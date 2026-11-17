export function shouldRetainClosedWindowForActivation({
  isAppQuitting,
  openWindowCountBeforeClose,
}: {
  isAppQuitting: boolean;
  openWindowCountBeforeClose: number;
}): boolean {
  return !isAppQuitting && openWindowCountBeforeClose === 1;
}

export function shouldQuitAfterAllWindowsClosed(
  platform: NodeJS.Platform,
  isAppQuitting = false,
  keepBackgroundHostRunning = false,
): boolean {
  if (isAppQuitting) return true;
  return platform !== "darwin" && !keepBackgroundHostRunning;
}

export function shouldCreateWindowOnActivate({
  isAppQuitting,
  hasCreatedInitialWindow,
  openWindowCount,
}: {
  isAppQuitting: boolean;
  hasCreatedInitialWindow: boolean;
  openWindowCount: number;
}): boolean {
  return !isAppQuitting && hasCreatedInitialWindow && openWindowCount === 0;
}

export function shouldRequestRelaunchOnActivate({
  isAppQuitting,
  hasCreatedInitialWindow,
  openWindowCount,
}: {
  isAppQuitting: boolean;
  hasCreatedInitialWindow: boolean;
  openWindowCount: number;
}): boolean {
  return isAppQuitting && hasCreatedInitialWindow && openWindowCount === 0;
}
