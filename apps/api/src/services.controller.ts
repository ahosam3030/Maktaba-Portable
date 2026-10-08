import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { CurrentUser, JwtAuthGuard, PermissionsGuard, RequirePermission, AuthUser } from './auth';
import { lineTotal as moneyLineTotal, roundMoney } from './money.util';

const DEFAULT_SERVICES: Array<{ name: string; unitPrice: number; chargeUnit: string; sortOrder: number }> = [
  { name: 'تصوير مستندات', unitPrice: 1, chargeUnit: 'page', sortOrder: 1 },
  { name: 'طباعة أبيض وأسود', unitPrice: 1.5, chargeUnit: 'page', sortOrder: 2 },
  { name: 'طباعة ألوان', unitPrice: 3, chargeUnit: 'page', sortOrder: 3 },
  { name: 'مسح ضوئي', unitPrice: 2, chargeUnit: 'page', sortOrder: 4 },
  { name: 'تغليف', unitPrice: 10, chargeUnit: 'job', sortOrder: 5 },
  { name: 'تجليد', unitPrice: 25, chargeUnit: 'job', sortOrder: 6 },
  { name: 'خدمة أخرى', unitPrice: 0, chargeUnit: 'job', sortOrder: 99 },
];

@Controller('services')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('printing')
export class ServicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    let rows = await this.prisma.service.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (rows.length === 0) {
      try {
        await this.prisma.service.createMany({
          data: DEFAULT_SERVICES.map((s) => ({
            organizationId: user.organizationId,
            name: s.name,
            unitPrice: s.unitPrice,
            chargeUnit: s.chargeUnit,
            sortOrder: s.sortOrder,
            active: true,
          })),
        });
      } catch {
        // طلب متزامن آخر زرع الخدمات — نتابع بالقراءة
      }
      rows = await this.prisma.service.findMany({
        where: { organizationId: user.organizationId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    }
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      unitPrice: Number(s.unitPrice),
      chargeUnit: s.chargeUnit as 'page' | 'copy' | 'job',
      active: s.active,
      sortOrder: s.sortOrder,
      notes: s.notes,
    }));
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: { name?: string; unitPrice?: number; chargeUnit?: string; notes?: string; active?: boolean; sortOrder?: number },
  ) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('اسم الخدمة مطلوب.');
    const unitPrice = Number(body.unitPrice) || 0;
    if (unitPrice < 0) throw new BadRequestException('السعر غير صحيح.');
    const chargeUnit = ['page', 'copy', 'job'].includes(String(body.chargeUnit)) ? String(body.chargeUnit) : 'job';
    try {
      const s = await this.prisma.service.create({
        data: {
          organizationId: user.organizationId,
          name,
          unitPrice,
          chargeUnit,
          notes: body.notes?.trim() || null,
          active: body.active !== false,
          sortOrder: Number(body.sortOrder) || 0,
        },
      });
      return {
        id: s.id,
        name: s.name,
        unitPrice: Number(s.unitPrice),
        chargeUnit: s.chargeUnit,
        active: s.active,
        sortOrder: s.sortOrder,
        notes: s.notes,
      };
    } catch (e: unknown) {
      if (typeof e === 'object' && e && 'code' in e && (e as { code: string }).code === 'P2002') {
        throw new BadRequestException('اسم الخدمة مستخدم بالفعل.');
      }
      throw e;
    }
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { name?: string; unitPrice?: number; chargeUnit?: string; notes?: string; active?: boolean; sortOrder?: number },
  ) {
    const existing = await this.prisma.service.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) throw new BadRequestException('الخدمة غير موجودة.');
    const data: Prisma.ServiceUpdateInput = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) throw new BadRequestException('اسم الخدمة مطلوب.');
      data.name = name;
    }
    if (body.unitPrice !== undefined) {
      const p = Number(body.unitPrice);
      if (!Number.isFinite(p) || p < 0) throw new BadRequestException('السعر غير صحيح.');
      data.unitPrice = p;
    }
    if (body.chargeUnit !== undefined && ['page', 'copy', 'job'].includes(body.chargeUnit)) {
      data.chargeUnit = body.chargeUnit;
    }
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0;
    try {
      const s = await this.prisma.service.update({ where: { id }, data });
      return {
        id: s.id,
        name: s.name,
        unitPrice: Number(s.unitPrice),
        chargeUnit: s.chargeUnit,
        active: s.active,
        sortOrder: s.sortOrder,
        notes: s.notes,
      };
    } catch (e: unknown) {
      if (typeof e === 'object' && e && 'code' in e && (e as { code: string }).code === 'P2002') {
        throw new BadRequestException('اسم الخدمة مستخدم بالفعل.');
      }
      throw e;
    }
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const existing = await this.prisma.service.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { _count: { select: { receipts: true } } },
    });
    if (!existing) throw new BadRequestException('الخدمة غير موجودة.');
    if (existing._count.receipts > 0) {
      await this.prisma.service.update({ where: { id }, data: { active: false } });
      return { ok: true, deactivated: true, message: 'تم تعطيل الخدمة لارتباطها بإيصالات.' };
    }
    await this.prisma.service.delete({ where: { id } });
    return { ok: true, deleted: true };
  }
}

