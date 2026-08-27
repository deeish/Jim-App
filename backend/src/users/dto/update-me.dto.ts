import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Profile fields the client syncs so crewmates can see them. */
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  avatarId?: string;
}
