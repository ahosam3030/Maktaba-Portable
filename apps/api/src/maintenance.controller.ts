import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard, PermissionsGuard, CurrentUser, AuthUser } from './auth';
import { APP_VERSION } from './version';
import * as fs from 'fs';
import * as path from 'path';

@Controller('maintenance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MaintenanceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('status')
  async status(@CurrentUser() user: AuthUser) {
    const dbUrl = process.env.DATABASE_URL || '';
    const dbFile = dbUrl.replace(/^file:/, '');
    let dbSize = 0;
    let dbExists = false;
    if (dbFile && fs.existsSync(dbFile)) {
      dbExists = true;
      dbSize = fs.statSync(dbFile).size;
    }
    let integrity = 'unknown';
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, string>>>(
        'PRAGMA integrity_check',
      );
      integrity = rows?.[0] ? String(Object.values(rows[0])[0]) : 'unknown';
    } catch {
      integrity = 'unavailable';
    }
    const [productCount, saleCount, licenseCount] = await Promise.all([
      this.prisma.product.count({ where: { organizationId: user.organizationId } }),
      this.prisma.sale.count({ where: { organizationId: user.organizationId } }),
      this.prisma.licenseActivation.count({
        where: { organizationId: user.organizationId, active: true },
      }),
    ]);
    const backupsDir = process.env.BACKUPS_DIR || path.join(path.dirname(dbFile || '.'), 'backups');
    let backupCount = 0;
    let lastBackup: string | null = null;
    try {
      if (fs.existsSync(backupsDir)) {
        const files = fs
          .readdirSync(backupsDir)
          .filter((f) => f.endsWith('.db'))
          .map((f) => ({ f, m: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
          .sort((a, b) => b.m - a.m);
        backupCount = files.length;
        if (files[0]) lastBackup = new Date(files[0].m).toISOString();
      }
    } catch { /* ignore */ }
    return {
      version: APP_VERSION,
      database: { exists: dbExists, sizeBytes: dbSize, integrity, ok: integrity === 'ok' || integrity === 'unknown' },
      counts: { products: productCount, sales: saleCount, licenses: licenseCount },
      backups: { count: backupCount, lastBackup, folder: backupsDir },
      platform: process.platform,
      node: process.version,
    };
  }

  @Get('support-report')
  async supportReport(@CurrentUser() user: AuthUser) {
    const status = await this.status(user);
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true, slug: true, createdAt: true },
    });
    return {
      generatedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      organization: org,
      user: { role: user.role, userId: user.userId },
      status,
      note: 'تقرير دعم بدون كلمات مرور أو مفاتيح ترخيص كاملة',
    };
  }

  @Post('integrity-check')
  async integrityCheck() {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, string>>>(
      'PRAGMA integrity_check',
    );
    const result = rows?.[0] ? String(Object.values(rows[0])[0]) : 'unknown';
    return { ok: result === 'ok', result };
  }
}
