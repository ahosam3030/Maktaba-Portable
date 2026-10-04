import { CreatePurchaseInvoiceDto, SupplierPaymentDto } from './dto/purchases.dto';
import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { CurrentUser, JwtAuthGuard, PermissionsGuard, RequirePermission, AuthUser } from './auth';
import { AuditService } from './audit.service';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('purchases')
export class SuppliersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.supplier.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: 'asc' } });
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: { name?: string; phone?: string; notes?: string }) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('اسم المورد مطلوب.');
    const phone = body.phone !== undefined ? (body.phone?.trim() || null) : undefined;
    const notes = body.notes !== undefined ? (body.notes?.trim() || null) : undefined;
    const update: { phone?: string | null; notes?: string | null } = {};
    if (phone !== undefined) update.phone = phone;
    if (notes !== undefined) update.notes = notes;
    return this.prisma.supplier.upsert({
      where: { organizationId_name: { organizationId: user.organizationId, name } },
      create: {
        organizationId: user.organizationId,
        name,
        phone: phone ?? null,
        notes: notes ?? null,
      },
      update,
    });
  }
}

type InvoiceInput = {
  supplierId?: string; invoiceNumber?: string; invoiceDate?: string; discount?: number; paidAmount?: number; notes?: string;
  items?: Array<{ productId?: string; productName?: string; barcode?: string; unit?: string; quantity?: number; unitCost?: number; piecesPerPack?: number; salePrice?: number }>;
};

@Controller('purchases/invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('purchases')
export class PurchaseInvoicesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.purchaseInvoice.findMany({
      where: { organizationId: user.organizationId },
      include: { supplier: { select: { id: true, name: true } }, items: true, payments: true, returns: true },
      orderBy: { invoiceDate: 'desc' }, take: 500,
    });
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: CreatePurchaseInvoiceDto) {
    const supplierId = body.supplierId?.trim();
    const invoiceNumber = body.invoiceNumber?.trim();
    if (!supplierId || !invoiceNumber || !Array.isArray(body.items) || body.items.length === 0) {
      throw new BadRequestException('المورد ورقم الفاتورة وصنف واحد على الأقل مطلوبة.');
    }
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, organizationId: user.organizationId } });
    if (!supplier) throw new BadRequestException('المورد غير موجود في مكتبتك.');

    const items = body.items.map((item) => {
      const productName = item.productName?.trim();
      const quantity = Number(item.quantity);
      const unitCost = Number(item.unitCost);
      const piecesPerPack = Number(item.piecesPerPack ?? 1);
      const unit = item.unit === 'PACK' ? 'PACK' : 'PIECE';
      if (!productName || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0 || !Number.isInteger(piecesPerPack) || piecesPerPack < 1) {
        throw new BadRequestException('راجع اسم الصنف والكمية والسعر وعدد القطع في العبوة.');
      }
      // unitCost is cost of the purchased unit (pack or piece). Convert to per-piece cost for inventory.
      const costPerPiece = unit === 'PACK' ? unitCost / piecesPerPack : unitCost;
      let salePrice: number | undefined;
      if (item.salePrice !== undefined && item.salePrice !== null) {
        const sp = Number(item.salePrice);
        if (!Number.isFinite(sp) || sp < 0) throw new BadRequestException('سعر البيع غير صحيح.');
        salePrice = sp;
      }
      return {
        productId: item.productId, productName, barcode: item.barcode, unit, quantity, unitCost,
        piecesPerPack, lineTotal: quantity * unitCost, costPerPiece, salePrice,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const discount = Number(body.discount ?? 0);
    const paidAmount = Number(body.paidAmount ?? 0);
    if (!Number.isFinite(discount) || discount < 0 || discount > subtotal || !Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > subtotal - discount) {
      throw new BadRequestException('قيمة الخصم أو المدفوع غير صحيحة.');
    }
    const invoiceDate = body.invoiceDate ? new Date(body.invoiceDate) : new Date();
    if (Number.isNaN(invoiceDate.getTime())) throw new BadRequestException('تاريخ الفاتورة غير صحيح.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const createdItems: Array<{ productId: string; productName: string; unit: string; quantity: number; unitCost: number; piecesPerPack: number; lineTotal: number }> = [];
        for (const item of items) {
          let product = item.productId
            ? await tx.product.findFirst({ where: { id: item.productId, organizationId: user.organizationId } })
            : null;
          if (item.productId && !product) throw new BadRequestException('أحد الأصناف لا ينتمي إلى مكتبتك.');
          const barcode = item.barcode?.trim() || null;
          if (!product && barcode) {
            product = await tx.product.findFirst({
              where: { organizationId: user.organizationId, barcode },
            });
          }
          if (!product && item.productName) {
            product = await tx.product.findFirst({
              where: { organizationId: user.organizationId, name: item.productName },
            });
          }

          if (!product) {
            product = await tx.product.create({
              data: {
                organizationId: user.organizationId,
                name: item.productName,
                barcode,
                unit: item.unit,
                piecesPerPack: item.piecesPerPack,
                currentCost: item.costPerPiece,
                salePrice: item.salePrice ?? 0,
              },
            });
          } else {
            // Only update piecesPerPack when buying by PACK; never reset to 1 on piece purchases.
            // Always store currentCost as cost per piece.
            const updateData: Prisma.ProductUpdateInput = { currentCost: item.costPerPiece };
            if (item.unit === 'PACK') {
              updateData.piecesPerPack = item.piecesPerPack;
              updateData.unit = 'PACK';
            }
            if (item.barcode?.trim()) updateData.barcode = item.barcode.trim();
            if (item.salePrice !== undefined) updateData.salePrice = item.salePrice;
            product = await tx.product.update({ where: { id: product.id }, data: updateData });
          }
          createdItems.push({
            productId: product.id, productName: item.productName, unit: item.unit,
            quantity: item.quantity, unitCost: item.unitCost, piecesPerPack: item.piecesPerPack, lineTotal: item.lineTotal,
          });
        }

        return tx.purchaseInvoice.create({
          data: {
            organizationId: user.organizationId, supplierId, invoiceNumber, invoiceDate,
            subtotal: new Prisma.Decimal(subtotal),
            discount: new Prisma.Decimal(discount),
            total: new Prisma.Decimal(subtotal - discount),
            paidAmount: new Prisma.Decimal(paidAmount),
            notes: body.notes?.trim() || null,
            items: {
              create: createdItems.map((item) => ({
                productId: item.productId,
                productName: item.productName,
                unit: item.unit,
                quantity: new Prisma.Decimal(item.quantity),
                unitCost: new Prisma.Decimal(item.unitCost),
                piecesPerPack: item.piecesPerPack,
                lineTotal: new Prisma.Decimal(item.lineTotal),
              })),
            },
          },
          include: { supplier: true, items: true, payments: true },
        });
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002') {
        throw new BadRequestException('رقم الفاتورة مستخدم بالفعل لهذا المورد.');
      }
      throw error;
    }
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const invoice = await this.prisma.purchaseInvoice.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { items: true, returns: { include: { items: true } } },
    });
    if (!invoice) throw new NotFoundException('فاتورة الوارد غير موجودة.');
    if (invoice.returns.length > 0) {
      throw new BadRequestException('لا يمكن حذف فاتورة عليها مرتجعات. احذف المرتجعات أولًا.');
    }

    return this.prisma.$transaction(async (tx) => {
      // الرصيد يُحسب من بنود فواتير الوارد مباشرة.
      // لا ننشئ حركة مخزون سالبة عند الحذف وإلا يُخصم الرصيد مرتين (بعد اختفاء البنود).
      await tx.supplierPayment.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.purchaseInvoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.purchaseInvoice.delete({ where: { id: invoice.id } });
      await this.audit.log({
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'PURCHASE_DELETE',
        entity: 'PurchaseInvoice',
        entityId: invoice.id,
        meta: { invoiceNumber: invoice.invoiceNumber },
        success: true,
      });
      return { ok: true, invoiceNumber: invoice.invoiceNumber };
    });
  }
}

