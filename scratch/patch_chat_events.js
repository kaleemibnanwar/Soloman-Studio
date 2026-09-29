const fs = require("fs");
const content = fs.readFileSync("src/ipc/types/chat.ts", "utf-8");

const newContent = content
  .replace(
    '  llmLogEvent: defineEvent({\n    channel: "chat:llm-log",\n    payload: LlmLogPayloadSchema,\n  }),',
    "",
  )
  .replace(
    "export const chatClient = createClient(chatContracts);",
    'export const chatClient = createClient(chatContracts);\n\nexport const chatEvents = {\n  llmLogEvent: defineEvent({\n    channel: "chat:llm-log",\n    payload: LlmLogPayloadSchema,\n  }),\n};\n\nexport const chatEventClient = createEventClient(chatEvents);',
  )
  .replace("createClient,\n  defineEvent,", "createClient,\n  defineEvent,\n  createEventClient,");

fs.writeFileSync("src/ipc/types/chat.ts", newContent);
