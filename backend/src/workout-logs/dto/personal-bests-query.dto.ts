import { IsNotEmpty, IsString } from 'class-validator';

export class PersonalBestsQueryDto {
  /** Comma-separated library exercise ids. */
  @IsString()
  @IsNotEmpty()
  exerciseIds: string;
}
