import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import net from "node:net";

const require = createRequire(import.meta.url);
const isWindows = process.platform === "win32";
const electron = require("electron");
const vitePackagePath = require.resolve("vite/package.json");
const viteBin = path.join(path.dirname(vitePackagePath), "bin", "vite.js");

function electronEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else if (typeof code === "number" && code !== 0) process.exit(code);
  });
  return child;
}

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function startElectron(options = {}) {
  if (isWindows) {
    return start("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `& ${quotePowerShell(electron)} .`,
    ], options);
  }
  return start(electron, ["."], options);
}

async function waitForRenderer(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await response.arrayBuffer();
        return;
      }
      await response.arrayBuffer();
    } catch {
      // retry until Vite is ready
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Renderer did not become ready: ${url}`);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findRendererPort(preferredPort) {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available renderer port found from ${preferredPort}`);
}

const rendererPort = await findRendererPort(5173);
const rendererUrl = `http://127.0.0.1:${rendererPort}`;
const vite = start(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(rendererPort), "--strictPort"]);

const shutdown = () => {
  vite.kill();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", shutdown);

await waitForRenderer(rendererUrl);

const app = startElectron({
  env: electronEnv({
    NOMI_DESKTOP_DEV: "1",
    VITE_DEV_SERVER_URL: rendererUrl,
  }),
});

app.on("exit", () => {
  vite.kill();
});
