import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { AuthUser, CurrentUser, JwtAuthGuard, PermissionsGuard, RequirePermission } from './auth';
import { AuditService } from './audit.service';
import { roundMoney } from './money.util';

const STATUSES = new Set(['ACTIVE', 'MAINTENANCE', 'SOLD', 'SCRAPPED']);

@Controller('assets')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('accounting')
export class AssetsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    const where: Prisma.AssetWhereInput = { organizationId: user.organizationId };
    if (status && STATUSES.has(status)) where.status = status;
    if (q?.trim()) {
      const term = q.trim();
      where.OR = [
        { name: { contains: term } },
        { category: { contains: term } },
        { serialNumber: { contains: term } },
        { location: { contains: term } },
        { notes: { contains: term } },
      ];
    }
    const rows = await this.prisma.asset.findMany({
      where,
      orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
    });
    const totalCost = rows.reduce((s, r) => s + Number(r.cost) * (r.quantity || 1), 0);
    const activeCost = rows
      .filter((r) => r.status === 'ACTIVE' || r.status === 'MAINTENANCE')
      .reduce((s, r) => s + Number(r.cost) * (r.quantity || 1), 0);
    return {
      items: rows.map((r) => this.serialize(r)),
      summary: {
        count: rows.length,
        totalCost: roundMoney(totalCost),
        activeCost: roundMoney(activeCost),
      },
    };
  }

  @Get(':id')
  async one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const row = await this.prisma.asset.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!row) throw new NotFoundException('الأصل غير موجود');
    return this.serialize(row);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      name?: string;
      category?: string;
      purchaseDate?: string;
      cost?: number;
      quantity?: number;
      status?: string;
      serialNumber?: string;
      location?: string;
      supplierName?: string;
      notes?: string;
      postToCash?: boolean;
    },
  ) {
    const name = String(body.name || '').trim();
    if (!name) throw new BadRequestException('اسم الأصل مطلوب');
    const cost = roundMoney(Number(body.cost) || 0);
    if (cost < 0) throw new BadRequestException('التكلفة غير صحيحة');
    const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));
    const status = STATUSES.has(String(body.status || 'ACTIVE'))
      ? String(body.status || 'ACTIVE')
      : 'ACTIVE';
    const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : new Date();
    if (Number.isNaN(purchaseDate.getTime())) throw new BadRequestException('تاريخ غير صحيح');
    const postToCash = Boolean(body.postToCash) && cost > 0;

    const asset = await this.prisma.$transaction(async (tx) => {
      const created = await tx.asset.create({
        data: {
          organizationId: user.organizationId,
          name,
          category: String(body.category || 'معدات').trim() || 'معدات',
          purchaseDate,
          cost: new Prisma.Decimal(cost),
          quantity,
          status,
          serialNumber: body.serialNumber?.trim() || null,
          location: body.location?.trim() || null,
          supplierName: body.supplierName?.trim() || null,
          notes: body.notes?.trim() || null,
          postedToCash: postToCash,
        },
      });
      if (postToCash) {
        const line = roundMoney(cost * quantity);
        await tx.cashTransaction.create({
          data: {
            organizationId: user.organizationId,
            userId: user.userId,
            kind: 'EXPENSE',
            date: purchaseDate,
            category: 'أصول ومعدات',
            amount: new Prisma.Decimal(line),
            method: 'CASH',
            reference: `ASSET:${created.id}`,
            notes: `شراء أصل: ${name}${body.category ? ' · ' + body.category : ''}`,
          },
        });
      }
      return created;
    });

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'ASSET_CREATE',
      entityType: 'Asset',
      entityId: asset.id,
      meta: { name, cost, quantity, postToCash },
    });

    return this.serialize(asset);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      category?: string;
      purchaseDate?: string;
      cost?: number;
      quantity?: number;
      status?: string;
      serialNumber?: string | null;
      location?: string | null;
      supplierName?: string | null;
      notes?: string | null;
    },
  ) {
    const existing = await this.prisma.asset.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('الأصل غير موجود');

    const data: Prisma.AssetUpdateInput = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new BadRequestException('اسم الأصل مطلوب');
      data.name = name;
    }
    if (body.category !== undefined) data.category = String(body.category).trim() || 'معدات';
    if (body.purchaseDate !== undefined) {
      const d = new Date(body.purchaseDate);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('تاريخ غير صحيح');
      data.purchaseDate = d;
    }
    if (body.cost !== undefined) {
      const cost = roundMoney(Number(body.cost));
      if (cost < 0) throw new BadRequestException('التكلفة غير صحيحة');
      data.cost = new Prisma.Decimal(cost);
    }
    if (body.quantity !== undefined) data.quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));
    if (body.status !== undefined) {
      if (!STATUSES.has(String(body.status))) throw new BadRequestException('حالة غير صحيحة');
      data.status = String(body.status);
    }
    if (body.serialNumber !== undefined) data.serialNumber = body.serialNumber?.trim() || null;
    if (body.location !== undefined) data.location = body.location?.trim() || null;
    if (body.supplierName !== undefined) data.supplierName = body.supplierName?.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

    const updated = await this.prisma.asset.update({ where: { id }, data });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'ASSET_UPDATE',
      entityType: 'Asset',
      entityId: id,
      meta: body,
    });
    return this.serialize(updated);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const existing = await this.prisma.asset.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('الأصل غير موجود');
    await this.prisma.asset.delete({ where: { id } });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'ASSET_DELETE',
      entityType: 'Asset',
      entityId: id,
      meta: { name: existing.name },
    });
    return { ok: true };
  }

  private serialize(r: {
    id: string;
    name: string;
    category: string;
    purchaseDate: Date;
    cost: Prisma.Decimal | number;
    quantity: number;
    status: string;
    serialNumber: string | null;
    location: string | null;
    supplierName: string | null;
    notes: string | null;
    postedToCash: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const cost = Number(r.cost);
    const qty = r.quantity || 1;
    return {
      ...r,
      cost,
      lineTotal: roundMoney(cost * qty),
      purchaseDate: r.purchaseDate,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
