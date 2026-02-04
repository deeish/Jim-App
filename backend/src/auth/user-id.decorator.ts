import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const id = request.user?.id;
    if (!id) throw new Error('UserId decorator used without AuthGuard');
    return id;
  },
);
