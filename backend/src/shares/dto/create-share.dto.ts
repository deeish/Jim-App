import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateShareDto {
  @IsIn(['plan', 'workout'])
  kind: 'plan' | 'workout';

  @IsString()
  @IsNotEmpty()
  targetId: string;

  /**
   * Display-name snapshot shown to the recipient ("Shared by ..."). Supplied by
   * the client because the backend User.name is never populated from Supabase.
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  senderName?: string;
}
