import { createServer } from "node:http";
import type { Pool } from "pg";
import type { SyncPoller } from "./poller";
import { fetchAgendamentosFuturos } from "./agendamentoQueries";
import { logger } from "./logger";

export function startHealthServer(poller: SyncPoller, esusPool: Pool, port: number) {
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      const body = JSON.stringify({
        status: "ok",
        lastCycleAt: poller.lastCycleAt,
        lastError: poller.lastError ? poller.lastError.message : null,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(body);
      return;
    }

    if (req.url === "/agendamentos/futuros") {
      fetchAgendamentosFuturos(esusPool)
        .then((rows) => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(rows));
        })
        .catch((err) => {
          logger.error({ err }, "Falha ao consultar agendamentos futuros");
          res.writeHead(502, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "falha ao consultar agendamentos futuros" }));
        });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    logger.info({ port }, "Healthcheck HTTP disponivel em /health");
  });

  return server;
}
