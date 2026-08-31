import { EventoWebhook, MetodoValidacao, StatusValidacao } from "./enums";

/** Dados minimos do paciente enviados pelo SaaS chamador. */
export interface PacienteDto {
  id_externo: string;
  nome: string;
  telefone: string;
  cpf_hash?: string;
}

/** Contexto do atendimento clinico associado a validacao. */
export interface ContextoAtendimentoDto {
  profissional?: string;
  procedimento?: string;
  unidade?: string;
  documento_referencia_hash?: string;
}

/** Corpo de requisicao para criar uma nova validacao. */
export interface CriarValidacaoDto {
  atendimento_id: string;
  paciente: PacienteDto;
  metodo_preferido?: MetodoValidacao;
  contexto?: ContextoAtendimentoDto;
  expiracao_segundos?: number;
}

export interface ComprovanteResumoDto {
  id: string;
  hash_integridade: string;
  assinatura_servico: string;
  url_pdf?: string | null;
  gerado_em: string;
}

/** Resposta padrao para qualquer operacao sobre uma validacao. */
export interface ValidacaoResponseDto {
  id: string;
  atendimento_id: string;
  status: StatusValidacao;
  metodo: MetodoValidacao;
  criado_em: string;
  expira_em: string | null;
  confirmado_em?: string | null;
  tentativas: number;
  metodos_disponiveis?: MetodoValidacao[];
  mensagem?: string;
  comprovante?: ComprovanteResumoDto | null;
}

export interface ConfirmarTokenDto {
  codigo_informado: string;
}

export interface EnviarAssinaturaDto {
  imagem_base64: string;
  coordenadas?: Array<{ x: number; y: number; t: number }>;
}

export interface EnviarBiometriaDto {
  imagem_base64: string;
  consentimento_id: string;
}

export interface RegistrarConsentimentoDto {
  paciente_id_externo: string;
  tipo: string;
  versao_termo: string;
  aceito: boolean;
}

export interface WebhookEventoPayload<T = unknown> {
  evento: EventoWebhook;
  tenant_id: string;
  validacao_id: string;
  emitido_em: string;
  dados: T;
}

export interface TenantMetodoConfigDto {
  metodo: MetodoValidacao;
  ativo: boolean;
  configurado: boolean;
  procedimento_tipo?: string | null;
  configuracao?: Record<string, unknown>;
}

export interface CriarTenantDto {
  nome: string;
  email_contato?: string;
}

export interface CriarTenantResponseDto {
  id: string;
  nome: string;
  api_key: string;
  api_secret: string;
}

export interface WebhookConfigDto {
  url: string;
  segredo: string;
  ativo: boolean;
}

export interface ErroApiDto {
  status: StatusValidacao | "erro_validacao" | "nao_autorizado" | "nao_encontrado";
  mensagem: string;
  detalhes?: unknown;
}
