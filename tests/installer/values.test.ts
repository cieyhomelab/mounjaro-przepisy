// Stage 2.2 of the installer: K3-K6 (variant, database password, owner's values, push keys).
// Scenario ids come from .ai/specs/2026-10-14-instalator.md. The installer ends with the
// provisional message of stage 2.1 after K7, so these tests look at .env and the output.
import { chmodSync, statSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createInstallation,
  dockerCalls,
  readEnvFile,
  runInstaller,
  setDockerState,
  type Installation,
  type RunResult,
  type Step,
} from './harness';

const FAST = 10_000;
const TYPED_SECRET = 'typed-secret-5e9f';
const ENV_SECRET = 'env-secret-31ab';

const VALUES = {
  HTTPS_MODE: 'caddy',
  APP_DOMAIN: 'przepisy.example.test',
  ALLOWED_EMAIL: 'owner@example.test',
  GOOGLE_CLIENT_ID: 'client-id-1',
  GOOGLE_CLIENT_SECRET: ENV_SECRET,
  BACKUP_AGE_RECIPIENT: 'age1publickey',
};

const Q = {
  variant: 'Wariant HTTPS [caddy/proxy]: ',
  domain: 'Domena aplikacji (np. przepisy.example.pl): ',
  email: 'Adres Google, który może się logować: ',
  clientId: 'Google Client ID: ',
  secret: 'Google Client secret (nie będzie widoczny): ',
  age: 'Klucz publiczny age: ',
};

const ALL_ANSWERS: Step[] = [
  { waitFor: Q.variant, send: 'caddy\n' },
  { waitFor: Q.domain, send: 'przepisy.example.test\n' },
  { waitFor: Q.email, send: 'owner@example.test\n' },
  { waitFor: Q.clientId, send: 'client-id-1\n' },
  { waitFor: Q.secret, send: `${TYPED_SECRET}\n` },
  { waitFor: Q.age, send: 'age1publickey\n' },
];

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

function envText() {
  return readEnvFile(installation) ?? '';
}

/** Last value of a key in .env text; undefined when the key is absent. */
function valueOf(key: string, text = envText()) {
  const lines = text.split('\n').filter((line) => line.startsWith(`${key}=`));
  return lines.length === 0 ? undefined : lines[lines.length - 1]!.slice(key.length + 1);
}

function secretsOf(text = envText()) {
  return ['POSTGRES_PASSWORD', 'GOOGLE_CLIENT_SECRET', 'VAPID_PRIVATE_KEY']
    .map((key) => valueOf(key, text))
    .filter((value): value is string => Boolean(value));
}

function expectNoSecretsIn(result: RunResult, extra: string[] = []) {
  for (const secret of [...secretsOf(), ...extra, TYPED_SECRET, ENV_SECRET]) {
    expect(result.output).not.toContain(secret);
  }
}

function expectNoDuplicatesOrTornLines() {
  const text = envText();
  if (text === '') return;
  expect(text.endsWith('\n')).toBe(true);
  const keys = text
    .split('\n')
    .map((line) => /^([A-Z_]+)=/.exec(line)?.[1])
    .filter((key): key is string => Boolean(key));
  expect(new Set(keys).size).toBe(keys.length);
}

const QUESTIONS: Array<[string, string]> = [
  ['HTTPS_MODE', Q.variant],
  ['APP_DOMAIN', Q.domain],
  ['ALLOWED_EMAIL', Q.email],
  ['GOOGLE_CLIENT_ID', Q.clientId],
  ['GOOGLE_CLIENT_SECRET', Q.secret],
  ['BACKUP_AGE_RECIPIENT', Q.age],
];

function answersUpTo(index: number, final: string): Step[] {
  return [...ALL_ANSWERS.slice(0, index), { waitFor: QUESTIONS[index]![1], send: final }];
}

/** A finished installation produced by one non-interactive run. */
async function install(extraEnv: Record<string, string> = {}) {
  const result = await runInstaller(installation, { env: { ...VALUES, ...extraEnv } });
  expect(result.output).toContain('K6 Klucze push: zrobione');
  return result;
}

