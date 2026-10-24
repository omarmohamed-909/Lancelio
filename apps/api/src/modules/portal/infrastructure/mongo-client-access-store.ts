import { Types, mongo } from 'mongoose';
import type { Connection } from 'mongoose';
import { ApplicationError } from '../../../shared/domain/application-error.js';
import type { ClientAccessStore } from '../application/ports/client-access-store.js';
import type { ClientAccess } from '../domain/client-access.js';
import type { PortalCursors } from '../domain/client-portal.js';
import type { ClientAccessModel } from './client-access-model.js';
import type { MongoPortalStore } from './mongo-portal-store.js';
type Row = {
  _id: Types.ObjectId;
  workspace: Types.ObjectId;
  client: Types.ObjectId;
  email: string;
  version: number;
  state: 'pending' | 'accepted' | 'declined' | 'revoked';
  user?: Types.ObjectId | null;
  digest?: string | null;
  expiresAt: Date;
};
export interface AccessCollections {
  users: string;
  clients: string;
  workspaces: string;
}
const unavailable = () =>
  new ApplicationError(
    'CLIENT_INVITATION_UNAVAILABLE',
    'Invitation unavailable',
  );
const conflict = () =>
  new ApplicationError(
    'PORTAL_CONFLICT',
    'Invitation changed; refresh before continuing',
  );
