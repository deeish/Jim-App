import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Operations probes. No auth — intended for load balancers / k8s / uptime monitors.
 * - GET /api/health — process up (fast)
 * - GET /api/health/ready — database reachable
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  liveness() {
    return {
      status: 'ok',
      service: 'jim-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async readiness() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
    };
  }
}
