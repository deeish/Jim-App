import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { UserId } from '../auth/user-id.decorator';
import { CrewsService } from './crews.service';
import {
  CrewSummaryQueryDto,
  JoinCrewDto,
  KudosDto,
  RenameCrewDto,
} from './dto/crews.dto';

// ThrottlerGuard: join is a code-redemption surface (same shape as shares) and
// must not be brute-forceable; the rest inherits the same sane per-user limits.
@Controller('crews')
@UseGuards(AuthGuard, ThrottlerGuard)
export class CrewsController {
  constructor(private readonly crews: CrewsService) {}

  @Post()
  create(@UserId() userId: string) {
    return this.crews.createCrew(userId);
  }

  @Post('join')
  @HttpCode(200)
  join(@UserId() userId: string, @Body() body: JoinCrewDto) {
    return this.crews.joinCrew(userId, body.code);
  }

  @Delete('mine')
  @HttpCode(204)
  async leave(@UserId() userId: string) {
    await this.crews.leaveCrew(userId);
  }

  @Patch('mine')
  rename(@UserId() userId: string, @Body() body: RenameCrewDto) {
    return this.crews.renameCrew(userId, body.name);
  }

  @Get('mine/summary')
  summary(@UserId() userId: string, @Query() query: CrewSummaryQueryDto) {
    return this.crews.getSummary(
      userId,
      query.today,
      query.weekMonday,
      query.tz,
    );
  }

  @Post('mine/kudos')
  @HttpCode(200)
  kudos(@UserId() userId: string, @Body() body: KudosDto) {
    return this.crews.toggleKudos(userId, body.toUserId, body.eventRef);
  }
}
