import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString } from "class-validator";

export class EnviarAssinaturaDto {
  @ApiProperty({ description: "Imagem da assinatura em base64 (PNG)" })
  @IsString()
  imagem_base64!: string;

  @ApiProperty({ required: false, description: "Coordenadas do traço, para auditoria futura" })
  @IsOptional()
  @IsArray()
  coordenadas?: Array<{ x: number; y: number; t: number }>;
}
