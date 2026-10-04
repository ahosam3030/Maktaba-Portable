import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentUser, JwtAuthGuard, PermissionsGuard, RequirePermission, AuthUser } from './auth';
import { PrismaService } from './prisma.service';

const METHODS = ['CASH', 'WALLET', 'BANK', 'CARD'] as const;
const KINDS = ['INCOME', 'EXPENSE'] as const;

@Controller('accounting/cash-transactions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('accounting')
export class AccountingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('kind') kind?: string,
    @Query('search') search?: string,
  ) {
    const where: Prisma.CashTransactionWhereInput = { organizationId: user.organizationId };
    if (from || to) {
      const date: Prisma.DateTimeFilter = {};
      if (from) { const d = new Date(from); if (Number.isNaN(d.getTime())) throw new BadRequestException('تاريخ البداية غير صحيح.'); date.gte = d; }
      if (to) { const d = new Date(to); if (Number.isNaN(d.getTime())) throw new BadRequestException('تاريخ النهاية غير صحيح.'); d.setHours(23, 59, 59, 999); date.lte = d; }
      where.date = date;
    }
    if (kind) {
      if (!KINDS.includes(kind as typeof KINDS[number])) throw new BadRequestException('نوع الحركة غير صحيح.');
      where.kind = kind;
    }
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { category: { contains: q } },
        { reference: { contains: q } },
        { notes: { contains: q } },
      ];
    }
    return this.prisma.cashTransaction.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 1000 });
  }

  @Get('summary')
  async summary(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const where: Prisma.CashTransactionWhereInput = { organizationId: user.organizationId };
    if (from || to) {
      const date: Prisma.DateTimeFilter = {};
      if (from) { const d = new Date(from); if (Number.isNaN(d.getTime())) throw new BadRequestException('تاريخ البداية غير صحيح.'); date.gte = d; }
      if (to) { const d = new Date(to); if (Number.isNaN(d.getTime())) throw new BadRequestException('تاريخ النهاية غير صحيح.'); d.setHours(23, 59, 59, 999); date.lte = d; }
      where.date = date;
    }
    const [income, expense, count] = await Promise.all([
      this.prisma.cashTransaction.aggregate({ where: { ...where, kind: 'INCOME' }, _sum: { amount: true } }),
      this.prisma.cashTransaction.aggregate({ where: { ...where, kind: 'EXPENSE' }, _sum: { amount: true } }),
      this.prisma.cashTransaction.count({ where }),
    ]);
    const totalIncome = Number(income._sum.amount ?? 0);
    const totalExpense = Number(expense._sum.amount ?? 0);
    return { totalIncome, totalExpense, netMovement: totalIncome - totalExpense, count };
  }

  @Get(':id')
  async getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const item = await this.prisma.cashTransaction.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!item) throw new NotFoundException('حركة الخزينة غير موجودة.');
    return item;
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: {
    kind?: string; date?: string; category?: string; amount?: number | string;
    method?: string; reference?: string; notes?: string;
  }) {
    if (!body.kind || !KINDS.includes(body.kind as typeof KINDS[number])) throw new BadRequestException('اختر نوع الحركة: إيراد أو مصروف.');
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('المبلغ يجب أن يكون رقمًا أكبر من صفر.');
    const category = body.category?.trim();
    if (!category) throw new BadRequestException('اكتب بند الحركة.');
    const method = (body.method || 'CASH').toUpperCase();
    if (!METHODS.includes(method as typeof METHODS[number])) throw new BadRequestException('طريقة الدفع غير صحيحة.');
    const date = body.date ? new Date(body.date) : new Date();
    if (Number.isNaN(date.getTime())) throw new BadRequestException('تاريخ الحركة غير صحيح.');
    return this.prisma.cashTransaction.create({
      data: {
        organizationId: user.organizationId,
        userId: user.userId,
        kind: body.kind,
        date,
        category,
        amount: new Prisma.Decimal(amount),
        method,
        reference: body.reference?.trim() || null,
        notes: body.notes?.trim() || null,
      },
    });
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const result = await this.prisma.cashTransaction.deleteMany({ where: { id, organizationId: user.organizationId } });
    if (!result.count) throw new NotFoundException('حركة الخزينة غير موجودة.');
    return { deleted: true, id };
  }
}
