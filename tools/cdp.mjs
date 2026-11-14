import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function waitFor(fn, { timeout = 20000, interval = 100 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn().catch(() => null);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`timeout after ${timeout}ms`);
}

async function json(port, path, options) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

export async function launchBrave(
  extensionPath,
  { profile: providedProfile, headless = true, cleanupProfile = true, extraArgs = [] } = {},
) {
  const port = await freePort();
  const profile = providedProfile ?? (await mkdtemp(join(tmpdir(), 'spb-')));
  const args = [
    ...(headless ? ['--headless=new', '--disable-gpu'] : []),
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-component-update',
    `--user-data-dir=${profile}`,
    `--load-extension=${extensionPath}`,
    `--disable-extensions-except=${extensionPath}`,
    `--remote-debugging-port=${port}`,
    '--window-size=1280,900',
    ...extraArgs,
    'about:blank',
  ];
  const child = spawn(process.env.BROWSER_BIN ?? 'brave', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  await waitFor(() => json(port, '/json/version'), { timeout: 30000 });

  function signal(sig) {
    try {
      process.kill(-child.pid, sig);
    } catch {
      try {
        child.kill(sig);
      } catch {
        // already gone
      }
    }
  }

  return {
    port,
    profile,
    child,
    output: () => output,
    async close() {
      signal('SIGTERM');
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
      signal('SIGKILL');
      child.unref();
      if (cleanupProfile) await rm(profile, { recursive: true, force: true }).catch(() => {});
    },
  };
}

export async function listTargets(port) {
  return json(port, '/json/list');
}

export async function newTab(port, url) {
  return json(port, `/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
}

// Chrome ships component extensions too, so look for this extension's worker.
export async function extensionId(port, worker = 'background.js') {
  const target = await waitFor(async () => {
    const list = await listTargets(port);
    return (
      list.find(
        (item) =>
          item.url.startsWith('chrome-extension://') && new URL(item.url).pathname === `/${worker}`,
      ) ?? null
    );
  });
  return new URL(target.url).host;
}

export class Cdp {
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    return new Cdp(ws);
  }

  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.events = new Map();
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result);
        return;
      }
      for (const handler of this.events.get(message.method) ?? []) handler(message.params);
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    if (!this.events.has(method)) this.events.set(method, []);
    this.events.get(method).push(handler);
  }

  async evaluate(expression, { awaitPromise = true, userGesture = true } = {}) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      userGesture,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails),
      );
    }
    return result.result?.value;
  }

  close() {
    this.ws.close();
  }
}

export async function closeTarget(port, id) {
  await fetch(`http://127.0.0.1:${port}/json/close/${id}`).catch(() => {});
}
