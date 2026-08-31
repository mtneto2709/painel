import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class ConfirmarTokenDto {
  @ApiProperty({ example: "483920" })
  @IsString()
  @Length(4, 8)
  codigo_informado!: string;
}