describe('S1: pierwsza instalacja z pytaniami', () => {
  it('S1: zapisuje podane wartości, wygenerowane hasło i klucze push, .env ma uprawnienia 600', async () => {
    const result = await runInstaller(installation, {
      tty: true,
      steps: ALL_ANSWERS,
      timeoutMs: FAST,
    });
    const text = envText();

    expect(statSync(installation.envPath).mode & 0o777).toBe(0o600);
    expect(valueOf('HTTPS_MODE')).toBe('caddy');
    expect(valueOf('POSTGRES_PASSWORD')).toMatch(/^[0-9a-f]{64}$/);
    expect(valueOf('VAPID_PUBLIC_KEY')).toHaveLength(87);
    expect(valueOf('VAPID_PRIVATE_KEY')).toHaveLength(43);
    expect(valueOf('APP_DOMAIN')).toBe('przepisy.example.test');
    expect(valueOf('APP_BASE_URL')).toBe('https://przepisy.example.test');
    expect(valueOf('ALLOWED_EMAIL')).toBe('owner@example.test');
    expect(valueOf('GOOGLE_CLIENT_ID')).toBe('client-id-1');
    expect(valueOf('GOOGLE_CLIENT_SECRET')).toBe(TYPED_SECRET);
    expect(valueOf('BACKUP_AGE_RECIPIENT')).toBe('age1publickey');
    for (const step of ['K3 Wariant HTTPS', 'K4 Hasło bazy', 'K5 Wartości od właściciela']) {
      expect(result.output).toContain(`${step}: zrobione`);
    }
    expect(result.output).toContain('K6 Klucze push: zrobione');
    expect(text).toContain('# Mounjaro Przepisy');
  });

  it('S1: pełne wyjście nie zawiera hasła bazy, sekretu Google ani prywatnego klucza VAPID', async () => {
    const result = await runInstaller(installation, {
      tty: true,
      steps: ALL_ANSWERS,
      timeoutMs: FAST,
    });

    expect(secretsOf()).toHaveLength(3);
    expectNoSecretsIn(result);
  });

  it('S1: pytania mają stałe teksty, a wskazówka o kluczu age jest przed pytaniem', async () => {
    const result = await runInstaller(installation, {
      tty: true,
      steps: ALL_ANSWERS,
      timeoutMs: FAST,
    });

    expect(result.output).toContain('caddy – wbudowana usługa caddy wystawia aplikację po HTTPS');
    expect(result.output).toContain('aplikacja nasłuchuje na 127.0.0.1:3000.');
    expect(result.output).toContain('Dane klienta OAuth z Google Cloud Console');
    expect(result.output).toContain('age-keygen -o klucz-kopii.txt');
  });

  it.each(QUESTIONS.map(([key], index) => [key, index] as const))(
    'S1: Ctrl+D przy pytaniu o %s kończy instalator błędem i nie zapisuje tej wartości',
    async (key, index) => {
      const result = await runInstaller(installation, {
        tty: true,
        steps: answersUpTo(index, '\x04'),
        timeoutMs: FAST,
      });

      expect(result.code).not.toBe(0);
      expect(result.output).toContain(`Przerwano wpisywanie, ${key} nie została zapisana.`);
      expect(valueOf(key)).toBe('');
      expectNoDuplicatesOrTornLines();
      expectNoSecretsIn(result);
    },
  );

  it.each(QUESTIONS.map(([key], index) => [key, index] as const))(
    'S1: Ctrl+C przy pytaniu o %s kończy instalator błędem i nie zapisuje tej wartości',
    async (key, index) => {
      const result = await runInstaller(installation, {
        tty: true,
        steps: answersUpTo(index, '\x03'),
        timeoutMs: FAST,
      });

      expect(result.code).not.toBe(0);
      expect(valueOf(key)).toBe('');
      expectNoDuplicatesOrTornLines();
      expectNoSecretsIn(result);
    },
  );
});

