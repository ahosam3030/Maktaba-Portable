import { MaintenanceController } from './maintenance.controller';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './health.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard, PermissionsGuard } from './auth';
import { SuppliersController, PurchaseInvoicesController, SupplierPaymentsController, PurchaseReturnsController } from './purchases.controller';
import { PrismaModule } from './prisma.module';
import { InventoryController } from './inventory.controller';
import { SalesController } from './sales.controller';
import { AccountingController } from './accounting.controller';
import { UsersController } from './users.controller';
import { ReportsController } from './reports.controller';
import { ServicesController, ServiceReceiptsController } from './services.controller';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { SettingsController } from './settings.controller';
import { CashOpsController } from './cash-ops.controller';
import { BackupController } from './backup.controller';
import { LicenseController,
    MaintenanceController, SupportController } from './license.controller';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { LicenseWriteInterceptor } from './license.guard';

const WEAK_JWT = new Set([
  '',
  'development-only-change-before-deploy',
  'replace-with-a-long-random-secret-before-deployment',
  'change-me',
  'secret',
]);
const jwtSecret = (process.env.JWT_SECRET || '').trim();
if (!jwtSecret || WEAK_JWT.has(jwtSecret) || jwtSecret.length < 32) {
  throw new Error(
    'JWT_SECRET must be set to a strong random string (min 32 characters). Update apps/api/.env',
  );
}

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: jwtSecret,
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    UsersController,
    ReportsController,
    SuppliersController,
    PurchaseInvoicesController,
    SupplierPaymentsController,
    PurchaseReturnsController,
    InventoryController,
    SalesController,
    AccountingController,
    ServicesController,
    ServiceReceiptsController,
    AuditController,
    SettingsController,
    CashOpsController,
    BackupController,
    LicenseController,
    MaintenanceController,
    SupportController,
  ],
  providers: [
      AuthService,
      AuditService,
      JwtAuthGuard,
      PermissionsGuard,
      { provide: APP_INTERCEPTOR, useClass: LicenseWriteInterceptor },
      { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    ],
})
export class AppModule {}
