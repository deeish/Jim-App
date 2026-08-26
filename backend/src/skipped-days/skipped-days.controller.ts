import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { UserId } from '../auth/user-id.decorator';
import { SkippedDaysService } from './skipped-days.service';

@Controller('skipped-days')
@UseGuards(AuthGuard)
export class SkippedDaysController {
  constructor(private readonly skippedDays: SkippedDaysService) {}

  @Get()
  async list(
    @UserId() userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return { dates: await this.skippedDays.list(userId, from, to) };
  }

  @Put(':dateIso')
  @HttpCode(204)
  async skip(@UserId() userId: string, @Param('dateIso') dateIso: string) {
    await this.skippedDays.skip(userId, dateIso);
  }

  @Delete(':dateIso')
  @HttpCode(204)
  async unskip(@UserId() userId: string, @Param('dateIso') dateIso: string) {
    await this.skippedDays.unskip(userId, dateIso);
  }

  /** DELETE /skipped-days?from=YYYY-MM-DD — new-plan cleanup of future skips. */
  @Delete()
  @HttpCode(204)
  async clearFrom(@UserId() userId: string, @Query('from') from: string) {
    await this.skippedDays.clearFrom(userId, from ?? '');
  }
}
