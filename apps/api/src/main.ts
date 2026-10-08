import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { join } from 'path';
import { existsSync } from 'fs';
import { uploadsRoot } from './uploads';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // إن كان خلف proxy: TRUST_PROXY=1
  if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }
  // صور المنتجات: http://host:3000/uploads/...
  app.useStaticAssets(uploadsRoot(), { prefix: '/uploads/' });

  // واجهة مبنية للتطبيق المكتبي (Electron) أو التشغيل الموحّد
  const webDist = process.env.WEB_DIST;
  if (webDist) {
    if (existsSync(webDist)) {
      app.useStaticAssets(webDist);
    } else {
      // eslint-disable-next-line no-console
      console.warn('WEB_DIST not found:', webDist);
    }
  }

  const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:3000,http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // رؤوس أمان أساسية (HTTPS الكامل يكون عبر reverse proxy مثل Caddy/Nginx)
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-XSS-Protection', '0');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // SPA fallback: أي مسار غير /api و /uploads → index.html
  if (webDist && existsSync(webDist)) {
    app.use((req: any, res: any, next: () => void) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const u = String(req.originalUrl || req.url || '');
      if (u.startsWith('/api') || u.startsWith('/uploads')) return next();
      if (u.includes('.')) return next();
      res.sendFile(join(webDist, 'index.html'), (err: unknown) => (err ? next() : undefined));
    });
  }

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}/api  (put HTTPS terminator in front for production)`);
}
bootstrap();
