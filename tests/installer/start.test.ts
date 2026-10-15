// Stage 2.3 of the installer: K8 (start) and K9 (health check), on the fake `docker`.
// Scenario ids come from .ai/specs/2026-10-14-instalator.md.
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createInstallation,
  dockerCalls,
  runInstaller,
  setDockerState,
  type Installation,
  type RunResult,
} from './harness';

const SECRETS = ['pg-secret-9f3a', 'gcs-secret-77b1', 'vapid-private-4c2d'];
const CALLBACK = 'https://przepisy.example.test/api/auth/google/callback';

let installation: Installation;

beforeEach(() => {
  installation = createInstallation();
});

afterEach(() => {
  installation.remove();
});

function validEnv(extra: string[] = [], mode = 'caddy') {
  return [
    `POSTGRES_PASSWORD=${SECRETS[0]}`,
    `HTTPS_MODE=${mode}`,
    'APP_DOMAIN=przepisy.example.test',
    'APP_BASE_URL=https://przepisy.example.test',
    'ALLOWED_EMAIL=owner@example.test',
    'GOOGLE_CLIENT_ID=client-id',
    `GOOGLE_CLIENT_SECRET=${SECRETS[1]}`,
    'PUSH_MODE=web-push',
    'VAPID_PUBLIC_KEY=vapid-public-key',
    `VAPID_PRIVATE_KEY=${SECRETS[2]}`,
    'BACKUP_AGE_RECIPIENT=age1abcdef',
    ...extra,
    '',
  ].join('\n');
}

function writeEnv(content: string) {
  writeFileSync(installation.envPath, content, { mode: 0o600 });
  chmodSync(installation.envPath, 0o600);
}

function envText() {
  return readFileSync(installation.envPath, 'utf8');
}

function composeCalls() {
  return dockerCalls(installation)
    .filter((call) => call.startsWith('compose -p'))
    .map((call) => call.split(' | env: ')[0]!);
}

function expectNoSecrets(result: RunResult) {
  for (const secret of SECRETS) expect(result.output).not.toContain(secret);
}

const UP_CADDY = '--profile tls up -d --build --remove-orphans';
const UP_PROXY = 'up -d --build --remove-orphans';
const RM_CADDY = '--profile tls rm -sf caddy';

const NONINTERACTIVE_VALUES = {
  HTTPS_MODE: 'caddy',
  APP_DOMAIN: 'przepisy.example.test',
  ALLOWED_EMAIL: 'owner@example.test',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: SECRETS[1]!,
  BACKUP_AGE_RECIPIENT: 'age1abcdef',
};

describe('S1: start aplikacji', () => {
  it('S1: wariant caddy buduje z profilem tls, sprawdza zdrowie i kończy kodem 0', async () => {
    writeEnv(validEnv());

    const result = await runInstaller(installation);

    expect(result.code).toBe(0);
    expect(result.output).toContain('K8 Start: zrobione');
    expect(result.output).toContain('K9 Sprawdzenie: zrobione');
    const calls = composeCalls();
    expect(calls.some((call) => call.endsWith(UP_CADDY))).toBe(true);
    expect(calls.some((call) => call.includes(RM_CADDY))).toBe(false);
    expect(calls.some((call) => call.includes('exec -T app node -e'))).toBe(true);
    expectNoSecrets(result);
  });

  it('S1: przypomnienie na końcu wymienia kroki ręczne po kolei, w wariancie caddy także DNS i porty', async () => {
    writeEnv(validEnv());

    const result = await runInstaller(installation);

    const tail = result.output.slice(result.output.indexOf('K9 Sprawdzenie'));
    const order = [
      CALLBACK,
      'zaszyfrowany dysk',
      'Klucz prywatny age',
      'rekord DNS domeny przepisy.example.test',
      'porty 80 i 443',
      'docs/operations.md',
    ].map((text) => tail.indexOf(text));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(result.output.trimEnd().split('\n').at(-1)).toContain('docs/operations.md');
  });

  it('S1: własne proxy zatrzymuje caddy, uruchamia aplikację bez profilu tls i pomija DNS w przypomnieniu', async () => {
    writeEnv(validEnv([], 'proxy'));

    const result = await runInstaller(installation);

    expect(result.code).toBe(0);
    const calls = composeCalls();
    const rm = calls.findIndex((call) => call.endsWith(RM_CADDY));
    const up = calls.findIndex((call) => call.endsWith(UP_PROXY) && !call.includes('--profile'));
    expect(rm).toBeGreaterThanOrEqual(0);
    expect(up).toBeGreaterThan(rm);
    expect(calls.some((call) => call.endsWith(UP_CADDY))).toBe(false);
    expect(result.output).toContain(CALLBACK);
    expect(result.output).not.toContain('rekord DNS');
    expect(result.output).not.toContain('porty 80 i 443');
    expect(result.output).toContain('docs/operations.md');
  });

  it('S2: bez terminala komplet zmiennych kończy się kodem 0', async () => {
    const result = await runInstaller(installation, { env: NONINTERACTIVE_VALUES });

    expect(result.code).toBe(0);
    expect(result.output).toContain('K9 Sprawdzenie: zrobione');
    expectNoSecrets(result);
  });

  it('S7: po poprawieniu .env zatrzymanego w K7 instalator kończy się kodem 0', async () => {
    writeEnv(validEnv().replace('ALLOWED_EMAIL=owner@example.test', 'ALLOWED_EMAIL=nie-adres'));
    const first = await runInstaller(installation);
    expect(first.code).toBe(1);
    expect(composeCalls().some((call) => call.includes(' up '))).toBe(false);

    writeEnv(validEnv());
    const second = await runInstaller(installation);

    expect(second.code).toBe(0);
  });
});

