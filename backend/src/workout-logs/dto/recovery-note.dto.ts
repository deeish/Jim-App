import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RecoveryNoteDto {
  /** Body-map region key ("Semitendinosus"). */
  @IsString()
  @MaxLength(64)
  region!: string;

  @IsIn(['sore', 'fine'])
  kind!: 'sore' | 'fine';
}

export class RecoveryQueryDto {
  /** Comma-separated exercise ids of today's session, to flag regions it touches. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  exerciseIds?: string;
}
