import { IS_TEST_BUILD } from "./test_utils";

export interface ExternalUrlRuntimeState {
  isTestBuild: boolean;
  e2ePortBlockIndex: string | undefined;
}

/**
 * External browser windows are suppressed only while the packaged app is
 * actually running under the Playwright E2E harness. A package compiled with
 * E2E_TEST_BUILD may also be launched manually for testing, where links must
 * continue to behave like they do in a production package.
 */
export function shouldSuppressExternalUrlOpen(
  runtime: ExternalUrlRuntimeState = {
    isTestBuild: IS_TEST_BUILD,
    e2ePortBlockIndex: process.env.OCTOPUS_STUDIO_E2E_PORT_BLOCK_INDEX,
  },
): boolean {
  return runtime.isTestBuild && runtime.e2ePortBlockIndex !== undefined;
}
