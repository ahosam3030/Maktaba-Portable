import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {
  CurrentUser,
  JwtAuthGuard,
  AuthUser,
  ALL_PERMISSIONS,
  isAdminRole,
  parsePermissions,
  RequirePermission,
  PermissionsGuard,
} from './auth';
import { hashPassword, isStrongPassword, PASSWORD_POLICY_MESSAGE } from './crypto.util';
import { AuditService } from './audit.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermission('users')
  async list(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.user.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        permissions: true,
        active: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      ...r,
      permissions: isAdminRole(r.role) ? [...ALL_PERMISSIONS] : parsePermissions(r.permissions),
    }));
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const row = await this.prisma.user.findFirst({
      where: { id: user.userId, organizationId: user.organizationId },
      select: { id: true, fullName: true, email: true, role: true, permissions: true, active: true },
    });
    if (!row) throw new BadRequestException('المستخدم غير موجود.');
    const permissions = isAdminRole(row.role) ? [...ALL_PERMISSIONS] : parsePermissions(row.permissions);
    return { ...row, permissions };
  }

  @Post()
  @RequirePermission('users')
  async create(
    @CurrentUser() actor: AuthUser,
    @Body() body: CreateUserDto,
  ) {
    if (actor.role !== 'OWNER') {
      throw new ForbiddenException('إنشاء وتعديل المستخدمين متاح لمالك المكتبة فقط.');
    }
    const fullName = body.fullName?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? '';
    let role = (body.role || 'USER').toUpperCase();
    if (!fullName || !email) {
      throw new BadRequestException('الاسم والبريد مطلوبان.');
    }
    if (!isStrongPassword(password)) {
      throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('البريد الإلكتروني غير صحيح.');
    }
    if (!['OWNER', 'ADMIN', 'USER'].includes(role)) {
      role = 'USER';
    }
    const perms =
      role === 'OWNER' || role === 'ADMIN'
        ? [...ALL_PERMISSIONS]
        : (Array.isArray(body.permissions) ? body.permissions : []).filter((p) =>
            (ALL_PERMISSIONS as readonly string[]).includes(p),
          );
    const passwordHash = await hashPassword(password);
    try {
      const created = await this.prisma.user.create({
        data: {
          organizationId: actor.organizationId,
          fullName,
          email,
          passwordHash,
          role,
          permissions: JSON.stringify(perms),
          active: true,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          permissions: true,
          active: true,
          createdAt: true,
        },
      });
      await this.audit.log({
        organizationId: actor.organizationId,
        userId: actor.userId,
        action: 'USER_CREATE',
        entity: 'User',
        entityId: created.id,
        meta: { email: created.email, role: created.role },
        success: true,
      });
      return {
        ...created,
        permissions: isAdminRole(created.role) ? [...ALL_PERMISSIONS] : parsePermissions(created.permissions),
      };
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002') {
        throw new BadRequestException('البريد الإلكتروني مستخدم بالفعل.');
      }
      throw error;
    }
  }

  @Patch(':id')
  @RequirePermission('users')
  async update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
  ) {
    if (actor.role !== 'OWNER') {
      throw new ForbiddenException('إنشاء وتعديل المستخدمين متاح لمالك المكتبة فقط.');
    }
    const target = await this.prisma.user.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!target) throw new BadRequestException('المستخدم غير موجود.');

    if (target.id === actor.userId && body.active === false) {
      throw new BadRequestException('لا يمكنك تعطيل حسابك الحالي.');
    }

    const data: {
      fullName?: string;
      role?: string;
      permissions?: string;
      active?: boolean;
      passwordHash?: string;
    } = {};

    if (body.fullName?.trim()) data.fullName = body.fullName.trim();
    if (typeof body.active === 'boolean') data.active = body.active;

    if (body.role) {
      const role = body.role.toUpperCase();
      if (['OWNER', 'ADMIN', 'USER'].includes(role)) {
        // لا تخفّض آخر مالك
        if (target.role === 'OWNER' && role !== 'OWNER') {
          const owners = await this.prisma.user.count({
            where: { organizationId: actor.organizationId, role: 'OWNER', active: true },
          });
          if (owners <= 1) {
            throw new BadRequestException('لا يمكن تخفيض آخر مالك. أنشئ مالكًا آخر أولًا.');
          }
        }
        data.role = role;
      }
    }

    if (Array.isArray(body.permissions)) {
      const nextRole = data.role || target.role;
      if (nextRole === 'OWNER' || nextRole === 'ADMIN') {
        data.permissions = JSON.stringify([...ALL_PERMISSIONS]);
      } else {
        data.permissions = JSON.stringify(
          body.permissions.filter((p) => (ALL_PERMISSIONS as readonly string[]).includes(p)),
        );
      }
    }

    if (body.password) {
      if (!isStrongPassword(body.password)) throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
      data.passwordHash = await hashPassword(body.password);
    }

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data,
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        permissions: true,
        active: true,
        createdAt: true,
      },
    });
    return {
      ...updated,
      permissions: isAdminRole(updated.role) ? [...ALL_PERMISSIONS] : parsePermissions(updated.permissions),
    };
  }

  /** إيقاف حساب بدل الحذف الصلب (لتجنب أخطاء FK من الحركات المالية) */
  @Delete(':id')
  @RequirePermission('users')
  async remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    if (actor.role !== 'OWNER') {
      throw new ForbiddenException('إيقاف المستخدمين متاح لمالك المكتبة فقط.');
    }
    if (id === actor.userId) {
      throw new BadRequestException('لا يمكن إيقاف حسابك الحالي من هنا.');
    }
    const target = await this.prisma.user.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!target) throw new BadRequestException('المستخدم غير موجود.');

    if (target.role === 'OWNER') {
      const owners = await this.prisma.user.count({
        where: { organizationId: actor.organizationId, role: 'OWNER', active: true },
      });
      if (owners <= 1) {
        throw new BadRequestException(
          'لا يمكن إيقاف آخر مالك نشط. أنشئ مالكًا آخر أولًا.',
        );
      }
    }

    await this.prisma.user.update({
      where: { id: target.id },
      data: { active: false },
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'USER_DEACTIVATE',
      entity: 'User',
      entityId: target.id,
      meta: { email: target.email, role: target.role },
      success: true,
    });
    return { ok: true, id: target.id, email: target.email, active: false };
  }
}
