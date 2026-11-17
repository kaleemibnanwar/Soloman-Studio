const fs = require("fs");
const content = fs.readFileSync("src/ipc/utils/agent_tools.ts", "utf-8");

const regex = /const ON_DEMAND_TOOL_KEYWORDS: Record<string, string\[\]> = \{[\s\S]*?\};\n/;
const newContent = content.replace(regex, "");

fs.writeFileSync("src/ipc/utils/agent_tools.ts", newContent);