describe('S2: instalacja bez interakcji', () => {
  it('S2: wartości ze zmiennych trafiają do .env bez żadnego pytania', async () => {
    const result = await runInstaller(installation, { env: VALUES });

    for (const [key, value] of Object.entries(VALUES)) {
      expect(valueOf(key)).toBe(value);
    }
    expect(valueOf('APP_BASE_URL')).toBe('https://przepisy.example.test');
    expect(valueOf('POSTGRES_PASSWORD')).toMatch(/^[0-9a-f]{64}$/);
    for (const question of Object.values(Q)) expect(result.output).not.toContain(question);
    expect(result.output).toContain('K7 Kontrola .env: zrobione');
    expectNoSecretsIn(result);
  });

  it('S2: niepusta wartość w .env ma pierwszeństwo przed zmienną środowiskową', async () => {
    writeEnv(
      [
        'POSTGRES_PASSWORD=pg-from-env-file',
        'HTTPS_MODE=proxy',
        'APP_DOMAIN=stara.example.test',
        'APP_BASE_URL=https://stara.example.test',
        'ALLOWED_EMAIL=stary@example.test',
        'GOOGLE_CLIENT_ID=stary-id',
        'GOOGLE_CLIENT_SECRET=stary-sekret',
        'BACKUP_AGE_RECIPIENT=age1stary',
        'VAPID_PUBLIC_KEY=pub-stary',
        'VAPID_PRIVATE_KEY=priv-stary',
        '',
      ].join('\n'),
    );
    const before = envText();

    const result = await runInstaller(installation, {
      env: { ...VALUES, POSTGRES_PASSWORD: 'inne-haslo', VAPID_PUBLIC_KEY: 'inny-pub' },
    });

    expect(envText()).toBe(before);
    for (const step of ['K3', 'K4', 'K5', 'K6']) {
      expect(result.output).toMatch(new RegExp(`${step} [^\\n]*: pominięty, już zrobione`));
    }
  });

  it('S2: w terminalu pyta tylko o wartości, których nie ma ani w .env, ani w zmiennych', async () => {
    writeEnv('GOOGLE_CLIENT_ID=client-id-1\n');
    const result = await runInstaller(installation, {
      tty: true,
      env: {
        HTTPS_MODE: 'caddy',
        APP_DOMAIN: 'przepisy.example.test',
        ALLOWED_EMAIL: 'owner@example.test',
      },
      steps: [
        { waitFor: Q.secret, send: `${TYPED_SECRET}\n` },
        { waitFor: Q.age, send: 'age1publickey\n' },
      ],
      timeoutMs: FAST,
    });

    expect(result.output).toContain('K5 Wartości od właściciela: zrobione');
    for (const question of [Q.variant, Q.domain, Q.email, Q.clientId]) {
      expect(result.output).not.toContain(question);
    }
    expect(valueOf('GOOGLE_CLIENT_SECRET')).toBe(TYPED_SECRET);
    expect(valueOf('ALLOWED_EMAIL')).toBe('owner@example.test');
    expectNoSecretsIn(result);
  });
});

describe('S3: ponowne uruchomienie (część na atrapie)', () => {
  it('S3: drugie uruchomienie pomija K2–K6, nie zmienia .env i nie pyta w terminalu', async () => {
    await install();
    const before = envText();

    const second = await runInstaller(installation, { tty: true, timeoutMs: FAST });

    expect(envText()).toBe(before);
    for (const n of [2, 3, 4, 5, 6]) {
      expect(second.output).toMatch(new RegExp(`K${n} [^\\n]*: pominięty, już zrobione`));
    }
    for (const question of Object.values(Q)) expect(second.output).not.toContain(question);
    expectNoSecretsIn(second);
  });

  it('S3: drugie uruchomienie bez terminala też zostawia .env bajt w bajt', async () => {
    await install();
    const before = envText();

    const second = await runInstaller(installation);

    expect(envText()).toBe(before);
    expect(second.output).toContain('K6 Klucze push: pominięty, już zrobione');
  });

  it.each(['usunięty', 'z wyczyszczonym hasłem'])(
    'S3: istniejący wolumen bazy i .env %s: błąd, bez nowego hasła i bez uruchamiania aplikacji',
    async (kind) => {
      await install();
      if (kind === 'usunięty') {
        writeFileSync(installation.envPath, '');
        chmodSync(installation.envPath, 0o600);
        const { rmSync } = await import('node:fs');
        rmSync(installation.envPath);
      } else {
        writeEnv(envText().replace(/^POSTGRES_PASSWORD=.*$/m, 'POSTGRES_PASSWORD='));
      }
      setDockerState(installation, { VOLUME: 'exists' });

      const result = await runInstaller(installation, { env: { HTTPS_MODE: 'caddy' } });

      expect(result.code).not.toBe(0);
      expect(result.output).toContain('K4 Hasło bazy: błąd');
      expect(result.output).toContain('ma hasło, którego nie ma w .env');
      expect(valueOf('POSTGRES_PASSWORD') ?? '').toBe('');
      expect(dockerCalls(installation).some((call) => call.startsWith('volume inspect'))).toBe(
        true,
      );
      expect(dockerCalls(installation).some((call) => call.startsWith('compose -p'))).toBe(false);
    },
  );

  it('S3: hasło podane w zmiennej przy istniejącym wolumenie jest zapisane', async () => {
    setDockerState(installation, { VOLUME: 'exists' });

    const result = await runInstaller(installation, {
      env: { ...VALUES, POSTGRES_PASSWORD: 'dotychczasowe-haslo-1' },
    });

    expect(valueOf('POSTGRES_PASSWORD')).toBe('dotychczasowe-haslo-1');
    expect(result.output).toContain('K4 Hasło bazy: zrobione');
  });
});

