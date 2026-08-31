import { ErroApiDto, ValidacaoResponseDto } from "@atendvalida/shared-types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/v1";

export class ErroApi extends Error {
  constructor(
    public readonly status: number,
    public readonly corpo: ErroApiDto,
  ) {
    super(corpo.mensagem);
  }
}

async function chamar<T>(caminho: string, opcoes?: RequestInit): Promise<T> {
  const resposta = await fetch(`${API_BASE_URL}${caminho}`, {
    ...opcoes,
    headers: { "Content-Type": "application/json", ...(opcoes?.headers ?? {}) },
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new ErroApi(resposta.status, corpo as ErroApiDto);
  }
  return corpo as T;
}

export const api = {
  obterValidacao: (id: string) => chamar<ValidacaoResponseDto>(`/validacoes/${id}`),

  confirmarToken: (id: string, codigoInformado: string) =>
    chamar<ValidacaoResponseDto>(`/validacoes/${id}/token/confirmar`, {
      method: "POST",
      body: JSON.stringify({ codigo_informado: codigoInformado }),
    }),

  reenviarToken: (id: string) =>
    chamar<ValidacaoResponseDto>(`/validacoes/${id}/reenviar`, { method: "POST" }),

  registrarConsentimento: (id: string, tipo: string) =>
    chamar<{ registrado: boolean; consentimento_id: string | null }>(`/validacoes/${id}/consentimento`, {
      method: "POST",
      body: JSON.stringify({ tipo, versao_termo: "1.0", aceito: true }),
    }),

  enviarAssinatura: (id: string, imagemBase64: string) =>
    chamar<ValidacaoResponseDto>(`/validacoes/${id}/assinatura`, {
      method: "POST",
      body: JSON.stringify({ imagem_base64: imagemBase64 }),
    }),

  enviarBiometria: (id: string, imagemBase64: string, consentimentoId: string) =>
    chamar<ValidacaoResponseDto>(`/validacoes/${id}/biometria`, {
      method: "POST",
      body: JSON.stringify({ imagem_base64: imagemBase64, consentimento_id: consentimentoId }),
    }),
};
