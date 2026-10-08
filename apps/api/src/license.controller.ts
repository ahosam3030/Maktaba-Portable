import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AllowUnlicensedWrite } from './license.guard';
import { JwtAuthGuard, CurrentUser, AuthUser, isAdminRole } from './auth';
import { PrismaService } from './prisma.service';
import { verifySignedLicense, verifyLegacyHmac } from './license-crypto';

function licenseSecret() {
  return process.env.LICENSE_SECRET || process.env.JWT_SECRET || '';
}

function validateSerial(serial: string): { maxDevices: number; ok: boolean; reason?: string } {
  const signed = verifySignedLicense(serial);
  if (signed.ok) return { maxDevices: signed.maxDevices, ok: true };
  if (process.env.ALLOW_LEGACY_LICENSE === '1') {
    const legacy = verifyLegacyHmac(serial, licenseSecret());
    if (legacy.ok) return { maxDevices: legacy.maxDevices, ok: true };
  }
  return {
    maxDevices: 0,
    ok: false,
    reason: signed.reason || 'مفتاح غير صالح. استخدم مفتاح MAK2 الصادر من البائع.',
  };
}

@Controller('license')
@UseGuards(JwtAuthGuard)
export class LicenseController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('status')
  @AllowUnlicensedWrite()
  async status(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.licenseActivation.findMany({
      where: { organizationId: user.organizationId, active: true },
      orderBy: { activatedAt: 'asc' },
    });
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { createdAt: true },
    });
    const trialDays = (() => {
      const n = Number(process.env.TRIAL_DAYS);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 14;
    })();
    const started = org?.createdAt ? new Date(org.createdAt).getTime() : Date.now();
    const elapsedDays = (Date.now() - started) / (24 * 60 * 60 * 1000);
    const trialActive = rows.length === 0 && elapsedDays <= trialDays;
    const trialExpired = rows.length === 0 && elapsedDays > trialDays;
    const daysLeft = rows.length > 0 ? null : Math.max(0, Math.ceil(trialDays - elapsedDays));
    return {
      activated: rows.length > 0,
      maxDevices: rows[0]?.maxDevices ?? 0,
      usedDevices: rows.length,
      devices: rows.map((r) => ({
        id: r.id,
        deviceId: r.deviceId,
        deviceName: r.deviceName,
        activatedAt: r.activatedAt,
        lastSeenAt: r.lastSeenAt,
      })),
      trialDays,
      trialActive,
      trialExpired,
      daysLeft,
      writeAllowed: rows.length > 0 || trialActive,
      scheme: 'Ed25519 (MAK2)',
    };
  }

  @Post('activate')
  @AllowUnlicensedWrite()
  async activate(
    @CurrentUser() user: AuthUser,
    @Body() body: { serialKey?: string; deviceId?: string; deviceName?: string },
  ) {
    const serialKey = String(body.serialKey || '').trim();
    const deviceId = String(body.deviceId || '').trim();
    if (!serialKey || !deviceId) throw new BadRequestException('المفتاح ومعرّف الجهاز مطلوبان');
    const parsed = validateSerial(serialKey);
    if (!parsed.ok) throw new BadRequestException(parsed.reason || 'مفتاح الترخيص غير صالح');

    const existingSame = await this.prisma.licenseActivation.findUnique({
      where: { organizationId_deviceId: { organizationId: user.organizationId, deviceId } },
    });
    if (existingSame?.active) {
      await this.prisma.licenseActivation.update({
        where: { id: existingSame.id },
        data: { lastSeenAt: new Date(), serialKey, maxDevices: parsed.maxDevices },
      });
      return { ok: true, message: 'الجهاز مفعّل مسبقًا', maxDevices: parsed.maxDevices };
    }

    const activeCount = await this.prisma.licenseActivation.count({
      where: { organizationId: user.organizationId, active: true },
    });
    if (activeCount >= parsed.maxDevices) {
      throw new BadRequestException(`تم بلوغ الحد الأقصى للأجهزة (${parsed.maxDevices}).`);
    }

    await this.prisma.licenseActivation.create({
      data: {
        organizationId: user.organizationId,
        serialKey,
        maxDevices: parsed.maxDevices,
        deviceId,
        deviceName: body.deviceName?.trim() || null,
      },
    });
    return { ok: true, message: 'تم تفعيل الترخيص على هذا الجهاز', maxDevices: parsed.maxDevices };
  }

  @Post('issue')
  async issue() {
    throw new BadRequestException(
      'إصدار المفاتيح من داخل نسخة العميل معطّل. استخدم عند البائع: node tools/issue-license.js',
    );
  }

  @Post('deactivate-device')
  async deactivate(@CurrentUser() user: AuthUser, @Body() body: { deviceId?: string }) {
    if (user.role !== 'OWNER' && !isAdminRole(user.role)) {
      throw new BadRequestException('للمالك/الأدمن فقط');
    }
    const deviceId = String(body.deviceId || '').trim();
    if (!deviceId) throw new BadRequestException('معرّف الجهاز مطلوب');
    await this.prisma.licenseActivation.updateMany({
      where: { organizationId: user.organizationId, deviceId },
      data: { active: false },
    });
    return { ok: true };
  }
}

@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('config')
  config() {
    const wa = process.env.SUPPORT_WHATSAPP || '';
    return {
      whatsapp: wa,
      whatsappUrl: wa ? `https://wa.me/${wa.replace(/\D/g, '')}` : '',
      email: process.env.SUPPORT_EMAIL || '',
    };
  }

  @Get('tickets')
  async list(@CurrentUser() user: AuthUser) {
    return this.prisma.supportTicket.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post('tickets')
  async create(@CurrentUser() user: AuthUser, @Body() body: { subject?: string; body?: string }) {
    const subject = String(body.subject || '').trim();
    const text = String(body.body || '').trim();
    if (!subject || !text) throw new BadRequestException('العنوان والوصف مطلوبان');
    if (subject.length > 200 || text.length > 5000) throw new BadRequestException('النص طويل جدًا');
    return this.prisma.supportTicket.create({
      data: {
        organizationId: user.organizationId,
        userId: user.userId,
        userName: null,
        subject,
        body: text,
      },
    });
  }
}
