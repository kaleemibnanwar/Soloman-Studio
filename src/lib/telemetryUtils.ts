import { hasOctopusStudioProKey, type UserSettings } from "@/lib/schemas";

/**
 * Backend-agnostic telemetry helpers shared by the renderer and main process.
 * Kept separate from `./telemetry` so the main process can import these
 * without pulling in the Clarity browser SDK.
 */

type TelemetryProperties = Record<string, unknown> | undefined;

export type InitialLoadTelemetryInput = {
  settings: UserSettings;
  appVersion: string;
  platform: string | null;
  isFirstSession: boolean;
};

export function getSettingsPersonTelemetryProperties(settings: UserSettings) {
  return {
    isPro: hasOctopusStudioProKey(settings),
    enableAppBlueprint: settings.enableAppBlueprint ?? true,
  };
}

export function getInitialLoadTelemetryProperties({
  settings,
  appVersion,
  platform,
  isFirstSession,
}: InitialLoadTelemetryInput) {
  return {
    ...getSettingsPersonTelemetryProperties(settings),
    appVersion,
    platform,
    releaseChannel: settings.releaseChannel,
    isFirstSession,
    modelProvider: settings.selectedModel.provider,
    defaultChatMode: settings.defaultChatMode ?? null,
    runtimeMode2: settings.runtimeMode2 ?? "host",
  };
}

/** Node/Electron undici network failure with no actionable stack context. */
export function isGenericFetchFailedError(
  name: string | undefined,
  message: string | undefined,
): boolean {
  return name === "TypeError" && message === "fetch failed";
}

export function createExceptionFromTelemetry(properties: TelemetryProperties) {
  const exception = new Error(
    typeof properties?.exception_message === "string"
      ? properties.exception_message
      : "Unknown IPC exception",
  );

  if (typeof properties?.exception_name === "string") {
    exception.name = properties.exception_name;
  }

  if (typeof properties?.exception_stack_trace === "string") {
    exception.stack = properties.exception_stack_trace;
  }

  return exception;
}
