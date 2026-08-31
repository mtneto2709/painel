import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsISO8601, IsInt, IsOptional, Max, Min } from "class-validator";
import { MetodoValidacao, StatusValidacao } from "@atendvalida/shared-types";

export class ListarValidacoesQueryDto {
  @ApiPropertyOptional({ enum: StatusValidacao })
  @IsOptional()
  @IsEnum(StatusValidacao)
  status?: StatusValidacao;

  @ApiPropertyOptional({ enum: MetodoValidacao })
  @IsOptional()
  @IsEnum(MetodoValidacao)
  metodo?: MetodoValidacao;

  @ApiPropertyOptional({ example: "2026-01-01T00:00:00.000Z" })
  @IsOptional()
  @IsISO8601()
  data_inicio?: string;

  @ApiPropertyOptional({ example: "2026-12-31T23:59:59.000Z" })
  @IsOptional()
  @IsISO8601()
  data_fim?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  tamanho_pagina?: number;
}
