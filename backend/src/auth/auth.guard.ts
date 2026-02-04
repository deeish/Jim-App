import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;

    if (!token) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Auth] No Bearer token in request to', request.url);
      }
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const payload = await this.authService.verifyToken(token);
    await this.authService.ensureUser(payload.sub, payload.email);

    request.user = { id: payload.sub };
    return true;
  }
}
