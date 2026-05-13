import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';
import jwksRsa = require('jwks-rsa');

type JwksClientInstance = ReturnType<typeof jwksRsa>;

export interface JwtPayload {
  sub: string;
  email?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private jwksClient: JwksClientInstance | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Get JWKS client for Supabase public key discovery (RS256/ES256). */
  private getJwksClient(): JwksClientInstance | null {
    if (this.jwksClient) return this.jwksClient;
    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    if (!supabaseUrl) {
      this.logger.warn('SUPABASE_URL not configured');
      return null;
    }
    try {
      const jwksUri = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
      this.jwksClient = jwksRsa({
        jwksUri,
        cache: true,
        cacheMaxAge: 600000, // 10 minutes
      });
      return this.jwksClient;
    } catch (err: any) {
      this.logger.error('Failed to create JWKS client', err?.message ?? String(err));
      return null;
    }
  }

  /** Verify Supabase JWT (supports HS256 legacy secret and RS256/ES256 signing keys). */
  async verifyToken(token: string): Promise<JwtPayload> {
    // Decode header to check algorithm
    const decoded = jwt.decode(token, { complete: true }) as {
      header?: { alg?: string; kid?: string };
      payload?: { sub?: string; email?: string };
    } | null;

    if (!decoded?.header) {
      throw new UnauthorizedException('Invalid token format');
    }

    const alg = decoded.header.alg;
    const kid = decoded.header.kid;

    // Try HS256 with legacy JWT secret first
    if (alg === 'HS256') {
      const secret = this.config.get<string>('SUPABASE_JWT_SECRET');
      if (!secret) {
        throw new UnauthorizedException('Auth not configured');
      }
      try {
        const payload = jwt.verify(token, secret, {
          algorithms: ['HS256'],
        }) as { sub?: string; email?: string };
        const sub = payload.sub;
        if (!sub) throw new UnauthorizedException('Invalid token');
        return { sub, email: payload.email ?? undefined };
      } catch (err: any) {
        this.logger.warn(`HS256 verify failed: ${err?.message ?? 'Unknown'}`);
        throw new UnauthorizedException('Invalid or expired token');
      }
    }

    // Try RS256/ES256 with JWKS (new signing keys)
    if (alg === 'RS256' || alg === 'ES256') {
      if (!kid) {
        this.logger.warn(`Token missing kid (key ID) for ${alg}`);
        throw new UnauthorizedException('Token missing key identifier');
      }
      const client = this.getJwksClient();
      if (!client) {
        const supabaseUrl = this.config.get<string>('SUPABASE_URL');
        this.logger.warn(`JWKS client not available. SUPABASE_URL: ${supabaseUrl}`);
        throw new UnauthorizedException('JWKS not available');
      }
      try {
        const key = await client.getSigningKey(kid);
        const publicKey = key.getPublicKey();
        const payload = jwt.verify(token, publicKey, {
          algorithms: [alg],
        }) as { sub?: string; email?: string };
        const sub = payload.sub;
        if (!sub) throw new UnauthorizedException('Invalid token');
        return { sub, email: payload.email ?? undefined };
      } catch (err: any) {
        this.logger.warn(`${alg} verify failed: ${err?.message ?? 'Unknown'}`);
        throw new UnauthorizedException('Invalid or expired token');
      }
    }

    throw new UnauthorizedException(`Unsupported algorithm: ${alg}`);
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
