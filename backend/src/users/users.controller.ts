import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { UserId } from '../auth/user-id.decorator';
import { UpdateMeDto } from './dto/update-me.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/export')
  export(@UserId() userId: string) {
    return this.usersService.exportUserData(userId);
  }

  /** Sync display name / avatar so crewmates see them (fire-and-forget client-side). */
  @Patch('me')
  updateMe(@UserId() userId: string, @Body() body: UpdateMeDto) {
    return this.usersService.updateProfile(userId, body);
  }

  @Delete('me')
  remove(@UserId() userId: string) {
    return this.usersService.deleteUserAccount(userId);
  }
}
