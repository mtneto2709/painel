import { createServer } from "node:http";
import type { SyncPoller } from "./poller";
import { logger } from "./logger";

export function startHealthServer(poller: SyncPoller, port: number) {
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
    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    logger.info({ port }, "Healthcheck HTTP disponivel em /health");
  });

  return server;
}
