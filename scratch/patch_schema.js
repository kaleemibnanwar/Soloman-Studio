const fs = require("fs");
const content = fs.readFileSync("src/ipc/types/chat.ts", "utf-8");

const newContent = content.replace(
  "  messagesSent: z.any(),",
  "  messagesSent: z.any(),\n  systemPrompt: z.string().optional(),\n  tools: z.any().optional(),",
);

fs.writeFileSync("src/ipc/types/chat.ts", newContent);
