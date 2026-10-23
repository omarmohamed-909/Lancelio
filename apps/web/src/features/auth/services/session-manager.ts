import { ApiError, authApi, errorMessage } from './auth-api';
import type {
  Credentials,
  Identity,
  LoginData,
  RegistrationData,
  GoogleSignInData,
} from './auth-api';

export type SessionSnapshot =
  | { status: 'loading' }
  | {
      status: 'anonymous';
      notice?: 'password-changed' | 'password-change-unconfirmed';
    }
  | { status: 'unavailable'; message: string }
  | { status: 'authenticated'; identity: Identity };
const serverSnapshot: SessionSnapshot = { status: 'loading' };

export class SessionManager {
  private snapshot: SessionSnapshot = serverSnapshot;
  private readonly listeners = new Set<() => void>();
  private accessToken: string | null = null;
  private generation = 0;
  private identityRead = 0;
  private started = false;
  private refreshing: Promise<void> | null = null;
  private channel: BroadcastChannel | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => serverSnapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(snapshot: SessionSnapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
  private clear() {
    this.accessToken = null;
    clearTimeout(this.timer);
  }
  private anonymous(
    broadcast = false,
    notice?: 'password-changed' | 'password-change-unconfirmed',
  ) {
    this.generation++;
    this.clear();
    this.publish({ status: 'anonymous', ...(notice ? { notice } : {}) });
    if (broadcast) this.channel?.postMessage('signed-out');
  }

  connect() {
    if (!('BroadcastChannel' in window) || !navigator.locks) {
      this.publish({
        status: 'unavailable',
        message: errorMessage(new ApiError(0, 'UNSUPPORTED_BROWSER')),
      });
      return () => undefined;
    }
    this.channel = new BroadcastChannel('lancelio-session');
    this.channel.onmessage = (event: MessageEvent<unknown>) => {
      if (
        event.data === 'password-changed' ||
        event.data === 'password-change-unconfirmed'
      )
        this.anonymous(false, event.data);
      else if (event.data === 'signed-in' || event.data === 'signed-out')
        void this.synchronize();
      else if (event.data === 'identity-changed')
        void this.reloadIdentity().catch(() => undefined);
    };
    const resume = () => {
      if (
        document.visibilityState === 'visible' &&
        this.snapshot.status === 'authenticated'
      ) {
        void this.reloadIdentity().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', resume);
    if (!this.started) {
      this.started = true;
      void this.restore();
    }
    return () => {
      document.removeEventListener('visibilitychange', resume);
      this.channel?.close();
      this.channel = null;
      clearTimeout(this.timer);
    };
  }

  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (!navigator.locks)
      return Promise.reject(new ApiError(0, 'UNSUPPORTED_BROWSER'));
    return navigator.locks.request('lancelio-auth-mutation', action);
  }

  private async synchronize() {
    await this.exclusive(async () => {
      const generation = ++this.generation;
      this.clear();
      this.publish({ status: 'loading' });
      try {
        this.accept(await authApi.refresh(), generation);
      } catch (error: unknown) {
        if (generation !== this.generation) return;
        if (error instanceof ApiError && error.status === 401) this.anonymous();
        else
          this.publish({ status: 'unavailable', message: errorMessage(error) });
      }
    }).catch(() => undefined);
  }

  private accept(
    credentials: Credentials,
    generation: number,
    identityRead = this.identityRead,
  ) {
    if (generation !== this.generation) return;
    this.accessToken = credentials.accessToken;
    const identity = {
      user:
        identityRead !== this.identityRead &&
        this.snapshot.status === 'authenticated' &&
        this.snapshot.identity.user.id === credentials.user.id
          ? this.snapshot.identity.user
          : credentials.user,
      workspace:
        identityRead !== this.identityRead &&
        this.snapshot.status === 'authenticated' &&
        this.snapshot.identity.user.id === credentials.user.id &&
        this.snapshot.identity.workspace.id === credentials.workspace.id
          ? this.snapshot.identity.workspace
          : credentials.workspace,
      membership:
        identityRead !== this.identityRead &&
        this.snapshot.status === 'authenticated' &&
        this.snapshot.identity.user.id === credentials.user.id &&
        this.snapshot.identity.workspace.id === credentials.workspace.id
          ? this.snapshot.identity.membership
          : credentials.membership,
    };
    this.publish({ status: 'authenticated', identity });
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        void this.restore();
      },
      Math.max(1000, (credentials.expiresIn - 30) * 1000),
    );
  }

  private refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    const identityRead = this.identityRead;
    this.refreshing = this.exclusive(async () => {
      if (generation !== this.generation) return;
      this.accept(await authApi.refresh(), generation, identityRead);
    }).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async restore(): Promise<void> {
    const generation = this.generation;
    const hadIdentity = this.snapshot.status === 'authenticated';
    try {
      await this.refresh();
    } catch (error: unknown) {
      if (generation !== this.generation) return;
      this.clear();
      if (error instanceof ApiError && error.status === 401)
        this.anonymous(hadIdentity);
      else
        this.publish({ status: 'unavailable', message: errorMessage(error) });
    }
  }

  async login(input: LoginData) {
    await this.exclusive(async () => {
      const generation = ++this.generation;
      this.accept(await authApi.login(input), generation);
      this.channel?.postMessage('signed-in');
    });
  }

