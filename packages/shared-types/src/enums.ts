/**
 * Enumeracoes centrais do dominio do AtendValida.
 * Mantidas em portugues pois refletem o contrato de API ja validado com o negocio.
 */

export enum MetodoValidacao {
  TOKEN_WHATSAPP = "token_whatsapp",
  TOKEN_SMS = "token_sms",
  ASSINATURA_TELA = "assinatura_tela",
  BIOMETRIA_FACIAL = "biometria_facial",
}

export enum StatusValidacao {
  AGUARDANDO = "aguardando",
  CONFIRMADO = "confirmado",
  EXPIRADO = "expirado",
  CODIGO_INVALIDO = "codigo_invalido",
  REJEITADO = "rejeitado",
  ERRO = "erro",
  METODO_NAO_CONFIGURADO = "metodo_nao_configurado",
}

export enum StatusEntregaWebhook {
  PENDENTE = "pendente",
  ENTREGUE = "entregue",
  FALHOU = "falhou",
}

export enum EventoWebhook {
  VALIDACAO_CONFIRMADA = "validacao.confirmada",
  VALIDACAO_EXPIRADA = "validacao.expirada",
  VALIDACAO_REJEITADA = "validacao.rejeitada",
  VALIDACAO_ERRO = "validacao.erro",
}

export enum TipoConsentimento {
  BIOMETRIA_FACIAL = "biometria_facial",
  ASSINATURA_TELA = "assinatura_tela",
  TOKEN_WHATSAPP = "token_whatsapp",
  TOKEN_SMS = "token_sms",
}

export enum StatusTenant {
  ATIVO = "ativo",
  SUSPENSO = "suspenso",
  INATIVO = "inativo",
}
