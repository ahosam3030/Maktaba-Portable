import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { AuthUser, CurrentUser, JwtAuthGuard, PermissionsGuard, RequirePermission } from './auth';
import { AuditService } from './audit.service';
import { roundMoney } from './money.util';

@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('sales')
export class CustomersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const customers = await this.prisma.customer.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: 'asc' },
      include: {
        sales: { select: { id: true, total: true, paidAmount: true, paymentStatus: true } },
        payments: { select: { amount: true } },
      },
    });
    return customers.map((c) => {
      const salesTotal = c.sales.reduce((s, x) => s + Number(x.total), 0);
      const salesPaid = c.sales.reduce((s, x) => s + Number(x.paidAmount), 0);
      const balance = roundMoney(salesTotal - salesPaid);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        notes: c.notes,
        createdAt: c.createdAt,
        invoicesCount: c.sales.length,
        salesTotal: roundMoney(salesTotal),
        paidTotal: roundMoney(salesPaid),
        balance: balance > 0 ? balance : 0,
      };
    });
  }

  @Get(':id')
  async one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const c = await this.prisma.customer.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        sales: { include: { items: true }, orderBy: { saleDate: 'desc' } },
        payments: { orderBy: { date: 'desc' }, take: 100 },
      },
    });
    if (!c) throw new NotFoundException('العميل غير موجود');
    const salesTotal = c.sales.reduce((s, x) => s + Number(x.total), 0);
    const salesPaid = c.sales.reduce((s, x) => s + Number(x.paidAmount), 0);
    const balance = roundMoney(salesTotal - salesPaid);
    return {
      ...c,
      salesTotal: roundMoney(salesTotal),
      paidTotal: roundMoney(salesPaid),
      balance: balance > 0 ? balance : 0,
      sales: c.sales.map((s) => ({
        ...s,
        total: Number(s.total),
        paidAmount: Number(s.paidAmount),
        remaining: roundMoney(Number(s.total) - Number(s.paidAmount)),
      })),
    };
  }

  @Post(':id/payments')
  async pay(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { amount?: number; notes?: string; method?: string; date?: string; saleId?: string },
  ) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('مبلغ التحصيل غير صحيح');
    }
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!customer) throw new NotFoundException('العميل غير موجود');
    const date = body.date ? new Date(body.date) : new Date();
    if (Number.isNaN(date.getTime())) throw new BadRequestException('تاريخ غير صحيح');
    const targetSaleId = body.saleId?.trim() || null;

    const result = await this.prisma.$transaction(async (tx) => {
      let openSales;
      if (targetSaleId) {
        const one = await tx.sale.findFirst({
          where: { id: targetSaleId, organizationId: user.organizationId, customerId: id },
        });
        if (!one) throw new BadRequestException('الفاتورة غير موجودة لهذا العميل');
        const due = roundMoney(Number(one.total) - Number(one.paidAmount));
        if (due <= 0) throw new BadRequestException('هذه الفاتورة مسددة بالكامل');
        if (roundMoney(amount) - due > 0.001) {
          throw new BadRequestException(
            `المبلغ أكبر من متبقي الفاتورة (${due.toFixed(2)}). أدخل مبلغًا أقل أو اختر توزيعًا على كل الفواتير.`,
          );
        }
        openSales = [one];
      } else {
        openSales = await tx.sale.findMany({
          where: {
            organizationId: user.organizationId,
            customerId: id,
            paymentStatus: { in: ['CREDIT', 'PARTIAL'] },
          },
          orderBy: { saleDate: 'asc' },
        });
      }
      let remaining = roundMoney(amount);
      const applied: Array<{ saleId: string; invoiceNumber: string; applied: number }> = [];
      for (const sale of openSales) {
        if (remaining <= 0) break;
        const due = roundMoney(Number(sale.total) - Number(sale.paidAmount));
        if (due <= 0) continue;
        const apply = Math.min(due, remaining);
        const newPaid = roundMoney(Number(sale.paidAmount) + apply);
        const status = newPaid >= Number(sale.total) - 0.001 ? 'PAID' : 'PARTIAL';
        await tx.sale.update({
          where: { id: sale.id },
          data: { paidAmount: new Prisma.Decimal(newPaid), paymentStatus: status },
        });
        applied.push({ saleId: sale.id, invoiceNumber: sale.invoiceNumber, applied: apply });
        remaining = roundMoney(remaining - apply);
      }
      if (applied.length === 0) {
        throw new BadRequestException('لا توجد فواتير آجل مفتوحة لهذا العميل');
      }
      const noteExtra =
        targetSaleId && applied[0]
          ? ` · فاتورة ${applied[0].invoiceNumber}`
          : applied.length
            ? ` · ${applied.map((a) => a.invoiceNumber).join(', ')}`
            : '';
      const payment = await tx.customerPayment.create({
        data: {
          organizationId: user.organizationId,
          customerId: id,
          amount: new Prisma.Decimal(roundMoney(amount)),
          date,
          method: body.method?.trim() || 'CASH',
          notes: ((body.notes?.trim() || '') + noteExtra) || null,
        },
      });
      await tx.cashTransaction.create({
        data: {
          organizationId: user.organizationId,
          userId: user.userId,
          kind: 'INCOME',
          date,
          category: 'تحصيل آجل',
          amount: new Prisma.Decimal(roundMoney(amount)),
          method: body.method?.trim() || 'CASH',
          reference: `CUSTOMER_PAY:${payment.id}`,
          notes: `تحصيل من ${customer.name}${noteExtra}`,
        },
      });
      return { payment, applied, unallocated: remaining };
    });

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'CUSTOMER_PAYMENT',
      entity: 'Customer',
      entityId: id,
      meta: { amount, saleId: targetSaleId, applied: result.applied },
    });
    return result;
  }

}
