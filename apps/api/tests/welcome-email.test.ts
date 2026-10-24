import { describe, expect, it, vi } from 'vitest';
import { welcomeTemplate } from '../src/modules/auth/infrastructure/welcome-template.js';
import { ResendWelcomeMailer } from '../src/modules/auth/infrastructure/resend-welcome-mailer.js';
import { readEnvironment } from '../src/main/config.js';

const message = {
  name: 'Omar',
  email: 'omar@example.com',
  workspaceName: 'My Studio',
  language: 'en' as const,
};
describe('welcome email content and delivery', () => {
  it.each(['ar', 'en'] as const)(
    'renders %s with escaped user content, a normal dashboard link and a plain-text alternative',
    (language) => {
      const content = welcomeTemplate(
        {
          ...message,
          language,
          name: '<img src=x onerror="bad()">',
          workspaceName: '<script>bad()</script>',
        },
        'https://www.lancelio.tech',
      );
      expect(content.html).toContain(`lang="${language}"`);
      expect(content.html).toContain(
        `dir="${language === 'ar' ? 'rtl' : 'ltr'}"`,
      );
      expect(content.html).not.toContain('<script>');
      expect(content.html).not.toContain('<img src=x');
      expect(content.html).toContain('&lt;script&gt;');
      expect(content.html).toContain('https://www.lancelio.tech/dashboard');
      expect(content.html).not.toMatch(/token=|password=|tracking/iu);
      expect(content.text).toContain('https://www.lancelio.tech/dashboard');
      expect(content.subject).not.toContain('bad()');
    },
  );
  it('uses a stable provider idempotency key and sends only the required public welcome content', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const mailer = new ResendWelcomeMailer(
      'test-only-secret',
      'hello@updates.lancelio.tech',
      'https://www.lancelio.tech',
      send,
    );
    await mailer.send(message, 'welcome/owner/v1');
    const [url, options] = send.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(options?.headers).toMatchObject({
      'Idempotency-Key': 'welcome/owner/v1',
    });
    const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
    expect(body.from).toBe('Lancelio <hello@updates.lancelio.tech>');
    expect(body.to).toEqual([message.email]);
    expect(body).toHaveProperty('html');
    expect(body).toHaveProperty('text');
    expect(String(options?.body)).not.toContain('test-only-secret');
  });
  it.each([
    [429, true],
    [503, true],
    [403, false],
    [422, false],
  ] as const)(
    'classifies provider status %s without exposing its body',
    async (status, retryable) => {
      const send = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('private provider details', { status }),
        );
      await expect(
        new ResendWelcomeMailer(
          'secret',
          'sender@example.com',
          'https://www.lancelio.tech',
          send,
        ).send(message, 'welcome/id/v1'),
      ).rejects.toMatchObject({
        retryable,
        message: 'Welcome delivery failed',
      });
    },
  );
  it('keeps welcome disabled by default and requires a configured sender only when enabled', () => {
    const base = {
      MONGODB_URI: 'mongodb://localhost/test',
      JWT_ACCESS_SECRET: 'test-only-signing-secret-at-least-32-characters',
    };
    expect(readEnvironment(base).WELCOME_EMAIL_ENABLED).toBe(false);
    expect(() =>
      readEnvironment({ ...base, WELCOME_EMAIL_ENABLED: 'true' }),
    ).toThrow('RESEND_API_KEY');
    expect(
      readEnvironment({
        ...base,
        WELCOME_EMAIL_ENABLED: 'true',
        RESEND_API_KEY: 'test-only-key',
        EMAIL_FROM: 'hello@updates.lancelio.tech',
      }),
    ).toMatchObject({
      WELCOME_EMAIL_ENABLED: true,
      EMAIL_PROVIDER: 'disabled',
    });
    expect(() =>
      readEnvironment({ ...base, WELCOME_EMAIL_ENABLED: 'maybe' }),
    ).toThrow('WELCOME_EMAIL_ENABLED');
  });
});
