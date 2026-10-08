import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export type AuditInput = {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown> | string | null;
  success?: boolean;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput): Promise<void> {
    try {
      const meta =
        input.meta == null
          ? null
          : typeof input.meta === 'string'
            ? input.meta
            : JSON.stringify(input.meta);
      await this.prisma.auditLog.create({
        data: {
          organizationId: input.organizationId || null,
          userId: input.userId || null,
          action: input.action,
          entity: input.entity || null,
          entityId: input.entityId || null,
          ip: input.ip || null,
          userAgent: input.userAgent?.slice(0, 500) || null,
          meta,
          success: input.success !== false,
        },
      });
    } catch {
      // لا نكسر العملية الأساسية لو فشل التدقيق
    }
  }
}
