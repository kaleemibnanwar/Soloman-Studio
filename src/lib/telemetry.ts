import clarity from "@microsoft/clarity";

/**
 * Telemetry facade over Microsoft Clarity.
 *
 * Clarity is a behavioral/session-replay tool rather than a product-analytics
 * engine like PostHog, so the rich `capture(name, properties)` surface is
 * mapped onto Clarity's smaller API: custom events carry only a name, and
 * identity is recorded as a `user_id` tag. Properties passed in for
 * compatibility are intentionally ignored.
 */

const CLARITY_PROJECT_ID = "yq5b8j38ea";

let initialized = false;

/**
 * Starts Clarity (injects its loader) exactly once. Call only after the user
 * has opted in to telemetry; capture/identify below no-op until this has run.
 */
export function initTelemetry(): void {
  if (initialized) return;
  initialized = true;
  try {
    clarity.init(CLARITY_PROJECT_ID);
  } catch (error) {
    console.warn("Failed to initialize Clarity telemetry:", error);
  }
}

function safe(fn: () => void): void {
  if (!initialized) return;
  try {
    fn();
  } catch {
    // Telemetry must never break the app.
  }
}

export function identifyTelemetryUser(userId: string | null | undefined): void {
  if (!userId) return;
  safe(() => clarity.identify(userId));
}

export function captureTelemetryEvent(
  eventName: string,
  _properties?: Record<string, unknown>,
): void {
  safe(() => clarity.event(eventName));
}

export function captureTelemetryException(error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error ?? "Unknown error"));
  safe(() => {
    clarity.event("$exception");
    clarity.setTag("exception_name", err.name);
    clarity.setTag("exception_message", err.message);
  });
}

export type TelemetryClient = {
  capture: typeof captureTelemetryEvent;
  captureException: typeof captureTelemetryException;
};

export const telemetryClient: TelemetryClient = {
  capture: captureTelemetryEvent,
  captureException: captureTelemetryException,
};

/** Clarity is a global singleton, so no React provider is required. */
export function useTelemetry(): TelemetryClient {
  return telemetryClient;
}
