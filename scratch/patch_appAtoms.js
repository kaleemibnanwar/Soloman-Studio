const fs = require("fs");
const content = fs.readFileSync("src/atoms/appAtoms.ts", "utf-8");

const newContent = content.replace(
  '| "tests"\n  | "plan";',
  '| "tests"\n  | "plan"\n  | "logger";',
);

fs.writeFileSync("src/atoms/appAtoms.ts", newContent);
