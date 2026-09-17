import { IsInt, Max, Min } from 'class-validator';

/** Three answers after a session; see `checkin-adjustment.ts` for what they move. */
export class CheckInDto {
  /** 1 easy, 2 about right, 3 too hard. */
  @IsInt()
  @Min(1)
  @Max(3)
  effort!: 1 | 2 | 3;

  /** 0 none, 1 some, 2 a lot. */
  @IsInt()
  @Min(0)
  @Max(2)
  soreness!: 0 | 1 | 2;

  /** 0 fine, 1 a niggle, 2 pain. */
  @IsInt()
  @Min(0)
  @Max(2)
  jointPain!: 0 | 1 | 2;
}