describe('S8: aplikacja nie odpowiada', () => {
  it('S8: po limicie kończy błędem z komunikatem i poleceniem do logów, bez logów i sekretów', async () => {
    writeEnv(validEnv());
    setDockerState(installation, { HEALTH: 'fail' });

    const result = await runInstaller(installation, {
      env: { MP_INSTALL_HEALTH_TIMEOUT: '3' },
    });

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('K9 Sprawdzenie: błąd');
    expect(result.output).toContain('Aplikacja nie odpowiada po 3 s.');
    expect(result.output).toContain(
      `docker compose --project-directory ${installation.dir} -p mounjaro-przepisy logs --tail 100 app`,
    );
    expect(result.output).not.toContain('Aplikacja działa');
    expect(composeCalls().some((call) => /\blogs\b/.test(call))).toBe(false);
    expectNoSecrets(result);
  }, 20_000);

  it('S8: bez MP_INSTALL_HEALTH_TIMEOUT limit i komunikat to 180 s (3 minuty)', async () => {
    writeEnv(validEnv());
    setDockerState(installation, { HEALTH: 'fail', CLOCK: 'virtual' });

    const result = await runInstaller(installation);

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('Aplikacja nie odpowiada po 3 minutach.');
    const waited = Number(readFileSync(path.join(installation.dockerDir, 'clock'), 'utf8'));
    expect(waited).toBeGreaterThanOrEqual(150); // real time of K1-K8 comes on top of it
    expect(waited).toBeLessThanOrEqual(182);
  });

  it('S8: odpowiedź ok przed limitem kończy czekanie i przechodzi do przypomnienia', async () => {
    writeEnv(validEnv());
    setDockerState(installation, { HEALTH_AFTER: '2' });

    const started = Date.now();
    const result = await runInstaller(installation, {
      env: { MP_INSTALL_HEALTH_TIMEOUT: '60' },
    });

    expect(result.code).toBe(0);
    expect(Date.now() - started).toBeLessThan(25_000);
    expect(composeCalls().filter((call) => call.includes(' exec ')).length).toBe(3);
    expect(result.output).toContain('K9 Sprawdzenie: zrobione');
    expect(result.output).toContain(CALLBACK);
  }, 20_000);
});

describe('S9: zmiana wariantu HTTPS', () => {
  async function installThenSwitch(from: string, to: string) {
    writeEnv(validEnv([], from));
    expect((await runInstaller(installation)).code).toBe(0);
    const edited = envText().replace(`HTTPS_MODE=${from}`, `HTTPS_MODE=${to}`);
    writeEnv(edited);
    const callsBefore = composeCalls().length;
    const result = await runInstaller(installation);
    return { result, edited, calls: composeCalls().slice(callsBefore) };
  }

  it('S9: z caddy na proxy zatrzymuje caddy i uruchamia aplikację bez profilu tls', async () => {
    const { result, calls, edited } = await installThenSwitch('caddy', 'proxy');

    expect(result.code).toBe(0);
    expect(result.output).toContain('K3 Wariant HTTPS: pominięty, już zrobione');
    expect(envText()).toBe(edited);
    const rm = calls.findIndex((call) => call.endsWith(RM_CADDY));
    expect(rm).toBeGreaterThanOrEqual(0);
    expect(calls.findIndex((call) => call.endsWith(UP_PROXY))).toBeGreaterThan(rm);
    expect(calls.some((call) => call.endsWith(UP_CADDY))).toBe(false);
  });

  it('S9: z proxy na caddy uruchamia usługę caddy przez profil tls', async () => {
    const { result, calls, edited } = await installThenSwitch('proxy', 'caddy');

    expect(result.code).toBe(0);
    expect(result.output).toContain('K3 Wariant HTTPS: pominięty, już zrobione');
    expect(envText()).toBe(edited);
    expect(calls.some((call) => call.endsWith(UP_CADDY))).toBe(true);
    expect(calls.some((call) => call.includes(RM_CADDY))).toBe(false);
  });
});

