import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { WebhooksService } from "./webhooks.service";
import { ConfigurarWebhookDto } from "./dto/configurar-webhook.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { TenantMatchGuard } from "../common/guards/tenant-match.guard";

@ApiTags("webhooks")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantMatchGuard)
@Controller("tenants/:id/webhook")
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Put()
  @ApiOperation({ summary: "Configura a URL e o segredo do webhook do tenant" })
  async configurar(@Param("id") id: string, @Body() dto: ConfigurarWebhookDto) {
    return this.webhooksService.configurar(id, dto);
  }

  @Get()
  @ApiOperation({ summary: "Consulta a configuração atual do webhook (sem expor o segredo)" })
  async obter(@Param("id") id: string) {
    return this.webhooksService.obterConfig(id);
  }

  @Post("testar")
  @ApiOperation({ summary: "Dispara um evento de teste para o webhook configurado" })
  async testar(@Param("id") id: string) {
    return this.webhooksService.testar(id);
  }
}
