import { Injectable, Logger } from "@nestjs/common";
import { EnviarOtpInput, NotificacaoAdapter } from "./notificacao-adapter.interface";

/** Adaptador de desenvolvimento: apenas loga a mensagem que seria enviada. */
@Injectable()
export class ConsoleNotificacaoAdapter implements NotificacaoAdapter {
  private readonly logger = new Logger("NotificacaoOTP");

  async enviarOtp(input: EnviarOtpInput): Promise<void> {
    const telefoneMascarado = `****${input.telefone.replace(/\D/g, "").slice(-4)}`;
    this.logger.log(
      `[SIMULADO] Envio de OTP via ${input.canal} para ${input.nomePaciente} (${telefoneMascarado}): ` +
        `"Seu código de confirmação AtendValida é ${input.codigo}. Válido por alguns minutos."`,
    );
  }
}
