import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { SearchExercisesDto } from './dto/search-exercises.dto';

@Controller('exercises')
export class ExercisesController {
  constructor(private readonly exercisesService: ExercisesService) {}

  @Get()
  findAll() {
    return this.exercisesService.findAll();
  }

  @Post('search')
  search(@Body() searchDto: SearchExercisesDto) {
    const results = this.exercisesService.search(searchDto);
    return {
      count: results.length,
      exercises: results,
    };
  }

  @Get('search')
  searchGet(@Query() query: SearchExercisesDto) {
    const results = this.exercisesService.search(query);
    return {
      count: results.length,
      exercises: results,
    };
  }

  @Get('stats')
  getStats() {
    return this.exercisesService.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    const exercise = this.exercisesService.findOne(id);
    if (!exercise) {
      return { error: 'Exercise not found' };
    }
    return exercise;
  }
}
