import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadEnv } from "./plugins/env.js";
import { registerHealthRoutes } from "./modules/health/routes.js";

const env = loadEnv(process.env);
const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await registerHealthRoutes(app);

app.get("/api/v1/portfolio", async () => {
  return { items: [], total: 0 };
});

app.get("/api/v1/treasury", async () => {
  return { configured: false, balanceSOL: 0 };
});

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
