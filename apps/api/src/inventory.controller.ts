import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

/** وحدة عرض حرة + توافق PIECE/PACK القديم */
function normalizeProductUnit(raw?: string): string {
  const s = String(raw || '').trim();
  if (!s) return 'قطعة';
  const up = s.toUpperCase();
  if (up === 'PIECE') return 'قطعة';
  if (up === 'PACK') return 'علبة';
  return s.slice(0, 40);
}

function isPackLikeUnit(unit: string, piecesPerPack: number): boolean {
  if (piecesPerPack > 1) return true;
  const u = unit.toUpperCase();
  if (u === 'PACK' || unit === 'علبة' || unit.includes('عبوة') || unit.includes('كرتونة') || unit.includes('رزمة') || unit.includes('دستة')) {
    return piecesPerPack > 1;
  }
  return false;
}

import { computeStockPieces } from './stock.util';
import { CurrentUser, JwtAuthGuard, PermissionsGuard, RequirePermission, AuthUser } from './auth';
import { imageFileFilter, orgUploadDir, safeImageExt } from './uploads';

type ProductBody = {
  name?: string;
  barcode?: string | null;
  unit?: string;
  piecesPerPack?: number;
  currentCost?: number;
  salePrice?: number;
  minStock?: number;
  imageUrl?: string | null;
  notes?: string | null;
  active?: boolean;
  /** رصيد افتتاحي عند الإضافة (يُسجَّل كتسوية) */
  initialStock?: number;
};

