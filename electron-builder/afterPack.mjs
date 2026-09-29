// electron-builder `afterPack` hook: replaces what Forge's `afterCopy` /
// `afterCopyExtraResources` hooks (native-module pruning + git/locale
// pruning) and `@electron-forge/plugin-fuses` did at packaging time.
import path from "node:path";
import { flipFuses, FuseV1Options, FuseVersion } from "@electron/fuses";
import { Arch } from "builder-util";
import {
  removeUnusedAppPackageFiles,
  removeUnusedCopiedResources,
} from "../src/lib/packaging_cleanup.ts";

const isEndToEndTestBuild = process.env.E2E_TEST_BUILD === "true";

function getResourcesDir(context) {
  if (context.electronPlatformName === "darwin" || context.electronPlatformName === "mas") {
    return path.join(context.appOutDir, "Octopus Studio.app", "Contents", "Resources");
  }
  return path.join(context.appOutDir, "resources");
}

function getElectronExecutablePath(context) {
  const executableName = context.packager.executableName;
  if (context.electronPlatformName === "darwin" || context.electronPlatformName === "mas") {
    return path.join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      "Contents",
      "MacOS",
      executableName,
    );
  }
  if (context.electronPlatformName === "win32") {
    return path.join(context.appOutDir, `${executableName}.exe`);
  }
  return path.join(context.appOutDir, executableName);
}

export default async function afterPack(context) {
  const resourcesDir = getResourcesDir(context);
  const unpackedAppPath = path.join(resourcesDir, "app.asar.unpacked");
  const arch = Arch[context.arch];

  await removeUnusedAppPackageFiles(unpackedAppPath, context.electronPlatformName, arch);
  await removeUnusedCopiedResources(context.appOutDir, context.electronPlatformName);

  if (!isEndToEndTestBuild) {
    await flipFuses(getElectronExecutablePath(context), {
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    });
  }
}
