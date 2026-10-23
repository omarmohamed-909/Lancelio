import { beforeAll, describe, expect, it } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { JoseGoogleTokenVerifier } from '../src/modules/auth/infrastructure/google-token-verifier.js';
import { readEnvironment } from '../src/main/config.js';

const clientId = 'test-client.apps.googleusercontent.com';
const now = new Date('2026-10-24T10:00:00Z');
const nonce = 'browser-bound-random-nonce';
let key: Awaited<ReturnType<typeof generateKeyPair>>;
let verifier: JoseGoogleTokenVerifier;
beforeAll(async () => {
  key = await generateKeyPair('RS256');
  verifier = new JoseGoogleTokenVerifier(
    clientId,
    createLocalJWKSet({
      keys: [
        { ...(await exportJWK(key.publicKey)), kid: 'test', alg: 'RS256' },
      ],
    }),
  );
});
async function token(overrides: Record<string, unknown> = {}) {
  return new SignJWT({
    iss: 'https://accounts.google.com',
    aud: clientId,
    sub: 'google-subject',
    email: 'PERSON@Gmail.com',
    email_verified: true,
    name: 'Google Name',
    nonce,
    iat: now.getTime() / 1000,
    exp: now.getTime() / 1000 + 3600,
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .sign(key.privateKey);
}
describe('Google identity verification', () => {
  it('verifies the signature, issuer, audience and nonce and normalizes the verified email', async () => {
    expect(await verifier.verify(await token(), nonce, now)).toEqual({
      subject: 'google-subject',
      email: 'person@gmail.com',
      name: 'Google Name',
    });
    expect(
      (
        await verifier.verify(
          await token({ iss: 'accounts.google.com' }),
          nonce,
          now,
        )
      ).subject,
    ).toBe('google-subject');
  });
  it.each([
    { aud: 'another-client.apps.googleusercontent.com' },
    { iss: 'https://attacker.example' },
    { nonce: 'another-browser' },
    { email_verified: false },
    { email_verified: 'true' },
    { email: 'invalid' },
    { sub: '' },
    { azp: 'another-client' },
    { exp: now.getTime() / 1000 - 1 },
    { iat: now.getTime() / 1000 - 601 },
    { iat: now.getTime() / 1000 + 60 },
    { nonce: undefined },
    { email_verified: undefined },
  ])('rejects invalid or missing identity claims: %j', async (overrides) => {
    await expect(
      verifier.verify(await token(overrides), nonce, now),
    ).rejects.toMatchObject({ code: 'GOOGLE_INVALID_CREDENTIALS' });
  });
  it('rejects a forged signature and malformed tokens', async () => {
    const other = await generateKeyPair('RS256');
    const forged = await new SignJWT({ sub: 'google-subject' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .sign(other.privateKey);
    await expect(verifier.verify(forged, nonce, now)).rejects.toMatchObject({
      code: 'GOOGLE_INVALID_CREDENTIALS',
    });
    await expect(
      verifier.verify('not-a-token', nonce, now),
    ).rejects.toMatchObject({ code: 'GOOGLE_INVALID_CREDENTIALS' });
  });
  it('reports key-service connection failure without exposing transport details', async () => {
    const unavailable = new JoseGoogleTokenVerifier(clientId, async () => {
      throw new TypeError('private transport details');
    });
    await expect(
      unavailable.verify(await token(), nonce, now),
    ).rejects.toMatchObject({
      code: 'GOOGLE_UNAVAILABLE',
      message: 'Google sign-in is temporarily unavailable',
    });
  });
  it('keeps Google disabled without a client ID and rejects malformed configuration without leaking it', () => {
    const environment = {
      MONGODB_URI: 'mongodb://localhost/test',
      JWT_ACCESS_SECRET: 'test-signing-key-at-least-thirty-two-characters',
    };
    expect(readEnvironment(environment).GOOGLE_CLIENT_ID).toBeUndefined();
    expect(
      readEnvironment({ ...environment, GOOGLE_CLIENT_ID: '' })
        .GOOGLE_CLIENT_ID,
    ).toBeUndefined();
    expect(
      readEnvironment({ ...environment, GOOGLE_CLIENT_ID: clientId })
        .GOOGLE_CLIENT_ID,
    ).toBe(clientId);
    expect(() =>
      readEnvironment({
        ...environment,
        GOOGLE_CLIENT_ID: 'private-invalid-value',
      }),
    ).toThrow('Invalid environment configuration: GOOGLE_CLIENT_ID');
  });
});
