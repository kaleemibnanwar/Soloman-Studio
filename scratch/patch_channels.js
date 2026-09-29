const fs = require("fs");
const content = fs.readFileSync("src/ipc/preload/channels.ts", "utf-8");

let newContent = content.replace(
  'import { chatContracts, chatStreamContract } from "../types/chat";',
  'import { chatContracts, chatStreamContract, chatEvents } from "../types/chat";',
);

newContent = newContent.replace(
  "...getReceiveChannels(systemEvents),",
  "...getReceiveChannels(systemEvents),\n  ...getReceiveChannels(chatEvents),",
);

fs.writeFileSync("src/ipc/preload/channels.ts", newContent);