@Controller('suppliers/payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('purchases')
export class SupplierPaymentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.supplierPayment.findMany({
      where: { organizationId: user.organizationId },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { paymentDate: 'desc' }, take: 500,
    });
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: SupplierPaymentDto) {
    const supplierId = body.supplierId?.trim();
    const amount = Number(body.amount);
    if (!supplierId || !Number.isFinite(amount) || amount <= 0) throw new BadRequestException('اختر المورد وأدخل مبلغًا صحيحًا.');
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, organizationId: user.organizationId } });
    if (!supplier) throw new BadRequestException('المورد غير موجود في مكتبتك.');
    if (body.invoiceId) {
      const invoice = await this.prisma.purchaseInvoice.findFirst({ where: { id: body.invoiceId, organizationId: user.organizationId, supplierId } });
      if (!invoice) throw new BadRequestException('الفاتورة المحددة لا تتبع هذا المورد أو مكتبتك.');
    }
    const paymentDate = body.paymentDate ? new Date(body.paymentDate) : new Date();
    if (Number.isNaN(paymentDate.getTime())) throw new BadRequestException('تاريخ الدفعة غير صحيح.');
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.create({
        data: {
          organizationId: user.organizationId,
          supplierId,
          invoiceId: body.invoiceId || null,
          amount: new Prisma.Decimal(amount),
          paymentDate,
          method: body.method?.trim() || 'CASH',
          notes: body.notes?.trim() || null,
        },
        include: { supplier: { select: { id: true, name: true } } },
      });
      if (body.invoiceId) {
        const inv = await tx.purchaseInvoice.findFirst({
          where: { id: body.invoiceId, organizationId: user.organizationId },
        });
        if (inv) {
          const newPaid = Number(inv.paidAmount) + amount;
          await tx.purchaseInvoice.update({
            where: { id: inv.id },
            data: { paidAmount: new Prisma.Decimal(Math.min(newPaid, Number(inv.total))) },
          });
        }
      }
      // قيد خزينة: مصروف دفع مورد
      await tx.cashTransaction.create({
        data: {
          organizationId: user.organizationId,
          userId: user.userId,
          kind: 'EXPENSE',
          date: paymentDate,
          category: 'موردين',
          amount: new Prisma.Decimal(amount),
          method: (body.method?.trim() || 'CASH').toUpperCase().includes('BANK') ? 'BANK' : 'CASH',
          reference: `SUPPLIER_PAY:${payment.id}`,
          notes: `دفعة مورد ${payment.supplier?.name || supplierId}`,
        },
      });
      return payment;
    });
  }
}

