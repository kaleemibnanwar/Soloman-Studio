import { z } from "zod";
import { createEventClient, createClient, defineContract, defineEvent } from "../contracts/core";

export const BrowserProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,48}$/),
  name: z.string().min(1).max(80),
  persistent: z.boolean(),
});
export type BrowserProfile = z.infer<typeof BrowserProfileSchema>;

const BrowserActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), url: z.string().url() }),
  z.object({ type: z.literal("back") }),
  z.object({ type: z.literal("forward") }),
  z.object({ type: z.literal("reload") }),
  z.object({ type: z.literal("click"), selector: z.string().min(1).max(500) }),
  z.object({
    type: z.literal("fill"),
    selector: z.string().min(1).max(500),
    value: z.string().max(20_000),
  }),
]);

export const browserContracts = {
  createSession: defineContract({
    channel: "browser:create-session",
    input: z.object({ profileId: z.string().regex(/^[a-z0-9-]{1,48}$/) }),
    output: z.object({ sessionId: z.string(), profile: BrowserProfileSchema }),
  }),
  setBounds: defineContract({
    channel: "browser:set-bounds",
    input: z.object({
      sessionId: z.string(),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
    output: z.object({ ok: z.literal(true) }),
  }),
  setVisible: defineContract({
    channel: "browser:set-visible",
    input: z.object({ sessionId: z.string(), visible: z.boolean() }),
    output: z.object({ ok: z.literal(true) }),
  }),
  importSession: defineContract({
    channel: "browser:import-session",
    input: z.object({ executablePath: z.string().min(1), profilePath: z.string().min(1) }),
    output: z.object({
      imported: z.number().int().nonnegative(),
      domains: z.number().int().nonnegative(),
    }),
  }),
  runAction: defineContract({
    channel: "browser:run-action",
    input: z.object({ sessionId: z.string(), action: BrowserActionSchema }),
    output: z.object({ ok: z.literal(true), url: z.string() }),
  }),
  closeSession: defineContract({
    channel: "browser:close-session",
    input: z.object({ sessionId: z.string() }),
    output: z.object({ ok: z.literal(true) }),
  }),
} as const;

export const browserEvents = {
  changed: defineEvent({
    channel: "browser:changed",
    payload: z.object({
      sessionId: z.string(),
      url: z.string(),
      title: z.string(),
      loading: z.boolean(),
    }),
  }),
  automation: defineEvent({
    channel: "browser:automation",
    payload: z.object({
      phase: z.enum(["started", "completed", "failed"]),
      tool: z.string(),
      args: z.record(z.string(), z.unknown()).default({}),
      url: z.string().optional(),
      message: z.string().optional(),
      elements: z
        .array(
          z.object({
            index: z.number(),
            tag: z.string(),
            text: z.string(),
          }),
        )
        .optional(),
      timestamp: z.number(),
    }),
  }),
} as const;

export type BrowserChangedPayload = z.infer<typeof browserEvents.changed.payload>;
export type BrowserAutomationPayload = z.infer<typeof browserEvents.automation.payload>;

export const browserClient = createClient(browserContracts);
export const browserEventClient = createEventClient(browserEvents);
