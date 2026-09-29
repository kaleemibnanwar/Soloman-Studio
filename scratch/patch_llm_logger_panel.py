import re

with open('src/components/preview_panel/LlmLoggerPanel.tsx', 'r') as f:
    content = f.read()

# 1. Add systemPromptStr and toolsStr
old = """            const requestStr = JSON.stringify(log.messagesSent, null, 2);
            const responseStr ="""
new = """            const requestStr = JSON.stringify(log.messagesSent, null, 2);
            const systemPromptStr = log.systemPrompt || "";
            const toolsStr = log.tools ? JSON.stringify(log.tools, null, 2) : "";
            const responseStr ="""
content = content.replace(old, new)

# 2. Add System Prompt and Tools UI sections
old_render = """                  <div className="mb-2">
                    <div className="flex justify-between items-center mb-1">
                      <strong className="text-muted-foreground uppercase text-[10px]">
                        What was sent
                      </strong>"""

new_render = """                  {systemPromptStr && (
                    <div className="mb-2">
                      <div className="flex justify-between items-center mb-1">
                        <strong className="text-muted-foreground uppercase text-[10px]">
                          System Prompt
                        </strong>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleCopy(systemPromptStr)}>
                          <Copy size={12} />
                        </Button>
                      </div>
                      {plainTextMode ? (
                        <textarea readOnly className="w-full h-32 p-2 font-mono text-[10px] bg-background border rounded" value={systemPromptStr} />
                      ) : (
                        <pre className="p-2 bg-background border rounded overflow-x-auto max-h-40 font-mono text-[10px] whitespace-pre-wrap">{systemPromptStr}</pre>
                      )}
                    </div>
                  )}

                  {toolsStr && (
                    <div className="mb-2">
                      <div className="flex justify-between items-center mb-1">
                        <strong className="text-muted-foreground uppercase text-[10px]">
                          Tools Available
                        </strong>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleCopy(toolsStr)}>
                          <Copy size={12} />
                        </Button>
                      </div>
                      {plainTextMode ? (
                        <textarea readOnly className="w-full h-32 p-2 font-mono text-[10px] bg-background border rounded" value={toolsStr} />
                      ) : (
                        <pre className="p-2 bg-background border rounded overflow-x-auto max-h-40 font-mono text-[10px]">{toolsStr}</pre>
                      )}
                    </div>
                  )}

                  <div className="mb-2">
                    <div className="flex justify-between items-center mb-1">
                      <strong className="text-muted-foreground uppercase text-[10px]">
                        Messages Sent
                      </strong>"""
content = content.replace(old_render, new_render)

with open('src/components/preview_panel/LlmLoggerPanel.tsx', 'w') as f:
    f.write(content)