const normalized = (email: string) => email.trim().toLowerCase();
export class MongoClientAccessStore implements ClientAccessStore {
  constructor(
    private readonly db: Connection,
    private readonly model: ClientAccessModel,
    private readonly names: AccessCollections,
    private readonly portal: MongoPortalStore,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private async user(id: string, session?: mongo.ClientSession) {
    const user = await this.db
      .collection<{ email: string; emailVerified: boolean; status: string }>(
        this.names.users,
      )
      .findOne(
        { _id: new Types.ObjectId(id), status: 'active' },
        {
          projection: { email: 1, emailVerified: 1 },
          ...(session ? { session } : {}),
        },
      );
    if (!user) throw unavailable();
    return user;
  }
  private async client(
    workspaceId: string,
    clientId: string,
    session?: mongo.ClientSession,
  ) {
    return this.db
      .collection<{ name: string; email: string; archivedAt?: Date | null }>(
        this.names.clients,
      )
      .findOne(
        {
          _id: new Types.ObjectId(clientId),
          workspace: new Types.ObjectId(workspaceId),
          archivedAt: null,
        },
        { projection: { name: 1, email: 1 }, ...(session ? { session } : {}) },
      );
  }
  private async summary(
    row: Row,
    session?: mongo.ClientSession,
  ): Promise<ClientAccess | null> {
    const client = await this.client(
      String(row.workspace),
      String(row.client),
      session,
    );
    if (!client || normalized(client.email) !== row.email) return null;
    const workspace = await this.db
      .collection<{ name: string }>(this.names.workspaces)
      .findOne(
        { _id: row.workspace },
        { projection: { name: 1 }, ...(session ? { session } : {}) },
      );
    if (!workspace) return null;
    return {
      id: String(row._id),
      version: row.version,
      email: row.email,
      workspaceName: workspace.name,
      clientName: client.name,
      expiresAt: row.expiresAt,
      state:
        row.state === 'pending' && row.expiresAt <= this.now()
          ? 'expired'
          : row.state,
    };
  }
  async owner(workspace: string, clientId: string) {
    const client = await this.client(workspace, clientId);
    if (!client)
      throw new ApplicationError('CLIENT_ARCHIVED', 'Client unavailable');
    const row = await this.model
      .findOne({ workspace, client: clientId })
      .lean();
    // Retain the revision even if a changed client email invalidates its old access.
    const access = row ? await this.summary(row) : null;
    return { email: client.email, access, version: row?.version ?? 0 };
  }
  async issue(
    workspace: string,
    clientId: string,
    version: number,
    digest: string,
    expiresAt: Date,
    expectedEmail: string,
  ) {
    const session = await this.db.startSession();
    try {
      return await session.withTransaction(async () => {
        // Fence edits/archiving of the client against invitation issuance.
        const client = await this.db
          .collection<{ name: string; email: string }>(this.names.clients)
          .findOneAndUpdate(
            {
              _id: new Types.ObjectId(clientId),
              workspace: new Types.ObjectId(workspace),
              archivedAt: null,
            },
            { $inc: { referenceRevision: 1 } },
            { returnDocument: 'after', session },
          );
        if (!client)
          throw new ApplicationError('CLIENT_ARCHIVED', 'Client unavailable');
        const email = normalized(client.email);
        if (email !== expectedEmail) throw conflict();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 254)
          throw new ApplicationError(
            'VALIDATION_ERROR',
            'Add a valid client email first',
          );
        const data = {
          email,
          digest,
          expiresAt,
          state: 'pending' as const,
          user: null,
        };
        let row;
        if (version === 0) {
          const rows = await this.model.create(
            [{ workspace, client: clientId, version: 1, ...data }],
            { session },
          );
          row = rows[0]!.toObject();
        } else
          row = await this.model
            .findOneAndUpdate(
              { workspace, client: clientId, version },
              { $set: data, $inc: { version: 1 } },
              { returnDocument: 'after', session, runValidators: true },
            )
            .lean();
        if (!row) throw conflict();
        const summary = await this.summary(row, session);
        if (!summary) throw unavailable();
        return summary;
      });
    } catch (error) {
      if (error instanceof mongo.MongoServerError && error.code === 11000)
        throw conflict();
      throw error;
    } finally {
      await session.endSession();
    }
  }
  async revoke(workspace: string, client: string, version: number) {
    const result = await this.model.updateOne(
      { workspace, client, version },
      {
        $set: { state: 'revoked', digest: null, user: null },
        $inc: { version: 1 },
      },
    );
    if (!result.modifiedCount) throw conflict();
  }
  async list(userId: string, after: string | null) {
    const user = await this.user(userId);
    const rows = await this.model
      .find({
        email: user.email,
        ...(after ? { _id: { $lt: new Types.ObjectId(after) } } : {}),
        $or: [
          { user: userId, state: 'accepted' },
          ...(user.emailVerified
            ? [{ state: 'pending' as const, expiresAt: { $gt: this.now() } }]
            : []),
        ],
      })
      .sort({ _id: -1 })
      .limit(101)
      .lean();
    const items: ClientAccess[] = [];
    for (const row of rows.slice(0, 100)) {
      const item = await this.summary(row);
      if (item) items.push(item);
    }
    return {
      verificationRequired: !user.emailVerified,
      items,
      hasMore: rows.length > 100,
      nextCursor: rows.length > 100 ? String(rows[99]!._id) : null,
    };
  }
  async resolve(userId: string, digest: string) {
    const user = await this.user(userId);
    const row = await this.model
      .findOne({
        email: user.email,
        digest,
        state: 'pending',
        expiresAt: { $gt: this.now() },
      })
      .lean();
    const summary = row ? await this.summary(row) : null;
    if (!summary) throw unavailable();
    return summary;
  }
  async decide(
    userId: string,
    id: string,
    version: number,
    accept: boolean,
    digest: string | null,
  ) {
    const session = await this.db.startSession();
    try {
      await session.withTransaction(async () => {
        const user = await this.user(userId, session);
        if (!user.emailVerified && !digest)
          throw new ApplicationError(
            'CLIENT_EMAIL_VERIFICATION_REQUIRED',
            'Use the invitation link or verify email with Google',
          );
        const row = await this.model
          .findOne({
            _id: id,
            email: user.email,
            version,
            state: 'pending',
            expiresAt: { $gt: this.now() },
            ...(digest ? { digest } : {}),
          })
          .session(session)
          .lean();
        if (!row || !(await this.summary(row, session))) throw unavailable();
        const result = await this.model.updateOne(
          { _id: id, version, state: 'pending' },
          {
            $set: {
              state: accept ? 'accepted' : 'declined',
              user: accept ? userId : null,
              digest: null,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (!result.modifiedCount) throw conflict();
      });
    } finally {
      await session.endSession();
    }
  }
  async leave(userId: string, id: string, version: number) {
    const user = await this.user(userId);
    const result = await this.model.updateOne(
      { _id: id, email: user.email, user: userId, version, state: 'accepted' },
      {
        $set: { state: 'declined', user: null, digest: null },
        $inc: { version: 1 },
      },
    );
    if (!result.modifiedCount) throw unavailable();
  }
  async page(userId: string, id: string, cursors: PortalCursors) {
    const session = await this.db.startSession();
    try {
      return await session.withTransaction(
        async () => {
          const user = await this.user(userId, session);
          const row = await this.model
            .findOne({
              _id: id,
              user: userId,
              email: user.email,
              state: 'accepted',
            })
            .session(session)
            .lean();
          if (!row || !(await this.summary(row, session))) throw unavailable();
          const page = await this.portal.readForAccount(
            String(row.workspace),
            String(row.client),
            this.now(),
            cursors,
            session,
          );
          if (!page) throw unavailable();
          return page;
        },
        { readConcern: { level: 'snapshot' }, readPreference: 'primary' },
      );
    } finally {
      await session.endSession();
    }
  }
}