describe('S4: dokończenie przerwanej instalacji', () => {
  it('S4: po przerwaniu po wygenerowaniu hasła hasło zostaje to samo, a brakujące kroki są uzupełnione', async () => {
    const first = await runInstaller(installation, {
      env: { ...VALUES, GOOGLE_CLIENT_ID: '' },
    });
    expect(first.code).not.toBe(0);
    const password = valueOf('POSTGRES_PASSWORD');
    expect(password).toMatch(/^[0-9a-f]{64}$/);

    const second = await runInstaller(installation, { env: VALUES });

    expect(valueOf('POSTGRES_PASSWORD')).toBe(password);
    expect(second.output).toContain('K4 Hasło bazy: pominięty, już zrobione');
    expect(second.output).toContain('K5 Wartości od właściciela: zrobione');
    expect(second.output).toContain('K6 Klucze push: zrobione');
    expect(second.output).toContain('K7 Kontrola .env: zrobione');
    expectNoDuplicatesOrTornLines();
  });

  it('S4: po przerwaniu w K5 po zapisaniu części wartości pyta tylko o wartości jeszcze puste', async () => {
    await runInstaller(installation, {
      tty: true,
      steps: answersUpTo(3, '\x04'),
      timeoutMs: FAST,
    });
    expect(valueOf('ALLOWED_EMAIL')).toBe('owner@example.test');
    expect(valueOf('GOOGLE_CLIENT_ID')).toBe('');

    const second = await runInstaller(installation, {
      tty: true,
      steps: ALL_ANSWERS.slice(3),
      timeoutMs: FAST,
    });

    for (const question of [Q.variant, Q.domain, Q.email]) {
      expect(second.output).not.toContain(question);
    }
    expect(valueOf('GOOGLE_CLIENT_ID')).toBe('client-id-1');
    expect(second.output).toContain('K6 Klucze push: zrobione');
    expectNoDuplicatesOrTornLines();
  });

  it.each(QUESTIONS.map(([key], index) => [key, index] as const))(
    'S4: przerwanie przy pytaniu o %s nie zostawia zdublowanych kluczy ani urwanych linii',
    async (_key, index) => {
      await runInstaller(installation, {
        tty: true,
        steps: answersUpTo(index, '\x04'),
        timeoutMs: FAST,
      });
      expectNoDuplicatesOrTornLines();

      const second = await runInstaller(installation, {
        tty: true,
        steps: ALL_ANSWERS.slice(index),
        timeoutMs: FAST,
      });

      expect(second.output).toContain('K6 Klucze push: zrobione');
      expectNoDuplicatesOrTornLines();
      expect(valueOf('BACKUP_AGE_RECIPIENT')).toBe('age1publickey');
    },
  );
});

