import pino from "pino";

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "warn" : "debug");

export const logger = pino({
  level,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers['x-api-key']",
      "password",
      "secret",
      "token",
      "accessToken",
    ],
    censor: "[REDACTED]",
  },
});
