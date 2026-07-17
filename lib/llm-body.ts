// Shared zod shape for the per-request LLM config the browser sends.
import { z } from "zod";

export const LlmBody = z
  .object({
    provider: z.string().optional(),
    model: z.string().optional(),
    apiKey: z.string().optional(),
    baseURL: z.string().optional(),
    effort: z.enum(["default", "low", "medium", "high"]).optional(),
  })
  .optional();
