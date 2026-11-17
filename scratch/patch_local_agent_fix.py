import re

with open('src/prompts/local_agent_prompt.ts', 'r') as f:
    content = f.read()

# Fix buildLocalAgentSystemPrompt signature
old_sig = """function buildLocalAgentSystemPrompt({
  enableAppBlueprint,
  codeExplorerAvailable,
  historyExplorerAvailable,
  testingEnabled,
  restartAppToolAvailable,
  rebuildAppToolAvailable,
}: {
  enableAppBlueprint: boolean;
  codeExplorerAvailable: boolean;
  historyExplorerAvailable: boolean;
  testingEnabled: boolean;
  restartAppToolAvailable: boolean;
  rebuildAppToolAvailable: boolean;
}): string {"""

new_sig = """function buildLocalAgentSystemPrompt({
  appPath,
  enableAppBlueprint,
  codeExplorerAvailable,
  historyExplorerAvailable,
  testingEnabled,
  restartAppToolAvailable,
  rebuildAppToolAvailable,
}: {
  appPath?: string;
  enableAppBlueprint: boolean;
  codeExplorerAvailable: boolean;
  historyExplorerAvailable: boolean;
  testingEnabled: boolean;
  restartAppToolAvailable: boolean;
  rebuildAppToolAvailable: boolean;
}): string {"""

content = content.replace(old_sig, new_sig)
with open('src/prompts/local_agent_prompt.ts', 'w') as f:
    f.write(content)