describe('S6: brakująca albo błędna wartość', () => {
  it.each([
    ['domenę z https://', Q.domain, 'https://przepisy.example.test', 'APP_DOMAIN'],
    ['e-mail bez @', Q.email, 'owner.example.test', 'ALLOWED_EMAIL'],
    ['klucz age bez age1', Q.age, 'ssh-ed25519-xyz', 'BACKUP_AGE_RECIPIENT'],
    ['pusty Client ID', Q.clientId, '', 'GOOGLE_CLIENT_ID'],
  ])(
    'S6: w terminalu %s: wskazuje problem, pyta ponownie i nie zapisuje',
    async (_name, question, wrong, key) => {
      const index = QUESTIONS.findIndex(([, q]) => q === question);
      const steps: Step[] = [
        ...ALL_ANSWERS.slice(0, index),
        { waitFor: question, send: `${wrong}\n` },
        { waitFor: `  ! ${key}:`, send: ALL_ANSWERS[index]!.send },
        ...ALL_ANSWERS.slice(index + 1),
      ];

      const result = await runInstaller(installation, { tty: true, steps, timeoutMs: FAST });

      expect(result.output).toContain(`  ! ${key}:`);
      expect(valueOf(key)).not.toBe(wrong);
      expect(result.output).toContain('K6 Klucze push: zrobione');
      expectNoDuplicatesOrTornLines();
    },
  );

  it('S6: bez terminala z brakującymi GOOGLE_CLIENT_ID i BACKUP_AGE_RECIPIENT wymienia obie nazwy i nie startuje', async () => {
    const env: Record<string, string> = { ...VALUES };
    delete env.GOOGLE_CLIENT_ID;
    delete env.BACKUP_AGE_RECIPIENT;

    const result = await runInstaller(installation, { env });

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('K5 Wartości od właściciela: błąd');
    expect(result.output).toContain('  - GOOGLE_CLIENT_ID:');
    expect(result.output).toContain('  - BACKUP_AGE_RECIPIENT:');
    expect(result.output).not.toContain('K6');
    expect(valueOf('ALLOWED_EMAIL')).toBe('owner@example.test');
    expect(dockerCalls(installation).some((call) => call.startsWith('compose -p'))).toBe(false);
  });

  it('S6: bez terminala bez wariantu kończy się błędem w K3 i wskazuje brak wariantu', async () => {
    const env: Record<string, string> = { ...VALUES };
    delete env.HTTPS_MODE;

    const result = await runInstaller(installation, { env });

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('K3 Wariant HTTPS: błąd');
    expect(result.output).toContain('brakuje wariantu');
    expect(valueOf('POSTGRES_PASSWORD')).toBe('');
  });

  it('S6: zmienna z błędną wartością podaje nazwę zmiennej, ale nie jej wartość', async () => {
    const result = await runInstaller(installation, {
      env: { ...VALUES, BACKUP_AGE_RECIPIENT: 'ssh-ed25519-tajny-klucz-6a' },
    });

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('  - BACKUP_AGE_RECIPIENT:');
    expect(result.output).not.toContain('tajny-klucz-6a');
    expect(valueOf('BACKUP_AGE_RECIPIENT')).toBe('');
  });

  it('S6: wartość z niedozwolonymi znakami jest odrzucona bez wypisania wartości', async () => {
    const result = await runInstaller(installation, {
      env: { ...VALUES, GOOGLE_CLIENT_SECRET: 'sekret z "cudzyslowem" 7d' },
    });

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('  - GOOGLE_CLIENT_SECRET: niedozwolone znaki');
    expect(result.output).not.toContain('cudzyslowem');
  });

  it('S6: po uzupełnieniu brakującej wartości instalacja przechodzi dalej, a zapisane wartości są nietknięte', async () => {
    const env: Record<string, string> = { ...VALUES };
    delete env.GOOGLE_CLIENT_ID;
    const first = await runInstaller(installation, { env });
    expect(first.code).not.toBe(0);
    const saved = {
      password: valueOf('POSTGRES_PASSWORD'),
      email: valueOf('ALLOWED_EMAIL'),
      secret: valueOf('GOOGLE_CLIENT_SECRET'),
    };

    const second = await runInstaller(installation, { env: VALUES });

    expect(second.output).toContain('K7 Kontrola .env: zrobione');
    expect(valueOf('POSTGRES_PASSWORD')).toBe(saved.password);
    expect(valueOf('ALLOWED_EMAIL')).toBe(saved.email);
    expect(valueOf('GOOGLE_CLIENT_SECRET')).toBe(saved.secret);
    expect(valueOf('GOOGLE_CLIENT_ID')).toBe('client-id-1');
  });
});

