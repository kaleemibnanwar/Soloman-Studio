import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  findMacCrashpadPids,
  findMacElectronPids,
  needsLinuxSandboxDisabled,
  signalDetachedProcesses,
  signalDevelopmentTree,
  startDevelopmentSupervisor,
  unregisterMacElectronApps,
} from "./start-supervisor.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const electronExecutable = path.join(
  repoRoot,
  "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
);
const crashpadExecutable = path.join(
  repoRoot,
  "node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Framework.framework/Helpers/chrome_crashpad_handler",
);
const linuxSandboxHelper = path.join(
  repoRoot,
  "node_modules/electron/dist/chrome-sandbox",
);
const forgeCli = path.join(
  repoRoot,
  "node_modules/@electron-forge/cli/dist/electron-forge.js",
);

const missingFile = () =>
  Object.assign(new Error("ENOENT: no such file or directory"), {
    code: "ENOENT",
  });

const statsWith = (uid, mode) => () => ({ uid, mode });

test("signals the full POSIX development process group", () => {
  const calls = [];

  signalDevelopmentTree({
    pid: 1234,
    signal: "SIGTERM",
    platform: "darwin",
    kill: (...args) => calls.push(args),
  });

  assert.deepEqual(calls, [[-1234, "SIGTERM"]]);
});

test("finds Electron main processes in the development process group", () => {
  const stdout = [
    "  100  50 /repo/node",
    `  200  50 ${electronExecutable} .`,
    `  202  50 ${electronExecutable}`,
    `  201  50 ${repoRoot}/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper`,
    `  300  99 ${electronExecutable} .`,
  ].join("\r\n");

  assert.deepEqual(
    findMacElectronPids({
      processGroupId: 50,
      runSync: () => ({ stdout }),
    }),
    [200, 202],
  );
});

test("finds detached Crashpad processes for this checkout", () => {
  const stdout = `
  200  50 ${crashpadExecutable} --database=octopusStudio
  201  50 ${crashpadExecutable}
  300  99 ${repoRoot}-zero/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Framework.framework/Helpers/chrome_crashpad_handler --database=octopusStudio-zero
`;

  assert.deepEqual(
    findMacCrashpadPids({ runSync: () => ({ stdout }) }),
    [200, 201],
  );
});

test("signals detached development processes individually", () => {
  const calls = [];

  signalDetachedProcesses({
    pids: [200, 201],
    signal: "SIGKILL",
    kill: (...args) => calls.push(args),
  });

  assert.deepEqual(calls, [
    [200, "SIGKILL"],
    [201, "SIGKILL"],
  ]);
});

test("unregisters Electron apps from macOS LaunchServices", () => {
  const calls = [];
  const cleanup = new EventEmitter();
  cleanup.unref = () => calls.push(["unref"]);

  unregisterMacElectronApps({
    pids: [200],
    exitStatus: 130,
    spawnProcess: (...args) => {
      calls.push(args);
      return cleanup;
    },
  });

  assert.deepEqual(calls, [
    [
      "lsappinfo",
      ["quit", "-asn", "#200", "-exitstatus", "130"],
      { detached: true, stdio: "ignore" },
    ],
    ["unref"],
  ]);
});

test("repeated terminal signals cannot interrupt forced cleanup", () => {
  const parentProcess = new EventEmitter();
  parentProcess.execPath = process.execPath;
  parentProcess.env = {};
  parentProcess.exitCode =     {
      name: "helper missing, so Chromium uses its namespace sandbox",
      platform: "linux",
      statSync: () => {
        throw missingFile();
      },
      expected: false,
    },
  ];
;
  const child = new EventEmitter();
  child.pid = 4321;
  const spawnCalls = [];
  const killCalls = [];
  let runForceKill;
  startDevelopmentSupervisor({
    parentProcess,
    platform: "linux",
    forceKillAfterMs: 1,
    statSync: () => {
      throw missingFile();
    },
    kill: (...args) => {
      killCalls.push(args);
      return true;
    },
    spawnProcess: (...args) => {
      spawnCalls.push(args);
      return child;
    },
    scheduleForceKill: (callback) => {
      runForceKill = callback;
      return 1;
    },
    cancelForceKill: () => {},
  });

  parentProcess.emit("SIGINT");
  child.emit("exit", null, "SIGTERM");
  assert.equal(parentProcess.listenerCount("SIGINT"), 1);
  parentProcess.emit("SIGINT");
  parentProcess.emit("SIGHUP");
  runForceKill();

  assert.equal(spawnCalls[0][2].detached, true);
  assert.deepEqual(killCalls, [
    [-4321, "SIGTERM"],
    [-4321, "SIGKILL"],
  ]);
  assert.equal(parentProcess.exitCode, 130);
  assert.equal(parentProcess.listenerCount("SIGINT"), 0);
});

test("needs the Linux sandbox disabled only for a misconfigured SUID helper", () => {
  const cases = [
    {
      name: "helper owned by an unprivileged user",
      platform: "linux",
      statSync: statsWith(1000, 0o755),
      expected: true,
    },
    {
      name: "root-owned helper without the setuid bit",
      platform: "linux",
      statSync: statsWith(0, 0o755),
      expected: true,
    },
    {
      name: "root-owned helper with the setuid bit",
      platform: "linux",
      statSync: statsWith(0, 0o4755),
      expected: false,
    },
    {
      name: "helper missing, so Chromium uses its namespace sandbox",
      platform: "linux",
      statSync: () => {
        throw missingFile();
      },
      expected: false,
    },
    {
      // Would be true on Linux, so this only passes if the platform is checked
      // before the helper is inspected.
      name: "non-Linux platform",
      platform: "darwin",
      statSync: statsWith(1000, 0o755),
      expected: false,
    },
  ];

  for (const { name, platform, statSync, expected } of cases) {
    assert.equal(
      needsLinuxSandboxDisabled({
        platform,
        helperPath: linuxSandboxHelper,
        statSync,
      }),
      expected,
      name,
    );
  }
});

test("forwards the unsandboxed launch to Electron through Forge", () => {
  const { args, warnings } = launchSupervisor({
    statSync: statsWith(1000, 0o755),
  });

  assert.deepEqual(args, [
    forgeCli,
    "start",
    "--inspect",
    "--",
    "--no-sandbox",
  ]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /--no-sandbox|unsandboxed/);
  assert.match(warnings[0], new RegExp(linuxSandboxHelper));
  assert.match(warnings[0], /sudo chmod 4755/);
});

test("leaves the sandbox enabled when the SUID helper is configured", () => {
  const { args, warnings } = launchSupervisor({
    statSync: statsWith(0, 0o4755),
  });

  assert.deepEqual(args, [forgeCli, "start", "--inspect"]);
  assert.deepEqual(warnings, []);
});

function launchSupervisor({ statSync }) {
  const child = new EventEmitter();
  child.pid = 4321;
  const spawnCalls = [];
  const warnings = [];

  startDevelopmentSupervisor({
    args: ["--inspect"],
    parentProcess: new EventEmitter(),
    platform: "linux",
    statSync,
    warn: (...args) => warnings.push(args.join("\n")),
    spawnProcess: (...args) => {
      spawnCalls.push(args);
      return child;
    },
  });

  return { args: spawnCalls[0][1], warnings };
}
