const fs = require("fs");
const content = fs.readFileSync("src/window_infrastructure/types.ts", "utf-8");

const newContent = content.replace('"plan",\n  ]),', '"plan",\n    "logger",\n  ]),');

fs.writeFileSync("src/window_infrastructure/types.ts", newContent);
