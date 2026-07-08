import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { UserId } from '../auth/user-id.decorator';
import { BodyWeightService } from './body-weight.service';
import { CreateBodyWeightEntryDto } from './dto/create-body-weight-entry.dto';

@Controller('me/weight')
@UseGuards(AuthGuard)
export class BodyWeightController {
  constructor(private readonly bodyWeightService: BodyWeightService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@UserId() userId: string, @Body() dto: CreateBodyWeightEntryDto) {
    return this.bodyWeightService.create(userId, dto);
  }

  @Get()
  findAll(@UserId() userId: string, @Query('limit') limit?: string) {
    const parsed = limit ? Number.parseInt(limit, 10) : undefined;
    return this.bodyWeightService.findAll(userId, {
      limit: Number.isFinite(parsed) ? parsed : undefined,
    });
  }

  @Delete(':id')
  remove(@UserId() userId: string, @Param('id') id: string) {
    return this.bodyWeightService.remove(userId, id);
  }
}
