import re

with open('src/ipc/handlers/chat_stream_handlers.ts', 'r') as f:
    content = f.read()

old = """                systemPrompt: systemPromptOverride ?? "",
                tools: tools,
                response: response.text,"""

new = """                systemPrompt: systemPromptOverride ?? "",
                tools: tools ? JSON.parse(JSON.stringify(
                  Object.fromEntries(
                    Object.entries(tools).map(([name, t]: [string, any]) => [
                      name,
                      {
                        description: t.description,
                        // We safely omit 'execute' and other functions.
                        // For parameters, if it's a Zod schema, JSON.stringify might drop it,
                        // but it prevents DataCloneError.
                        parameters: t.parameters ? (t.parameters.jsonSchema ?? "Schema hidden") : undefined,
                        inputSchema: t.inputSchema,
                      }
                    ])
                  )
                )) : undefined,
                response: response.text,"""

content = content.replace(old, new)

with open('src/ipc/handlers/chat_stream_handlers.ts', 'w') as f:
    f.write(content)
