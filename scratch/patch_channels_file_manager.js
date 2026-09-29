const fs = require("fs");
const content = fs.readFileSync("src/ipc/preload/channels.ts", "utf-8");

let newContent = content.replace(
  'import { chatProjectContracts } from "../types/chat_project";',
  'import { chatProjectContracts } from "../types/chat_project";\nimport { fileManagerContracts } from "../types/file_manager";',
);

newContent = newContent.replace(
  "...getInvokeChannels(chatProjectContracts),",
  "...getInvokeChannels(chatProjectContracts),\n  ...getInvokeChannels(fileManagerContracts),",
);

fs.writeFileSync("src/ipc/preload/channels.ts", newContent);
