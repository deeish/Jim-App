import { Controller, Delete, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { UserId } from '../auth/user-id.decorator';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/export')
  export(@UserId() userId: string) {
    return this.usersService.exportUserData(userId);
  }

  @Delete('me')
  remove(@UserId() userId: string) {
    return this.usersService.deleteUserAccount(userId);
  }
}
