import { BadRequestException, Body, Controller, ForbiddenException, Get, Put, UseGuards } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthUser, CurrentUser, JwtAuthGuard, PermissionsGuard } from './auth';
import { AuditService } from './audit.service';

export type PaperSize = 'thermal_58' | 'thermal_80' | 'a4';

export type PrintSettingsDto = {
  brandTitle: string;
  brandSubtitle: string;
  phone: string;
  address: string;
  watermarkText: string;
  serviceTags: string[];
  invoiceTitle: string;
  footerText: string;
  /** حجم ورقة الفاتورة: حراري 58مم / 80مم أو A4 */
  paperSize: PaperSize;
};

const DEFAULTS: PrintSettingsDto = {
  brandTitle: '',
  brandSubtitle: 'للخدمات العلمية والطباعة والأدوات المكتبية',
  phone: '',
  address: '',
  watermarkText: '',
  serviceTags: ['خدمات علمية', 'تصوير وطباعة', 'أدوات مكتبية'],
  invoiceTitle: 'فاتورة مبيعات',
  footerText: 'شكرًا لثقتكم بنا',
  paperSize: 'thermal_80',
};

function normalizePaperSize(v: unknown): PaperSize {
  const s = String(v || '').trim();
  if (s === 'thermal_58' || s === '58') return 'thermal_58';
  if (s === 'a4' || s === 'A4') return 'a4';
  return 'thermal_80';
}

function parseSettings(raw: string | null | undefined): PrintSettingsDto {
  if (!raw?.trim()) {
    return { ...DEFAULTS, serviceTags: [...DEFAULTS.serviceTags] };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PrintSettingsDto>;
    const tags = Array.isArray(parsed.serviceTags)
      ? parsed.serviceTags.map(String).map((x) => x.trim()).filter(Boolean)
      : [...DEFAULTS.serviceTags];
    return {
      brandTitle: String(parsed.brandTitle ?? DEFAULTS.brandTitle).trim() || DEFAULTS.brandTitle,
      brandSubtitle: String(parsed.brandSubtitle ?? DEFAULTS.brandSubtitle).trim() || DEFAULTS.brandSubtitle,
      phone: String(parsed.phone ?? DEFAULTS.phone).trim() || DEFAULTS.phone,
      address: String(parsed.address ?? DEFAULTS.address).trim() || DEFAULTS.address,
      watermarkText: String(parsed.watermarkText ?? DEFAULTS.watermarkText).trim() || DEFAULTS.watermarkText,
      serviceTags: tags.length ? tags : [...DEFAULTS.serviceTags],
      invoiceTitle: String(parsed.invoiceTitle ?? DEFAULTS.invoiceTitle).trim() || DEFAULTS.invoiceTitle,
      footerText: String(parsed.footerText ?? DEFAULTS.footerText).trim() || DEFAULTS.footerText,
      paperSize: normalizePaperSize(parsed.paperSize),
    };
  } catch {
    return { ...DEFAULTS, serviceTags: [...DEFAULTS.serviceTags] };
  }
}

function sanitize(body: Partial<PrintSettingsDto> | undefined): PrintSettingsDto {
  const tags = Array.isArray(body?.serviceTags)
    ? body!.serviceTags!.map(String).map((t) => t.trim()).filter(Boolean).slice(0, 20)
    : [...DEFAULTS.serviceTags];
  const str = (v: unknown, fallback: string, max = 200) => {
    const s = String(v ?? fallback).trim();
    return (s || fallback).slice(0, max);
  };
  return {
    brandTitle: str(body?.brandTitle, DEFAULTS.brandTitle, 120),
    brandSubtitle: str(body?.brandSubtitle, DEFAULTS.brandSubtitle, 200),
    phone: str(body?.phone, DEFAULTS.phone, 40),
    address: str(body?.address, DEFAULTS.address, 300),
    watermarkText: str(body?.watermarkText, DEFAULTS.watermarkText, 200),
    serviceTags: tags.length ? tags : [...DEFAULTS.serviceTags],
    invoiceTitle: str(body?.invoiceTitle, DEFAULTS.invoiceTitle, 80),
    footerText: str(body?.footerText, DEFAULTS.footerText, 200),
    paperSize: normalizePaperSize(body?.paperSize),
  };
}

@Controller('settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('print')
  async getPrint(@CurrentUser() user: AuthUser) {
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { printSettings: true },
    });
    return parseSettings(org?.printSettings);
  }

  @Put('print')
  async putPrint(@CurrentUser() user: AuthUser, @Body() body: Partial<PrintSettingsDto>) {
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      throw new ForbiddenException('تعديل إعدادات الطباعة متاح للمالك أو الأدمن فقط.');
    }
    const clean = sanitize(body);
    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: { printSettings: JSON.stringify(clean) },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'PRINT_SETTINGS_UPDATE',
      entity: 'Organization',
      entityId: user.organizationId,
      success: true,
    });
    return clean;
  }

  @Put('print/reset')
  async resetPrint(@CurrentUser() user: AuthUser) {
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      throw new BadRequestException('استعادة الإعدادات متاحة للمالك أو الأدمن فقط.');
    }
    const clean = { ...DEFAULTS, serviceTags: [...DEFAULTS.serviceTags] };
    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: { printSettings: JSON.stringify(clean) },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'PRINT_SETTINGS_RESET',
      entity: 'Organization',
      entityId: user.organizationId,
      success: true,
    });
    return clean;
  }
}
