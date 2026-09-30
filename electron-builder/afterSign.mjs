// electron-builder `afterSign` hook: notarizes the signed macOS app, matching
// Forge's `osxNotarize` config (`@electron/notarize` is what Forge itself
// used under the hood).
import { notarize } from "@electron/notarize";

const isEndToEndTestBuild = process.env.E2E_TEST_BUILD === "true";

export default async function afterSign(context) {
  if (context.electronPlatformName !== "darwin" || isEndToEndTestBuild) {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  await notarize({
    appPath: `${context.appOutDir}/${appName}.app`,
    appleApiKey: process.env.APPLE_API_KEY_PATH,
    appleApiKeyId: process.env.APPLE_API_KEY_ID,
    appleApiIssuer: process.env.APPLE_API_ISSUER,
  });
}
