import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class EnviarBiometriaDto {
  @ApiProperty({ description: "Imagem facial capturada em base64 (JPEG)" })
  @IsString()
  imagem_base64!: string;

  @ApiProperty({ description: "Id do consentimento LGPD previamente registrado para biometria" })
  @IsString()
  consentimento_id!: string;
}
