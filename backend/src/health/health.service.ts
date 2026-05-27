import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ProbeResult = 'ok' | 'down' | 'skipped';

const PROBE_TIMEOUT_MS = 3_000;
const PROBE_CACHE_TTL_MS = 30_000;

/**
 * Liveness/readiness probes. External probes are cached so health checks
 * fired every few seconds don't hammer Supabase / Groq.
 *
 * DB is not cached — it's the only subsystem whose state we treat as gating;
 * we want to know about it immediately.
 */
@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  private cache = new Map<string, { result: ProbeResult; until: number }>();

  async checkDb(): Promise<ProbeResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'down';
    }
  }

  async checkSupabase(): Promise<ProbeResult> {
    const url = process.env.SUPABASE_URL?.trim();
    if (!url) return 'skipped';
    return this.cachedProbe('supabase', async () => {
      // JWKS is the actual runtime dependency for token verification
      // (auth.service.ts pulls keys from here) and is publicly reachable.
      const res = await this.fetchWithTimeout(
        `${url.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`,
      );
      return res.ok ? 'ok' : 'down';
    });
  }

  async checkGroq(): Promise<ProbeResult> {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) return 'skipped';
    return this.cachedProbe('groq', async () => {
      const res = await this.fetchWithTimeout(
        'https://api.groq.com/openai/v1/models',
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      return res.ok ? 'ok' : 'down';
    });
  }

  private async cachedProbe(
    key: string,
    probe: () => Promise<ProbeResult>,
  ): Promise<ProbeResult> {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.until > now) return cached.result;
    let result: ProbeResult;
    try {
      result = await probe();
    } catch {
      result = 'down';
    }
    this.cache.set(key, { result, until: now + PROBE_CACHE_TTL_MS });
    return result;
  }

  private async fetchWithTimeout(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
