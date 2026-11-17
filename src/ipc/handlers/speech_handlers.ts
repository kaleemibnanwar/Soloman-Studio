import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";

import { OctopusStudioError, OctopusStudioErrorKind } from "@/errors/octopus_studio_error";
import { systemContracts } from "@/ipc/types/system";
import { createTypedHandler } from "./base";

let activeSpeechProcess: ChildProcess | null = null;
let speechRequestId = 0;

function nativeSpeechCommand(language: string | undefined): {
  executable: string;
  args: (text: string) => string[];
} | null {
  if (process.platform === "linux") {
    if (existsSync("/usr/bin/spd-say")) {
      return {
        executable: "/usr/bin/spd-say",
        args: (text) => ["--wait", ...(language ? ["--language", language] : []), text],
      };
    }
    if (existsSync("/usr/bin/espeak-ng")) {
      return {
        executable: "/usr/bin/espeak-ng",
        args: (text) => [...(language ? ["--voice", language] : []), text],
      };
    }
  }
  if (process.platform === "darwin" && existsSync("/usr/bin/say")) {
    return {
      executable: "/usr/bin/say",
      args: (text) => [text],
    };
  }
  return null;
}

function cancelSpeechDispatcher() {
  if (process.platform !== "linux" || !existsSync("/usr/bin/spd-say")) return;
  const cancellation = spawn("/usr/bin/spd-say", ["--cancel"], {
    stdio: "ignore",
  });
  cancellation.unref();
}

export function stopNativeSpeech() {
  speechRequestId += 1;
  activeSpeechProcess?.kill();
  activeSpeechProcess = null;
  cancelSpeechDispatcher();
}

export function speakWithNativeVoice(text: string, language?: string): Promise<void> {
  stopNativeSpeech();
  const requestId = ++speechRequestId;
  const command = nativeSpeechCommand(language);
  if (!command) {
    throw new OctopusStudioError(
      "No native text-to-speech engine is available.",
      OctopusStudioErrorKind.Precondition,
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args(text), {
      stdio: "ignore",
    });
    activeSpeechProcess = child;
    child.once("error", (error) => {
      if (requestId !== speechRequestId) {
        resolve();
        return;
      }
      activeSpeechProcess = null;
      reject(
        new OctopusStudioError(
          `Voice playback failed: ${error.message}`,
          OctopusStudioErrorKind.External,
        ),
      );
    });
    child.once("close", (code) => {
      if (requestId !== speechRequestId) {
        resolve();
        return;
      }
      activeSpeechProcess = null;
      if (code === 0) {
        resolve();
      } else {
        reject(
          new OctopusStudioError(
            "Voice playback failed through the system speech engine.",
            OctopusStudioErrorKind.External,
          ),
        );
      }
    });
  });
}

export function registerSpeechHandlers() {
  createTypedHandler(systemContracts.speakText, async (_event, { text, language }) => {
    await speakWithNativeVoice(text, language);
  });

  createTypedHandler(systemContracts.stopSpeaking, async () => {
    stopNativeSpeech();
  });
}
