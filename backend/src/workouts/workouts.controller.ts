import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WorkoutsService } from './workouts.service';
import { CreateWorkoutDto } from './dto/create-workout.dto';
import { GenerateWorkoutDto } from './dto/generate-workout.dto';

@Controller('workouts')
export class WorkoutsController {
  constructor(private readonly workoutsService: WorkoutsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createWorkoutDto: CreateWorkoutDto) {
    return this.workoutsService.create(createWorkoutDto);
  }

  @Get()
  findAll() {
    return this.workoutsService.findAll();
  }

  @Get('weekly')
  findWeekly() {
    return this.workoutsService.findWeekly();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workoutsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateWorkoutDto: Partial<CreateWorkoutDto>) {
    return this.workoutsService.update(id, updateWorkoutDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.workoutsService.remove(id);
  }

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  generate(@Body() generateWorkoutDto: GenerateWorkoutDto) {
    return this.workoutsService.generate(generateWorkoutDto);
  }
}
