import pino from "pino";
import { appConfig } from "./config";

export const logger = pino({
  level: appConfig.logLevel,
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } },
});
