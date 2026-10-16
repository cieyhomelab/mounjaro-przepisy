// Stage 2.1 of the installer: K1 (requirements), K2 (.env file) and K7 (.env check).
// A complete .env makes K3-K6 skip, so these tests reach K7 as before.
// Scenario ids come from .ai/specs/2026-10-14-instalator.md.
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createInstallation,
  dockerCalls,
  readEnvFile,
  runInstaller,
  setDockerState,
  type Installation,
} from './harness';

const SECRETS = ['pg-secret-9f3a', 'gcs-secret-77b1', 'vapid-private-4c2d'];

let installation: Installation;

beforeEach(() => {
  installation = createInstallation();
});

afterEach(() => {
  installation.remove();
});

function writeEnv(content: string, mode = 0o600) {
  writeFileSync(installation.envPath, content, { mode });
  chmodSync(installation.envPath, mode);
}

function validEnv(extra = '') {
  return [
    `POSTGRES_PASSWORD=${SECRETS[0]}`,
    'HTTPS_MODE=caddy',
    'APP_DOMAIN=przepisy.example.test',
    'APP_BASE_URL=https://przepisy.example.test',
    'ALLOWED_EMAIL=owner@example.test',
    'GOOGLE_CLIENT_ID=client-id',
    `GOOGLE_CLIENT_SECRET=${SECRETS[1]}`,
    'PUSH_MODE=web-push',
    'VAPID_PUBLIC_KEY=vapid-public-key',
    `VAPID_PRIVATE_KEY=${SECRETS[2]}`,
    'BACKUP_AGE_RECIPIENT=age1abcdef',
    extra,
  ].join('\n');
}

function expectNoSecrets(output: string) {
  for (const secret of SECRETS) expect(output).not.toContain(secret);
}

function mode(file: string) {
  return statSync(file).mode & 0o777;
}

// A PATH with the basic tools but without any `docker`.
function pathWithoutDocker() {
  const bin = path.join(installation.home, 'nodocker-bin');
  mkdirSync(bin);
  for (const tool of ['bash', 'dirname', 'id', 'stat', 'chmod', 'mktemp', 'mv', 'cat', 'rm']) {
    for (const dir of ['/usr/bin', '/bin']) {
      try {
        symlinkSync(path.join(dir, tool), path.join(bin, tool));
        break;
      } catch {
        // the tool is not in this directory, or already linked
      }
    }
  }
  return bin;
}

describe('S5: brak wymagań', () => {
  it('S5: brak polecenia docker kończy instalator komunikatem i nie tworzy .env', async () => {
    const result = await runInstaller(installation, { env: { PATH: pathWithoutDocker() } });

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('K1 Wymagania: błąd');
    expect(result.output).toContain('Brakuje Dockera');
    expect(readEnvFile(installation)).toBeNull();
  });

  it.each(['2.20.0', 'v2.23.9-desktop.1', 'none'])(
    'S5: Compose %s jest za stary albo go brak, instalator nie tworzy .env',
    async (version) => {
      setDockerState(installation, { COMPOSE_VERSION: version });

      const result = await runInstaller(installation);

      expect(result.code).not.toBe(0);
      expect(result.output).toContain('K1 Wymagania: błąd');
      expect(result.output).toContain(
        'Wymagany Docker Compose w wersji co najmniej 2.24, wykryto:',
      );
      expect(readEnvFile(installation)).toBeNull();
    },
  );

  it('S5: Compose 2.20.0 jest raportowany jako wykryta wersja', async () => {
    setDockerState(installation, { COMPOSE_VERSION: '2.20.0' });

    const result = await runInstaller(installation);

    expect(result.output).toContain('wykryto: 2.20.0.');
  });

  it('S5: brak Compose raportuje „brak”', async () => {
    setDockerState(installation, { COMPOSE_VERSION: 'none' });

    const result = await runInstaller(installation);

    expect(result.output).toContain('wykryto: brak.');
  });

  it('S5: Docker bez dostępu kończy instalator komunikatem o braku dostępu i nie tworzy .env', async () => {
    setDockerState(installation, { ACCESS: 'denied' });

    const result = await runInstaller(installation, { env: { USER: 'tester' } });

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('K1 Wymagania: błąd');
    expect(result.output).toContain('Brak dostępu do Dockera dla użytkownika tester');
    expect(readEnvFile(installation)).toBeNull();
  });

  it('S5: istniejący .env zostaje bez zmian, gdy wymagania nie są spełnione', async () => {
    writeEnv('POSTGRES_PASSWORD=\n', 0o644);
    setDockerState(installation, { COMPOSE_VERSION: '2.1.0' });

    const result = await runInstaller(installation);

    expect(result.code).not.toBe(0);
    expect(readEnvFile(installation)).toBe('POSTGRES_PASSWORD=\n');
    expect(mode(installation.envPath)).toBe(0o644);
  });

  it('S5: Compose 2.24.0 i nowszy przechodzą K1', async () => {
    setDockerState(installation, { COMPOSE_VERSION: '2.24.0' });
    writeEnv(validEnv());

    const result = await runInstaller(installation);

    expect(result.output).toContain('K1 Wymagania: zrobione');
  });
});

