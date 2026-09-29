const fs = require("fs");
const content = fs.readFileSync("src/pages/chat.tsx", "utf-8");

let newContent = content.replace(
  'import { ipc } from "@/ipc/types";',
  'import { ipc } from "@/ipc/types";\nimport { useLlmLogger } from "@/hooks/useLlmLogger";',
);

newContent = newContent.replace(
  "export default function ChatPage() {",
  "export default function ChatPage() {\n  useLlmLogger();",
);

fs.writeFileSync("src/pages/chat.tsx", newContent);
