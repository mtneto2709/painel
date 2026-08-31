import { Inject, Injectable } from "@nestjs/common";
import { PacienteDto } from "@atendvalida/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { KMS_PROVIDER, KmsProvider } from "../common/crypto/kms.provider.interface";
import { MaskService } from "../common/crypto/mask.service";

@Injectable()
export class PacientesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(KMS_PROVIDER) private readonly kms: KmsProvider,
    private readonly mask: MaskService,
  ) {}

  /** Cria ou atualiza o paciente do tenant a partir do id_externo informado pelo SaaS. */
  async upsert(tenantId: string, dto: PacienteDto) {
    const telefoneCriptografado = await this.kms.encrypt(dto.telefone);
    const telefoneMascarado = this.mask.telefone(dto.telefone);

    return this.prisma.paciente.upsert({
      where: { tenantId_idExterno: { tenantId, idExterno: dto.id_externo } },
      create: {
        tenantId,
        idExterno: dto.id_externo,
        nome: dto.nome,
        telefoneCriptografado,
        telefoneMascarado,
        cpfHash: dto.cpf_hash,
      },
      update: {
        nome: dto.nome,
        telefoneCriptografado,
        telefoneMascarado,
        cpfHash: dto.cpf_hash,
      },
    });
  }

  async telefoneEmClaro(pacienteId: string): Promise<string> {
    const paciente = await this.prisma.paciente.findUniqueOrThrow({ where: { id: pacienteId } });
    return this.kms.decrypt(paciente.telefoneCriptografado);
  }
}
