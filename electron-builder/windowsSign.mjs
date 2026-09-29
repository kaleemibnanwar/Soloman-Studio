// Custom electron-builder Windows sign hook (win.signtoolOptions.sign),
// replacing Forge's `windowsSign.ts` (which used @electron/windows-sign's
// `signWithParams` to append raw signtool flags for Azure Trusted Signing).
// electron-builder v26 has a native `azureSignOptions`, but that needs the
// account/endpoint/certificate-profile values that only exist inside the
// AZURE_METADATA_JSON file referenced below — re-plumbing the exact same
// signtool.exe invocation here avoids guessing at those values.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export default async function signWindowsAzure(configuration) {
  // electron-builder may invoke this once per configured hash algorithm;
  // Forge's config only ever signed with sha256.
  if (configuration.hash !== "sha256") return;

  const dlib = process.env.AZURE_CODE_SIGNING_DLIB;
  const metadataJson = process.env.AZURE_METADATA_JSON;
  if (!dlib || !metadataJson) {
    throw new Error(
      "WINDOWS_SIGN is enabled but AZURE_CODE_SIGNING_DLIB/AZURE_METADATA_JSON is not set. " +
        "Ensure Azure Trusted Signing tools are installed.",
    );
  }

  const signtoolPath = process.env.SIGNTOOL_PATH || "signtool.exe";
  await execFileAsync(signtoolPath, [
    "sign",
    "/v",
    "/debug",
    "/dlib",
    dlib,
    "/dmdf",
    metadataJson,
    "/tr",
    "http://timestamp.acs.microsoft.com",
    "/td",
    "sha256",
    "/fd",
    "sha256",
    configuration.path,
  ]);
}
