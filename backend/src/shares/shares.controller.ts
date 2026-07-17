import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { UserId } from '../auth/user-id.decorator';
import { SharesService } from './shares.service';
import { CreateShareDto } from './dto/create-share.dto';

/**
 * Share codes are capability tokens: anyone signed in with the code can preview
 * and clone the shared plan/workout. All routes require auth; the generous
 * catalog throttle buckets (per user) make code enumeration hopeless against
 * the 30^8 code space, so AI buckets are skipped like other non-LLM routes.
 */
@Controller('shares')
@UseGuards(AuthGuard, ThrottlerGuard)
@SkipThrottle({ aiBurst: true, aiDay: true })
export class SharesController {
  constructor(private readonly sharesService: SharesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateShareDto, @UserId() userId: string) {
    return this.sharesService.createShare(dto, userId);
  }

  @Get(':code')
  preview(@Param('code') code: string, @UserId() userId: string) {
    return this.sharesService.getByCode(code, userId);
  }

  @Post(':code/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Param('code') code: string, @UserId() userId: string) {
    return this.sharesService.accept(code, userId);
  }
}
