import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthUser, CurrentUser, JwtAuthGuard } from './auth';

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
  ) {
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      throw new ForbiddenException('سجل التدقيق متاح للمالك والأدمن فقط.');
    }
    const take = Math.min(200, Math.max(1, Number(limit) || 50));
    return this.prisma.auditLog.findMany({
      where: {
        organizationId: user.organizationId,
        ...(action?.trim() ? { action: action.trim() } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
