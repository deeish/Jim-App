import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const id = request.user?.id;
    if (!id)
      throw new UnauthorizedException('User ID not found in request context');
    return id;
  },
);
