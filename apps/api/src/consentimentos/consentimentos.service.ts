import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditoriaService } from "../common/audit/auditoria.service";
import { RegistrarConsentimentoDto } from "./dto/registrar-consentimento.dto";

@Injectable()
export class ConsentimentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async registrar(
    tenantId: string,
    pacienteId: string,
    dto: RegistrarConsentimentoDto,
    ip: string | undefined,
    userAgent: string | undefined,
  ) {
    if (!dto.aceito) {
      return null;
    }
    const consentimento = await this.prisma.consentimento.create({
      data: {
        tenantId,
        pacienteId,
        tipo: dto.tipo,
        versaoTermo: dto.versao_termo,
        ip,
        evidencia: { user_agent: userAgent ?? null },
      },
    });

    await this.auditoria.registrar({
      tenantId,
      ator: `paciente:${pacienteId}`,
      acao: "consentimento.registrado",
      entidade: "consentimento",
      entidadeId: consentimento.id,
      detalhes: { tipo: dto.tipo, versao_termo: dto.versao_termo },
    });

    return consentimento;
  }

  /** Verifica se ha consentimento valido (mais recente) para o tipo informado. */
  async possuiConsentimento(tenantId: string, pacienteId: string, tipo: string): Promise<boolean> {
    const consentimento = await this.prisma.consentimento.findFirst({
      where: { tenantId, pacienteId, tipo },
      orderBy: { aceitoEm: "desc" },
    });
    return Boolean(consentimento);
  }
}
