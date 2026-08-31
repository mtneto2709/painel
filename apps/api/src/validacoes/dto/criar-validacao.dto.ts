import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { MetodoValidacao } from "@atendvalida/shared-types";

export class PacienteInputDto {
  @ApiProperty({ example: "pac_45210" })
  @IsString()
  id_externo!: string;

  @ApiProperty({ example: "Maria da Silva Souza" })
  @IsString()
  @MinLength(2)
  nome!: string;

  @ApiProperty({ example: "+5585999887766" })
  @IsString()
  telefone!: string;

  @ApiProperty({ example: "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3", required: false })
  @IsOptional()
  @IsString()
  cpf_hash?: string;
}

export class ContextoInputDto {
  @ApiProperty({ example: "Dr. João Pereira", required: false })
  @IsOptional()
  @IsString()
  profissional?: string;

  @ApiProperty({ example: "Consulta - Clínica Geral", required: false })
  @IsOptional()
  @IsString()
  procedimento?: string;

  @ApiProperty({ example: "Clínica ABC - Unidade Aldeota", required: false })
  @IsOptional()
  @IsString()
  unidade?: string;

  @ApiProperty({ example: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e", required: false })
  @IsOptional()
  @IsString()
  documento_referencia_hash?: string;
}

export class CriarValidacaoDto {
  @ApiProperty({ example: "atd_9f2b7c31" })
  @IsString()
  atendimento_id!: string;

  @ApiProperty({ type: PacienteInputDto })
  @ValidateNested()
  @Type(() => PacienteInputDto)
  paciente!: PacienteInputDto;

  @ApiProperty({ enum: MetodoValidacao, required: false })
  @IsOptional()
  @IsEnum(MetodoValidacao)
  metodo_preferido?: MetodoValidacao;

  @ApiProperty({ type: ContextoInputDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContextoInputDto)
  contexto?: ContextoInputDto;

  @ApiProperty({ example: 300, required: false, minimum: 60, maximum: 1800 })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(1800)
  expiracao_segundos?: number;
}
