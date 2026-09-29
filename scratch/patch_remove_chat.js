const fs = require("fs");
const content = fs.readFileSync("src/pages/chat.tsx", "utf-8");

let newContent = content.replace('import { useLlmLogger } from "@/hooks/useLlmLogger";\n', "");

newContent = newContent.replace(
  "export default function ChatPage() {\n  useLlmLogger();\n",
  "export default function ChatPage() {\n",
);

fs.writeFileSync("src/pages/chat.tsx", newContent);