describe('S10: instalacja ręczna (bez startu)', () => {
  const MANUAL = [
    '# Ręczny .env',
    'POSTGRES_PASSWORD=pg-manual-secret',
    'APP_DOMAIN=przepisy.example.test',
    'APP_BASE_URL=https://przepisy.example.test',
    'ALLOWED_EMAIL=owner@example.test',
    'GOOGLE_CLIENT_ID=client-id-1',
    'GOOGLE_CLIENT_SECRET=gcs-manual-secret',
    'BACKUP_AGE_RECIPIENT=age1publickey',
    'VAPID_PUBLIC_KEY=pub-manual',
    'VAPID_PRIVATE_KEY=priv-manual-secret',
    'PUSH_MODE=web-push',
    '',
  ].join('\n');

  it.each([
    ['z pustym kluczem HTTPS_MODE', `${MANUAL}HTTPS_MODE=\n`],
    ['bez klucza HTTPS_MODE', MANUAL],
  ])(
    'S10: .env %s: pyta wyłącznie o wariant i nie zmienia istniejących wartości',
    async (_name, content) => {
      writeEnv(content);

      const result = await runInstaller(installation, {
        tty: true,
        steps: [{ waitFor: Q.variant, send: 'proxy\n' }],
        timeoutMs: FAST,
      });

      expect(valueOf('HTTPS_MODE')).toBe('proxy');
      expect(
        envText()
          .replace(/^HTTPS_MODE=.*\n/m, '')
          .replace(/\nHTTPS_MODE=proxy\n$/, '\n'),
      ).toBe(MANUAL);
      for (const question of [Q.domain, Q.email, Q.clientId, Q.secret, Q.age]) {
        expect(result.output).not.toContain(question);
      }
      expect(result.output).toContain('K7 Kontrola .env: zrobione');
      expect(result.output).not.toContain('pg-manual-secret');
    },
  );

  it('S10: z APP_BASE_URL i pustą APP_DOMAIN wylicza domenę bez pytania', async () => {
    writeEnv(
      MANUAL.replace('APP_DOMAIN=przepisy.example.test', 'APP_DOMAIN=') + 'HTTPS_MODE=caddy\n',
    );

    const result = await runInstaller(installation, { tty: true, timeoutMs: FAST });

    expect(valueOf('APP_DOMAIN')).toBe('przepisy.example.test');
    expect(result.output).toContain('K5 Wartości od właściciela: zrobione');
    expect(result.output).not.toContain(Q.domain);
  });

  it('S10: z portem w APP_BASE_URL (proxy) domena jest bez portu', async () => {
    writeEnv(
      MANUAL.replace('APP_DOMAIN=przepisy.example.test', 'APP_DOMAIN=').replace(
        'APP_BASE_URL=https://przepisy.example.test',
        'APP_BASE_URL=https://przepisy.example.test:8443',
      ) + 'HTTPS_MODE=proxy\n',
    );

    await runInstaller(installation, { tty: true, timeoutMs: FAST });

    expect(valueOf('APP_DOMAIN')).toBe('przepisy.example.test');
  });

  it('S10: bez kluczy VAPID dopisuje je na końcu, a resztę pliku zostawia bez zmian', async () => {
    const content = `${MANUAL.replace(/^VAPID_.*\n/gm, '')}HTTPS_MODE=caddy\n`;
    writeEnv(content);

    const result = await runInstaller(installation);

    const text = envText();
    expect(text.startsWith(content)).toBe(true);
    expect(text.slice(content.length)).toMatch(
      /^VAPID_PUBLIC_KEY=.{87}\nVAPID_PRIVATE_KEY=.{43}\n$/,
    );
    expect(result.output).toContain('K6 Klucze push: zrobione');
    expect(result.output).not.toContain(valueOf('VAPID_PRIVATE_KEY') ?? 'x');
  });

  it('S10: plik bez końcowej nowej linii dostaje ją przed dopisanymi kluczami', async () => {
    const content = `${MANUAL.replace(/^VAPID_.*\n/gm, '')}HTTPS_MODE=caddy`;
    writeEnv(content);

    await runInstaller(installation);

    expect(envText().startsWith(`${content}\nVAPID_PUBLIC_KEY=`)).toBe(true);
    expectNoDuplicatesOrTornLines();
  });
});

