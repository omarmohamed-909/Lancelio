import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/main/create-app.js';
import { createAuthentication } from '../src/main/create-authentication.js';
import { createGoogleAuthentication } from '../src/main/create-google-authentication.js';
import { createPasswordRecovery } from '../src/main/create-password-recovery.js';
import { createPasswordChange } from '../src/main/create-password-change.js';
import { connectDatabase } from '../src/main/database.js';
import { RegisterAccount } from '../src/modules/auth/application/register-account.js';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher.js';
import { MongoRegistrationStore } from '../src/modules/auth/infrastructure/mongo-registration-store.js';
import { MongoSessionStore } from '../src/modules/auth/infrastructure/mongo-session-store.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../src/modules/auth/infrastructure/registration-models.js';
import { createSessionModel } from '../src/modules/auth/infrastructure/session-model.js';
import { JoseGoogleTokenVerifier } from '../src/modules/auth/infrastructure/google-token-verifier.js';
import { mongoBinaryOptions } from './helpers/mongo-binary.js';

const origin = 'http://localhost:3000';
const clientId = 'test-client.apps.googleusercontent.com';
const secret = 'test-google-signing-key-at-least-thirty-two-characters';
const password = 'a secure existing account password';
describe('Google sign-in and account integrity', () => {
  let replica: MongoMemoryReplSet;
  let database: Awaited<ReturnType<typeof connectDatabase>>;
  let models: ReturnType<typeof createRegistrationModels>;
  let sessionModel: ReturnType<typeof createSessionModel>;
  let sessions: Awaited<ReturnType<typeof createAuthentication>>;
  let google: Awaited<ReturnType<typeof createGoogleAuthentication>>;
  let recovery: Awaited<ReturnType<typeof createPasswordRecovery>>;
  let change: Awaited<ReturnType<typeof createPasswordChange>>;
  let register: RegisterAccount;
  let app: ReturnType<typeof createApp>;
  let keys: Awaited<ReturnType<typeof generateKeyPair>>;
  const sent: { token: string; email: string }[] = [];
  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({
      binary: {
        ...mongoBinaryOptions(),
        downloadDir: resolve('../../.cache/mongodb-binaries'),
      },
      replSet: { count: 1 },
    });
    database = await connectDatabase(replica.getUri('google-auth'));
    models = createRegistrationModels(database);
    await initializeRegistrationModels(models);
    sessionModel = createSessionModel(database);
    await sessionModel.createCollection();
    await sessionModel.createIndexes();
    sessions = await createAuthentication(models, sessionModel, secret, false);
    keys = await generateKeyPair('RS256');
    const verifier = new JoseGoogleTokenVerifier(
      clientId,
      createLocalJWKSet({
        keys: [
          { ...(await exportJWK(keys.publicKey)), kid: 'test', alg: 'RS256' },
        ],
      }),
    );
    google = await createGoogleAuthentication(
      models,
      sessionModel,
      secret,
      clientId,
      false,
      verifier,
    );
    register = new RegisterAccount(
      new MongoRegistrationStore(database, models),
      new Argon2PasswordHasher(),
    );
    recovery = await createPasswordRecovery(models.User, sessionModel, secret, {
      send: async (email, token) => {
        sent.push({ email, token });
      },
    });
    change = await createPasswordChange(
      models,
      sessionModel,
      recovery.models.Job,
    );
  }, 240000);
  beforeEach(async () => {
    sent.length = 0;
    for (const collection of Object.values(database.collections))
      await collection.deleteMany({});
    app = createApp(origin, {
      sessions,
      google,
      passwordRecovery: recovery.service,
      passwordChange: change.service,
    });
  });
  afterAll(async () => {
    await database?.close();
    await replica?.stop();
  });
  async function begin(
    subject = 'subject-one',
    email = 'person@gmail.com',
    hd?: string,
  ) {
    const challenge = await request(app)
      .post('/api/v1/auth/google/challenge')
      .set('Origin', origin)
      .send({});
    expect(challenge.status).toBe(200);
    const cookie = (
      challenge.headers['set-cookie'] as unknown as string[]
    )[0]!.split(';')[0]!;
    const nonce = challenge.body.data.nonce as string;
    const credential = await new SignJWT({
      email,
      email_verified: true,
      name: 'Google Person',
      ...(hd ? { hd } : {}),
      nonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer('https://accounts.google.com')
      .setAudience(clientId)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(keys.privateKey);
    return { nonce, cookie, credential };
  }
  function exchange(
    flow: Awaited<ReturnType<typeof begin>>,
    extra: Record<string, unknown> = {},
  ) {
    return request(app)
      .post('/api/v1/auth/google')
      .set('Origin', origin)
      .set('Cookie', flow.cookie)
      .send({ credential: flow.credential, ...extra });
  }
  async function signup() {
    const flow = await begin();
    const result = await exchange(flow, {
      name: 'My Local Name',
      workspaceName: 'My Studio',
    });
    expect(result.status).toBe(200);
    return { flow, result };
  }
  it('reports disabled configuration and keeps password registration usable without Google configuration', async () => {
    const disabled = createApp(origin);
    expect(
      (await request(disabled).get('/api/v1/auth/google/config')).body.data,
    ).toEqual({ enabled: false });
    expect(
      (
        await request(disabled)
          .post('/api/v1/auth/google/challenge')
          .set('Origin', origin)
          .send({})
      ).status,
    ).toBe(503);
    expect(
      (await request(app).get('/api/v1/auth/google/config')).body.data,
    ).toEqual({ enabled: true, clientId });
  });
  it('requires explicit onboarding and makes no account, workspace or session until it is submitted', async () => {
    const flow = await begin();
    expect((await exchange(flow)).body.data).toEqual({
      kind: 'onboarding-required',
      email: 'person@gmail.com',
      name: 'Google Person',
    });
    expect(await models.User.countDocuments()).toBe(0);
    expect(await models.Workspace.countDocuments()).toBe(0);
    expect(await sessionModel.countDocuments()).toBe(0);
    expect(
      (await exchange(flow, { name: 'A', workspaceName: 'B' })).status,
    ).toBe(422);
    expect(await models.User.countDocuments()).toBe(0);
  });
  it('uses Secure Host cookies and independent bounded challenge and exchange budgets', async () => {
    const production = createApp('https://lancelio.example', {
      google: { ...google, secureCookies: true },
    });
    const challenge = await request(production)
      .post('/api/v1/auth/google/challenge')
      .set('Origin', 'https://lancelio.example')
      .send({});
    const cookie = (challenge.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/^__Host-lancelio_google=/u);
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    for (let count = 1; count < 60; count++)
      expect(
        (
          await request(production)
            .post('/api/v1/auth/google/challenge')
            .set('Origin', 'https://lancelio.example')
            .send({})
        ).status,
      ).toBe(200);
    expect(
      (
        await request(production)
          .post('/api/v1/auth/google/challenge')
          .set('Origin', 'https://lancelio.example')
          .send({})
      ).status,
    ).toBe(429);
    for (let count = 0; count < 20; count++)
      expect(
        (
          await request(production)
            .post('/api/v1/auth/google')
            .set('Origin', 'https://lancelio.example')
            .send({ credential: 'invalid-test-token' })
        ).status,
      ).toBe(401);
    expect(
      (
        await request(production)
          .post('/api/v1/auth/google')
          .set('Origin', 'https://lancelio.example')
          .send({ credential: 'invalid-test-token' })
      ).status,
    ).toBe(429);
  });
  it('allows several Google accounts on one network even after repeated page preparations', async () => {
    for (let count = 0; count < 25; count++)
      expect(
        (
          await request(app)
            .post('/api/v1/auth/google/challenge')
            .set('Origin', origin)
            .send({})
        ).status,
      ).toBe(200);
    const identities = new Set<string>();
    const workspaces = new Set<string>();
    for (let count = 0; count < 3; count++) {
      const flow = await begin(`subject-${count}`, `person-${count}@gmail.com`);
      expect((await exchange(flow)).body.data.kind).toBe('onboarding-required');
      const signedIn = await exchange(flow, {
        name: `Person ${count}`,
        workspaceName: `Studio ${count}`,
      });
      expect(signedIn.status).toBe(200);
      identities.add(signedIn.body.data.user.id);
      workspaces.add(signedIn.body.data.workspace.id);
    }
    expect(identities.size).toBe(3);
    expect(workspaces.size).toBe(3);
    expect(await models.User.countDocuments()).toBe(3);
    expect(await sessionModel.countDocuments()).toBe(3);
  });
  it('creates a Google-only account and real session, rotates refresh, logs out and signs in again without duplicating records', async () => {
    const { result } = await signup();
    expect(result.body.data).toMatchObject({
      kind: 'authenticated',
      user: { name: 'My Local Name', email: 'person@gmail.com' },
      workspace: { name: 'My Studio' },
    });
    expect(result.headers['cache-control']).toBe('no-store');
    const cookies = result.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find((value) =>
      value.startsWith('lancelio_refresh='),
    )!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(JSON.stringify(result.body)).not.toMatch(
      /googleSubject|passwordHash|refreshToken/,
    );
    const user = await models.User.findOne()
      .select('+passwordHash +googleSubject')
      .orFail();
    expect(user.passwordHash).toBeNull();
    expect(user.googleSubject).toBe('subject-one');
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .set('Origin', origin)
          .send({ email: user.email, password })
      ).status,
    ).toBe(401);
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${result.body.data.accessToken}`);
    expect(me.status).toBe(200);
    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', cookie.split(';')[0]!)
      .send({});
    expect(refresh.status).toBe(200);
    const rotated = (
      refresh.headers['set-cookie'] as unknown as string[]
    )[0]!.split(';')[0]!;
    expect(
      (
        await request(app)
          .post('/api/v1/auth/logout')
          .set('Origin', origin)
          .set('Cookie', rotated)
          .send({})
      ).status,
    ).toBe(204);
    const returning = await exchange(await begin());
    expect(returning.status).toBe(200);
    expect(returning.body.data.user.id).toBe(user.id);
    expect(await models.User.countDocuments()).toBe(1);
    expect(await models.Workspace.countDocuments()).toBe(1);
    expect(await models.Membership.countDocuments()).toBe(1);
  });
  it('links verified Gmail immediately, preserves local data and retires unverified password access', async () => {
    const local = await register.execute({
      name: 'Original Local Name',
      email: 'person@gmail.com',
      password,
      workspaceName: 'Original Studio',
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: 'person@gmail.com', password });
    expect(login.status).toBe(200);
    const oldHash = (
      await models.User.findOne().select('+passwordHash').orFail()
    ).passwordHash;
    await recovery.service.request('person@gmail.com');
    await recovery.service.deliverNext();
    const oldRecoveryToken = sent[0]!.token;
    const linked = await exchange(await begin(), {
      name: 'Injected Name',
      workspaceName: 'Injected Workspace',
    });
    expect(linked.status).toBe(200);
    expect(linked.body.data.kind).toBe('authenticated');
    expect(linked.body.data.user).toEqual(local.user);
    expect(linked.body.data.workspace).toEqual(local.workspace);
    expect(await models.User.countDocuments()).toBe(1);
    expect(await models.Workspace.countDocuments()).toBe(1);
    const user = await models.User.findOne()
      .select('+passwordHash +passwordLoginNeedsVerification')
      .orFail();
    expect(user.passwordHash).toBe(oldHash);
    expect(user.emailVerified).toBe(true);
    expect(user.passwordLoginNeedsVerification).toBe(true);
    expect(
      (
        await request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      ).status,
    ).toBe(401);
    const oldCookie = (
      login.headers['set-cookie'] as unknown as string[]
    )[0]!.split(';')[0]!;
    expect(
      (
        await request(app)
          .post('/api/v1/auth/refresh')
          .set('Origin', origin)
          .set('Cookie', oldCookie)
          .send({})
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/reset-password')
          .set('Origin', origin)
          .send({
            token: oldRecoveryToken,
            password: 'another secure password value',
          })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .set('Origin', origin)
          .send({ email: 'person@gmail.com', password })
      ).body.error.code,
    ).toBe('PASSWORD_SIGN_IN_CONFIRMATION_REQUIRED');
    expect(
      (
        await request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${linked.body.data.accessToken}`)
      ).status,
    ).toBe(200);
    await expect(
      new MongoSessionStore(models, sessionModel).createSession(
        {
          userId: local.user.id,
          workspaceId: local.workspace.id,
          sessionId: 'stale-password-session',
          refreshTokenHash: 'digest',
          expiresAt: new Date(Date.now() + 60000),
        },
        oldHash!,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(
      await sessionModel.exists({ _id: 'stale-password-session' }),
    ).toBeNull();
    expect((await exchange(await begin())).status).toBe(200);
    expect(
      (
        await models.User.findOne()
          .select('+passwordLoginNeedsVerification')
          .orFail()
      ).passwordLoginNeedsVerification,
    ).toBe(true);
    const newPassword = 'a newly selected secure password';
    const changed = await request(app)
      .post('/api/v1/settings/password')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${linked.body.data.accessToken}`)
      .send({ currentPassword: password, newPassword });
    expect(changed.status).toBe(204);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .set('Origin', origin)
          .send({ email: 'person@gmail.com', password: newPassword })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${linked.body.data.accessToken}`)
      ).status,
    ).toBe(401);
  });
  it('retains password sign-in for an already verified local email after direct Google linking', async () => {
    await register.execute({
      name: 'Verified Person',
      email: 'person@gmail.com',
      password,
      workspaceName: 'Studio',
    });
    await models.User.updateOne({}, { $set: { emailVerified: true } });
    expect((await exchange(await begin())).body.data.kind).toBe(
      'authenticated',
    );
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .set('Origin', origin)
          .send({ email: 'person@gmail.com', password })
      ).status,
    ).toBe(200);
  });
  it('does not silently merge a third-party email that Google is not authoritative for', async () => {
    await register.execute({
      name: 'Local Person',
      email: 'person@example.com',
      password,
      workspaceName: 'Studio',
    });
    const flow = await begin('external-subject', 'person@example.com');
    const rejected = await exchange(flow);
    expect(rejected.status).toBe(422);
    expect(rejected.body.error.code).toBe('GOOGLE_EMAIL_NOT_AUTHORITATIVE');
    expect((await exchange(flow, { linkPassword: password })).status).toBe(422);
    expect(
      (await models.User.findOne().select('+googleSubject').orFail())
        .googleSubject,
    ).toBeNull();
    expect(await sessionModel.countDocuments()).toBe(0);
  });
  it('links an authoritative Workspace identity and restores quarantined password access through fresh email recovery', async () => {
    const local = await register.execute({
      name: 'Workspace Person',
      email: 'person@studio.example',
      password,
      workspaceName: 'Original Studio',
    });
    const linked = await exchange(
      await begin(
        'workspace-subject',
        'person@studio.example',
        'studio.example',
      ),
    );
    expect(linked.status).toBe(200);
    expect(linked.body.data.user.id).toBe(local.user.id);
    await recovery.service.request('person@studio.example');
    expect(await recovery.service.deliverNext()).toBe(true);
    expect(sent).toHaveLength(1);
    const newPassword = 'fresh verified email recovery password';
    expect(
      (
        await request(app)
          .post('/api/v1/auth/reset-password')
          .set('Origin', origin)
          .send({ token: sent[0]!.token, password: newPassword })
      ).status,
    ).toBe(204);
    expect(
      (
        await models.User.findOne()
          .select('+passwordLoginNeedsVerification')
          .orFail()
      ).passwordLoginNeedsVerification,
    ).toBe(false);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .set('Origin', origin)
          .send({ email: 'person@studio.example', password: newPassword })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${linked.body.data.accessToken}`)
      ).status,
    ).toBe(401);
    expect(
      (
        await exchange(
          await begin(
            'workspace-subject',
            'person@studio.example',
            'studio.example',
          ),
        )
      ).status,
    ).toBe(200);
  });
  it('does not deliver recovery jobs requested before an unverified password account is linked', async () => {
    await register.execute({
      name: 'Local Person',
      email: 'person@gmail.com',
      password,
      workspaceName: 'Studio',
    });
    await recovery.service.request('person@gmail.com');
    expect((await exchange(await begin())).status).toBe(200);
    expect(await recovery.service.deliverNext()).toBe(true);
    expect(sent).toHaveLength(0);
  });
  it('uses the immutable Google subject after a Google email change without overwriting local profile', async () => {
    const { result } = await signup();
    const changed = await exchange(
      await begin('subject-one', 'changed@example.com'),
    );
    expect(changed.status).toBe(200);
    expect(changed.body.data.user).toEqual(result.body.data.user);
    expect(await models.User.countDocuments()).toBe(1);
  });
  it('blocks a different Google subject for an already linked email and blocks suspended users', async () => {
    await signup();
    expect((await exchange(await begin('another-subject'))).status).toBe(409);
    await models.User.updateOne({}, { $set: { status: 'suspended' } });
    expect((await exchange(await begin())).status).toBe(401);
    expect(await models.User.countDocuments()).toBe(1);
  });
  it('rejects foreign origins, absent and duplicate nonce cookies, wrong-browser tokens and body injection', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/auth/google/challenge')
          .set('Origin', 'https://evil.example')
          .send({})
      ).status,
    ).toBe(403);
    const flow = await begin();
    const another = await begin();
    expect(
      (
        await request(app)
          .post('/api/v1/auth/google')
          .set('Origin', origin)
          .send({ credential: flow.credential })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/google')
          .set('Origin', origin)
          .set('Cookie', `${flow.cookie}; ${flow.cookie}`)
          .send({ credential: flow.credential })
      ).status,
    ).toBe(401);
    expect((await exchange({ ...flow, cookie: another.cookie })).status).toBe(
      401,
    );
    expect((await exchange(flow, { userId: 'attacker' })).status).toBe(422);
    expect(await models.User.countDocuments()).toBe(0);
  });
  it('consumes each nonce once, including simultaneous attempts, and rejects expired challenges', async () => {
    const flow = await begin();
    const results = await Promise.all([
      exchange(flow, { name: 'Person', workspaceName: 'Studio' }),
      exchange(flow, { name: 'Person', workspaceName: 'Studio' }),
    ]);
    expect(results.filter((value) => value.status === 200)).toHaveLength(1);
    expect((await exchange(flow)).status).toBe(401);
    expect(await models.User.countDocuments()).toBe(1);
    expect(await sessionModel.countDocuments()).toBe(1);
    const expired = await begin();
    await database
      .model('GoogleChallenge')
      .updateOne(
        { _id: createHash('sha256').update(expired.nonce).digest('hex') },
        { $set: { expiresAt: new Date(0) } },
      );
    expect((await exchange(expired)).status).toBe(401);
  });
  it('can set the first password through verified email recovery, revokes old sessions and keeps Google sign-in', async () => {
    const { result } = await signup();
    await recovery.service.request('person@gmail.com');
    expect(await recovery.service.deliverNext()).toBe(true);
    expect(sent).toHaveLength(1);
    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .set('Origin', origin)
      .send({ token: sent[0]!.token, password });
    expect(reset.status).toBe(204);
    expect(
      (
        await request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${result.body.data.accessToken}`)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .set('Origin', origin)
          .send({ email: 'person@gmail.com', password })
      ).status,
    ).toBe(200);
    expect((await exchange(await begin())).status).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/reset-password')
          .set('Origin', origin)
          .send({
            token: sent[0]!.token,
            password: 'another sufficiently long password',
          })
      ).status,
    ).toBe(422);
  });
  it('guides a Google-only user to email recovery without ending their session', async () => {
    const { result } = await signup();
    const response = await request(app)
      .post('/api/v1/settings/password')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${result.body.data.accessToken}`)
      .send({ currentPassword: 'not-a-local-password', newPassword: password });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('PASSWORD_NOT_SET');
    expect(
      (
        await request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${result.body.data.accessToken}`)
      ).status,
    ).toBe(200);
  });
  it('prevents session issuance from a stale password snapshot after a reset', async () => {
    await signup();
    const user = await models.User.findOne().orFail();
    await models.User.updateOne(
      { _id: user._id },
      { $set: { passwordHash: 'new-hash' } },
    );
    await expect(
      new MongoSessionStore(models, sessionModel).createSession(
        {
          userId: user.id,
          workspaceId: (await models.Workspace.findOne().orFail()).id,
          sessionId: 'stale-session',
          refreshTokenHash: 'digest',
          expiresAt: new Date(Date.now() + 60000),
        },
        null,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(await sessionModel.exists({ _id: 'stale-session' })).toBeNull();
  });
});
