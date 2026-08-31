import {
  CriarTenantResponseDto,
  ErroApiDto,
  MetodoValidacao,
  StatusValidacao,
  TenantMetodoConfigDto,
} from "@atendvalida/shared-types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/v1";

export class ErroApi extends Error {
  constructor(
    public readonly status: number,
    public readonly corpo: ErroApiDto,
  ) {
    super(corpo.mensagem ?? "Erro desconhecido");
  }
}

let jwtAtual: string | null = sessionStorage.getItem("atendvalida_jwt");
let tenantIdAtual: string | null = sessionStorage.getItem("atendvalida_tenant_id");

export function definirSessao(jwt: string | null, tenantId: string | null) {
  jwtAtual = jwt;
  tenantIdAtual = tenantId;
  if (jwt && tenantId) {
    sessionStorage.setItem("atendvalida_jwt", jwt);
    sessionStorage.setItem("atendvalida_tenant_id", tenantId);
  } else {
    sessionStorage.removeItem("atendvalida_jwt");
    sessionStorage.removeItem("atendvalida_tenant_id");
  }
}

export function obterTenantId() {
  return tenantIdAtual;
}

export function sessaoAtiva() {
  return Boolean(jwtAtual && tenantIdAtual);
}

async function chamar<T>(caminho: string, opcoes?: RequestInit): Promise<T> {
  const resposta = await fetch(`${API_BASE_URL}${caminho}`, {
    ...opcoes,
    headers: {
      "Content-Type": "application/json",
      ...(jwtAtual ? { Authorization: `Bearer ${jwtAtual}` } : {}),
      ...(opcoes?.headers ?? {}),
    },
  });
  if (resposta.status === 204) return undefined as T;
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    if (resposta.status === 401) definirSessao(null, null);
    throw new ErroApi(resposta.status, corpo as ErroApiDto);
  }
  return corpo as T;
}

export interface ItemHistorico {
  id: string;
  atendimento_id: string;
  status: StatusValidacao;
  metodo: MetodoValidacao;
  criado_em: string;
  confirmado_em: string | null;
  tentativas: number;
  paciente_nome: string;
  paciente_telefone_mascarado: string;
  comprovante: { id: string; url_pdf: string | null } | null;
}

export const api = {
  login: (apiKeyId: string, apiSecret: string) =>
    chamar<{ access_token: string }>("/auth/token", {
      method: "POST",
      body: JSON.stringify({ api_key_id: apiKeyId, api_secret: apiSecret }),
    }),

  decodificarTenantId(jwt: string): string {
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    return payload.sub;
  },

  criarTenant: (operatorToken: string, nome: string, emailContato?: string) =>
    chamar<CriarTenantResponseDto>("/tenants", {
      method: "POST",
      headers: { "x-operator-token": operatorToken },
      body: JSON.stringify({ nome, email_contato: emailContato }),
    }),

  listarMetodos: (tenantId: string) => chamar<TenantMetodoConfigDto[]>(`/tenants/${tenantId}/metodos`),

  configurarMetodo: (
    tenantId: string,
    metodo: MetodoValidacao,
    dados: { ativo: boolean; configuracao?: Record<string, unknown>; procedimento_tipo?: string },
  ) =>
    chamar(`/tenants/${tenantId}/metodos/${metodo}`, {
      method: "PUT",
      body: JSON.stringify(dados),
    }),

  rotacionarApiKey: (tenantId: string) =>
    chamar<{ api_key_id: string; api_secret: string }>(`/tenants/${tenantId}/rotate-api-key`, {
      method: "POST",
    }),

  obterWebhook: (tenantId: string) =>
    chamar<{ url: string; ativo: boolean; atualizado_em: string } | null>(`/tenants/${tenantId}/webhook`),

  configurarWebhook: (tenantId: string, url: string, ativo: boolean, segredo?: string) =>
    chamar<{ url: string; ativo: boolean; segredo?: string }>(`/tenants/${tenantId}/webhook`, {
      method: "PUT",
      body: JSON.stringify({ url, ativo, ...(segredo ? { segredo } : {}) }),
    }),

  testarWebhook: (tenantId: string) =>
    chamar(`/tenants/${tenantId}/webhook/testar`, { method: "POST" }),

  listarHistorico: (filtros: {
    status?: string;
    metodo?: string;
    data_inicio?: string;
    data_fim?: string;
    pagina?: number;
  }) => {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([chave, valor]) => {
      if (valor) params.set(chave, String(valor));
    });
    return chamar<{ total: number; pagina: number; tamanho_pagina: number; itens: ItemHistorico[] }>(
      `/validacoes?${params.toString()}`,
    );
  },

  urlPdfComprovante: (comprovanteId: string) => `${API_BASE_URL}/comprovantes/${comprovanteId}/pdf`,
};
