import { createPasswordRecovery } from './create-password-recovery.js';
import { createPasswordChange } from './create-password-change.js';
import { ResendRecoveryMailer } from '../modules/auth/infrastructure/resend-recovery-mailer.js';
import { createNotifications } from './create-notifications.js';
import { createNotificationStateModel } from '../modules/notifications/infrastructure/notification-state-model.js';
import { createPortal } from './create-portal.js';
import { createClientAccess } from './create-client-access.js';
import { createClientAccessModel } from '../modules/portal/infrastructure/client-access-model.js';
import { ResendClientInvitation } from '../modules/portal/infrastructure/resend-client-invitation.js';
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
import { createClients } from './create-clients.js';
import { createClientModel } from '../modules/clients/infrastructure/client-model.js';
import { createApp } from './create-app.js';
import { readEnvironment, assistantConfiguration } from './config.js';
import { checkDatabaseReadiness, connectDatabase } from './database.js';
import { createAuthentication } from './create-authentication.js';
import { createGoogleAuthentication } from './create-google-authentication.js';
import { WelcomeEmail } from '../modules/auth/application/welcome-email.js';
import { MongoWelcomeStore } from '../modules/auth/infrastructure/mongo-welcome-store.js';
import { ResendWelcomeMailer } from '../modules/auth/infrastructure/resend-welcome-mailer.js';
import { createProfile } from './create-profile.js';
import { createWorkspaceSettings } from './create-workspace-settings.js';
import { createSessionModel } from '../modules/auth/infrastructure/session-model.js';
import {
  createRegistrationModels,
  initializeRegistrationModels,
} from '../modules/auth/infrastructure/registration-models.js';

export async function createApiRuntime(
  environmentVariables: NodeJS.ProcessEnv = process.env,
) {
  const environment = readEnvironment(environmentVariables);
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
      undefined,
      environment.WELCOME_EMAIL_ENABLED,
    );
    const welcome = new WelcomeEmail(
      new MongoWelcomeStore(models.User),
      environment.WELCOME_EMAIL_ENABLED
        ? new ResendWelcomeMailer(
            environment.RESEND_API_KEY!,
            environment.EMAIL_FROM!,
            environment.WEB_ORIGIN,
          )
        : null,
      { now: () => new Date() },
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
    const registerAccount = sessions.register;
    const clientModel = createClientModel(database);
    await clientModel.createCollection();
    await clientModel.createIndexes();
    const clients = createClients(clientModel);
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
    const clientAccessModel = createClientAccessModel(database);
    await clientAccessModel.createCollection();
    await clientAccessModel.createIndexes();
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
    const app = createApp(environment.WEB_ORIGIN, {
      ...(environment.GOOGLE_CLIENT_ID
        ? {
            google: await createGoogleAuthentication(
              models,
              sessionModel,
              environment.JWT_ACCESS_SECRET,
              environment.GOOGLE_CLIENT_ID,
              environment.NODE_ENV === 'production',
              undefined,
              environment.WELCOME_EMAIL_ENABLED,
            ),
          }
        : {}),
      assistant,
      clientAccess: createClientAccess(
        database,
        clientAccessModel,
        portalModel,
        {
          clients: clientModel.collection.name,
          users: models.User.collection.name,
          workspaces: models.Workspace.collection.name,
          projects: projectModel.collection.name,
          invoices: invoiceModels.Invoice.collection.name,
          tasks: taskBoardModel.collection.name,
          payments: paymentModel.collection.name,
        },
        environment.WELCOME_EMAIL_ENABLED
          ? new ResendClientInvitation(
              environment.RESEND_API_KEY!,
              environment.EMAIL_FROM!,
              environment.WEB_ORIGIN,
            )
          : null,
      ),
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
    });
    return {
      app,
      database,
      recovery: recovery.service,
      welcome,
      environment,
      ...(environment.WELCOME_EMAIL_ENABLED
        ? {
            afterResponse: async () => {
              await welcome.deliverNext();
            },
          }
        : {}),
      mailQueue: {
        deliverNext: async () => {
          const recovered = await recovery.service.deliverNext();
          const welcomed = await welcome.deliverNext();
          return recovered || welcomed;
        },
      },
    };
  } catch (error: unknown) {
    await database.close();
    throw error;
  }
}
