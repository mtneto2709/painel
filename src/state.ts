import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { appConfig } from "./config";

/**
 * Estado interno do worker de sincronizacao.
 *
 * Este SQLite e um artefato PRIVADO da aplicacao (nao e uma estrutura do
 * banco do e-SUS nem do banco do IS). Ele existe apenas para permitir a
 * deteccao de transicao de status sem depender de triggers:
 *
 *  - watermark:     ultimo instante (dt_ultima_alteracao_status) processado
 *                   com sucesso, usado para nao reler o e-SUS inteiro a
 *                   cada ciclo.
 *  - status_cache:  ultimo status conhecido de cada atendimento, usado para
 *                   detectar a transicao "aguardando -> em atendimento"
 *                   (equivalente ao OLD/NEW da trigger original).
 *  - event_log:     trilha de auditoria de cada chamada gerada/tentada.
 */
export class StateStore {
  private db: Database.Database;

  constructor(path: string = appConfig.stateDbPath) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      create table if not exists watermark (
        id integer primary key check (id = 1),
        last_processed_at text not null
      );

      create table if not exists atend_status_cache (
        cod_atendimento integer primary key,
        cod_status integer not null,
        updated_at text not null
      );

      create table if not exists event_log (
        id integer primary key autoincrement,
        cod_atendimento integer not null,
        status_anterior integer,
        status_novo integer not null,
        acao text not null,
        sucesso integer not null,
        detalhe text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      create index if not exists event_log_cod_atendimento_idx on event_log (cod_atendimento);
    `);
  }

  getWatermark(): Date | null {
    const row = this.db
      .prepare<[], { last_processed_at: string }>("select last_processed_at from watermark where id = 1")
      .get();
    return row ? new Date(row.last_processed_at) : null;
  }

  setWatermark(date: Date): void {
    this.db
      .prepare(
        `insert into watermark (id, last_processed_at) values (1, ?)
         on conflict (id) do update set last_processed_at = excluded.last_processed_at`,
      )
      .run(date.toISOString());
  }

  getLastStatus(codAtendimento: number): number | null {
    const row = this.db
      .prepare<[number], { cod_status: number }>(
        "select cod_status from atend_status_cache where cod_atendimento = ?",
      )
      .get(codAtendimento);
    return row ? row.cod_status : null;
  }

  setLastStatus(codAtendimento: number, codStatus: number): void {
    this.db
      .prepare(
        `insert into atend_status_cache (cod_atendimento, cod_status, updated_at) values (?, ?, ?)
         on conflict (cod_atendimento) do update set cod_status = excluded.cod_status, updated_at = excluded.updated_at`,
      )
      .run(codAtendimento, codStatus, new Date().toISOString());
  }

  logEvent(event: {
    codAtendimento: number;
    statusAnterior: number | null;
    statusNovo: number;
    acao: "chamada_enviada" | "chamada_ignorada" | "chamada_erro" | "dry_run";
    sucesso: boolean;
    detalhe?: string;
  }): void {
    this.db
      .prepare(
        `insert into event_log (cod_atendimento, status_anterior, status_novo, acao, sucesso, detalhe)
         values (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.codAtendimento,
        event.statusAnterior,
        event.statusNovo,
        event.acao,
        event.sucesso ? 1 : 0,
        event.detalhe ?? null,
      );
  }

  close(): void {
    this.db.close();
  }
}
