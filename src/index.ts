import { appConfig } from "./config";
import { logger } from "./logger";
import { esusPool, isPool, closePools } from "./db";
import { StateStore } from "./state";
import { SyncPoller } from "./poller";
import { startHealthServer } from "./health";

async function main() {
  logger.info({ dryRun: appConfig.dryRun }, "Iniciando painel-esus-sync");

  const state = new StateStore();
  const poller = new SyncPoller(esusPool, isPool, state);
  const healthServer = startHealthServer(poller, appConfig.healthPort);

  poller.start();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Encerrando aplicacao");
    poller.stop();
    healthServer.close();
    state.close();
    await closePools();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Falha fatal ao iniciar a aplicacao");
  process.exit(1);
});
