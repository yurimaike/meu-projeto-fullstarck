import { serve } from "@hono/node-server";
import app from "./create-app";
import { env } from "./env";

// FC3 Web function mode for streaming/SSE/large-response apps.
// The HTTP server must listen on 0.0.0.0:$SKY_FC_SERVER_PORT.
const server = serve({
  fetch: app.fetch,
  hostname: "0.0.0.0",
  port: env.SKY_FC_SERVER_PORT
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[server] ${signal} received; draining HTTP server`);

  const forceCloseTimer = setTimeout(() => {
    if ("closeAllConnections" in server) {
      server.closeAllConnections();
    } else {
      server.close();
    }
  }, 25_000);
  forceCloseTimer.unref();

  server.close((error) => {
    clearTimeout(forceCloseTimer);
    if (error) {
      console.error("[server] graceful shutdown failed");
      process.exitCode = 1;
    }
  });
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
