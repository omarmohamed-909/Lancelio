import { createPasswordRecovery } from './create-password-recovery.js';
import { createPasswordChange } from './create-password-change.js';
import { ResendRecoveryMailer } from '../modules/auth/infrastructure/resend-recovery-mailer.js';
import { createNotifications } from './create-notifications.js';
import { createNotificationStateModel } from '../modules/notifications/infrastructure/notification-state-model.js';
import { createPortal } from './create-portal.js';
import { createPortalModel } from '../modules/portal/infrastructure/portal-model.js';
import { createDashboard } from './create-dashboard.js';
import { createSearch } from './create-search.js';
import { createAssistant } from './create-assistant.js';
import { createPayments } from './create-payments.js';
import { createPaymentLedgerModel } from '../modules/payments/infrastructure/payment-ledger-model.js';
import { createInvoiceSharing } from './create-invoice-sharing.js';
import { createInvoices } from './create-invoices.js';
import {
  createInvoiceModels,
  initializeInvoiceModels,
} from '../modules/invoices/infrastructure/invoice-model.js';
import { createTasks } from './create-tasks.js';
import { createTaskBoardModel } from '../modules/tasks/infrastructure/task-board-model.js';
import { createProposalDecisions } from './create-proposal-decisions.js';
import { createProjectModel } from '../modules/projects/infrastructure/project-model.js';
import { createProjects } from './create-projects.js';
import { initializeProjectModel } from '../modules/projects/infrastructure/project-model.js';
import { createProposalSharing } from './create-proposal-sharing.js';
import { createProposals } from './create-proposals.js';
import { createProposalModel } from '../modules/proposals/infrastructure/proposal-model.js';
import { ManageClients } from '../modules/clients/application/manage-clients.js';
import { createClientModel } from '../modules/clients/infrastructure/client-model.js';
import { MongoClientStore } from '../modules/clients/infrastructure/mongo-client-store.js';
import { createApp } from './create-app.js';
import {
  EnvironmentConfigurationError,
  readEnvironment,
  assistantConfiguration,
} from './config.js';
import { checkDatabaseReadiness, connectDatabase } from './database.js';
import { createAuthentication } from './create-authentication.js';
import { createProfile } from './create-profile.js';
import { createWorkspaceSettings } from './create-workspace-settings.js';
import { createSessionModel } from '../modules/auth/infrastructure/session-model.js';
import { RegisterAccount } from '../modules/auth/application/register-account.js';
import { Argon2PasswordHasher } from '../modules/auth/infrastructure/argon2-password-hasher.js';
import { MongoRegistrationStore } from '../modules/auth/infrastructure/mongo-registration-store.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../modules/auth/infrastructure/registration-models.js';

