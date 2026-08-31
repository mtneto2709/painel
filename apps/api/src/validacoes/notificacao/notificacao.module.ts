import { Module } from "@nestjs/common";
import { NOTIFICACAO_ADAPTER } from "./notificacao-adapter.interface";
import { ConsoleNotificacaoAdapter } from "./console-notificacao.adapter";
import { NotificacaoProcessor } from "./notificacao.processor";
import { PacientesModule } from "../../pacientes/pacientes.module";

@Module({
  imports: [PacientesModule],
  providers: [
    { provide: NOTIFICACAO_ADAPTER, useClass: ConsoleNotificacaoAdapter },
    NotificacaoProcessor,
  ],
  exports: [NOTIFICACAO_ADAPTER],
})
export class NotificacaoModule {}
