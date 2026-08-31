import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsString } from "class-validator";

export class RegistrarConsentimentoDto {
  @ApiProperty({ example: "biometria_facial" })
  @IsString()
  tipo!: string;

  @ApiProperty({ example: "1.0" })
  @IsString()
  versao_termo!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  aceito!: boolean;
}
