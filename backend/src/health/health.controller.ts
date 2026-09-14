import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService, type ProbeResult } from './health.service';

/**
 * Operations probes. No auth — intended for load balancers / k8s / uptime monitors.
 * - GET /api/health — process up (fast)
 * - GET /api/health/ready — DB reachable; reports Supabase + the LLM model as 'ok'/'down'/'skipped'
 *
 * Readiness contract:
 *   200 ready     — everything healthy
 *   200 degraded  — DB ok but Supabase or the LLM down (service still usable)
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

  @Get('ready')
  async readiness(@Res({ passthrough: true }) res: Response) {
    const [db, supabase, llm] = await Promise.all([
      this.health.checkDb(),
      this.health.checkSupabase(),
      this.health.checkLlm(),
    ]);

    const status = readinessStatus(db, supabase, llm);
    if (status === 'unready') res.status(503);

    return {
      status,
      checks: { db, supabase, llm },
      timestamp: new Date().toISOString(),
    };
  }
}

function readinessStatus(
  db: ProbeResult,
  supabase: ProbeResult,
  llm: ProbeResult,
): 'ready' | 'degraded' | 'unready' {
  if (db === 'down') return 'unready';
  if (supabase === 'down' || llm === 'down') return 'degraded';
  return 'ready';
}
