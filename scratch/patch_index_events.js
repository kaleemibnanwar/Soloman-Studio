const fs = require("fs");
const content = fs.readFileSync("src/ipc/types/index.ts", "utf-8");

let newContent = content.replace(
  'import { chatClient, chatStreamClient } from "./chat";',
  'import { chatClient, chatStreamClient, chatEventClient } from "./chat";',
);

newContent = newContent.replace(
  "  events: {\n    agent: agentEventClient,",
  "  events: {\n    chat: chatEventClient,\n    agent: agentEventClient,",
);

fs.writeFileSync("src/ipc/types/index.ts", newContent);
