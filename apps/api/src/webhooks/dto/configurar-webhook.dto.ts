import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, IsUrl } from "class-validator";

export class ConfigurarWebhookDto {
  @ApiProperty({ example: "https://saas-cliente.com.br/webhooks/atendvalida" })
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiProperty({
    required: false,
    description: "Segredo compartilhado usado para assinar os eventos (HMAC-SHA256). Se omitido, um novo é gerado.",
  })
  @IsOptional()
  @IsString()
  segredo?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  ativo!: boolean;
}
