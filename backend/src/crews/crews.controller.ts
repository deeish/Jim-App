import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { UserId } from '../auth/user-id.decorator';
import { CrewsService } from './crews.service';
import {
  CreateCrewDto,
  CrewSummaryQueryDto,
  JoinCrewDto,
  KudosDto,
  RenameCrewDto,
} from './dto/crews.dto';

// ThrottlerGuard: join is a code-redemption surface (same shape as shares) and
// must not be brute-forceable. Only the CATALOG buckets apply (120/min): the
// AI buckets (12/min) would choke ordinary summary refreshes — same
// SkipThrottle split the shares controller uses.
@Controller('crews')
@UseGuards(AuthGuard, ThrottlerGuard)
@SkipThrottle({ aiBurst: true, aiDay: true })
export class CrewsController {
  constructor(private readonly crews: CrewsService) {}

  @Post()
  create(@UserId() userId: string, @Body() body: CreateCrewDto) {
    return this.crews.createCrew(userId, body.name);
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

  /** Remove a crewmate. Crew lead only — see `CrewsService.leadOf`. */
  @Delete('mine/members/:userId')
  @HttpCode(204)
  async removeMember(
    @UserId() userId: string,
    @Param('userId') targetUserId: string,
  ) {
    await this.crews.removeMember(userId, targetUserId);
  }

  /** Mint a new code, the only way to un-share one that leaked. Lead only. */
  @Post('mine/code')
  @HttpCode(200)
  rotateCode(@UserId() userId: string) {
    return this.crews.rotateCode(userId);
  }

  @Post('mine/kudos')
  @HttpCode(200)
  kudos(@UserId() userId: string, @Body() body: KudosDto) {
    return this.crews.toggleKudos(userId, body.toUserId, body.eventRef);
  }
}
