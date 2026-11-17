const fs = require("fs");
const content = fs.readFileSync("src/ipc/types/chat.ts", "utf-8");

const newContent = content.replace("createClient,", "createClient,\n  defineEvent,").replace(
  "export const chatContracts = {",
  `export const LlmLogPayloadSchema = z.object({
  chatId: z.number(),
  sentAt: z.number(),
  messagesSent: z.any(),
  response: z.any(),
  usage: z.object({
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
    totalTokens: z.number().optional(),
  }).optional(),
});

export const chatContracts = {
  llmLogEvent: defineEvent({
    channel: "chat:llm-log",
    payload: LlmLogPayloadSchema,
  }),`,
);

fs.writeFileSync("src/ipc/types/chat.ts", newContent);