@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('inventory')
export class InventoryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const products = await this.prisma.product.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: {
        purchaseItems: { where: { invoice: { organizationId: user.organizationId } } },
        returnItems: {
          where: { purchaseReturn: { organizationId: user.organizationId } },
          include: { invoiceItem: true },
        },
        stockMovements: { where: { organizationId: user.organizationId } },
      },
    });
    return products.map((product) => this.mapProduct(product));
  }

  /** رفع صورة منتج — يُرجع مسارًا نسبيًا يُحفظ في imageUrl */
  @Post('upload-image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: imageFileFilter,
    }),
  )
  uploadImage(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('اختر ملف صورة للرفع.');
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new BadRequestException('الحد الأقصى لحجم الصورة 2 ميجابايت.');
    }
    const ext = safeImageExt(file.mimetype);
    const name = `${randomUUID()}${ext}`;
    const dir = orgUploadDir(user.organizationId);
    writeFileSync(join(dir, name), file.buffer);
    const imageUrl = `/uploads/${user.organizationId}/${name}`;
    return { imageUrl, size: file.size };
  }


  @Get('alerts/low-stock')
  async lowStockAlerts(@CurrentUser() user: AuthUser) {
    const products = await this.prisma.product.findMany({
      where: { organizationId: user.organizationId, active: true },
      include: {
        purchaseItems: { where: { invoice: { organizationId: user.organizationId } } },
        returnItems: {
          where: { purchaseReturn: { organizationId: user.organizationId } },
          include: { invoiceItem: true },
        },
        stockMovements: { where: { organizationId: user.organizationId } },
      },
      orderBy: { name: 'asc' },
    });
    const mapped = products.map((product) => this.mapProduct(product));
    const low = mapped.filter((p) => p.lowStock || (p.minStock > 0 && p.stock <= p.minStock));
    return {
      count: low.length,
      items: low.map((p) => ({
        id: p.id, name: p.name, barcode: p.barcode, stock: p.stock, minStock: p.minStock, unit: p.unit,
      })),
    };
  }

  @Post('products')
  async createProduct(@CurrentUser() user: AuthUser, @Body() body: ProductBody) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('اسم الصنف مطلوب.');
    const barcode = body.barcode?.trim() || null;
    const unit = normalizeProductUnit(body.unit);
    let piecesPerPack = Math.max(1, Math.floor(Number(body.piecesPerPack) || 1));
    if (unit === 'قطعة' || unit.toUpperCase() === 'PIECE') piecesPerPack = 1;
    const currentCost = Number(body.currentCost) || 0;
    const salePrice = Number(body.salePrice) || 0;
    const minStock = Number(body.minStock) || 0;
    if (currentCost < 0 || salePrice < 0 || minStock < 0) {
      throw new BadRequestException('الأسعار وحد المخزون لا يمكن أن تكون سالبة.');
    }
    if (barcode) {
      const dup = await this.prisma.product.findFirst({
        where: { organizationId: user.organizationId, barcode },
      });
      if (dup) throw new BadRequestException('الباركود مستخدم لصنف آخر في مكتبتك.');
    }
    const initialStock = Number(body.initialStock);
    const hasOpening = Number.isFinite(initialStock) && initialStock > 0;
    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            organizationId: user.organizationId,
            name,
            barcode,
            unit,
            piecesPerPack,
            currentCost,
            salePrice,
            minStock,
            imageUrl: body.imageUrl?.trim() || null,
            notes: body.notes?.trim() || null,
            active: body.active !== false,
          },
        });
        if (hasOpening) {
          await tx.stockMovement.create({
            data: {
              organizationId: user.organizationId,
              productId: created.id,
              quantity: new Prisma.Decimal(initialStock),
              type: 'ADJUSTMENT',
              reason: 'رصيد افتتاحي',
              notes: 'عند إضافة الصنف',
            },
          });
        }
        return created;
      });
      const stock = hasOpening ? initialStock : 0;
      return {
        id: product.id,
        name: product.name,
        barcode: product.barcode,
        unit: product.unit,
        piecesPerPack: product.piecesPerPack,
        currentCost: Number(product.currentCost),
        salePrice: Number(product.salePrice),
        minStock: Number(product.minStock),
        imageUrl: product.imageUrl,
        notes: product.notes,
        active: product.active,
        purchased: 0,
        returned: 0,
        sold: 0,
        adjusted: stock,
        stock,
        lowStock: minStock > 0 && stock <= minStock,
      };
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002') {
        throw new BadRequestException('اسم الصنف مستخدم بالفعل في مكتبتك.');
      }
      throw error;
    }
  }

  @Patch('products/:id')
  async updateProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ProductBody,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!product) throw new BadRequestException('الصنف غير موجود في مكتبتك.');

    const data: Prisma.ProductUpdateInput = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) throw new BadRequestException('اسم الصنف مطلوب.');
      data.name = name;
    }
    if (body.barcode !== undefined) {
      const barcode = body.barcode?.trim() || null;
      if (barcode) {
        const dup = await this.prisma.product.findFirst({
          where: { organizationId: user.organizationId, barcode, NOT: { id } },
        });
        if (dup) throw new BadRequestException('الباركود مستخدم لصنف آخر في مكتبتك.');
      }
      data.barcode = barcode;
    }
    if (body.unit !== undefined) {
      data.unit = normalizeProductUnit(body.unit);
    }
    if (body.piecesPerPack !== undefined) {
      const ppp = Math.floor(Number(body.piecesPerPack));
      if (!Number.isFinite(ppp) || ppp < 1) throw new BadRequestException('عدد القطع في العبوة غير صحيح.');
      data.piecesPerPack = ppp;
    }
    if (body.salePrice !== undefined) {
      const price = Number(body.salePrice);
      if (!Number.isFinite(price) || price < 0) throw new BadRequestException('سعر البيع غير صحيح.');
      data.salePrice = price;
    }
    if (body.currentCost !== undefined) {
      const cost = Number(body.currentCost);
      if (!Number.isFinite(cost) || cost < 0) throw new BadRequestException('التكلفة غير صحيحة.');
      data.currentCost = cost;
    }
    if (body.minStock !== undefined) {
      const ms = Number(body.minStock);
      if (!Number.isFinite(ms) || ms < 0) throw new BadRequestException('الحد الأدنى للمخزون غير صحيح.');
      data.minStock = ms;
    }
    if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl?.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    if (body.active !== undefined) data.active = Boolean(body.active);

    if (Object.keys(data).length === 0) throw new BadRequestException('لا توجد حقول لتحديثها.');
    try {
      return await this.prisma.product.update({ where: { id }, data });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002') {
        throw new BadRequestException('اسم الصنف مستخدم بالفعل في مكتبتك.');
      }
      throw error;
    }
  }

  @Delete('products/:id')
  async deleteProduct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        _count: {
          select: { purchaseItems: true, saleItems: true, returnItems: true, stockMovements: true },
        },
      },
    });
    if (!product) throw new BadRequestException('الصنف غير موجود في مكتبتك.');
    const linked = product._count.purchaseItems + product._count.saleItems + product._count.returnItems;
    if (linked > 0) {
      throw new BadRequestException(
        'لا يمكن حذف صنف مرتبط بفواتير وارد أو مبيعات أو مرتجعات. يمكنك تعطيله بدل الحذف.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({ where: { productId: id, organizationId: user.organizationId } });
      await tx.product.delete({ where: { id } });
    });
    return { ok: true, id, name: product.name };
  }

  @Post('adjustments')
  async adjust(
    @CurrentUser() user: AuthUser,
    @Body() body: { productId?: string; quantity?: number; reason?: string; notes?: string },
  ) {
    const productId = body.productId?.trim();
    const quantity = Number(body.quantity);
    const reason = body.reason?.trim();
    if (!productId || !Number.isFinite(quantity) || quantity === 0 || !reason) {
      throw new BadRequestException('اختر الصنف وأدخل كمية تعديل غير صفرية وسبب التعديل.');
    }
    return this.prisma.$transaction(
      async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "Product"
        WHERE id = ${productId} AND "organizationId" = ${user.organizationId}
       
      `;
      const product = await tx.product.findFirst({
        where: { id: productId, organizationId: user.organizationId },
      });
      if (!product) throw new BadRequestException('الصنف غير موجود في مكتبتك.');
      const current = await this.currentStockTx(tx, user.organizationId, productId);
      if (current + quantity < 0) throw new BadRequestException('لا يمكن أن يصبح رصيد الصنف بالسالب.');
      return tx.stockMovement.create({
        data: {
          organizationId: user.organizationId,
          productId,
          quantity: new Prisma.Decimal(quantity),
          type: 'ADJUSTMENT',
          reason,
          notes: body.notes?.trim() || null,
        },
        include: { product: { select: { id: true, name: true, barcode: true } } },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 15_000,
    },
    );
  }

  /** أُوقف لأسباب أمنية — كان يسمح بمسح حركات مخزون دون أثر تدقيق كافٍ */
  @Post('repair-purchase-delete-adjustments')
  repairPurchaseDeleteAdjustments() {
    throw new BadRequestException(
      'هذا المسار أُوقف. استخدم تسوية جرد يدوية موثّقة إن لزم تصحيح رصيد.',
    );
  }

  private mapProduct(product: {
    id: string;
    name: string;
    barcode: string | null;
    unit: string;
    piecesPerPack: number;
    currentCost: Prisma.Decimal;
    salePrice: Prisma.Decimal;
    minStock: Prisma.Decimal;
    imageUrl: string | null;
    notes: string | null;
    active: boolean;
    purchaseItems: Array<{ quantity: Prisma.Decimal; unit: string; piecesPerPack: number }>;
    returnItems: Array<{ quantity: Prisma.Decimal; invoiceItem: { unit: string; piecesPerPack: number } }>;
    stockMovements: Array<{ quantity: Prisma.Decimal; type: string }>;
  }) {
    const purchased = product.purchaseItems.reduce(
      (sum, item) => sum + Number(item.quantity) * (item.unit === 'PACK' || item.unit === 'علبة' || Number(item.piecesPerPack) > 1 ? Number(item.piecesPerPack) || 1 : 1),
      0,
    );
    const returned = product.returnItems.reduce(
      (sum, item) =>
        sum + Number(item.quantity) * (item.invoiceItem.unit === 'PACK' || item.invoiceItem.unit === 'علبة' || Number(item.invoiceItem.piecesPerPack) > 1 ? Number(item.invoiceItem.piecesPerPack) || 1 : 1),
      0,
    );
    const sold = -product.stockMovements
      .filter((m) => m.type === 'SALE')
      .reduce((sum, m) => sum + Number(m.quantity), 0);
    const adjusted = product.stockMovements
      .filter((m) => m.type !== 'SALE')
      .reduce((sum, m) => sum + Number(m.quantity), 0);
    const stock = purchased - returned - sold + adjusted;
    const minStock = Number(product.minStock);
    return {
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      unit: product.unit,
      piecesPerPack: product.piecesPerPack,
      currentCost: Number(product.currentCost),
      salePrice: Number(product.salePrice),
      minStock,
      imageUrl: product.imageUrl,
      notes: product.notes,
      active: product.active,
      purchased,
      returned,
      sold,
      adjusted,
      stock,
      lowStock: minStock > 0 && stock <= minStock,
    };
  }

  private async currentStockTx(tx: Prisma.TransactionClient, organizationId: string, productId: string) {
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
