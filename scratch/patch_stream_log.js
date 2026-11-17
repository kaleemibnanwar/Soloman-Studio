const fs = require("fs");
const content = fs.readFileSync("src/ipc/handlers/chat_stream_handlers.ts", "utf-8");

const newContent = content.replace(
  'logger.error("Failed to save token usage for assistant message", error);\n                });',
  `logger.error("Failed to save token usage for assistant message", error);\n                });\n\n              event.sender.send("chat:llm-log", {\n                chatId: req.chatId,\n                sentAt: Date.now(),\n                messagesSent: chatMessages,\n                response: response.text,\n                usage: {\n                  promptTokens: inputTokens,\n                  completionTokens: outputTokens,\n                  totalTokens: totalTokens,\n                }\n              });`,
);

fs.writeFileSync("src/ipc/handlers/chat_stream_handlers.ts", newContent);
