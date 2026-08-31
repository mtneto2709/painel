import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";

export interface RegistrarAuditoriaInput {
  tenantId?: string | null;
  ator: string;
  acao: string;
  entidade?: string;
  entidadeId?: string;
  detalhes?: Record<string, unknown>;
}

/**
 * Log de auditoria append-only com hash encadeado: cada registro guarda o
 * SHA-256 do registro anterior + seus proprios dados, formando uma cadeia
 * simples que permite detectar adulteracao retroativa (nao e uma blockchain
 * distribuida — nao precisa ser, para o requisito de auditoria interna).
 */
@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(input: RegistrarAuditoriaInput): Promise<void> {
    const ultimo = await this.prisma.auditoriaLog.findFirst({
      orderBy: { criadoEm: "desc" },
      select: { hashAtual: true },
    });
    const hashAnterior = ultimo?.hashAtual ?? null;
    const timestamp = new Date();

    const corpo = JSON.stringify({
      tenantId: input.tenantId ?? null,
      ator: input.ator,
      acao: input.acao,
      entidade: input.entidade ?? null,
      entidadeId: input.entidadeId ?? null,
      detalhes: input.detalhes ?? {},
      hashAnterior,
      timestamp: timestamp.toISOString(),
    });
    const hashAtual = createHash("sha256").update(corpo).digest("hex");

    await this.prisma.auditoriaLog.create({
      data: {
        tenantId: input.tenantId ?? null,
        ator: input.ator,
        acao: input.acao,
        entidade: input.entidade,
        entidadeId: input.entidadeId,
        detalhes: input.detalhes ?? {},
        hashAnterior,
        hashAtual,
        criadoEm: timestamp,
      },
    });
  }

  /** Reprocessa a cadeia e confirma que nenhum registro foi adulterado. */
  async verificarCadeia(): Promise<{ integra: boolean; totalRegistros: number }> {
    const registros = await this.prisma.auditoriaLog.findMany({ orderBy: { criadoEm: "asc" } });
    let hashAnteriorEsperado: string | null = null;
    for (const registro of registros) {
      if (registro.hashAnterior !== hashAnteriorEsperado) {
        return { integra: false, totalRegistros: registros.length };
      }
      const corpo = JSON.stringify({
        tenantId: registro.tenantId,
        ator: registro.ator,
        acao: registro.acao,
        entidade: registro.entidade,
        entidadeId: registro.entidadeId,
        detalhes: registro.detalhes,
        hashAnterior: registro.hashAnterior,
        timestamp: registro.criadoEm.toISOString(),
      });
      const hashRecalculado = createHash("sha256").update(corpo).digest("hex");
      if (hashRecalculado !== registro.hashAtual) {
        return { integra: false, totalRegistros: registros.length };
      }
      hashAnteriorEsperado = registro.hashAtual;
    }
    return { integra: true, totalRegistros: registros.length };
  }
}
