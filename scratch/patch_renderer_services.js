const fs = require("fs");
const content = fs.readFileSync("src/renderer.tsx", "utf-8");

let newContent = content.replace(
  'import { useStore } from "jotai";',
  'import { useStore } from "jotai";\nimport { useLlmLogger } from "./hooks/useLlmLogger";',
);

newContent = newContent.replace(
  "function RendererServices() {\n  const queryClient = useQueryClient();",
  "function RendererServices() {\n  useLlmLogger();\n  const queryClient = useQueryClient();",
);

fs.writeFileSync("src/renderer.tsx", newContent);
