import { Injectable } from "@nestjs/common";
import { createWriteStream, existsSync, mkdirSync } from "fs";
import { join } from "path";
import PDFDocument from "pdfkit";

export interface DadosPdfComprovante {
  id: string;
  atendimentoId: string;
  metodo: string;
  status: string;
  confirmadoEm: Date | null;
  hashIntegridade: string;
  assinaturaServico: string;
  contexto: Record<string, unknown>;
}

/**
 * Geracao do PDF do comprovante usando pdfkit e gravacao em disco local.
 * Em producao, troque o destino de escrita por um bucket de objetos (S3/GCS)
 * mantendo a mesma assinatura de metodo.
 */
@Injectable()
export class PdfService {
  private readonly diretorio = process.env.STORAGE_DIR ?? join(process.cwd(), "storage", "comprovantes");

  constructor() {
    if (!existsSync(this.diretorio)) {
      mkdirSync(this.diretorio, { recursive: true });
    }
  }

  caminhoArquivo(comprovanteId: string): string {
    return join(this.diretorio, `${comprovanteId}.pdf`);
  }

  async gerar(dados: DadosPdfComprovante): Promise<string> {
    const caminho = this.caminhoArquivo(dados.id);
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = createWriteStream(caminho);
    doc.pipe(stream);

    doc.fontSize(18).text("Comprovante de Validação de Atendimento", { align: "center" });
    doc.moveDown();
    doc.fontSize(10).fillColor("#555").text("Emitido por AtendValida", { align: "center" });
    doc.moveDown(2);

    doc.fillColor("#000").fontSize(12);
    doc.text(`Comprovante: ${dados.id}`);
    doc.text(`Atendimento: ${dados.atendimentoId}`);
    doc.text(`Método de validação: ${dados.metodo}`);
    doc.text(`Status: ${dados.status}`);
    doc.text(
      `Confirmado em: ${dados.confirmadoEm ? dados.confirmadoEm.toISOString() : "não confirmado"}`,
    );
    doc.moveDown();

    if (dados.contexto.procedimento) doc.text(`Procedimento: ${dados.contexto.procedimento}`);
    if (dados.contexto.profissional) doc.text(`Profissional: ${dados.contexto.profissional}`);
    if (dados.contexto.unidade) doc.text(`Unidade: ${dados.contexto.unidade}`);
    doc.moveDown();

    doc.fontSize(10).fillColor("#333");
    doc.text("Integridade e assinatura digital (Ed25519)", { underline: true });
    doc.moveDown(0.5);
    doc.text(`Hash SHA-256 do payload: ${dados.hashIntegridade}`);
    doc.moveDown(0.5);
    doc.text(`Assinatura: ${dados.assinaturaServico}`);
    doc.moveDown(2);

    doc
      .fontSize(9)
      .fillColor("#777")
      .text(
        "Este comprovante é tamper-evident: qualquer alteração nos dados invalida a assinatura acima. " +
          "A autenticidade pode ser verificada via GET /v1/comprovantes/:id/verificar.",
        { align: "left" },
      );

    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on("finish", () => resolve());
      stream.on("error", reject);
    });

    return caminho;
  }
}
