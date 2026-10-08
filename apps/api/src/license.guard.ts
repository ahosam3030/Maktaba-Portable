import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { PrismaService } from './prisma.service';
import { AuthUser } from './auth';

/** تخطّي فحص الترخيص */
export const SKIP_LICENSE_KEY = 'skip_license';
export const SkipLicense = () => SetMetadata(SKIP_LICENSE_KEY, true);

/** السماح بالكتابة حتى بدون تفعيل (تفعيل الترخيص نفسه) */
export const ALLOW_UNLICENSED_WRITE = 'allow_unlicensed_write';
export const AllowUnlicensedWrite = () => SetMetadata(ALLOW_UNLICENSED_WRITE, true);

function trialDays(): number {
  const n = Number(process.env.TRIAL_DAYS);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 14;
}

/**
 * يُنفَّذ كـ Interceptor بعد حراس JWT حتى يتوفر req.user.
 * بعد انتهاء التجربة بدون تفعيل: القراءة مسموحة والكتابة ممنوعة.
 */
@Injectable()
export class LicenseWriteInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_LICENSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const allowWrite = this.reflector.getAllAndOverride<boolean>(ALLOW_UNLICENSED_WRITE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowWrite) return next.handle();

    const req = context.switchToHttp().getRequest();
    const method = String(req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next.handle();

    const user = req.user as AuthUser | undefined;
    if (!user?.organizationId) return next.handle();

    const activated = await this.prisma.licenseActivation.count({
      where: { organizationId: user.organizationId, active: true },
    });
    if (activated > 0) return next.handle();

    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { createdAt: true },
    });
    if (!org) return next.handle();

    const days = trialDays();
    const elapsedDays = (Date.now() - new Date(org.createdAt).getTime()) / (24 * 60 * 60 * 1000);
    if (elapsedDays <= days) return next.handle();

    throw new ForbiddenException(
      `انتهت فترة التجربة (${days} يومًا). فعّل الترخيص من الإعدادات → الدعم والترخيص للمتابعة.`,
    );
  }
}

/** @deprecated استخدم LicenseWriteInterceptor */
export { LicenseWriteInterceptor as LicenseWriteGuard };
