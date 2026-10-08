import { createHash, randomUUID, type webcrypto } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

type Key = webcrypto.CryptoKey;

export const CLIENT_ID = 'test-client-id';
export const CLIENT_SECRET = 'test-client-secret';

type Grant = { nonce: string; challenge: string; email: string; emailVerified: boolean };

/**
 * A minimal OpenID Connect provider for tests: discovery, JWKS, authorization (no UI) and token
 * endpoint with PKCE verification. Signs RS256 ID tokens with a key generated per instance.
 */
export class LocalOidcIssuer {
  private server: Server | undefined;
  private readonly grants = new Map<string, Grant>();
  private keys: { publicKey: Key; privateKey: Key } | undefined;
  issuer = '';
  /** Overrides applied to the claims of the next ID token, to simulate misbehaving providers. */
  claimOverrides: Record<string, unknown> = {};
  /** Who "signs in" at the authorization endpoint. */
  account = { email: 'owner@example.test', emailVerified: true };

  async start() {
    this.keys = await generateKeyPair('RS256');
    this.server = createServer((request, response) => {
      void this.handle(request).then(({ status, headers, body }) => {
        response.writeHead(status, headers);
        response.end(body);
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
    this.issuer = `http://127.0.0.1:${(this.server?.address() as AddressInfo).port}`;
  }

  async stop() {
    await new Promise((resolve) => this.server?.close(resolve));
  }

  /** Plays the user's browser at the authorization endpoint; returns where it would be redirected. */
  async authorize(authorizationUrl: string): Promise<URL> {
    const response = await fetch(authorizationUrl, { redirect: 'manual' });
    return new URL(response.headers.get('location') ?? '');
  }

  private async handle(request: IncomingMessage) {
    const url = new URL(request.url ?? '/', this.issuer);
    const json = (value: unknown) => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    });
    switch (url.pathname) {
      case '/.well-known/openid-configuration':
        return json({
          issuer: this.issuer,
          authorization_endpoint: `${this.issuer}/authorize`,
          token_endpoint: `${this.issuer}/token`,
          jwks_uri: `${this.issuer}/jwks`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          code_challenge_methods_supported: ['S256'],
        });
      case '/jwks': {
        const jwk = await exportJWK(this.keys?.publicKey as Key);
        return json({ keys: [{ ...jwk, alg: 'RS256', use: 'sig', kid: 'test' }] });
      }
      case '/authorize': {
        const params = url.searchParams;
        const code = randomUUID();
        this.grants.set(code, {
          nonce: params.get('nonce') ?? '',
          challenge: params.get('code_challenge') ?? '',
          ...this.account,
        });
        const target = new URL(params.get('redirect_uri') ?? '');
        target.searchParams.set('code', code);
        target.searchParams.set('state', params.get('state') ?? '');
        return { status: 302, headers: { location: target.toString() }, body: '' };
      }
      case '/token':
        return this.token(request);
      default:
        return { status: 404, headers: {}, body: '' };
    }
  }

  private async token(request: IncomingMessage) {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const form = new URLSearchParams(Buffer.concat(chunks).toString());
    const grant = this.grants.get(form.get('code') ?? '');
    const verifier = form.get('code_verifier') ?? '';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    if (!grant || grant.challenge !== challenge) {
      return {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'invalid_grant' }),
      };
    }
    this.grants.delete(form.get('code') ?? '');
    const idToken = await new SignJWT({
      nonce: grant.nonce,
      email: grant.email,
      email_verified: grant.emailVerified,
      ...this.claimOverrides,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(this.issuer)
      .setAudience(CLIENT_ID)
      .setSubject('subject-1')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(this.keys?.privateKey as Key);
    return {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: 'unused', token_type: 'Bearer', id_token: idToken }),
    };
  }
}
