import { Module } from "@nestjs/common";
import { ValidacoesController } from "./validacoes.controller";
import { ValidacoesService } from "./validacoes.service";
import { TokenOtpService } from "./token/token-otp.service";
import { AssinaturaProvider } from "./providers/assinatura.provider";
import { BiometriaProvider } from "./providers/biometria.provider";
import { NotificacaoModule } from "./notificacao/notificacao.module";
import { TenantsModule } from "../tenants/tenants.module";
import { PacientesModule } from "../pacientes/pacientes.module";
import { ConsentimentosModule } from "../consentimentos/consentimentos.module";
import { ComprovantesModule } from "../comprovantes/comprovantes.module";
import { WebhooksModule } from "../webhooks/webhooks.module";

@Module({
  imports: [
    NotificacaoModule,
    TenantsModule,
    PacientesModule,
    ConsentimentosModule,
    ComprovantesModule,
    WebhooksModule,
  ],
  controllers: [ValidacoesController],
  providers: [ValidacoesService, TokenOtpService, AssinaturaProvider, BiometriaProvider],
})
export class ValidacoesModule {}
