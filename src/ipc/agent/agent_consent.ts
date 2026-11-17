import type { IpcMainInvokeEvent } from "electron";

import { rememberUserInputSubscriber, userInputRegistry } from "../../user_input/main";

export async function requireAgentToolConsent(
  event: IpcMainInvokeEvent,
  params: {
    chatId: number;
    toolName: string;
    toolDescription: string;
    inputPreview: string;
    abortSignal?: AbortSignal;
  },
): Promise<boolean> {
  rememberUserInputSubscriber(event.sender);
  const requestId = userInputRegistry.request({
    kind: "agent-consent",
    chatId: params.chatId,
    toolName: params.toolName,
    toolDescription: params.toolDescription,
    inputPreview: params.inputPreview,
    classifier: "none",
  });
  const response = await userInputRegistry.park(requestId, params.abortSignal);
  return response?.kind === "agent-consent" && response.decision !== "decline";
}