describe('K2: plik .env', () => {
  it('K2: tworzy .env z .env.example z uprawnieniami 600', async () => {
    const result = await runInstaller(installation);

    expect(result.output).toContain('K2 Plik .env: zrobione');
    expect(readEnvFile(installation)).toBe(
      readFileSync(path.join(installation.dir, '.env.example'), 'utf8'),
    );
    expect(mode(installation.envPath)).toBe(0o600);
    expectNoSecrets(result.output);
  });

  it('K2: zawęża szersze uprawnienia do 600 bez zmiany treści i zgłasza pominięcie', async () => {
    const content = validEnv('# komentarz\n');
    writeEnv(content, 0o644);

    const result = await runInstaller(installation);

    expect(result.output).toContain('K2 Plik .env: pominięty, już zrobione');
    expect(mode(installation.envPath)).toBe(0o600);
    expect(readEnvFile(installation)).toBe(content);
    expectNoSecrets(result.output);
  });

  it('K2: nie zostawia plików tymczasowych w katalogu repozytorium', async () => {
    await runInstaller(installation);

    expect(
      readdirSync(installation.dir).filter((name) => /^\.env\.[A-Za-z0-9]{6}$/.test(name)),
    ).toEqual([]);
  });
});

describe('S7: błędna wartość już zapisana w .env', () => {
  it('S7: PUSH_MODE=webpush zatrzymuje w K7, podaje nazwę i dozwoloną wartość, .env bez zmian', async () => {
    const content = validEnv().replace('PUSH_MODE=web-push', 'PUSH_MODE=webpush');
    writeEnv(content);

    const result = await runInstaller(installation);

    expect(result.code).toBe(1);
    expect(result.output).toContain('K7 Kontrola .env: błąd');
    expect(result.output).toContain('PUSH_MODE');
    expect(result.output).toContain('web-push');
    expect(readEnvFile(installation)).toBe(content);
    expect(dockerCalls(installation).some((call) => call.startsWith('compose -p'))).toBe(false);
    expectNoSecrets(result.output);
  });

  it('S7: zdublowany VAPID_PUBLIC_KEY zatrzymuje w K7 i jest wymieniony, .env bez zmian', async () => {
    const content = validEnv('VAPID_PUBLIC_KEY=aaa\nVAPID_PUBLIC_KEY=bbb\n');
    writeEnv(content);

    const result = await runInstaller(installation);

    expect(result.code).toBe(1);
    expect(result.output).toContain('K7 Kontrola .env: błąd');
    expect(result.output).toContain('VAPID_PUBLIC_KEY');
    expect(readEnvFile(installation)).toBe(content);
    expectNoSecrets(result.output);
  });

  it('S7: BACKUP_AGE_RECIPIENT bez prefiksu age1 podaje nazwę zmiennej, ale nie jej wartość', async () => {
    const content = validEnv().replace('age1abcdef', 'ssh-ed25519-tajna-wartosc-k7');
    writeEnv(content);

    const result = await runInstaller(installation);

    expect(result.code).toBe(1);
    expect(result.output).toContain('K7 Kontrola .env: błąd');
    expect(result.output).toContain('BACKUP_AGE_RECIPIENT');
    expect(result.output).not.toContain('tajna-wartosc-k7');
    expect(readEnvFile(installation)).toBe(content);
  });

  it('S7: po poprawieniu .env instalator przechodzi K7 i startuje aplikację', async () => {
    writeEnv(validEnv().replace('PUSH_MODE=web-push', 'PUSH_MODE=webpush'));
    const first = await runInstaller(installation);
    expect(first.output).toContain('K7 Kontrola .env: błąd');

    writeEnv(validEnv());
    const second = await runInstaller(installation);

    expect(second.output).toContain('K7 Kontrola .env: zrobione');
    expect(second.output).toContain('K9 Sprawdzenie: zrobione');
    expect(second.code).toBe(0);
    expectNoSecrets(second.output + first.output);
  });

  it.each([
    ['HTTPS_MODE=nginx', 'HTTPS_MODE'],
    ['AUTH_MODE=mock', 'AUTH_MODE'],
    ['APP_DOMAIN=https://przepisy.example.test', 'APP_DOMAIN'],
    ['APP_BASE_URL=http://przepisy.example.test', 'APP_BASE_URL'],
    ['APP_BASE_URL=https://inny.example.test', 'APP_BASE_URL'],
    ['ALLOWED_EMAIL=owner.example.test', 'ALLOWED_EMAIL'],
  ])('S7: wartość „%s” zatrzymuje w K7 z nazwą %s', async (line, name) => {
    const key = line.split('=')[0];
    const base = validEnv()
      .split('\n')
      .filter((l) => !l.startsWith(`${key}=`))
      .join('\n');
    writeEnv(`${base}\n${line}\n`);

    const result = await runInstaller(installation);

    expect(result.code).toBe(1);
    expect(result.output).toContain('K7 Kontrola .env: błąd');
    expect(result.output).toContain(`  - ${name}:`);
  });

  it('S7: APP_BASE_URL z portem jest dozwolony tylko w wariancie proxy', async () => {
    const proxy = validEnv()
      .replace('HTTPS_MODE=caddy', 'HTTPS_MODE=proxy')
      .replace(
        'APP_BASE_URL=https://przepisy.example.test',
        'APP_BASE_URL=https://przepisy.example.test:8443',
      );
    writeEnv(proxy);
    const ok = await runInstaller(installation);
    expect(ok.output).toContain('K7 Kontrola .env: zrobione');

    writeEnv(proxy.replace('HTTPS_MODE=proxy', 'HTTPS_MODE=caddy'));
    const bad = await runInstaller(installation);
    expect(bad.output).toContain('K7 Kontrola .env: błąd');
    expect(bad.output).toContain('APP_BASE_URL');
  });
});

