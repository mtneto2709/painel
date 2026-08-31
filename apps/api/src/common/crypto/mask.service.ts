import { Injectable } from "@nestjs/common";

/** Utilitario para mascarar dados sensiveis (telefone, CPF) antes de exibir/logar. */
@Injectable()
export class MaskService {
  telefone(telefone: string): string {
    const digitos = telefone.replace(/\D/g, "");
    if (digitos.length < 4) return "****";
    return `****${digitos.slice(-4)}`;
  }

  documento(hash: string): string {
    if (!hash) return "****";
    return `${hash.slice(0, 6)}...`;
  }
}
