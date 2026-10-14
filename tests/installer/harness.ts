// Test harness for scripts/install.sh (docs/adr/0003-instalator-na-serwer.md, decisions 8–10).
// Each test gets a throwaway copy of the files the installer needs and its own fake `docker`.
import { spawn } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const copiedPaths = ['scripts', 'compose.yml', '.env.example', 'Dockerfile'];

export type Installation = {
  /** Repository copy; the installer works on it because it resolves paths from its own location. */
  dir: string;
  /** Directory with the fake `docker`, first on PATH. */
  dockerDir: string;
  /** HOME of the installer process. */
  home: string;
  envPath: string;
  remove: () => void;
};

export function createInstallation(): Installation {
  const root = mkdtempSync(path.join(tmpdir(), 'installer-'));
  const dir = path.join(root, 'repo');
  const dockerDir = path.join(root, 'bin');
  const home = path.join(root, 'home');
  for (const entry of copiedPaths) {
    cpSync(path.join(repoRoot, entry), path.join(dir, entry), { recursive: true });
  }
  cpSync(path.join(repoRoot, 'tests/installer/fake-docker'), dockerDir, { recursive: true });
  chmodSync(path.join(dockerDir, 'docker'), 0o755);
  mkdirSync(home);
  return {
    dir,
    dockerDir,
    home,
    envPath: path.join(dir, '.env'),
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Sets the behaviour of the fake `docker` (see the header of tests/installer/fake-docker/docker). */
export function setDockerState(installation: Installation, state: Record<string, string>) {
  const lines = Object.entries(state).map(([key, value]) => `${key}=${value}\n`);
  writeFileSync(path.join(installation.dockerDir, 'state'), lines.join(''));
}

/** Calls received by the fake `docker`, one per line: arguments, then ` | env: ` and variable names. */
export function dockerCalls(installation: Installation): string[] {
  try {
    return readFileSync(path.join(installation.dockerDir, 'calls.log'), 'utf8')
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

export type Step = {
  /** Text the output must contain (after the previous step's match) before `send` is typed. */
  waitFor: string | RegExp;
  /** Typed into the terminal; `\n` is Enter, `\x03` is Ctrl+C, `\x04` is Ctrl+D. */
  send: string;
};

export type RunOptions = {
  /** Variables added to a minimal environment (PATH with the fake docker, HOME). */
  env?: Record<string, string>;
  /** true runs the script under a pseudo-terminal (`script`), so `[ -t 0 ]` holds. */
  tty?: boolean;
  /** Answers typed in tty mode, in order. */
  steps?: Step[];
  /** Arguments for the script. */
  args?: string[];
  timeoutMs?: number;
};

export type RunResult = { code: number | null; signal: NodeJS.Signals | null; output: string };

/** Runs a bash script from the installation copy, e.g. `runScript(i, 'scripts/install.sh')`. */
export function runScript(
  installation: Installation,
  relativePath: string,
  options: RunOptions = {},
): Promise<RunResult> {
  const scriptPath = path.join(installation.dir, relativePath);
  const env = {
    PATH: `${installation.dockerDir}:${process.env.PATH ?? '/usr/bin:/bin'}`,
    HOME: installation.home,
    LANG: 'C.UTF-8',
    ...options.env,
  };
  const args = [scriptPath, ...(options.args ?? [])];
  const child = options.tty
    ? spawn('script', ['-qefc', ['bash', ...args].map(shellQuote).join(' '), '/dev/null'], {
        env: { ...env, TERM: 'dumb' },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    : spawn('bash', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });

  const steps = [...(options.steps ?? [])];
  let output = '';
  let searchFrom = 0;
  const onData = (chunk: Buffer) => {
    output += chunk.toString('utf8');
    for (let step = steps[0]; step; step = steps[0]) {
      const rest = output.slice(searchFrom);
      const match =
        typeof step.waitFor === 'string'
          ? { index: rest.indexOf(step.waitFor), length: step.waitFor.length }
          : (() => {
              const found = step.waitFor.exec(rest);
              return { index: found ? found.index : -1, length: found ? found[0].length : 0 };
            })();
      if (match.index < 0) break;
      searchFrom += match.index + match.length;
      steps.shift();
      child.stdin?.write(step.send);
    }
  };
  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Script did not finish in time. Output so far:\n${output}`));
    }, options.timeoutMs ?? 20_000);
    child.on('error', reject);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, output });
    });
  });
}

export function runInstaller(installation: Installation, options: RunOptions = {}) {
  return runScript(installation, 'scripts/install.sh', options);
}

/** Reads `.env` of the installation as raw text, or null when it does not exist. */
export function readEnvFile(installation: Installation): string | null {
  try {
    return readFileSync(installation.envPath, 'utf8');
  } catch {
    return null;
  }
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
