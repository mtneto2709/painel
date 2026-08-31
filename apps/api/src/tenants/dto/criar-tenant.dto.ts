import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class CriarTenantDto {
  @ApiProperty({ example: "Clinica ABC" })
  @IsString()
  @MinLength(2)
  nome!: string;

  @ApiProperty({ example: "contato@clinicaabc.com.br", required: false })
  @IsOptional()
  @IsEmail()
  email_contato?: string;
}