  async googleSignIn(input: GoogleSignInData) {
    return this.exclusive(async () => {
      const generation = ++this.generation;
      const result = await authApi.googleSignIn(input);
      if (result.kind === 'authenticated') {
        this.accept(result, generation);
        this.channel?.postMessage('signed-in');
        return { kind: 'authenticated' as const };
      }
      return result;
    });
  }

  async register(input: RegistrationData) {
    await this.exclusive(async () => {
      const generation = ++this.generation;
      await authApi.register(input);
      try {
        this.accept(
          await authApi.login({ email: input.email, password: input.password }),
          generation,
        );
      } catch {
        throw new ApiError(0, 'ACCOUNT_CREATED');
      }
      this.channel?.postMessage('signed-in');
    });
  }

  async logout() {
    await this.exclusive(async () => {
      await authApi.logout();
      this.anonymous(true);
    });
  }

  async changePassword(input: {
    currentPassword: string;
    newPassword: string;
  }) {
    const generation = this.generation;
    await this.exclusive(async () => {
      if (generation !== this.generation || !this.accessToken)
        throw new ApiError(401, 'UNAUTHENTICATED');
      try {
        // Credential changes are single attempts; a 401 must never refresh and replay them.
        await authApi.changePassword(this.accessToken, input);
      } catch (error: unknown) {
        if (generation === this.generation) {
          if (error instanceof ApiError && error.status === 401)
            this.anonymous(true);
          else if (
            !(error instanceof ApiError) ||
            error.status === 0 ||
            error.status >= 500
          ) {
            this.anonymous(false, 'password-change-unconfirmed');
            this.channel?.postMessage('password-change-unconfirmed');
          }
        }
        throw error;
      }
      if (generation === this.generation) {
        this.anonymous(false, 'password-changed');
        this.channel?.postMessage('password-changed');
      }
    });
  }

  async authorized<T>(operation: (token: string) => Promise<T>): Promise<T> {
    const generation = this.generation;
    if (!this.accessToken) throw new ApiError(401, 'UNAUTHENTICATED');
    let result: T;
    try {
      result = await operation(this.accessToken);
    } catch (error: unknown) {
      if (
        !(error instanceof ApiError) ||
        error.status !== 401 ||
        generation !== this.generation
      )
        throw error;
      try {
        await this.refresh();
      } catch (refreshError: unknown) {
        if (
          refreshError instanceof ApiError &&
          refreshError.status === 401 &&
          generation === this.generation
        )
          this.anonymous(true);
        else if (generation === this.generation) {
          this.clear();
          this.publish({
            status: 'unavailable',
            message: errorMessage(refreshError),
          });
        }
        throw refreshError;
      }
      if (!this.accessToken || generation !== this.generation)
        throw new ApiError(401, 'UNAUTHENTICATED');
      try {
        result = await operation(this.accessToken);
      } catch (retryError: unknown) {
        if (
          retryError instanceof ApiError &&
          retryError.status === 401 &&
          generation === this.generation
        )
          this.anonymous(true);
        throw retryError;
      }
    }
    if (generation !== this.generation)
      throw new ApiError(401, 'UNAUTHENTICATED');
    return result;
  }
  async reloadIdentity() {
    const generation = this.generation;
    const read = ++this.identityRead;
    const identity = await this.authorized((token) => authApi.me(token));
    if (generation === this.generation && read === this.identityRead)
      this.publish({ status: 'authenticated', identity });
  }

  updateProfileIdentity(
    profile: { id: string; name: string; email: string },
    broadcast = true,
    expectedRead?: number,
  ) {
    if (
      this.snapshot.status !== 'authenticated' ||
      this.snapshot.identity.user.id !== profile.id
    )
      return;
    if (expectedRead !== undefined && expectedRead !== this.identityRead) {
      if (broadcast) this.channel?.postMessage('identity-changed');
      void this.reloadIdentity().catch(() => undefined);
      return;
    }
    ++this.identityRead;
    this.publish({
      status: 'authenticated',
      identity: {
        ...this.snapshot.identity,
        user: { id: profile.id, name: profile.name, email: profile.email },
      },
    });
    if (broadcast) this.channel?.postMessage('identity-changed');
  }
  getIdentityRevision = () => this.identityRead;
  updateWorkspaceIdentity(
    workspace: {
      id: string;
      name: string;
      slug: string;
      role: Identity['membership']['role'];
    },
    userId: string,
    broadcast = true,
    expectedRead?: number,
  ) {
    if (
      this.snapshot.status !== 'authenticated' ||
      this.snapshot.identity.user.id !== userId ||
      this.snapshot.identity.workspace.id !== workspace.id
    )
      return;
    if (expectedRead !== undefined && expectedRead !== this.identityRead) {
      if (broadcast) this.channel?.postMessage('identity-changed');
      void this.reloadIdentity().catch(() => undefined);
      return;
    }
    ++this.identityRead;
    this.publish({
      status: 'authenticated',
      identity: {
        ...this.snapshot.identity,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
        },
        membership: {
          ...this.snapshot.identity.membership,
          role: workspace.role,
        },
      },
    });
    if (broadcast) this.channel?.postMessage('identity-changed');
  }
}
