// Checks the installer test harness itself; the installer's own tests live next to this file.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createInstallation,
  dockerCalls,
  readEnvFile,
  runScript,
  setDockerState,
  type Installation,
} from './harness';

let installation: Installation;

beforeEach(() => {
  installation = createInstallation();
});

afterEach(() => {
  installation.remove();
});

function writeScript(name: string, body: string) {
  writeFileSync(path.join(installation.dir, name), `#!/usr/bin/env bash\nset -u\n${body}\n`);
  return name;
}

describe('installer test harness', () => {
  it('runs without a terminal unless tty is requested', async () => {
    const script = writeScript(
      'tty.sh',
      'if [ -t 0 ]; then echo "terminal"; else echo "no terminal"; fi',
    );

    const plain = await runScript(installation, script);
    const withTty = await runScript(installation, script, { tty: true });

    expect(plain.code).toBe(0);
    expect(plain.output).toContain('no terminal');
    expect(withTty.code).toBe(0);
    expect(withTty.output).toContain('terminal');
    expect(withTty.output).not.toContain('no terminal');
  });

  it('types answers after the expected prompt and hides silent input', async () => {
    const script = writeScript(
      'ask.sh',
      'read -r -p "Adres: " a; read -r -s -p "Sekret: " s; echo; echo "odp=$a dl=${#s}"',
    );

    const result = await runScript(installation, script, {
      tty: true,
      steps: [
        { waitFor: 'Adres: ', send: 'owner@example.test\n' },
        { waitFor: 'Sekret: ', send: 'tajne-123\n' },
      ],
    });

    expect(result.code).toBe(0);
    expect(result.output).toContain('odp=owner@example.test dl=9');
    expect(result.output).not.toContain('tajne-123');
  });

  it('delivers Ctrl+C as SIGINT and Ctrl+D as end of input', async () => {
    const script = writeScript(
      'interrupt.sh',
      "trap 'exit 130' INT; if ! read -r -p 'Pytanie: ' a; then echo 'EOF'; exit 3; fi",
    );

    const interrupted = await runScript(installation, script, {
      tty: true,
      steps: [{ waitFor: 'Pytanie: ', send: '\x03' }],
    });
    const ended = await runScript(installation, script, {
      tty: true,
      steps: [{ waitFor: 'Pytanie: ', send: '\x04' }],
    });

    expect(interrupted.code).toBe(130);
    expect(ended.code).toBe(3);
    expect(ended.output).toContain('EOF');
  });

  it('puts the fake docker first on PATH and records its calls', async () => {
    setDockerState(installation, { COMPOSE_VERSION: '2.20.0', ACCESS: 'denied' });
    const script = writeScript(
      'docker.sh',
      'docker compose version --short; docker info || echo "no access"',
    );

    const result = await runScript(installation, script, { env: { SECRET_PROBE: 'x' } });

    expect(result.output).toContain('2.20.0');
    expect(result.output).toContain('no access');
    const calls = dockerCalls(installation);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/^compose version --short \| env: .*SECRET_PROBE/);
    expect(readEnvFile(installation)).toBeNull();
  });
});
