/**
 * Abstracao de um provedor de chaves/criptografia no estilo KMS.
 *
 * A implementacao local (`LocalKmsProvider`) usa uma chave estatica lida do
 * ambiente (adequada para desenvolvimento). Em producao, troque a injecao do
 * provider por uma implementacao que fale com AWS KMS, HashiCorp Vault ou
 * GCP KMS, mantendo esta mesma interface — nenhum outro modulo precisa mudar.
 */
export interface KmsProvider {
  /** Criptografa um texto em claro e retorna um envelope opaco em base64. */
  encrypt(plaintext: string): Promise<string>;
  /** Decripta um envelope gerado por `encrypt`. */
  decrypt(envelope: string): Promise<string>;
}

export const KMS_PROVIDER = "KMS_PROVIDER";
