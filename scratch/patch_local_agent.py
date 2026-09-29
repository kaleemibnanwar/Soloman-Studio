import re

with open('src/prompts/local_agent_prompt.ts', 'r') as f:
    content = f.read()

# 1. add appPath to options in constructLocalAgentPrompt
old_options = """  options?: {
    readOnly?: boolean;
    basicAgentMode?: boolean;
    freeModelMode?: boolean;
    frameworkType?: AppFrameworkType | null;"""

new_options = """  options?: {
    appPath?: string;
    readOnly?: boolean;
    basicAgentMode?: boolean;
    freeModelMode?: boolean;
    frameworkType?: AppFrameworkType | null;"""

if "appPath?: string;" not in content:
    content = content.replace(old_options, new_options)

# 2. Add FILE_SYSTEM_BLOCK
old_role = """const ROLE_BLOCK = `<role>
You are Octopus Studio, an AI assistant that creates and modifies web applications. You assist users by chatting with them and making changes to their code in real-time. You understand that users can see a live preview of their application in an iframe on the right side of the screen while you make code changes.
You make efficient and effective changes to codebases while following best practices for maintainability and readability. You take pride in keeping things simple and elegant. You are friendly and helpful, always aiming to provide clear explanations. 
</role>`;"""

new_role = """const ROLE_BLOCK = `<role>
You are Octopus Studio, an AI assistant that creates and modifies web applications. You assist users by chatting with them and making changes to their code in real-time. You understand that users can see a live preview of their application in an iframe on the right side of the screen while you make code changes.
You make efficient and effective changes to codebases while following best practices for maintainability and readability. You take pride in keeping things simple and elegant. You are friendly and helpful, always aiming to provide clear explanations. 
</role>`;

function fileSystemBlock(appPath?: string): string {
  if (!appPath) return "";
  return `<file_system_awareness>
The absolute path to the root of the user's project/chat on their operating system is: \`${appPath}\`
When generating media (images/videos) or writing files, you are operating within this absolute directory path. Use this context if the user asks where their files are located on their OS.
</file_system_awareness>`;
}"""

if "fileSystemBlock" not in content:
    content = content.replace(old_role, new_role)

# 3. Add to buildLocalAgentSystemPrompt
old_build = """function buildLocalAgentSystemPrompt({
  enableAppBlueprint,
  codeExplorerAvailable,
  historyExplorerAvailable,
  testingEnabled,
  restartAppToolAvailable,
  rebuildAppToolAvailable,
}: {"""

new_build = """function buildLocalAgentSystemPrompt({
  appPath,
  enableAppBlueprint,
  codeExplorerAvailable,
  historyExplorerAvailable,
  testingEnabled,
  restartAppToolAvailable,
  rebuildAppToolAvailable,
}: {
  appPath?: string;"""

if "appPath?: string" not in content:
    content = content.replace(old_build, new_build)

old_build_return = """  return `
${ROLE_BLOCK}

${APP_COMMANDS_BLOCK}"""

new_build_return = """  return `
${ROLE_BLOCK}

${fileSystemBlock(appPath)}

${APP_COMMANDS_BLOCK}"""

if "fileSystemBlock(appPath)" not in content:
    content = content.replace(old_build_return, new_build_return)

# 4. Add to buildLocalAgentBasicSystemPrompt
old_basic = """function buildLocalAgentBasicSystemPrompt(
  enableAppBlueprint: boolean,
  testingEnabled: boolean,
  restartAppToolAvailable: boolean,
  rebuildAppToolAvailable: boolean,
): string {"""

new_basic = """function buildLocalAgentBasicSystemPrompt(
  enableAppBlueprint: boolean,
  testingEnabled: boolean,
  restartAppToolAvailable: boolean,
  rebuildAppToolAvailable: boolean,
  appPath?: string,
): string {"""

if "appPath?: string," not in content:
    content = content.replace(old_basic, new_basic)

old_basic_return = """  return `
${ROLE_BLOCK}

${APP_COMMANDS_BLOCK}"""

new_basic_return = """  return `
${ROLE_BLOCK}

${fileSystemBlock(appPath)}

${APP_COMMANDS_BLOCK}"""

if "fileSystemBlock(appPath)" not in content:
    content = content.replace(old_basic_return, new_basic_return)

# 5. Add to callers in constructLocalAgentPrompt
old_call1 = """    basePrompt = buildLocalAgentBasicSystemPrompt(
      enableAppBlueprint,
      testingEnabled,
      restartAppToolAvailable,
      rebuildAppToolAvailable,
    );"""

new_call1 = """    basePrompt = buildLocalAgentBasicSystemPrompt(
      enableAppBlueprint,
      testingEnabled,
      restartAppToolAvailable,
      rebuildAppToolAvailable,
      options?.appPath,
    );"""

content = content.replace(old_call1, new_call1)

old_call2 = """    basePrompt = buildLocalAgentSystemPrompt({
      enableAppBlueprint,
      codeExplorerAvailable,
      historyExplorerAvailable,
      testingEnabled,
      restartAppToolAvailable,
      rebuildAppToolAvailable,
    });"""

new_call2 = """    basePrompt = buildLocalAgentSystemPrompt({
      appPath: options?.appPath,
      enableAppBlueprint,
      codeExplorerAvailable,
      historyExplorerAvailable,
      testingEnabled,
      restartAppToolAvailable,
      rebuildAppToolAvailable,
    });"""

content = content.replace(old_call2, new_call2)

with open('src/prompts/local_agent_prompt.ts', 'w') as f:
    f.write(content)
