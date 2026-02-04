import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as jose from 'jose';

export interface JwtPayload {
  sub: string;
  email?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Verify Supabase JWT and return payload (sub, email). */
  async verifyToken(token: string): Promise<JwtPayload> {
    const secret = this.config.get<string>('SUPABASE_JWT_SECRET');
    if (!secret) {
      throw new UnauthorizedException('Auth not configured');
    }
    try {
      const key = new TextEncoder().encode(secret);
      const { payload } = await jose.jwtVerify(token, key, {
        algorithms: ['HS256'],
      });
      const sub = payload.sub as string;
      if (!sub) throw new UnauthorizedException('Invalid token');
      return {
        sub,
        email: (payload.email as string) ?? undefined,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /** Upsert user by Supabase id (sub) so we have a local User record. */
  async ensureUser(sub: string, email?: string): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: sub },
      create: {
        id: sub,
        email: email ?? null,
        name: null,
      },
      update: { ...(email && { email }), updatedAt: new Date() },
    });
  }
}
