import re

with open('src/components/preview_panel/LlmLoggerPanel.tsx', 'r') as f:
    content = f.read()

old_render = r'                  <div>\n                    <div className="flex justify-between items-center mb-1">\n                      <strong className="text-muted-foreground uppercase text-\[10px\]">\n                        What was sent'

new_render = """                  {systemPromptStr && (
                    <div className="mb-4">
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
                    <div className="mb-4">
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
                        <pre className="p-2 bg-background border rounded overflow-x-auto max-h-40 font-mono text-[10px] whitespace-pre-wrap">{toolsStr}</pre>
                      )}
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <strong className="text-muted-foreground uppercase text-[10px]">
                        Messages Sent"""

content = re.sub(old_render, new_render, content, count=1)

with open('src/components/preview_panel/LlmLoggerPanel.tsx', 'w') as f:
    f.write(content)
