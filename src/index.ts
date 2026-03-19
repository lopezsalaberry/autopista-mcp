#!/usr/bin/env node

import { config } from "./shared/config.js";

const transport = process.env.TRANSPORT || "stdio";

if (transport === "http") {
  const { createApp } = await import("./http.js");
  const { logger } = await import("./shared/logger.js");

  const app = createApp();
  const port = parseInt(process.env.APP_PORT || "3000", 10);

  app.listen(port, () => {
    logger.info({ port, transport: "http" }, `autopista-mcp HTTP server iniciado en puerto ${port}`);
    logger.info(`Swagger UI disponible en http://localhost:${port}/api-docs`);
    logger.info(`MCP endpoint en http://localhost:${port}/mcp`);
  });
} else {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { createMcpServer } = await import("./mcp.js");

  const server = createMcpServer();
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
}
