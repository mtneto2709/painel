import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsObject, IsOptional, IsString } from "class-validator";

export class ConfigurarMetodoDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  ativo!: boolean;

  @ApiProperty({
    required: false,
    description: "Configuracao especifica do metodo (ex.: credenciais do provedor)",
    example: { token_api: "xxxx", remetente: "+5585999990000" },
  })
  @IsOptional()
  @IsObject()
  configuracao?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: "Restringe esta configuracao a um tipo de procedimento especifico",
    example: "Consulta - Clinica Geral",
  })
  @IsOptional()
  @IsString()
  procedimento_tipo?: string;
}
