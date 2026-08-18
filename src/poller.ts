import type { Pool } from "pg";
import { fetchAtendimentoDetalhado, fetchStatusChangesSince, type StatusChangeRow } from "./esusQueries";
import { enviarChamada } from "./chamadaService";
import { StateStore } from "./state";
import { logger } from "./logger";
import { appConfig } from "./config";

/** Status de origem exigido pela regra original da trigger (old.st_atend = 1). */
const STATUS_AGUARDANDO = 1;
/** Status de destino exigidos pela regra original (new.st_atend = 2 ou 3). */
const STATUS_QUE_DISPARAM_CHAMADA = new Set([2, 3]);

export class SyncPoller {
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  public lastCycleAt: Date | null = null;
  public lastError: Error | null = null;

  constructor(
    private readonly esusPool: Pool,
    private readonly isPool: Pool,
    private readonly state: StateStore,
  ) {}

  start(): void {
    if (this.timer) return;
    logger.info({ intervalMs: appConfig.poll.intervalMs, dryRun: appConfig.dryRun }, "Iniciando worker de sincronizacao");
    this.scheduleNext(0);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleNext(delayMs: number): void {
    this.timer = setTimeout(() => {
      void this.runCycle().finally(() => this.scheduleNext(appConfig.poll.intervalMs));
    }, delayMs);
  }

  private async runCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.processPendingChanges();
      this.lastError = null;
    } catch (err) {
      this.lastError = err as Error;
      logger.error({ err }, "Falha no ciclo de sincronizacao");
    } finally {
      this.lastCycleAt = new Date();
      this.running = false;
    }
  }

  private async processPendingChanges(): Promise<void> {
    const since = this.state.getWatermark() ?? new Date();
    const rows = await fetchStatusChangesSince(this.esusPool, since, appConfig.poll.batchSize);
    if (rows.length === 0) return;

    logger.debug({ count: rows.length, since }, "Mudancas de status detectadas no e-SUS");

    for (const row of rows) {
      const ok = await this.processRow(row);
      if (!ok) {
        // Interrompe o ciclo sem avancar o watermark alem deste ponto, para
        // que a proxima execucao reprocesse esta linha e as subsequentes.
        logger.warn(
          { codAtendimento: row.cod_atendimento },
          "Interrompendo ciclo apos falha; sera reprocessado no proximo ciclo",
        );
        return;
      }
      this.state.setLastStatus(row.cod_atendimento, row.cod_status);
      this.state.setWatermark(row.data_alteracao_status);
    }
  }

  /** Retorna false quando o processamento falhou e deve ser retentado. */
  private async processRow(row: StatusChangeRow): Promise<boolean> {
    const statusAnterior = this.state.getLastStatus(row.cod_atendimento);
    const disparaChamada =
      statusAnterior === STATUS_AGUARDANDO && STATUS_QUE_DISPARAM_CHAMADA.has(row.cod_status);

    if (!disparaChamada) {
      return true;
    }

    try {
      const payload = await fetchAtendimentoDetalhado(this.esusPool, row.cod_atendimento);
      if (!payload || !payload.cod_profissional || payload.cod_profissional <= 0) {
        logger.info(
          { codAtendimento: row.cod_atendimento },
          "Atendimento sem profissional definido; chamada nao enviada",
        );
        this.state.logEvent({
          codAtendimento: row.cod_atendimento,
          statusAnterior,
          statusNovo: row.cod_status,
          acao: "chamada_ignorada",
          sucesso: true,
          detalhe: "sem profissional definido",
        });
        return true;
      }

      if (appConfig.dryRun) {
        logger.info({ payload }, "[DRY RUN] chamada que seria enviada ao IS");
        this.state.logEvent({
          codAtendimento: row.cod_atendimento,
          statusAnterior,
          statusNovo: row.cod_status,
          acao: "dry_run",
          sucesso: true,
          detalhe: JSON.stringify(payload),
        });
        return true;
      }

      const retorno = await enviarChamada(this.isPool, payload);
      logger.info({ codAtendimento: row.cod_atendimento, retorno }, "Chamada enviada ao IS");
      this.state.logEvent({
        codAtendimento: row.cod_atendimento,
        statusAnterior,
        statusNovo: row.cod_status,
        acao: "chamada_enviada",
        sucesso: true,
        detalhe: retorno,
      });
      return true;
    } catch (err) {
      logger.error({ err, codAtendimento: row.cod_atendimento }, "Erro ao processar chamada");
      this.state.logEvent({
        codAtendimento: row.cod_atendimento,
        statusAnterior,
        statusNovo: row.cod_status,
        acao: "chamada_erro",
        sucesso: false,
        detalhe: (err as Error).message,
      });
      return false;
    }
  }
}
