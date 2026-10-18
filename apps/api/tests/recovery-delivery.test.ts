import { describe, expect, it, vi } from 'vitest';
import { EncryptedRecoverySecrets } from '../src/modules/auth/infrastructure/recovery-secrets.js';
import { ResendRecoveryMailer } from '../src/modules/auth/infrastructure/resend-recovery-mailer.js';
import { readEnvironment } from '../src/main/config.js';
const secret = 'recovery-unit-test-key-at-least-thirty-two-characters';
describe('Recovery encryption and Resend adapter', () => {
  it('generates unpredictable 256-bit tokens and encrypts distinct queue payloads', () => {
    const crypto = new EncryptedRecoverySecrets(secret),
      first = crypto.create('a@example.com'),
      second = crypto.create('a@example.com');
    expect(first.id).not.toBe(second.id);
    expect(first.payload).not.toBe(second.payload);
    expect(first.mailbox).toBe(second.mailbox);
    const value = crypto.open(first.payload);
    expect(value.email).toBe('a@example.com');
    expect(value.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(crypto.digest(value.token)).toBe(first.id);
  });
  it('rejects payload tampering and the wrong encryption key', () => {
    const crypto = new EncryptedRecoverySecrets(secret),
      job = crypto.create('a@example.com');
    const bytes = Buffer.from(job.payload, 'base64url');
    bytes[30] = bytes[30]! ^ 1;
    expect(() => crypto.open(bytes.toString('base64url'))).toThrow();
    expect(() =>
      new EncryptedRecoverySecrets(secret + 'other').open(job.payload),
    ).toThrow();
  });
  it('sends the expected provider contract with an idempotency key, canonical fragment URL and no workspace data', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'delivery' }), { status: 200 }),
      );
    const mailer = new ResendRecoveryMailer(
      'provider-key',
      'mail@example.com',
      'https://lancelio.example',
      send,
    );
    await mailer.send('recipient@example.com', 'a'.repeat(43), 'request-id');
    expect(send).toHaveBeenCalledOnce();
    const [url, options] = send.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(options?.headers).toEqual({
      Authorization: 'Bearer provider-key',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'password-recovery/request-id',
    });
    const body: unknown = JSON.parse(String(options?.body));
    expect(body).toMatchObject({
      from: 'mail@example.com',
      to: ['recipient@example.com'],
    });
    expect(JSON.stringify(body)).toContain(
      'https://lancelio.example/reset-password#token=' + 'a'.repeat(43),
    );
    expect(JSON.stringify(body)).not.toContain('workspace');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
  it('fails without echoing provider errors and leaves retrying to the durable worker', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('private provider recipient details', { status: 429 }),
      );
    await expect(
      new ResendRecoveryMailer(
        'key',
        'mail@example.com',
        'https://lancelio.example',
        send,
      ).send('a@example.com', 'token', 'id'),
    ).rejects.toThrow('Recovery delivery failed');
    expect(send).toHaveBeenCalledOnce();
  });
  it('requires sender and key together for Resend and fails without printing secrets', () => {
    const environment = {
      MONGODB_URI: 'mongodb://localhost/test',
      JWT_ACCESS_SECRET: secret,
      EMAIL_PROVIDER: 'resend',
    };
    expect(() => readEnvironment(environment)).toThrow(
      'RESEND_API_KEY, EMAIL_FROM',
    );
    expect(() =>
      readEnvironment({
        ...environment,
        RESEND_API_KEY: 'private-key',
        EMAIL_FROM: 'invalid-secret-email',
      }),
    ).toThrow('EMAIL_FROM');
    expect(
      readEnvironment({
        ...environment,
        RESEND_API_KEY: 'key',
        EMAIL_FROM: 'mail@example.com',
      }).EMAIL_PROVIDER,
    ).toBe('resend');
  });
});
