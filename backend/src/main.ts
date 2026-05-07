import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import helmet from 'helmet';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';
import { buildAllowedCorsOrigins } from './cors-origins';
import { JsonProductionLogger } from './common/json-logger.service';

function jsonBodyLimit(): string {
  const raw = process.env.JSON_BODY_LIMIT?.trim();
  return raw && raw.length > 0 ? raw : '512kb';
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    logger:
      process.env.NODE_ENV === 'production'
        ? new JsonProductionLogger()
        : undefined,
    bodyParser: false,
  });

  const bodyLimit = jsonBodyLimit();
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(bodyParser.json({ limit: bodyLimit }));
  app.use(bodyParser.urlencoded({ extended: true, limit: bodyLimit }));

  const allowedOrigins = buildAllowedCorsOrigins();
  const logger = new Logger('Bootstrap');

  app.enableCors({
    credentials: true,
    origin(
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      logger.warn(`CORS blocked Origin: ${origin}`);
      callback(null, false);
    },
  });

  if (process.env.NODE_ENV !== 'production') {
    logger.log(
      `CORS allowlist size=${allowedOrigins.size} (set CORS_ORIGINS to override dev defaults)`,
    );
  }

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API prefix
  app.setGlobalPrefix('api');

  // Root URL has no Nest route; browsers and probes hit `/` — avoid a confusing 404.
  const http = app.getHttpAdapter().getInstance();
  const rootJson = {
    service: 'jim-api',
    health: '/api/health',
    ready: '/api/health/ready',
  };
  http.get('/', (_req: Request, res: Response) => res.status(200).json(rootJson));
  http.head('/', (_req: Request, res: Response) => res.status(200).end());

  const port = process.env.PORT || 3000;
  await app.listen(port);
  const msg = `Listening on :${port} (global prefix /api; health GET /api/health)`;
  if (process.env.NODE_ENV === 'production') {
    console.log(
      JSON.stringify({ level: 'info', ts: new Date().toISOString(), msg }),
    );
  } else {
    console.log(`🚀 ${msg}`);
  }
}

bootstrap();
