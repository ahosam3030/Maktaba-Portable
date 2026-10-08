import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator, ForbiddenException, SetMetadata } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PrismaService } from './prisma.service';

export type AuthUser = {
  userId: string;
  organizationId: string;
  role: string;
  permissions: string[];
};

export const ALL_PERMISSIONS = [
  'purchases',
  'sales',
  'inventory',
  'accounting',
  'printing',
  'reports',
  'users',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export function parsePermissions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).filter((p) => (ALL_PERMISSIONS as readonly string[]).includes(p));
  } catch {
    return [];
  }
}

export function isAdminRole(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function userHasPermission(user: AuthUser, permission: Permission): boolean {
  if (isAdminRole(user.role)) return true;
  return user.permissions.includes(permission);
}

export const PERMISSION_KEY = 'required_permission';
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('سجّل الدخول أولًا.');
    try {
      const payload = await this.jwt.verifyAsync<{
        userId: string;
        organizationId: string;
        role: string;
        permissions?: string[];
      }>(header.slice(7));
      if (!payload.userId || !payload.organizationId) throw new Error('invalid token');

      // تحقق حي من قاعدة البيانات: مستخدم نشط + نفس المكتبة + أحدث دور وصلاحيات
      const dbUser = await this.prisma.user.findFirst({
        where: { id: payload.userId, organizationId: payload.organizationId },
        select: { id: true, role: true, permissions: true, active: true, organizationId: true },
      });
      if (!dbUser || dbUser.active === false) {
        throw new UnauthorizedException('الحساب غير موجود أو موقوف.');
      }
      let permissions: string[] = [];
      try {
        permissions = dbUser.permissions ? (JSON.parse(dbUser.permissions) as string[]) : [];
        if (!Array.isArray(permissions)) permissions = [];
      } catch {
        permissions = Array.isArray(payload.permissions) ? payload.permissions : [];
      }
      request.user = {
        userId: dbUser.id,
        organizationId: dbUser.organizationId,
        role: dbUser.role || 'USER',
        permissions,
      } satisfies AuthUser;
      return true;
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('جلسة الدخول غير صالحة أو انتهت.');
    }
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (!user) throw new UnauthorizedException('سجّل الدخول أولًا.');
    if (!userHasPermission(user, required)) {
      throw new ForbiddenException('ليس لديك صلاحية للوصول إلى هذا القسم.');
    }
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  return context.switchToHttp().getRequest().user as AuthUser;
});
