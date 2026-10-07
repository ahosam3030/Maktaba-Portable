import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { JwtAuthGuard, CurrentUser, AuthUser, isAdminRole } from './auth';
import { PrismaService } from './prisma.service';

function licenseSecret() {
  return process.env.LICENSE_SECRET || process.env.JWT_SECRET || '';
}

export function generateSerial(maxDevices: number): string {
  const raw = randomBytes(6).toString('hex').toUpperCase();
  const parts = [raw.slice(0, 4), raw.slice(4, 8), raw.slice(8, 12)];
  const payload = `${parts.join('-')}:${maxDevices}`;
  const sig = createHmac('sha256', licenseSecret()).update(payload).digest('hex').slice(0, 4).toUpperCase();
  return `MAK-${parts[0]}-${parts[1]}-${parts[2]}-${Math.max(1, Math.min(99, maxDevices))}${sig}`;
}

export function parseAndValidateSerial(serial: string): { maxDevices: number; ok: boolean } {
  const secret = licenseSecret();
  if (!secret || secret.length < 16) return { maxDevices: 0, ok: false };
  const s = String(serial || '').trim().toUpperCase();
  const m = /^MAK-([A-F0-9]{4})-([A-F0-9]{4})-([A-F0-9]{4})-(\d{1,2})([A-F0-9]{4})$/.exec(s);
  if (!m) return { maxDevices: 0, ok: false };
  const maxDevices = parseInt(m[4], 10);
  const payload = `${m[1]}-${m[2]}-${m[3]}:${maxDevices}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex').slice(0, 4).toUpperCase();
  return { maxDevices, ok: sig === m[5] && maxDevices >= 1 };
}

@Controller('license')
@UseGuards(JwtAuthGuard)
export class LicenseController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('status')
  async status(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.licenseActivation.findMany({
      where: { organizationId: user.organizationId, active: true },
      orderBy: { activatedAt: 'asc' },
    });
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
    };
  }

  @Post('activate')
  async activate(
    @CurrentUser() user: AuthUser,
    @Body() body: { serialKey?: string; deviceId?: string; deviceName?: string },
  ) {
    const serialKey = String(body.serialKey || '').trim().toUpperCase();
    const deviceId = String(body.deviceId || '').trim();
    if (!serialKey || !deviceId) throw new BadRequestException('المفتاح ومعرّف الجهاز مطلوبان');
    const parsed = parseAndValidateSerial(serialKey);
    if (!parsed.ok) throw new BadRequestException('مفتاح الترخيص غير صالح');

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
  async issue(@CurrentUser() user: AuthUser, @Body() body: { maxDevices?: number }) {
    if (process.env.ALLOW_LICENSE_ISSUE !== 'YES') {
      throw new BadRequestException('إصدار المفاتيح غير متاح في نسخة العميل. تواصل مع البائع.');
    }
    if (user.role !== 'OWNER' && !isAdminRole(user.role)) {
      throw new BadRequestException('للمالك فقط');
    }
    if (!licenseSecret()) {
      throw new BadRequestException('LICENSE_SECRET غير مضبوط');
    }
    const maxDevices = Math.max(1, Math.min(20, Number(body.maxDevices) || 1));
    return { serialKey: generateSerial(maxDevices), maxDevices };
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
      whatsappUrl: `https://wa.me/${wa.replace(/\D/g, '')}`,
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
