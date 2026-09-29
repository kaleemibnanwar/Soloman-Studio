const fs = require("fs");
const content = fs.readFileSync("src/pages/chat.tsx", "utf-8");

const newContent = content.replace(
  "export function ChatPage() {",
  'import { useLlmLogger } from "@/hooks/useLlmLogger";\n\nexport function ChatPage() {\n  useLlmLogger();',
);

fs.writeFileSync("src/pages/chat.tsx", newContent);