@Controller('service-receipts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('printing')
export class ServiceReceiptsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.serviceReceipt.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ receiptDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      include: { items: true },
    });
    return rows.map((r) => this.mapReceipt(r));
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      receiptNo?: string;
      receiptDate?: string;
      customerName?: string;
      serviceId?: string;
      serviceName?: string;
      description?: string;
      paperSize?: string;
      colorMode?: string;
      pages?: number;
      copies?: number;
      sides?: string;
      unitPrice?: number;
      extraFees?: number;
      discount?: number;
      total?: number;
      paidAmount?: number;
      notes?: string;
      items?: Array<{
        serviceId?: string;
        serviceName?: string;
        description?: string;
        quantity?: number;
        unitPrice?: number;
        lineTotal?: number;
      }>;
    },
  ) {
    const receiptNo = body.receiptNo?.trim() || `S-${Date.now()}`;
    const discount = Math.max(0, Number(body.discount) || 0);
    const extraFees = Math.max(0, Number(body.extraFees) || 0);

    // Multi-line invoice items (preferred) or single-line legacy body
    let lineItems = (body.items || [])
      .map((it) => {
        const quantity = Math.max(0.001, Number(it.quantity) || 1);
        const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
        // الإجمالي من السيرفر فقط — لا نثق في lineTotal القادم من العميل
        const lineTotal = moneyLineTotal(quantity, unitPrice);
        const serviceName = (it.serviceName || body.serviceName || 'خدمة').trim();
        return {
          serviceId: it.serviceId?.trim() || null,
          serviceName,
          description: it.description?.trim() || null,
          quantity,
          unitPrice,
          lineTotal,
        };
      })
      .filter((it) => it.serviceName && it.lineTotal >= 0);

    if (lineItems.length === 0) {
      const serviceName = body.serviceName?.trim() || 'خدمة';
      const unitPrice = Math.max(0, Number(body.unitPrice) || 0);
      const pages = Math.max(1, Math.floor(Number(body.pages) || 1));
      const copies = Math.max(1, Math.floor(Number(body.copies) || 1));
      const lineTotal = unitPrice; // UI already computed complex cases into unitPrice/total historically
      lineItems = [
        {
          serviceId: body.serviceId?.trim() || null,
          serviceName,
          description: body.description?.trim() || null,
          quantity: 1,
          unitPrice,
          lineTotal: Math.max(0, Number(body.total) || lineTotal) - extraFees + discount > 0
            ? Math.max(0, (Number(body.total) || 0) - extraFees + discount)
            : lineTotal,
        },
      ];
    }

    const subtotal = lineItems.reduce((s, it) => s + it.lineTotal, 0);
    const total =
      body.total !== undefined && Number.isFinite(Number(body.total))
        ? Math.max(0, Number(body.total))
        : Math.max(0, subtotal + extraFees - discount);
    const paidAmount = Math.max(0, Number(body.paidAmount) || 0);
    if (paidAmount > total + 0.001) throw new BadRequestException('المدفوع أكبر من الإجمالي.');
    if (lineItems.length === 0) throw new BadRequestException('أضف بند خدمة واحدًا على الأقل.');

    const primaryName = lineItems.map((i) => i.serviceName).join(' + ').slice(0, 200);
    let receiptDate = new Date();
    if (body.receiptDate) {
      const raw = body.receiptDate.trim();
      receiptDate = new Date(raw.includes('T') ? raw : raw + 'T12:00:00');
      if (Number.isNaN(receiptDate.getTime())) throw new BadRequestException('تاريخ الإيصال غير صحيح.');
    }

    // validate service ids belong to org
    for (const it of lineItems) {
      if (it.serviceId) {
        const svc = await this.prisma.service.findFirst({
          where: { id: it.serviceId, organizationId: user.organizationId },
        });
        if (!svc) it.serviceId = null;
      }
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        let cashId: string | null = null;
        if (paidAmount > 0) {
          const cash = await tx.cashTransaction.create({
            data: {
              organizationId: user.organizationId,
              userId: user.userId,
              kind: 'INCOME',
              date: receiptDate,
              category: 'خدمات',
              amount: paidAmount,
              method: 'CASH',
              reference: receiptNo,
              notes: `فاتورة خدمات: ${primaryName}${body.customerName ? ` — ${body.customerName}` : ''}`,
            },
          });
          cashId = cash.id;
        }
        const receipt = await tx.serviceReceipt.create({
          data: {
            organizationId: user.organizationId,
            userId: user.userId,
            serviceId: lineItems[0]?.serviceId || null,
            receiptNo,
            receiptDate,
            customerName: body.customerName?.trim() || null,
            serviceName: primaryName,
            description: body.description?.trim() || null,
            paperSize: body.paperSize || null,
            colorMode: body.colorMode || null,
            pages: Math.max(1, Math.floor(Number(body.pages) || 1)),
            copies: Math.max(1, Math.floor(Number(body.copies) || 1)),
            sides: body.sides || null,
            unitPrice: lineItems[0]?.unitPrice || 0,
            extraFees,
            discount,
            total,
            paidAmount,
            notes: body.notes?.trim() || null,
            cashTransactionId: cashId,
            items: {
              create: lineItems.map((it) => ({
                serviceId: it.serviceId,
                serviceName: it.serviceName,
                description: it.description,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                lineTotal: it.lineTotal,
              })),
            },
          },
          include: { items: true },
        });
        return receipt;
      });
      return this.mapReceipt(result);
    } catch (e: unknown) {
      if (typeof e === 'object' && e && 'code' in e && (e as { code: string }).code === 'P2002') {
        throw new BadRequestException('رقم الفاتورة/الإيصال مستخدم بالفعل.');
      }
      throw e;
    }
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const row = await this.prisma.serviceReceipt.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!row) throw new BadRequestException('الإيصال غير موجود.');
    await this.prisma.$transaction(async (tx) => {
      if (row.cashTransactionId) {
        await tx.cashTransaction.deleteMany({
          where: { id: row.cashTransactionId, organizationId: user.organizationId },
        });
      }
      await tx.serviceReceipt.delete({ where: { id } });
    });
    return { ok: true, id };
  }

  private mapReceipt(r: {
    id: string;
    receiptNo: string;
    receiptDate: Date;
    customerName: string | null;
    serviceId: string | null;
    serviceName: string;
    description: string | null;
    paperSize: string | null;
    colorMode: string | null;
    pages: number;
    copies: number;
    sides: string | null;
    unitPrice: Prisma.Decimal;
    extraFees: Prisma.Decimal;
    discount: Prisma.Decimal;
    total: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    notes: string | null;
    cashTransactionId: string | null;
    createdAt: Date;
    items?: Array<{
      id: string;
      serviceId: string | null;
      serviceName: string;
      description: string | null;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }>;
  }) {
    const items = (r.items || []).map((it) => ({
      id: it.id,
      serviceId: it.serviceId,
      serviceName: it.serviceName,
      description: it.description,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unitPrice),
      lineTotal: Number(it.lineTotal),
    }));
    return {
      id: r.id,
      receiptNo: r.receiptNo,
      date: r.receiptDate.toISOString().slice(0, 10),
      customerName: r.customerName,
      serviceId: r.serviceId,
      serviceName: r.serviceName,
      service: r.serviceName,
      description: r.description,
      paperSize: r.paperSize,
      colorMode: r.colorMode,
      pages: r.pages,
      copies: r.copies,
      sides: r.sides,
      unitPrice: Number(r.unitPrice),
      extraFees: Number(r.extraFees),
      discount: Number(r.discount),
      total: Number(r.total),
      paid: Number(r.paidAmount),
      paidAmount: Number(r.paidAmount),
      notes: r.notes,
      cashTransactionId: r.cashTransactionId,
      createdAt: r.createdAt.toISOString(),
      items,
    };
  }
}
