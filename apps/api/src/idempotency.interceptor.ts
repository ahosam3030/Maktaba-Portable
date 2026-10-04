import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of, from } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { PrismaService } from './prisma.service';

/**
 * إذا أرسل العميل X-Idempotency-Key مع طلب كتابة، نعيد نفس الاستجابة المخزّنة
 * بدل تنفيذ العملية مرة ثانية (مهم لطابور الأوفلاين).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next.handle();
    }
    const key = (req.headers['x-idempotency-key'] as string | undefined)?.trim();
    if (!key || key.length < 8 || key.length > 120) {
      return next.handle();
    }
    const user = req.user as { organizationId?: string } | undefined;
    const organizationId = user?.organizationId || 'anonymous';
    const path = (req.originalUrl || req.url || '').split('?')[0];

    return from(
      this.prisma.idempotencyRecord.findUnique({ where: { id: key } }),
    ).pipe(
      switchMap((existing) => {
        if (existing) {
          res.status(existing.statusCode);
          try {
            return of(JSON.parse(existing.responseBody));
          } catch {
            return of(existing.responseBody);
          }
        }
        return next.handle().pipe(
          switchMap((body) =>
            from(
              this.prisma.idempotencyRecord
                .create({
                  data: {
                    id: key,
                    organizationId,
                    method,
                    path,
                    statusCode: res.statusCode || 201,
                    responseBody: JSON.stringify(body ?? null),
                  },
                })
                .catch(() => null)
                .then(() => body),
            ),
          ),
        );
      }),
    );
  }
}
