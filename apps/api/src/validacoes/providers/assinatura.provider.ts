import { Injectable } from "@nestjs/common";

export interface ResultadoProviderAssinatura {
  configurado: boolean;
  mensagem?: string;
}

/**
 * Provider de assinatura em tela (digital signature pad).
 *
 * Contrato completo (schema, DTOs, endpoint) ja implementado; a chamada real
 * ao armazenamento/validacao da assinatura fica aqui, propositalmente
 * stubada. Para ativar: implemente a logica de armazenamento (ex.: em um
 * bucket seguro) e retorne `configurado: true` quando o tenant tiver essa
 * configuracao definida — nenhuma mudanca de schema ou de API e necessaria.
 */
@Injectable()
export class AssinaturaProvider {
  async processar(): Promise<ResultadoProviderAssinatura> {
    return {
      configurado: false,
      mensagem: "Método de assinatura em tela ainda não configurado para esta unidade.",
    };
  }
}
