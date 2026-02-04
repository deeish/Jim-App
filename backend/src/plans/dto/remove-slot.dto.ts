import { IsString, IsUUID } from 'class-validator';

export class RemoveSlotDto {
  @IsString()
  @IsUUID()
  slotId: string;
}
