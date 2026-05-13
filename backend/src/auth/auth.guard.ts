import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;

    if (!token) {
      this.logger.warn(`No Bearer token in request to ${request.url}`);
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const payload = await this.authService.verifyToken(token);
    await this.authService.ensureUser(payload.sub, payload.email);

    request.user = { id: payload.sub };
    return true;
  }
}
