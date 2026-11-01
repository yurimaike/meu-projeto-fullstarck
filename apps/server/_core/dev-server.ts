import { serve } from "@hono/node-server";
import app from "./create-app";
import { env } from "./env";

serve(
  {
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port: env.PORT
  },
  () => {
    console.log(`Server dev listening on http://127.0.0.1:${env.PORT}`);
  }
);
