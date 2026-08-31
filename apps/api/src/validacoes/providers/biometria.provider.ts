import { Injectable } from "@nestjs/common";

export interface ResultadoProviderBiometria {
  configurado: boolean;
  mensagem?: string;
}

/**
 * Provider de verificacao de biometria facial.
 *
 * Abstrai o provedor real (AWS Rekognition, Azure Face, Unico, Idwall...).
 * O contrato completo (schema, consentimento LGPD, DTOs, endpoint, tela de
 * configuracao no admin) ja esta implementado; a chamada de matching fica
 * aqui, propositalmente stubada. Para ativar: implemente uma classe que
 * satisfaca esta mesma interface fazendo a chamada real ao provedor
 * escolhido, injete as credenciais via `tenant_validation_methods.configuracao`
 * (ja criptografadas em repouso) e troque o binding no ValidacoesModule.
 */
@Injectable()
export class BiometriaProvider {
  async processar(): Promise<ResultadoProviderBiometria> {
    return {
      configurado: false,
      mensagem: "Método de biometria facial ainda não configurado para esta unidade.",
    };
  }
}
