import { z } from "zod";
import { RegionType, ServiceType } from "../../../generated/prisma/enums.ts";

const regionValues = Object.values(RegionType) as [RegionType, ...RegionType[]];
const serviceValues = Object.values(ServiceType) as [ServiceType, ...ServiceType[]];

export const moverAiSortSchema = z.enum(["rating", "review", "career", "confirmed"]);
export const moverAiNextActionSchema = z.enum([
  "ASK_REGION",
  "ASK_SERVICE",
  "ASK_SORT",
  "SHOW_MOVERS",
  "CLARIFY_UNSUPPORTED",
  "CLARIFY_REGION",
]);
export const moverAiFiltersSchema = z.object({
  region: z.enum(regionValues).nullable(),
  service: z.enum(serviceValues).nullable(),
  sort: moverAiSortSchema.nullable(),
});

/** Gemini structured output 재검증 */
export const geminiMoverAiResultSchema = z.object({
  reply: z.string().min(1).max(500),
  filters: moverAiFiltersSchema,
  nextAction: moverAiNextActionSchema,
});

export const sessionIdParamSchema = z.object({
  sessionId: z.string().min(1, "sessionId가 필요합니다"),
});

export const clientActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("SELECT_SERVICE"),
    value: z.enum(serviceValues),
  }),
  z.object({
    type: z.literal("SELECT_SORT"),
    value: moverAiSortSchema,
  }),
  z.object({
    type: z.literal("SELECT_REGION"),
    value: z.enum(regionValues),
  }),
  z.object({
    type: z.literal("SHOW_MORE"),
    value: z.null().optional(),
  }),
  z.object({
    type: z.literal("CHANGE_FILTERS"),
    value: z.null().optional(),
  }),
  z.object({
    type: z.literal("FAVORITE_ALL"),
    value: z.null().optional(),
  }),
]);

export const postMessageSchema = z
  .object({
    message: z.string().trim().min(1, "message는 비울 수 없습니다").max(1000),
    clientAction: clientActionSchema.nullable().optional().default(null),
  })
  .strict();

export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;
export type PostMessageDto = z.infer<typeof postMessageSchema>;
export type ClientActionDto = z.infer<typeof clientActionSchema>;