async function bootstrap() {
  const environment = readEnvironment(process.env);
  const database = await connectDatabase(environment.MONGODB_URI);
  try {
    const models = createRegistrationModels(database);
    await initializeRegistrationModels(models);
    const sessionModel = createSessionModel(database);
    await sessionModel.createCollection();
    await sessionModel.createIndexes();
    const sessions = await createAuthentication(
      models,
      sessionModel,
      environment.JWT_ACCESS_SECRET,
      environment.NODE_ENV === 'production',
    );
    const recovery = await createPasswordRecovery(
      models.User,
      sessionModel,
      environment.JWT_ACCESS_SECRET,
      environment.EMAIL_PROVIDER === 'resend'
        ? new ResendRecoveryMailer(
            environment.RESEND_API_KEY!,
            environment.EMAIL_FROM!,
            environment.WEB_ORIGIN,
          )
        : null,
    );
    const registerAccount = new RegisterAccount(
      new MongoRegistrationStore(database, models),
      new Argon2PasswordHasher(),
    );
    const clientModel = createClientModel(database);
    await clientModel.createCollection();
    await clientModel.createIndexes();
    const clients = new ManageClients(new MongoClientStore(clientModel));
    const proposalModel = createProposalModel(database);
    await proposalModel.createCollection();
    await proposalModel.createIndexes();
    const proposals = createProposals(database, proposalModel, clientModel);
    const projectModel = createProjectModel(database);
    await initializeProjectModel(projectModel);
    const invoiceModels = createInvoiceModels(database);
    await initializeInvoiceModels(invoiceModels);
    const paymentModel = createPaymentLedgerModel(database);
    await paymentModel.createCollection();
    await paymentModel.createIndexes();
    const taskBoardModel = createTaskBoardModel(database);
    await taskBoardModel.createCollection();
    await taskBoardModel.createIndexes();
    const portalModel = createPortalModel(database);
    await portalModel.createCollection();
    await portalModel.createIndexes();
    const notificationStates = createNotificationStateModel(database);
    await notificationStates.createCollection();
    await notificationStates.createIndexes();
    await proposalModel.collection.createIndex({
      workspace: 1,
      'decision.at': -1,
    });
    await invoiceModels.Invoice.collection.createIndex({
      workspace: 1,
      issuedAt: -1,
    });
    const search = createSearch(database, {
      clients: clientModel.collection.name,
      projects: projectModel.collection.name,
      proposals: proposalModel.collection.name,
      invoices: invoiceModels.Invoice.collection.name,
    });
    const dashboard = createDashboard(database, {
      clients: clientModel.collection.name,
      proposals: proposalModel.collection.name,
      projects: projectModel.collection.name,
      tasks: taskBoardModel.collection.name,
      invoices: invoiceModels.Invoice.collection.name,
      payments: paymentModel.collection.name,
    });
    const assistant = createAssistant(
      database,
      {
        projects: projectModel.collection.name,
        invoices: invoiceModels.Invoice.collection.name,
        payments: paymentModel.collection.name,
      },
      dashboard,
      search,
      assistantConfiguration(environment),
    );
    const server = createApp(environment.WEB_ORIGIN, {
      assistant,
      passwordChange: (
        await createPasswordChange(models, sessionModel, recovery.models.Job)
      ).service,
      checkReadiness: () => checkDatabaseReadiness(database),
      profile: createProfile(models.User),
      workspaceSettings: createWorkspaceSettings(models),
      notifications: createNotifications(database, notificationStates, {
        proposals: proposalModel.collection.name,
        invoices: invoiceModels.Invoice.collection.name,
        payments: paymentModel.collection.name,
      }),
      payments: createPayments(paymentModel, invoiceModels.Invoice),
      search,
      dashboard,
      portal: createPortal(database, portalModel, {
        clients: clientModel.collection.name,
        workspaces: models.Workspace.collection.name,
        projects: projectModel.collection.name,
        invoices: invoiceModels.Invoice.collection.name,
        tasks: taskBoardModel.collection.name,
        payments: paymentModel.collection.name,
      }),
      clients,
      invoiceSharing: createInvoiceSharing(invoiceModels),
      invoices: createInvoices(
        database,
        invoiceModels,
        clientModel,
        projectModel,
      ),
      tasks: createTasks(database, taskBoardModel, projectModel),
      proposals,
      sharing: createProposalSharing(proposalModel),
      decisions: createProposalDecisions(database, proposalModel, projectModel),
      projects: createProjects(database, projectModel, clientModel),
      registerAccount,
      passwordRecovery: recovery.service,
      sessions,
    }).listen(environment.PORT, () => {
      console.info(`Lancelio API listening on port ${environment.PORT}`);
    });

    server.once('error', () => {
      console.error('API could not listen. Check the configured port.');
      void database.close().finally(() => process.exit(1));
    });

    let delivering = false;
    const deliveryTimer = setInterval(() => {
      if (delivering) return;
      delivering = true;
      void recovery.service
        .deliverNext()
        .catch(() => {
          console.error('Recovery queue processing failed; it will retry.');
        })
        .finally(() => {
          delivering = false;
        });
    }, 2_000);
    deliveryTimer.unref();
    let shuttingDown = false;
    function shutdown() {
      if (shuttingDown) return;
      shuttingDown = true;
      clearInterval(deliveryTimer);
      const timeout = setTimeout(() => process.exit(1), 10_000);
      timeout.unref();
      server.close((error) => {
        void database
          .close()
          .then(() => {
            clearTimeout(timeout);
            process.exit(error ? 1 : 0);
          })
          .catch(() => process.exit(1));
      });
    }

    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  } catch (error: unknown) {
    await database.close();
    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  console.error(
    error instanceof EnvironmentConfigurationError
      ? error.message
      : 'API startup failed. Check MongoDB connectivity, transaction support, and collection/index permissions.',
  );
  process.exitCode = 1;
});
