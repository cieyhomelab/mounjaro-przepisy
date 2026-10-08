import { createHash, randomBytes } from 'node:crypto';
import * as oidc from 'openid-client';
import type { Config } from '../config';

/** What the login flow needs from an identity provider; Google and the mock both implement it. */
export type AuthProvider = {
  /** Address to send the browser to for signing in. */
  authorizationUrl(input: AuthorizationInput): Promise<string>;
  /** Exchanges the callback for the verified identity, or throws when the exchange is invalid. */
  completeLogin(input: CompletionInput): Promise<{ email: string; emailVerified: boolean }>;
};

export type AuthorizationInput = {
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
};

export type CompletionInput = {
  /** The full callback address as the provider redirected the browser to it. */
  callbackUrl: URL;
  state: string;
  nonce: string;
  codeVerifier: string;
};

export const MOCK_LOGIN_PATH = '/api/__test/google';

/**
 * Stand-in for Google (`AUTH_MODE=mock`): sends the browser to a form where a test picks an
 * e-mail address; the callback carries that address as `code`. Everything after the identity
 * is obtained (address check, session, returnTo) is shared with the real provider.
 */
export function createMockAuthProvider(): AuthProvider {
  return {
    authorizationUrl: ({ state }) =>
      Promise.resolve(`${MOCK_LOGIN_PATH}?${new URLSearchParams({ state }).toString()}`),
    completeLogin: ({ callbackUrl, state }) => {
      const code = callbackUrl.searchParams.get('code');
      if (!code || callbackUrl.searchParams.get('state') !== state) {
        return Promise.reject(new Error('invalid mock callback'));
      }
      return Promise.resolve({ email: code, emailVerified: true });
    },
  };
}

export type GoogleProviderOptions = {
  clientId: string;
  clientSecret: string;
  /** Defaults to Google; tests point it at a local issuer. */
  issuer?: string;
  /** Tests only: allows a plain-http issuer. */
  allowInsecureIssuer?: boolean;
};

/** Google OpenID Connect, authorization-code flow with PKCE, scope `openid email`. */
export function createGoogleAuthProvider(options: GoogleProviderOptions): AuthProvider {
  let configuration: Promise<oidc.Configuration> | undefined;
  const getConfiguration = () => {
    configuration ??= oidc.discovery(
      new URL(options.issuer ?? 'https://accounts.google.com'),
      options.clientId,
      options.clientSecret,
      undefined,
      options.allowInsecureIssuer ? { execute: [oidc.allowInsecureRequests] } : undefined,
    );
    // A failed discovery must not be cached forever.
    configuration.catch(() => {
      configuration = undefined;
    });
    return configuration;
  };

  return {
    authorizationUrl: async ({ redirectUri, state, nonce, codeChallenge }) => {
      const url = oidc.buildAuthorizationUrl(await getConfiguration(), {
        redirect_uri: redirectUri,
        scope: 'openid email',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      return url.toString();
    },
    completeLogin: async ({ callbackUrl, state, nonce, codeVerifier }) => {
      const tokens = await oidc.authorizationCodeGrant(await getConfiguration(), callbackUrl, {
        pkceCodeVerifier: codeVerifier,
        expectedState: state,
        expectedNonce: nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      const email = claims?.['email'];
      if (typeof email !== 'string') throw new Error('id token without e-mail');
      // Only the verified address is used; nothing else from the token is kept.
      return { email, emailVerified: claims?.['email_verified'] === true };
    },
  };
}

export function createAuthProvider(config: Config): AuthProvider {
  if (config.authMode === 'mock') return createMockAuthProvider();
  return createGoogleAuthProvider({
    clientId: config.googleClientId ?? '',
    clientSecret: config.googleClientSecret ?? '',
  });
}

export type LoginChecks = Pick<AuthorizationInput, 'state' | 'nonce' | 'codeChallenge'> &
  Pick<CompletionInput, 'codeVerifier'>;

/** Fresh random values binding one login attempt to the browser that started it (state, nonce, PKCE). */
export function createLoginChecks(): LoginChecks {
  const random = () => randomBytes(32).toString('base64url');
  const codeVerifier = random();
  return {
    state: random(),
    nonce: random(),
    codeVerifier,
    codeChallenge: createHash('sha256').update(codeVerifier).digest('base64url'),
  };
}
