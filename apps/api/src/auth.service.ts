import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { ALL_PERMISSIONS, isAdminRole, parsePermissions } from './auth';
import { hashPassword, verifyPassword, isStrongPassword, passwordNeedsRehash, PASSWORD_POLICY_MESSAGE } from './crypto.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async setupStatus() {
    const count = await this.prisma.user.count();
    return { needsSetup: count === 0, product: 'Maktaba-Portable' };
  }

  async register(input: {
    organizationName?: string;
    slug?: string;
    phone?: string;
    fullName?: string;
    email?: string;
    password?: string;
    setupSecret?: string;
  }) {
    const userCount = await this.prisma.user.count();
    const expected = process.env.SETUP_SECRET || '';
    const isFirstRun = userCount === 0;
    const secretOk = expected && input.setupSecret === expected;
    const firstRunOk = isFirstRun && (input.setupSecret === 'FIRST_RUN' || input.setupSecret === expected || !expected);
    // أول تثبيت فقط بدون مستخدمين، أو SETUP_SECRET صحيح
    if (!secretOk && !firstRunOk) {
      throw new ForbiddenException('التسجيل العام مقفول. المالك يضيف الحسابات من داخل النظام.');
    }
    const organizationName = input.organizationName?.trim();
    const slug = input.slug?.trim().toLowerCase();
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    if (!organizationName || !slug || !fullName || !email || !password) {
      throw new BadRequestException('كل الحقول الأساسية مطلوبة.');
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new BadRequestException(
        'المعرّف المختصر يجب أن يكون إنجليزيًا صغيرًا، ويمكن أن يحتوي على أرقام وشرطات.',
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('البريد الإلكتروني غير صحيح.');
    }
    if (!isStrongPassword(password)) {
      throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
    }
    const passwordHash = await hashPassword(password);
    const allPerms = JSON.stringify([...ALL_PERMISSIONS]);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: { name: organizationName, slug, phone: input.phone?.trim() || null },
        });
        const user = await tx.user.create({
          data: {
            organizationId: organization.id,
            fullName,
            email,
            passwordHash,
            role: 'OWNER',
            permissions: allPerms,
          },
        });
        return { organization, user };
      });
      return this.issue(result.user, result.organization);
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException('البريد الإلكتروني أو معرّف المكتبة مستخدم بالفعل.');
      }
      throw error;
    }
  }

  async login(input: { email?: string; password?: string }) {
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    if (!email || !password) {
      throw new BadRequestException('أدخل البريد الإلكتروني وكلمة المرور.');
    }
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });
    if (
      !user ||
      !user.active ||
      !user.passwordHash ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة.');
    }
    if (passwordNeedsRehash(user.passwordHash)) {
      const newHash = await hashPassword(password);
      await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
    }
    return this.issue(user, user.organization);
  }

  async deleteOrganization(
    user: { userId: string; organizationId: string; role: string },
    confirmSlug?: string,
  ) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('حذف المكتبة متاح لمالك الحساب فقط.');
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
    });
    if (!org) throw new NotFoundException('المكتبة غير موجودة.');
    if (!confirmSlug || confirmSlug.trim() !== org.slug) {
      throw new BadRequestException(`للتأكيد اكتب المعرّف: ${org.slug}`);
    }
    await this.prisma.organization.delete({ where: { id: org.id } });
    return { ok: true, deleted: org.slug, name: org.name };
  }


  /** حذف المكتبة من صفحة الدخول بعد التحقق من البريد وكلمة المرور (مالك فقط) */
  async deleteOrganizationWithCredentials(input: {
    email?: string;
    password?: string;
    confirmSlug?: string;
  }) {
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';
    const confirmSlug = input.confirmSlug?.trim();
    if (!email || !password || !confirmSlug) {
      throw new BadRequestException('أدخل البريد وكلمة المرور ومعرّف المكتبة للتأكيد.');
    }
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة.');
    }
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('حذف المكتبة متاح لمالك الحساب فقط.');
    }
    if (!user.active) {
      throw new ForbiddenException('الحساب غير نشط.');
    }
    const org = user.organization;
    if (!org || confirmSlug !== org.slug) {
      throw new BadRequestException(`للتأكيد اكتب المعرّف بالضبط: ${org?.slug || ''}`);
    }
    await this.prisma.organization.delete({ where: { id: org.id } });
    return { ok: true, deleted: org.slug, name: org.name };
  }

  private issue(
    user: {
      id: string;
      organizationId: string;
      fullName: string;
      email: string;
      role: string;
      permissions?: string;
    },
    organization: { id: string; name: string; slug: string; phone?: string | null },
  ) {
    let permissions = parsePermissions(user.permissions);
    if (isAdminRole(user.role)) permissions = [...ALL_PERMISSIONS];
    const accessToken = this.jwt.sign({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      permissions,
    });
    return {
      accessToken,
      tokenType: 'Bearer' as const,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        permissions,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        phone: organization.phone || null,
      },
    };
  }
}
