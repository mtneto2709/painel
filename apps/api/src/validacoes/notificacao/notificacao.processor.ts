import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { CanalNotificacao, NOTIFICACAO_ADAPTER, NotificacaoAdapter } from "./notificacao-adapter.interface";
import { PacientesService } from "../../pacientes/pacientes.service";
import { PrismaService } from "../../prisma/prisma.service";
import { FILA_NOTIFICACOES } from "../../queue/queue.constants";

export interface EnviarOtpJobData {
  validacaoId: string;
  pacienteId: string;
  codigo: string;
  canal: CanalNotificacao;
}

@Processor(FILA_NOTIFICACOES)
export class NotificacaoProcessor extends WorkerHost {
  private readonly logger = new Logger("NotificacaoProcessor");

  constructor(
    @Inject(NOTIFICACAO_ADAPTER) private readonly adapter: NotificacaoAdapter,
    private readonly pacientesService: PacientesService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<EnviarOtpJobData>): Promise<void> {
    const { pacienteId, codigo, canal, validacaoId } = job.data;
    const paciente = await this.prisma.paciente.findUnique({ where: { id: pacienteId } });
    if (!paciente) {
      this.logger.warn(`Paciente ${pacienteId} não encontrado ao enviar OTP da validação ${validacaoId}.`);
      return;
    }
    const telefone = await this.pacientesService.telefoneEmClaro(pacienteId);
    await this.adapter.enviarOtp({ telefone, codigo, canal, nomePaciente: paciente.nome });
  }
}
