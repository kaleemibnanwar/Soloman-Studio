import re

with open('src/prompts/system_prompt.ts', 'r') as f:
    content = f.read()

# 1. Add appPath to constructSystemPrompt options
old_options = """  economyMode?: boolean;
  aiRules: string | undefined;
  chatMode?: "build" | "ask" | "local-agent" | "plan";
  enableTurboEditsV2: boolean;
  themePrompt?: string;"""

new_options = """  economyMode?: boolean;
  appPath?: string;
  aiRules: string | undefined;
  chatMode?: "build" | "ask" | "local-agent" | "plan";
  enableTurboEditsV2: boolean;
  themePrompt?: string;"""

if "appPath?: string;" not in content:
    content = content.replace(old_options, new_options)

# 2. Add it to the argument destructuring
old_destruct = """  restartAppToolAvailable,
  rebuildAppToolAvailable,
  chatProject,
  economyMode,
}: {"""
new_destruct = """  restartAppToolAvailable,
  rebuildAppToolAvailable,
  chatProject,
  economyMode,
  appPath,
}: {"""
if "  appPath," not in content:
    content = content.replace(old_destruct, new_destruct)

# 3. Add to constructLocalAgentPrompt call
old_local = """      constructLocalAgentPrompt(aiRules, themePrompt, {
        readOnly,
        basicAgentMode,
        freeModelMode,
        frameworkType,
        hasSupabaseProject,
        enableAppBlueprint,
        codeExplorerAvailable,
        historyExplorerAvailable,
        testingEnabled,
        restartAppToolAvailable,
        rebuildAppToolAvailable,
      })"""

new_local = """      constructLocalAgentPrompt(aiRules, themePrompt, {
        appPath,
        readOnly,
        basicAgentMode,
        freeModelMode,
        frameworkType,
        hasSupabaseProject,
        enableAppBlueprint,
        codeExplorerAvailable,
        historyExplorerAvailable,
        testingEnabled,
        restartAppToolAvailable,
        rebuildAppToolAvailable,
      })"""

if "        appPath," not in content:
    content = content.replace(old_local, new_local)

with open('src/prompts/system_prompt.ts', 'w') as f:
    f.write(content)