@Controller('purchases/returns')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('purchases')
export class PurchaseReturnsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.purchaseReturn.findMany({
      where: { organizationId: user.organizationId },
      include: { supplier: { select: { id: true, name: true } }, items: true },
      orderBy: { returnDate: 'desc' }, take: 500,
    });
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: { invoiceId?: string; returnNumber?: string; returnDate?: string; reason?: string; items?: Array<{ invoiceItemId?: string; quantity?: number }> }) {
    if (!body.invoiceId || !Array.isArray(body.items) || body.items.length === 0) {
      throw new BadRequestException('حدد فاتورة الوارد وصنفًا واحدًا على الأقل للمرتجع.');
    }
    const returnDate = body.returnDate ? new Date(body.returnDate) : new Date();
    if (Number.isNaN(returnDate.getTime())) throw new BadRequestException('تاريخ المرتجع غير صحيح.');

    return this.prisma.$transaction(
      async (tx) => {
      // قفل بنود الفاتورة ثم الأصناف لمنع مرتجعين متزامنين
      await tx.$queryRaw`
        SELECT id FROM "PurchaseInvoiceItem"
        WHERE "invoiceId" = ${body.invoiceId}
       
      `;
      const invoice = await tx.purchaseInvoice.findFirst({
        where: { id: body.invoiceId, organizationId: user.organizationId },
        include: { items: true },
      });
      if (!invoice) throw new BadRequestException('فاتورة الوارد غير موجودة في مكتبتك.');

      const productIds = [...new Set(invoice.items.map((i) => i.productId))];
      for (const pid of productIds) {
        await tx.$queryRaw`
          SELECT id FROM "Product"
          WHERE id = ${pid} AND "organizationId" = ${user.organizationId}
         
        `;
      }

      const lines = body.items!.map((draft) => {
        const item = invoice.items.find((candidate) => candidate.id === draft.invoiceItemId);
        const quantity = Number(draft.quantity);
        if (!item || !Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('أحد أصناف المرتجع غير صحيح.');
        const remaining = Number(item.quantity) - Number(item.returnedQuantity);
        if (quantity > remaining) throw new BadRequestException(`كمية المرتجع تتجاوز الكمية المتبقية للصنف ${item.productName}.`);
        return { item, quantity, unitCost: Number(item.unitCost), lineTotal: quantity * Number(item.unitCost) };
      });

      const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
      const purchaseReturn = await tx.purchaseReturn.create({
        data: {
          organizationId: user.organizationId,
          supplierId: invoice.supplierId,
          invoiceId: invoice.id,
          returnNumber: body.returnNumber?.trim() || null,
          returnDate,
          total: new Prisma.Decimal(total),
          reason: body.reason?.trim() || null,
          items: {
            create: lines.map((line) => ({
              invoiceItemId: line.item.id,
              productId: line.item.productId,
              quantity: new Prisma.Decimal(line.quantity),
              unitCost: new Prisma.Decimal(line.unitCost),
              lineTotal: new Prisma.Decimal(line.lineTotal),
            })),
          },
        },
        include: { items: true, supplier: { select: { id: true, name: true } } },
      });

      for (const line of lines) {
        const updated = await tx.purchaseInvoiceItem.updateMany({
          where: {
            id: line.item.id,
            returnedQuantity: { lte: new Prisma.Decimal(Number(line.item.quantity) - line.quantity) },
          },
          data: { returnedQuantity: { increment: new Prisma.Decimal(line.quantity) } },
        });
        if (updated.count === 0) {
          throw new BadRequestException(`تعذر تسجيل المرتجع للصنف ${line.item.productName} بسبب تعارض متزامن. أعد المحاولة.`);
        }
        // Record stock reduction for the return (pieces)
        const pieces = line.item.unit === 'PACK' ? line.quantity * line.item.piecesPerPack : line.quantity;
        await tx.stockMovement.create({
          data: {
            organizationId: user.organizationId,
            productId: line.item.productId,
            quantity: new Prisma.Decimal(-pieces),
            type: 'RETURN',
            reason: `مرتجع مشتريات ${purchaseReturn.id}`,
            notes: body.reason?.trim() || null,
          },
        });
      }

      return purchaseReturn;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 15_000,
    },
    );
  }
}
