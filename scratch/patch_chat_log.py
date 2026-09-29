import re

with open('src/ipc/handlers/chat_stream_handlers.ts', 'r') as f:
    content = f.read()

old = """              event.sender.send("chat:llm-log", {
                chatId: req.chatId,
                sentAt: Date.now(),
                messagesSent: chatMessages,
                response: response.text,
                usage: {
                  promptTokens: inputTokens,
                  completionTokens: outputTokens,
                  totalTokens: totalTokens,
                },
              });"""

new = """              event.sender.send("chat:llm-log", {
                chatId: req.chatId,
                sentAt: Date.now(),
                messagesSent: chatMessages,
                systemPrompt: systemPromptOverride ?? "",
                tools: tools,
                response: response.text,
                usage: {
                  promptTokens: inputTokens,
                  completionTokens: outputTokens,
                  totalTokens: totalTokens,
                },
              });"""

content = content.replace(old, new)

with open('src/ipc/handlers/chat_stream_handlers.ts', 'w') as f:
    f.write(content)
