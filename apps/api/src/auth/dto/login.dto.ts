import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "ak_1a2b3c4d5e6f7a8b" })
  @IsString()
  @MinLength(3)
  api_key_id!: string;

  @ApiProperty({ example: "as_..." })
  @IsString()
  @MinLength(10)
  api_secret!: string;
}
