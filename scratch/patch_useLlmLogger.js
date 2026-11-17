const fs = require("fs");
const content = fs.readFileSync("src/hooks/useLlmLogger.ts", "utf-8");

const newContent = content.replace(
  "ipc.events.chat.llmLogEvent.subscribe",
  "ipc.events.chat.onLlmLogEvent",
);

fs.writeFileSync("src/hooks/useLlmLogger.ts", newContent);
