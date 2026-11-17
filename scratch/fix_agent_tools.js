const fs = require("fs");
const content = fs.readFileSync("src/ipc/utils/agent_tools.ts", "utf-8");

let newContent = content
  .replace("return filterOnDemandTools(readOnlyTools, params.prompt);", "return readOnlyTools;")
  .replace("return filterOnDemandTools(tools, params.prompt);", "return tools;");

// We should also probably comment out or remove the filterOnDemandTools function to avoid unused function warnings.
newContent = newContent.replace(
  /function filterOnDemandTools\([\s\S]*?return tools;\n\}/,
  "/* filterOnDemandTools removed to restore agent autonomy */",
);

fs.writeFileSync("src/ipc/utils/agent_tools.ts", newContent);
