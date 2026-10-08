import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { AuthUser, CurrentUser, JwtAuthGuard, PermissionsGuard, RequirePermission } from './auth';
import { AuditService } from './audit.service';

function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function dayEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function parseBizDate(raw?: string): Date {
  if (!raw?.trim()) return dayStart(new Date());
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('تاريخ غير صحيح.');
  return dayStart(d);
}

@Controller('cash-ops')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('accounting')
export class CashOpsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** ملخص يوم قبل الإغلاق */
  @Get('day-preview')
  async dayPreview(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    const biz = parseBizDate(date);
    const from = dayStart(biz);
    const to = dayEnd(biz);
    const orgId = user.organizationId;

    const [income, expense, drawerIn, drawerOut, existing] = await Promise.all([
      this.prisma.cashTransaction.aggregate({
        where: { organizationId: orgId, kind: 'INCOME', date: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      this.prisma.cashTransaction.aggregate({
        where: { organizationId: orgId, kind: 'EXPENSE', date: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      this.prisma.drawerEvent.aggregate({
        where: { organizationId: orgId, kind: 'PAY_IN', createdAt: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      this.prisma.drawerEvent.aggregate({
        where: { organizationId: orgId, kind: 'PAY_OUT', createdAt: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      this.prisma.dayClose.findUnique({
        where: {
          organizationId_businessDate: { organizationId: orgId, businessDate: from },
        },
      }),
    ]);

    const cashSales = Number(income._sum.amount ?? 0);
    const cashOutTx = Number(expense._sum.amount ?? 0);
    const cashIn = Number(drawerIn._sum.amount ?? 0);
    const cashOut = Number(drawerOut._sum.amount ?? 0) + cashOutTx;
    return {
      businessDate: from.toISOString().slice(0, 10),
      cashSales,
      cashIn,
      cashOut,
      closed: Boolean(existing),
      existing: existing
        ? {
            openingFloat: Number(existing.openingFloat),
            expectedCash: Number(existing.expectedCash),
            countedCash: Number(existing.countedCash),
            variance: Number(existing.variance),
            notes: existing.notes,
          }
        : null,
    };
  }

  @Get('day-closes')
  listCloses(@CurrentUser() user: AuthUser) {
    return this.prisma.dayClose.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { businessDate: 'desc' },
      take: 60,
    });
  }

  @Post('day-close')
  async closeDay(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      date?: string;
      openingFloat?: number;
      countedCash?: number;
      notes?: string;
    },
  ) {
    const biz = parseBizDate(body.date);
    const from = dayStart(biz);
    const to = dayEnd(biz);
    const openingFloat = Number(body.openingFloat ?? 0);
    const countedCash = Number(body.countedCash ?? 0);
    if (!Number.isFinite(openingFloat) || openingFloat < 0) {
      throw new BadRequestException('عهدة الافتتاح غير صحيحة.');
    }
    if (!Number.isFinite(countedCash) || countedCash < 0) {
      throw new BadRequestException('المبلغ المعدود غير صحيح.');
    }

    const existing = await this.prisma.dayClose.findUnique({
      where: {
        organizationId_businessDate: {
          organizationId: user.organizationId,
          businessDate: from,
        },
      },
    });
    if (existing) throw new BadRequestException('هذا اليوم مُغلق مسبقًا.');

    const [income, expense, drawerIn, drawerOut] = await Promise.all([
      this.prisma.cashTransaction.aggregate({
        where: {
          organizationId: user.organizationId,
          kind: 'INCOME',
          date: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
      this.prisma.cashTransaction.aggregate({
        where: {
          organizationId: user.organizationId,
          kind: 'EXPENSE',
          date: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
      this.prisma.drawerEvent.aggregate({
        where: {
          organizationId: user.organizationId,
          kind: 'PAY_IN',
          createdAt: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
      this.prisma.drawerEvent.aggregate({
        where: {
          organizationId: user.organizationId,
          kind: 'PAY_OUT',
          createdAt: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
    ]);

    const cashSales = Number(income._sum.amount ?? 0);
    const cashIn = Number(drawerIn._sum.amount ?? 0);
    const cashOut = Number(drawerOut._sum.amount ?? 0) + Number(expense._sum.amount ?? 0);
    const expectedCash = openingFloat + cashSales + cashIn - cashOut;
    const variance = countedCash - expectedCash;

    const row = await this.prisma.dayClose.create({
      data: {
        organizationId: user.organizationId,
        businessDate: from,
        openingFloat: new Prisma.Decimal(openingFloat),
        cashSales: new Prisma.Decimal(cashSales),
        cashIn: new Prisma.Decimal(cashIn),
        cashOut: new Prisma.Decimal(cashOut),
        expectedCash: new Prisma.Decimal(expectedCash),
        countedCash: new Prisma.Decimal(countedCash),
        variance: new Prisma.Decimal(variance),
        notes: body.notes?.trim() || null,
        closedByUserId: user.userId,
      },
    });

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'DAY_CLOSE',
      entity: 'DayClose',
      entityId: row.id,
      meta: { businessDate: from.toISOString().slice(0, 10), expectedCash, countedCash, variance },
      success: true,
    });

    return {
      ...row,
      openingFloat,
      cashSales,
      cashIn,
      cashOut,
      expectedCash,
      countedCash,
      variance,
    };
  }

  @Get('drawer')
  listDrawer(@CurrentUser() user: AuthUser) {
    return this.prisma.drawerEvent.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post('drawer')
  async drawerEvent(
    @CurrentUser() user: AuthUser,
    @Body() body: { kind?: string; amount?: number; reason?: string },
  ) {
    const kind = (body.kind || '').toUpperCase();
    if (!['OPEN_DRAWER', 'PAY_IN', 'PAY_OUT'].includes(kind)) {
      throw new BadRequestException('نوع الحركة: OPEN_DRAWER أو PAY_IN أو PAY_OUT.');
    }
    let amount = Number(body.amount ?? 0);
    if (kind === 'OPEN_DRAWER') amount = 0;
    if ((kind === 'PAY_IN' || kind === 'PAY_OUT') && (!Number.isFinite(amount) || amount <= 0)) {
      throw new BadRequestException('أدخل مبلغًا صحيحًا.');
    }
    const row = await this.prisma.drawerEvent.create({
      data: {
        organizationId: user.organizationId,
        kind,
        amount: new Prisma.Decimal(amount),
        reason: body.reason?.trim() || null,
        userId: user.userId,
      },
    });
    // قيد خزينة لدخول/خروج نقد الدرج
    if (kind === 'PAY_IN' || kind === 'PAY_OUT') {
      await this.prisma.cashTransaction.create({
        data: {
          organizationId: user.organizationId,
          userId: user.userId,
          kind: kind === 'PAY_IN' ? 'INCOME' : 'EXPENSE',
          date: new Date(),
          category: 'درج النقدية',
          amount: new Prisma.Decimal(amount),
          method: 'CASH',
          reference: `DRAWER:${row.id}`,
          notes: body.reason?.trim() || (kind === 'PAY_IN' ? 'توريد للدرج' : 'صرف من الدرج'),
        },
      });
    }
    return row;
  }
}
