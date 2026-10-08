import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthUser, CurrentUser, JwtAuthGuard, PermissionsGuard } from './auth';
import { AuditService } from './audit.service';

/** تصدير بيانات المكتبة الحالية (JSON) — للمالك فقط */
@Controller('backup')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BackupController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('export')
  async export(@CurrentUser() user: AuthUser) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('النسخ الاحتياطي متاح للمالك فقط.');
    }
    const orgId = user.organizationId;
    const [
      organization,
      users,
      suppliers,
      products,
      purchaseInvoices,
      sales,
      cashTransactions,
      services,
      serviceReceipts,
      dayCloses,
      drawerEvents,
    ] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId } }),
      this.prisma.user.findMany({
        where: { organizationId: orgId },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          permissions: true,
          active: true,
          createdAt: true,
        },
      }),
      this.prisma.supplier.findMany({ where: { organizationId: orgId } }),
      this.prisma.product.findMany({ where: { organizationId: orgId } }),
      this.prisma.purchaseInvoice.findMany({
        where: { organizationId: orgId },
        include: { items: true },
      }),
      this.prisma.sale.findMany({
        where: { organizationId: orgId },
        include: { items: true },
      }),
      this.prisma.cashTransaction.findMany({ where: { organizationId: orgId } }),
      this.prisma.service.findMany({ where: { organizationId: orgId } }),
      this.prisma.serviceReceipt.findMany({
        where: { organizationId: orgId },
        include: { items: true },
      }),
      this.prisma.dayClose.findMany({ where: { organizationId: orgId } }),
      this.prisma.drawerEvent.findMany({ where: { organizationId: orgId } }),
    ]);

    await this.audit.log({
      organizationId: orgId,
      userId: user.userId,
      action: 'BACKUP_EXPORT',
      entity: 'Organization',
      entityId: orgId,
      success: true,
    });

    return {
      exportedAt: new Date().toISOString(),
      version: 1,
      organization,
      users,
      suppliers,
      products,
      purchaseInvoices,
      sales,
      cashTransactions,
      services,
      serviceReceipts,
      dayCloses,
      drawerEvents,
    };
  }
}
