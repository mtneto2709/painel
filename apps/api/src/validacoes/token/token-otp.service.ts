import { Injectable } from "@nestjs/common";
import { createHash, randomInt } from "crypto";

/**
 * Regras puras de geracao/validacao de codigo OTP. Isolado em um servico
 * proprio para ser testado unitariamente sem dependencias de banco/fila.
 */
@Injectable()
export class TokenOtpService {
  readonly tamanhoCodigo = 6;
  readonly maxTentativas = 5;

  gerarCodigo(): string {
    const min = 10 ** (this.tamanhoCodigo - 1);
    const max = 10 ** this.tamanhoCodigo - 1;
    return String(randomInt(min, max + 1));
  }

  hash(codigo: string): string {
    return createHash("sha256").update(codigo).digest("hex");
  }

  comparar(codigoInformado: string, hashArmazenado: string): boolean {
    return this.hash(codigoInformado) === hashArmazenado;
  }
}
