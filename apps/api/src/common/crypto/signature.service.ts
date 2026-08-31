import { Injectable } from "@nestjs/common";
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "crypto";

/**
 * Servico de assinatura digital dos comprovantes (tamper-evidence).
 *
 * Usa Ed25519 (assinatura assimetrica) sobre o hash SHA-256 do payload
 * canonico. A chave privada e mantida apenas pelo servico; a chave publica
 * pode ser distribuida para que terceiros verifiquem comprovantes offline.
 */
@Injectable()
export class SignatureService {
  private readonly privateKey;
  private readonly publicKey;

  constructor() {
    const pem = process.env.ED25519_PRIVATE_KEY;
    if (!pem) {
      throw new Error(
        "ED25519_PRIVATE_KEY nao configurada. Gere um par de chaves (ver README) e defina no .env.",
      );
    }
    this.privateKey = createPrivateKey(pem.replace(/\\n/g, "\n"));
    this.publicKey = createPublicKey(this.privateKey);
  }

  /** Gera o hash SHA-256 (hex) de um payload JSON canonico (chaves ordenadas). */
  hashPayload(payload: unknown): string {
    const canonical = this.canonicalizar(payload);
    return createHash("sha256").update(canonical).digest("hex");
  }

  /** Assina um hash hexadecimal, retornando a assinatura em base64. */
  assinarHash(hashHex: string): string {
    const assinatura = sign(null, Buffer.from(hashHex, "hex"), this.privateKey);
    return assinatura.toString("base64");
  }

  /** Verifica se uma assinatura base64 corresponde ao hash informado. */
  verificar(hashHex: string, assinaturaBase64: string): boolean {
    try {
      return verify(
        null,
        Buffer.from(hashHex, "hex"),
        this.publicKey,
        Buffer.from(assinaturaBase64, "base64"),
      );
    } catch {
      return false;
    }
  }

  exportarChavePublica(): string {
    return this.publicKey.export({ type: "spki", format: "pem" }).toString();
  }

  /** Serializacao JSON deterministica (chaves ordenadas recursivamente). */
  private canonicalizar(valor: unknown): string {
    return JSON.stringify(this.ordenarChaves(valor));
  }

  private ordenarChaves(valor: unknown): unknown {
    if (Array.isArray(valor)) {
      return valor.map((item) => this.ordenarChaves(item));
    }
    if (valor !== null && typeof valor === "object") {
      return Object.keys(valor as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, chave) => {
          acc[chave] = this.ordenarChaves((valor as Record<string, unknown>)[chave]);
          return acc;
        }, {});
    }
    return valor;
  }
}
