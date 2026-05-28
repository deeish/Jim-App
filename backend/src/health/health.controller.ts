import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService, type ProbeResult } from './health.service';

/**
 * Operations probes. No auth — intended for load balancers / k8s / uptime monitors.
 * - GET /api/health — process up (fast)
 * - GET /api/health/ready — DB reachable; reports Supabase + Groq as 'ok'/'down'/'skipped'
 *
 * Readiness contract:
 *   200 ready     — everything healthy
 *   200 degraded  — DB ok but Supabase or Groq down (service still usable)
 *   503 unready   — DB down (service cannot function)
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  liveness() {
    return {
      status: 'ok',
      service: 'jim-api',
      timestamp: new Date().toISOString(),
    };
  }

  // TEMP: Sentry end-to-end verification route. Throws an unhandled error so
  // SanitizedExceptionFilter routes it through reportToSentry. Remove after
  // confirming the event lands in the jim-api Sentry project.
  @Get('boom')
  boom(): never {
    throw new Error('Sentry verification boom — temporary route');
  }

  @Get('ready')
  async readiness(@Res({ passthrough: true }) res: Response) {
    const [db, supabase, groq] = await Promise.all([
      this.health.checkDb(),
      this.health.checkSupabase(),
      this.health.checkGroq(),
    ]);

    const status = readinessStatus(db, supabase, groq);
    if (status === 'unready') res.status(503);

    return {
      status,
      checks: { db, supabase, groq },
      timestamp: new Date().toISOString(),
    };
  }
}

function readinessStatus(
  db: ProbeResult,
  supabase: ProbeResult,
  groq: ProbeResult,
): 'ready' | 'degraded' | 'unready' {
  if (db === 'down') return 'unready';
  if (supabase === 'down' || groq === 'down') return 'degraded';
  return 'ready';
}
