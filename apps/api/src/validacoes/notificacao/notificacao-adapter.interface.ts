export type CanalNotificacao = "whatsapp" | "sms";

export interface EnviarOtpInput {
  telefone: string;
  codigo: string;
  canal: CanalNotificacao;
  nomePaciente: string;
}

/**
 * Abstracao do envio de OTP por WhatsApp/SMS.
 *
 * A implementacao padrao (`ConsoleNotificacaoAdapter`) apenas registra a
 * mensagem no log estruturado — util para desenvolvimento local, ja que
 * este projeto nao inclui credenciais reais de nenhum provedor.
 * Para producao, implemente esta interface com a WhatsApp Business API
 * (Meta Cloud API) e/ou um gateway de SMS, e troque o binding de
 * `NOTIFICACAO_ADAPTER` no NotificacaoModule — nenhum outro modulo precisa mudar.
 */
export interface NotificacaoAdapter {
  enviarOtp(input: EnviarOtpInput): Promise<void>;
}

export const NOTIFICACAO_ADAPTER = "NOTIFICACAO_ADAPTER";