describe('S4: przerwanie w K8', () => {
  it('S4: błąd budowania zatrzymuje w K8, a po usunięciu przyczyny K2–K6 są pominięte i aplikacja startuje', async () => {
    setDockerState(installation, { UP: 'build-error' });

    const first = await runInstaller(installation, { env: NONINTERACTIVE_VALUES });

    expect(first.code).not.toBe(0);
    expect(first.output).toContain('K8 Start: błąd');
    expect(first.output).toContain('Uruchomienie nie powiodło się. Usuń przyczynę');
    expect(first.output).not.toContain('K9');
    const saved = envText();

    setDockerState(installation, {});
    const second = await runInstaller(installation, { env: NONINTERACTIVE_VALUES });

    expect(second.code).toBe(0);
    for (const n of [2, 3, 4, 5, 6]) {
      expect(second.output).toMatch(new RegExp(`K${n} [^\\n]*: pominięty, już zrobione`));
    }
    expect(envText()).toBe(saved);
    expect(second.output).toContain('K9 Sprawdzenie: zrobione');
  });
});

describe('przypadki brzegowe K8', () => {
  it('zajęty APP_PORT kończy błędem z nazwą APP_PORT i nie sprawdza zdrowia', async () => {
    writeEnv(validEnv(['APP_PORT=3999']));
    setDockerState(installation, { UP: 'port-busy' });

    const result = await runInstaller(installation);

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('K8 Start: błąd');
    expect(result.output).toContain('APP_PORT (3999) jest zajęty przez inny program');
    expect(result.output).toContain('porty 80/443');
    expect(result.output).not.toContain('K9');
    expect(composeCalls().some((call) => call.includes(' exec '))).toBe(false);
  });

  it('w wariancie proxy zajęty port nie wspomina o 80/443', async () => {
    writeEnv(validEnv([], 'proxy'));
    setDockerState(installation, { UP: 'port-busy' });

    const result = await runInstaller(installation);

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('APP_PORT (3000) jest zajęty');
    expect(result.output).not.toContain('80/443');
  });

  it('zmienne środowiskowe spoza listy nie trafiają do Compose', async () => {
    writeEnv(validEnv());
    const leaked = {
      ALLOWED_EMAIL: 'inny@example.test',
      POSTGRES_PASSWORD: 'powloka-haslo',
      COMPOSE_PROJECT_NAME: 'obcy',
      APP_PORT: '1',
      MOJ_SEKRET: 'sekret-z-powloki',
    };

    const result = await runInstaller(installation, { env: leaked });

    expect(result.code).toBe(0);
    const allowed = new Set([
      'PATH',
      'HOME',
      'USER',
      'LANG',
      'TERM',
      'XDG_RUNTIME_DIR',
      'DOCKER_HOST',
      'DOCKER_CONTEXT',
      'DOCKER_CONFIG',
      'DOCKER_CERT_PATH',
      'DOCKER_TLS_VERIFY',
      'DOCKER_BUILDKIT',
      // set by bash itself in the fake `docker` script
      'PWD',
      'SHLVL',
      '_',
      'OLDPWD',
    ]);
    const lines = dockerCalls(installation).filter((call) => call.startsWith('compose -p'));
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      const names = line.split(' | env: ')[1]!.trim().split(/\s+/).filter(Boolean);
      for (const name of names) expect(allowed.has(name)).toBe(true);
    }
    expect(envText()).toContain('ALLOWED_EMAIL=owner@example.test');
    expect(result.output).not.toContain('powloka-haslo');
    expect(result.output).not.toContain('sekret-z-powloki');
  });
});
