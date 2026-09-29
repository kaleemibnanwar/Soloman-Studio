sed -i 's/return CHAT_PROJECT_SYSTEM_PROMPT + economySuffix;/return CHAT_PROJECT_SYSTEM_PROMPT + officeGuidance + economySuffix;/g' src/prompts/system_prompt.ts
sed -i 's/}) + economySuffix/}) + officeGuidance + economySuffix/g' src/prompts/system_prompt.ts
