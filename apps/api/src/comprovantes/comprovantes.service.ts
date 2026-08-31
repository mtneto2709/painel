import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { Validacao } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SignatureService } from "../common/crypto/signature.service";
import { FILA_COMPROVANTES } from "../queue/queue.constants";

export interface PayloadAuditavel {
  comprovante_versao: 1;
  validacao_id: string;
  tenant_id: string;
  atendimento_id: string;
  paciente_id: string;
  metodo: string;
  status: string;
  contexto: Record<string, unknown>;
  documento_referencia_hash: string | null;
  criado_em: string;
  confirmado_em: string | null;
}

@Injectable()
export class ComprovantesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signature: SignatureService,
    @InjectQueue(FILA_COMPROVANTES) private readonly filaComprovantes: Queue,
  ) {}

  async gerarParaValidacao(validacao: Validacao) {
    const payload: PayloadAuditavel = {
      comprovante_versao: 1,
      validacao_id: validacao.id,
      tenant_id: validacao.tenantId,
      atendimento_id: validacao.atendimentoId,
      paciente_id: validacao.pacienteId,
      metodo: validacao.metodo,
      status: validacao.status,
      contexto: validacao.contexto as Record<string, unknown>,
      documento_referencia_hash: validacao.documentoReferenciaHash,
      criado_em: validacao.criadoEm.toISOString(),
      confirmado_em: validacao.confirmadoEm?.toISOString() ?? null,
    };

    const hashIntegridade = this.signature.hashPayload(payload);
    const assinaturaServico = this.signature.assinarHash(hashIntegridade);

    const comprovante = await this.prisma.comprovante.create({
      data: {
        validacaoId: validacao.id,
        hashIntegridade,
        assinaturaServico,
        payloadAuditavel: payload as any,
      },
    });

    await this.filaComprovantes.add("gerar-pdf", { comprovanteId: comprovante.id });

    return comprovante;
  }

  async buscarPorId(id: string) {
    const comprovante = await this.prisma.comprovante.findUnique({
      where: { id },
      include: { validacao: true },
    });
    if (!comprovante) {
      throw new NotFoundException({ status: "nao_encontrado", mensagem: "Comprovante não encontrado." });
    }
    return comprovante;
  }

  async atualizarUrlPdf(comprovanteId: string, urlPdf: string) {
    await this.prisma.comprovante.update({ where: { id: comprovanteId }, data: { urlPdf } });
  }

  /** Recalcula o hash do payload armazenado e confere a assinatura Ed25519. */
  async verificar(id: string) {
    const comprovante = await this.buscarPorId(id);
    const hashRecalculado = this.signature.hashPayload(comprovante.payloadAuditavel);
    const hashConfere = hashRecalculado === comprovante.hashIntegridade;
    const assinaturaValida = this.signature.verificar(
      comprovante.hashIntegridade,
      comprovante.assinaturaServico,
    );
    return {
      comprovante_id: comprovante.id,
      integro: hashConfere && assinaturaValida,
      hash_confere: hashConfere,
      assinatura_valida: assinaturaValida,
      verificado_em: new Date().toISOString(),
    };
  }
}
