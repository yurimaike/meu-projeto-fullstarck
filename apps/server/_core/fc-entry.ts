import { serve } from "@hono/node-server";
import app from "./create-app";

const port = Number(process.env.PORT) || 3000;
console.log(`Servidor rodando na porta ${port}`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
