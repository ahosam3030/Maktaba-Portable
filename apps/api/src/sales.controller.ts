import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { CurrentUser, JwtAuthGuard, PermissionsGuard, RequirePermission, AuthUser } from './auth';
import { computeStockPieces, assertSufficientStock, roundStock, piecesFromSaleLine } from './stock.util';
import { CreateSaleDto } from './dto/sales.dto';
import { AuditService } from './audit.service';

type SaleDraft = {
  productId?: string;
  productName?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
};

@Controller('sales')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('sales')
export class SalesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.sale.findMany({
      where: { organizationId: user.organizationId },
      include: { items: true },
      orderBy: { saleDate: 'desc' },
      take: 300,
    });
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateSaleDto,
  ) {
    const invoiceNumber = body.invoiceNumber?.trim();
    if (!invoiceNumber || !Array.isArray(body.items) || body.items.length === 0) {
      throw new BadRequestException('رقم الفاتورة وبند واحد على الأقل مطلوبان.');
    }
    const date = body.saleDate ? new Date(body.saleDate) : new Date();
    if (Number.isNaN(date.getTime())) throw new BadRequestException('تاريخ البيع غير صحيح.');

    type ParsedLine = {
      productId: string | null;
      productName: string;
      unit: string | null;
      quantity: number;
      unitPrice: number;
    };

    const parsed: ParsedLine[] = body.items.map((item) => {
      const productId = item.productId?.trim() || null;
      const productName = (item.productName || '').trim();
      const unit = item.unit?.trim() || null;
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new BadRequestException('راجع الكمية وسعر البيع لكل بند.');
      }
      if (!productId && !productName) {
        throw new BadRequestException('كل بند يحتاج اسم خدمة أو صنف من المخزون.');
      }
      return { productId, productName, unit, quantity, unitPrice };
    });

    // أصناف المخزون فقط (سيتم تحويل العلبة → قطعة حسب piecesPerPack داخل المعاملة)
    const productIds = [...new Set(parsed.map((p) => p.productId).filter(Boolean))] as string[];

    try {
      return await this.prisma.$transaction(
        async (tx) => {
        const products = new Map<
          string,
          { id: string; name: string; currentCost: Prisma.Decimal; piecesPerPack: number }
        >();
        const piecesNeeded = new Map<string, number>();

        for (const productId of productIds) {
          await this.lockProductRow(tx, user.organizationId, productId);
          const product = await tx.product.findFirst({
            where: { id: productId, organizationId: user.organizationId },
          });
          if (!product) throw new BadRequestException('أحد الأصناف غير موجود في مكتبتك.');
          const ppp = product.piecesPerPack || 1;
          let need = 0;
          for (const line of parsed) {
            if (line.productId !== productId) continue;
            need += piecesFromSaleLine(line.quantity, line.unit, ppp);
          }
          const stock = await this.currentStockTx(tx, user.organizationId, productId);
          try {
            assertSufficientStock(stock, need, product.name);
          } catch (e) {
            throw new BadRequestException(e instanceof Error ? e.message : 'رصيد غير كافٍ.');
          }
          products.set(productId, {
            id: product.id,
            name: product.name,
            currentCost: product.currentCost,
            piecesPerPack: ppp,
          });
          piecesNeeded.set(productId, need);
        }

        const lines = parsed.map((item) => {
          if (item.productId) {
            const product = products.get(item.productId)!;
            return {
              productId: product.id,
              productName: product.name,
              unit: item.unit,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitCost: Number(product.currentCost),
              lineTotal: item.quantity * item.unitPrice,
            };
          }
          return {
            productId: null as string | null,
            productName: item.productName,
            unit: item.unit || 'خدمة',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitCost: 0,
            lineTotal: item.quantity * item.unitPrice,
          };
        });

        const subtotal = lines.reduce((sum, item) => sum + item.lineTotal, 0);
        const discount = Number(body.discount ?? 0);
        const paidAmount = Number(body.paidAmount ?? 0);
        if (
          !Number.isFinite(discount) ||
          discount < 0 ||
          discount > subtotal ||
          !Number.isFinite(paidAmount) ||
          paidAmount < 0 ||
          paidAmount > subtotal - discount
        ) {
          throw new BadRequestException('الخصم أو المبلغ المدفوع غير صحيح.');
        }

        const sale = await tx.sale.create({
          data: {
            organizationId: user.organizationId,
            invoiceNumber,
            saleDate: date,
            customerName: body.customerName?.trim() || null,
            subtotal: new Prisma.Decimal(subtotal),
            discount: new Prisma.Decimal(discount),
            total: new Prisma.Decimal(subtotal - discount),
            paidAmount: new Prisma.Decimal(paidAmount),
            notes: body.notes?.trim() || null,
            items: {
              create: lines.map((line) => ({
                productId: line.productId,
                productName: line.productName,
                unit: line.unit,
                quantity: new Prisma.Decimal(line.quantity),
                unitPrice: new Prisma.Decimal(line.unitPrice),
                unitCost: new Prisma.Decimal(line.unitCost),
                lineTotal: new Prisma.Decimal(line.lineTotal),
              })),
            },
          },
          include: { items: true },
        });

        for (const [productId, quantity] of piecesNeeded) {
          await tx.stockMovement.create({
            data: {
              organizationId: user.organizationId,
              productId,
              quantity: new Prisma.Decimal(-quantity),
              type: 'SALE',
              reason: `بيع ${invoiceNumber}`,
              notes: `خصم آلي من المخزون للفاتورة ${invoiceNumber} (${quantity} قطعة)`,
            },
          });
        }

        // قيد خزينة تلقائي بالمبلغ المحصّل (إن وُجد)
        if (paidAmount > 0) {
          await tx.cashTransaction.create({
            data: {
              organizationId: user.organizationId,
              userId: user.userId,
              kind: 'INCOME',
              date,
              category: 'مبيعات',
              amount: new Prisma.Decimal(paidAmount),
              method: 'CASH',
              reference: `SALE:${sale.id}`,
              notes: `تحصيل فاتورة بيع ${invoiceNumber}`,
            },
          });
        }
        return sale;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      },
    );
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('رقم فاتورة البيع مستخدم من قبل.');
      }
      // تعارض عزل Serializable
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new BadRequestException('تعارض في المخزون بسبب عملية متزامنة — أعد المحاولة.');
      }
      throw error;
    }
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { items: true },
    });
    if (!sale) throw new NotFoundException('فاتورة البيع غير موجودة.');

    return this.prisma.$transaction(
      async (tx) => {
      // قفل الأصناف ثم إرجاع الرصيد
      const productIds = [...new Set(sale.items.map((i) => i.productId).filter(Boolean))] as string[];
      for (const productId of productIds) {
        await this.lockProductRow(tx, user.organizationId, productId);
      }
      for (const item of sale.items) {
        if (!item.productId) continue;
        await tx.stockMovement.create({
          data: {
            organizationId: user.organizationId,
            productId: item.productId,
            quantity: item.quantity, // موجب = إرجاع
            type: 'ADJUSTMENT',
            reason: `إلغاء بيع ${sale.invoiceNumber}`,
            notes: `إرجاع رصيد بعد حذف فاتورة البيع ${sale.invoiceNumber}`,
          },
        });
      }
      await tx.cashTransaction.deleteMany({
        where: { organizationId: user.organizationId, reference: `SALE:${sale.id}` },
      });
      await tx.saleItem.deleteMany({ where: { saleId: sale.id } });
      await tx.sale.delete({ where: { id: sale.id } });
      await this.audit.log({
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'SALE_DELETE',
        entity: 'Sale',
        entityId: sale.id,
        meta: { invoiceNumber: sale.invoiceNumber },
        success: true,
      });
      return { ok: true, invoiceNumber: sale.invoiceNumber };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 15_000,
    },
    );
  }


  @Get('returns')
  listReturns(@CurrentUser() user: AuthUser) {
    return this.prisma.saleReturn.findMany({
      where: { organizationId: user.organizationId },
      include: {
        items: true,
        sale: { select: { id: true, invoiceNumber: true, saleDate: true, customerName: true } },
      },
      orderBy: { returnDate: 'desc' },
      take: 200,
    });
  }

  @Post('returns')
  async createReturn(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      saleId?: string;
      returnNumber?: string;
      returnDate?: string;
      reason?: string;
      refundAmount?: number;
      items?: Array<{ saleItemId?: string; quantity?: number }>;
    },
  ) {
    const saleId = body.saleId?.trim();
    if (!saleId || !Array.isArray(body.items) || body.items.length === 0) {
      throw new BadRequestException('حدد فاتورة البيع وبندًا واحدًا على الأقل للمرتجع.');
    }
    const returnDate = body.returnDate ? new Date(body.returnDate) : new Date();
    if (Number.isNaN(returnDate.getTime())) throw new BadRequestException('تاريخ المرتجع غير صحيح.');

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const sale = await tx.sale.findFirst({
            where: { id: saleId, organizationId: user.organizationId },
            include: { items: true },
          });
          if (!sale) throw new BadRequestException('فاتورة البيع غير موجودة.');

          const productIds = [
            ...new Set(sale.items.map((i) => i.productId).filter(Boolean)),
          ] as string[];
          for (const productId of productIds) {
            await this.lockProductRow(tx, user.organizationId, productId);
          }

          // أعد قراءة البنود بعد القفل
          const freshItems = await tx.saleItem.findMany({ where: { saleId: sale.id } });
          const byId = new Map(freshItems.map((i) => [i.id, i]));

          const lines: Array<{
            item: (typeof freshItems)[0];
            quantity: number;
            lineTotal: number;
          }> = [];

          for (const draft of body.items!) {
            const item = byId.get(draft.saleItemId || '');
            const quantity = Number(draft.quantity);
            if (!item || !Number.isFinite(quantity) || quantity <= 0) {
              throw new BadRequestException('أحد أصناف المرتجع غير صحيح.');
            }
            const remaining = Number(item.quantity) - Number(item.returnedQuantity);
            if (quantity > remaining + 1e-9) {
              throw new BadRequestException(
                `كمية المرتجع تتجاوز المتبقي للصنف ${item.productName}. المتبقي: ${remaining}`,
              );
            }
            // نصيب السطر من صافي الفاتورة بعد الخصم (مش سعر القائمة قبل الخصم)
            const saleSub = Number(sale.subtotal) || 0;
            const saleNet = Number(sale.total) || 0;
            const grossLine = quantity * Number(item.unitPrice);
            const netLine =
              saleSub > 0 ? (grossLine / saleSub) * saleNet : grossLine;
            lines.push({
              item,
              quantity,
              lineTotal: netLine,
            });
          }

          const total = lines.reduce((s, l) => s + l.lineTotal, 0);
          // سقف الاسترداد: ما دفعه العميل فعليًا على الفاتورة (تقريبيًا) أو صافي البنود
          const maxRefund = Math.min(total, Number(sale.paidAmount) || total);
          let refundAmount = body.refundAmount !== undefined ? Number(body.refundAmount) : maxRefund;
          if (!Number.isFinite(refundAmount) || refundAmount < 0) {
            throw new BadRequestException('مبلغ الاسترداد غير صحيح.');
          }
          if (refundAmount > maxRefund + 1e-9) refundAmount = maxRefund;

          const saleReturn = await tx.saleReturn.create({
            data: {
              organizationId: user.organizationId,
              saleId: sale.id,
              returnNumber: body.returnNumber?.trim() || null,
              returnDate,
              total: new Prisma.Decimal(total),
              refundAmount: new Prisma.Decimal(refundAmount),
              reason: body.reason?.trim() || null,
              items: {
                create: lines.map((l) => ({
                  saleItemId: l.item.id,
                  productId: l.item.productId,
                  productName: l.item.productName,
                  quantity: new Prisma.Decimal(l.quantity),
                  unitPrice: l.item.unitPrice,
                  unitCost: l.item.unitCost,
                  lineTotal: new Prisma.Decimal(l.lineTotal),
                })),
              },
            },
            include: {
              items: true,
              sale: { select: { id: true, invoiceNumber: true, customerName: true } },
            },
          });

          for (const l of lines) {
            const updated = await tx.saleItem.updateMany({
              where: {
                id: l.item.id,
                returnedQuantity: { lte: new Prisma.Decimal(Number(l.item.quantity) - l.quantity) },
              },
              data: { returnedQuantity: { increment: new Prisma.Decimal(l.quantity) } },
            });
            if (updated.count === 0) {
              throw new BadRequestException(
                `تعذر تسجيل مرتجع ${l.item.productName} بسبب عملية متزامنة — أعد المحاولة.`,
              );
            }
            if (l.item.productId) {
              const prod = await tx.product.findFirst({
                where: { id: l.item.productId, organizationId: user.organizationId },
                select: { piecesPerPack: true },
              });
              const pieces = piecesFromSaleLine(
                l.quantity,
                l.item.unit,
                prod?.piecesPerPack || 1,
              );
              await tx.stockMovement.create({
                data: {
                  organizationId: user.organizationId,
                  productId: l.item.productId,
                  quantity: new Prisma.Decimal(pieces),
                  type: 'SALE_RETURN',
                  reason: `مرتجع بيع ${sale.invoiceNumber}`,
                  notes: body.reason?.trim() || `إرجاع من فاتورة ${sale.invoiceNumber}`,
                },
              });
            }
          }

          if (refundAmount > 0) {
            await tx.cashTransaction.create({
              data: {
                organizationId: user.organizationId,
                userId: user.userId,
                kind: 'EXPENSE',
                date: returnDate,
                category: 'مرتجع مبيعات',
                amount: new Prisma.Decimal(refundAmount),
                method: 'CASH',
                reference: `SALE_RETURN:${saleReturn.id}`,
                notes: `استرداد مرتجع بيع ${sale.invoiceNumber}`,
              },
            });
          }

          return saleReturn;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 15_000,
        },
      );
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new BadRequestException('تعارض في المخزون بسبب عملية متزامنة — أعد المحاولة.');
      }
      throw error;
    }
  }

    private async lockProductRow(
    tx: Prisma.TransactionClient,
    organizationId: string,
    productId: string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT id FROM "Product"
      WHERE id = ${productId} AND "organizationId" = ${organizationId}
     
    `;
  }

  private async currentStockTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    productId: string,
  ): Promise<number> {
    const product = await tx.product.findFirst({
      where: { id: productId, organizationId },
      include: {
        purchaseItems: { where: { invoice: { organizationId } } },
        returnItems: {
          where: { purchaseReturn: { organizationId } },
          include: { invoiceItem: true },
        },
        stockMovements: { where: { organizationId } },
      },
    });
    if (!product) return 0;
    return computeStockPieces({
      purchases: product.purchaseItems.map((item) => ({
        quantity: Number(item.quantity),
        unit: item.unit,
        piecesPerPack: item.piecesPerPack,
      })),
      returns: product.returnItems.map((item) => ({
        quantity: Number(item.quantity),
        unit: item.invoiceItem.unit,
        piecesPerPack: item.invoiceItem.piecesPerPack,
      })),
      movements: product.stockMovements.map((m) => ({
        quantity: Number(m.quantity),
        type: m.type,
      })),
    });
  }
}
