import { z } from "zod";

export const PortfolioItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  location: z.string(),
  sizeAcres: z.number(),
  priceUSD: z.number(),
  score: z.number().min(0).max(100),
  sourceUrl: z.string().url().optional(),
});

export type PortfolioItem = z.infer<typeof PortfolioItemSchema>;
