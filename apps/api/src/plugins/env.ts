import { z } from "zod";

export const EnvSchema = z.object({
  API_PORT: z.coerce.number().default(8787),
  API_HOST: z.string().default("0.0.0.0"),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv): AppEnv {
  return EnvSchema.parse(raw);
}