describe('K6: klucze push', () => {
  it('K6: tylko jeden klucz VAPID w .env kończy się błędem z nazwą pustego klucza', async () => {
    writeEnv('VAPID_PUBLIC_KEY=pub-only\n');

    const result = await runInstaller(installation, { env: VALUES });

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('K6 Klucze push: błąd');
    expect(result.output).toContain('  - VAPID_PRIVATE_KEY:');
    expect(valueOf('VAPID_PRIVATE_KEY') ?? '').toBe('');
    expect(valueOf('VAPID_PUBLIC_KEY')).toBe('pub-only');
  });

  it.each([
    ['VAPID_PUBLIC_KEY', 'VAPID_PUBLIC_KEY=\nVAPID_PUBLIC_KEY=pub-manual\nVAPID_PRIVATE_KEY=\n'],
    ['VAPID_PRIVATE_KEY', 'VAPID_PUBLIC_KEY=\nVAPID_PRIVATE_KEY=\nVAPID_PRIVATE_KEY=priv-manual\n'],
  ])('K6: zdublowany %s nie jest uzupełniany, a K7 zgłasza duplikat', async (key, content) => {
    writeEnv(content);

    const result = await runInstaller(installation, { env: VALUES });

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('K6 Klucze push: pominięty, już zrobione');
    expect(result.output).toContain(`  - ${key}: klucz występuje w .env więcej niż raz`);
    expect(envText().startsWith(content)).toBe(true);
    expect(dockerCalls(installation).some((call) => call.startsWith('run '))).toBe(false);
  });

  it('K6: tylko jedna zmienna VAPID kończy się błędem i niczego nie zapisuje', async () => {
    const result = await runInstaller(installation, {
      env: { ...VALUES, VAPID_PRIVATE_KEY: 'priv-only-from-env' },
    });

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('  - VAPID_PUBLIC_KEY:');
    expect(result.output).not.toContain('priv-only-from-env');
    expect(valueOf('VAPID_PRIVATE_KEY')).toBe('');
  });

  it('K6: para ze zmiennych jest zapisana bez uruchamiania kontenera', async () => {
    const result = await runInstaller(installation, {
      env: { ...VALUES, VAPID_PUBLIC_KEY: 'pub-from-env', VAPID_PRIVATE_KEY: 'priv-from-env' },
    });

    expect(valueOf('VAPID_PUBLIC_KEY')).toBe('pub-from-env');
    expect(valueOf('VAPID_PRIVATE_KEY')).toBe('priv-from-env');
    expect(dockerCalls(installation).some((call) => call.startsWith('run '))).toBe(false);
    expect(result.output).not.toContain('priv-from-env');
  });

  it('K6: generuje parę w kontenerze bez sieci, z obrazem z Dockerfile', async () => {
    await install();

    const run = dockerCalls(installation).find((call) => call.startsWith('run '));
    expect(run).toContain('--rm --network none node:24-bookworm-slim node -e');
  });

  it('K6: błąd kontenera albo klucz o złej długości zatrzymuje instalator bez zapisu', async () => {
    setDockerState(installation, { VAPID_PUBLIC: 'za-krotki' });
    const short = await runInstaller(installation, { env: VALUES });
    expect(short.code).not.toBe(0);
    expect(short.output).toContain('K6 Klucze push: błąd');
    expect(valueOf('VAPID_PUBLIC_KEY')).toBe('');

    setDockerState(installation, { EXIT_run: '1' });
    const failed = await runInstaller(installation, { env: VALUES });
    expect(failed.code).not.toBe(0);
    expect(failed.output).toContain('K6 Klucze push: błąd');
    expect(valueOf('VAPID_PRIVATE_KEY')).toBe('');
  });
});