describe('S4: poprawność pliku .env', () => {
  it('S4: zdublowany klucz jest zgłaszany, a plik bez urwanych linii zostaje bez zmian', async () => {
    const content = validEnv('LOG_LEVEL=info\nLOG_LEVEL=debug\n');
    writeEnv(content);

    const result = await runInstaller(installation);

    expect(result.output).toContain('  - LOG_LEVEL:');
    expect(readEnvFile(installation)).toBe(content);
  });

  it('S4: wartości w cudzysłowach ręcznego .env są odczytane bez cudzysłowów', async () => {
    writeEnv(
      validEnv()
        .replace('PUSH_MODE=web-push', 'PUSH_MODE="web-push"')
        .replace('age1abcdef', "'age1abcdef'")
        .replace('HTTPS_MODE=caddy', 'export HTTPS_MODE="caddy"'),
    );

    const result = await runInstaller(installation);

    expect(result.output).toContain('K7 Kontrola .env: zrobione');
    expect(result.output).toContain('K9 Sprawdzenie: zrobione');
  });
});

describe('uruchomienie', () => {
  it('uruchomione spoza katalogu repozytorium działa na katalogu skryptu', async () => {
    const { spawnSync } = await import('node:child_process');
    const script = path.join(installation.dir, 'scripts/install.sh');
    const run = spawnSync('bash', [script], {
      cwd: installation.home,
      env: {
        PATH: `${installation.dockerDir}:${process.env.PATH ?? '/usr/bin:/bin'}`,
        HOME: installation.home,
      },
      encoding: 'utf8',
    });

    expect(run.stdout).toContain('K2 Plik .env: zrobione');
    expect(readEnvFile(installation)).not.toBeNull();
    expect(() => statSync(path.join(installation.home, '.env'))).toThrow();
  });

  it('argument powoduje błąd z opisem użycia', async () => {
    const result = await runInstaller(installation, { args: ['--x'] });

    expect(result.code).toBe(1);
    expect(result.output).toContain('Użycie: scripts/install.sh');
    expect(readEnvFile(installation)).toBeNull();
  });
});
