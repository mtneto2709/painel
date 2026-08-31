import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { PdfService } from "./pdf.service";
import { ComprovantesService } from "./comprovantes.service";
import { FILA_COMPROVANTES } from "../queue/queue.constants";

@Processor(FILA_COMPROVANTES)
export class ComprovantesProcessor extends WorkerHost {
  private readonly logger = new Logger("ComprovantesProcessor");

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly comprovantesService: ComprovantesService,
  ) {
    super();
  }

  async process(job: Job<{ comprovanteId: string }>): Promise<void> {
    const { comprovanteId } = job.data;
    const comprovante = await this.prisma.comprovante.findUnique({
      where: { id: comprovanteId },
      include: { validacao: true },
    });
    if (!comprovante) {
      this.logger.warn(`Comprovante ${comprovanteId} não encontrado para geração de PDF.`);
      return;
    }

    await this.pdfService.gerar({
      id: comprovante.id,
      atendimentoId: comprovante.validacao.atendimentoId,
      metodo: comprovante.validacao.metodo,
      status: comprovante.validacao.status,
      confirmadoEm: comprovante.validacao.confirmadoEm,
      hashIntegridade: comprovante.hashIntegridade,
      assinaturaServico: comprovante.assinaturaServico,
      contexto: comprovante.validacao.contexto as Record<string, unknown>,
    });

    await this.comprovantesService.atualizarUrlPdf(
      comprovante.id,
      `/v1/comprovantes/${comprovante.id}/pdf`,
    );
    this.logger.log(`PDF do comprovante ${comprovante.id} gerado com sucesso.`);
  }
}
