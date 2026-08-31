import { Controller, ForbiddenException, Get, HttpStatus, Param, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { existsSync } from "fs";
import { ComprovantesService } from "./comprovantes.service";
import { PdfService } from "./pdf.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentTenant, TenantAutenticado } from "../auth/current-tenant.decorator";

@ApiTags("comprovantes")
@Controller("comprovantes")
export class ComprovantesController {
  constructor(
    private readonly comprovantesService: ComprovantesService,
    private readonly pdfService: PdfService,
  ) {}

  @Get(":id")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Consulta os dados de um comprovante" })
  async obter(@Param("id") id: string, @CurrentTenant() tenant: TenantAutenticado) {
    const comprovante = await this.comprovantesService.buscarPorId(id);
    this.garantirPertenceAoTenant(comprovante, tenant.tenantId);
    return {
      id: comprovante.id,
      validacao_id: comprovante.validacaoId,
      hash_integridade: comprovante.hashIntegridade,
      assinatura_servico: comprovante.assinaturaServico,
      payload_auditavel: comprovante.payloadAuditavel,
      url_pdf: comprovante.urlPdf,
      gerado_em: comprovante.geradoEm,
    };
  }

  @Get(":id/pdf")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Baixa o PDF do comprovante" })
  async baixarPdf(
    @Param("id") id: string,
    @Res() res: Response,
    @CurrentTenant() tenant: TenantAutenticado,
  ) {
    const comprovante = await this.comprovantesService.buscarPorId(id);
    this.garantirPertenceAoTenant(comprovante, tenant.tenantId);
    const caminho = this.pdfService.caminhoArquivo(comprovante.id);
    if (!comprovante.urlPdf || !existsSync(caminho)) {
      res.status(HttpStatus.ACCEPTED).json({
        status: "processando",
        mensagem: "O PDF do comprovante ainda está sendo gerado. Tente novamente em instantes.",
      });
      return;
    }
    res.download(caminho, `comprovante-${comprovante.id}.pdf`);
  }

  @Get(":id/verificar")
  @ApiOperation({
    summary: "Verifica a integridade/assinatura de um comprovante (endpoint público)",
  })
  async verificar(@Param("id") id: string) {
    return this.comprovantesService.verificar(id);
  }

  private garantirPertenceAoTenant(
    comprovante: { validacao: { tenantId: string } },
    tenantId: string,
  ) {
    if (comprovante.validacao.tenantId !== tenantId) {
      throw new ForbiddenException({
        status: "nao_autorizado",
        mensagem: "Voce nao tem permissao para acessar este comprovante.",
      });
    }
  }
}
