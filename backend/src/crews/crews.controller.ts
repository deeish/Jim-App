import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { UserId } from '../auth/user-id.decorator';
import { CrewsService } from './crews.service';
import { CrewSummaryQueryDto, JoinCrewDto, KudosDto } from './dto/crews.dto';

@Controller('crews')
@UseGuards(AuthGuard)
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
