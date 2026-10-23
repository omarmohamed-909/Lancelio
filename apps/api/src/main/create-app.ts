import type { PasswordRecovery } from '../modules/auth/application/password-recovery.js';
import type { ChangePassword } from '../modules/auth/application/change-password.js';
import { createPasswordChangeRouter } from '../modules/auth/presentation/password-change.routes.js';
import { createRecoveryRouter } from '../modules/auth/presentation/password-recovery.routes.js';
import type { ManageNotifications } from '../modules/notifications/application/manage-notifications.js';
import { createNotificationRouter } from '../modules/notifications/presentation/notification.routes.js';
import type { ShareClientPortal } from '../modules/portal/application/share-client-portal.js';
import {
  createPortalRouter,
  createPublicPortalRouter,
} from '../modules/portal/presentation/portal.routes.js';
import type { ReadWorkspaceOverview } from '../modules/dashboard/application/read-workspace-overview.js';
import { createDashboardRouter } from '../modules/dashboard/presentation/dashboard.routes.js';
import { createPaymentRouter } from '../modules/payments/presentation/payment.routes.js';
import type { ManagePayments } from '../modules/payments/application/manage-payments.js';
import type { ShareInvoices } from '../modules/invoices/application/share-invoices.js';
import {
  createInvoiceSharingRouter,
  createPublicInvoiceRouter,
} from '../modules/invoices/presentation/invoice-sharing.routes.js';
import type { ManageInvoices } from '../modules/invoices/application/manage-invoices.js';
import { createInvoiceRouter } from '../modules/invoices/presentation/invoice.routes.js';
import type { ManageTasks } from '../modules/tasks/application/manage-tasks.js';
import { createTaskRouter } from '../modules/tasks/presentation/task.routes.js';
import type { DecideProposal } from '../modules/proposals/application/decide-proposal.js';
import { createProposalDecisionRouter } from '../modules/proposals/presentation/proposal-decision.routes.js';
import type { ManageProjects } from '../modules/projects/application/manage-projects.js';
import { createProjectRouter } from '../modules/projects/presentation/project.routes.js';
import type { ShareProposals } from '../modules/proposals/application/share-proposals.js';
import {
  createProposalSharingRouter,
  createPublicProposalRouter,
} from '../modules/proposals/presentation/proposal-sharing.routes.js';
import type { ManageProposals } from '../modules/proposals/application/manage-proposals.js';
import { createProposalRouter } from '../modules/proposals/presentation/proposal.routes.js';
import type { ManageClients } from '../modules/clients/application/manage-clients.js';
import { createClientRouter } from '../modules/clients/presentation/client.routes.js';
import { createAuthenticationMiddleware } from '../modules/auth/presentation/authentication.middleware.js';
import cors from 'cors';
import type { ManageProfile } from '../modules/auth/application/manage-profile.js';
import type { ManageWorkspaceSettings } from '../modules/auth/application/manage-workspace-settings.js';
import { createWorkspaceSettingsRouter } from '../modules/auth/presentation/workspace-settings.routes.js';
import { createProfileRouter } from '../modules/auth/presentation/profile.routes.js';
import express from 'express';
import helmet from 'helmet';
import type { RegisterAccount } from '../modules/auth/application/register-account.js';
import { createRegistrationRouter } from '../modules/auth/presentation/registration.routes.js';
import { createSessionRouter } from '../modules/auth/presentation/session.routes.js';
import { createGoogleAuthRouter } from '../modules/auth/presentation/google-auth.routes.js';
import type { GoogleAuthEndpoints } from '../modules/auth/presentation/google-auth.routes.js';
import type { SessionEndpoints } from '../modules/auth/presentation/session.routes.js';
import { createHealthRouter } from '../modules/health/presentation/health.routes.js';
import { errorHandler } from '../shared/presentation/http/error-handler.js';
import type { SearchWorkspace } from '../modules/search/application/search-workspace.js';
import { createSearchRouter } from '../modules/search/presentation/search.routes.js';
import type { AskAssistant } from '../modules/assistant/application/ask-assistant.js';
import { createAssistantRouter } from '../modules/assistant/presentation/assistant.routes.js';

export function createApp(
  webOrigin: string,
  dependencies: {
    checkReadiness?: () => Promise<boolean>;
    profile?: ManageProfile;
    workspaceSettings?: ManageWorkspaceSettings;
    registerAccount?: RegisterAccount;
    passwordRecovery?: PasswordRecovery;
    passwordChange?: ChangePassword;
    sessions?: SessionEndpoints;
    google?: GoogleAuthEndpoints;
    portal?: ShareClientPortal;
    notifications?: ManageNotifications;
    dashboard?: ReadWorkspaceOverview;
    search?: SearchWorkspace;
    assistant?: AskAssistant;
    clients?: ManageClients;
    proposals?: ManageProposals;
    sharing?: ShareProposals;
    decisions?: DecideProposal;
    projects?: ManageProjects;
    tasks?: ManageTasks;
    payments?: ManagePayments;
    invoices?: ManageInvoices;
    invoiceSharing?: ShareInvoices;
  } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: webOrigin, credentials: true }));
  app.use('/api/v1/public/proposals', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    next();
  });
  app.use('/api/v1/public/invoices', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    next();
  });
  app.use('/api/v1/public/portal', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1/health', createHealthRouter(dependencies.checkReadiness));
  app.use(
    '/api/v1/auth',
    createGoogleAuthRouter(webOrigin, dependencies.google),
  );
  if (dependencies.registerAccount)
    app.use(
      '/api/v1/auth',
      createRegistrationRouter(dependencies.registerAccount),
    );
  if (dependencies.passwordRecovery)
    app.use(
      '/api/v1/auth',
      createRecoveryRouter(dependencies.passwordRecovery, webOrigin),
    );
  if (dependencies.sessions)
    app.use(
      '/api/v1/auth',
      createSessionRouter(dependencies.sessions, webOrigin),
    );
  if (dependencies.passwordChange) {
    if (!dependencies.sessions)
      throw new Error('Password change requires authentication services');
    app.use(
      '/api/v1/settings/password',
      createPasswordChangeRouter(
        dependencies.passwordChange,
        dependencies.sessions,
        webOrigin,
      ),
    );
  }
  if (dependencies.profile) {
    if (!dependencies.sessions)
      throw new Error('Profile settings require authentication services');
    app.use(
      '/api/v1/settings/profile',
      (_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      },
      createAuthenticationMiddleware(dependencies.sessions.authenticate),
      createProfileRouter(dependencies.profile, webOrigin),
    );
  }
  if (dependencies.workspaceSettings) {
    if (!dependencies.sessions)
      throw new Error('Workspace settings require authentication services');
    app.use(
      '/api/v1/settings/workspace',
      (_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      },
      createAuthenticationMiddleware(dependencies.sessions.authenticate),
      createWorkspaceSettingsRouter(dependencies.workspaceSettings, webOrigin),
    );
  }
  if (dependencies.notifications) {
    if (!dependencies.sessions)
      throw new Error('Notifications require authentication services');
    app.use(
      '/api/v1/notifications',
      (_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      },
      createAuthenticationMiddleware(dependencies.sessions.authenticate),
      createNotificationRouter(dependencies.notifications),
    );
  }
  if (dependencies.search) {
    if (!dependencies.sessions)
      throw new Error('Search requires authentication services');
    app.use(
      '/api/v1/search',
      (_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      },
      createAuthenticationMiddleware(dependencies.sessions.authenticate),
      createSearchRouter(dependencies.search),
    );
  }
  if (dependencies.assistant) {
    if (!dependencies.sessions)
      throw new Error('Assistant requires authentication services');
    app.use(
      '/api/v1/assistant',
      (_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      },
      createAuthenticationMiddleware(dependencies.sessions.authenticate),
      createAssistantRouter(dependencies.assistant, webOrigin),
    );
  }
  if (dependencies.dashboard) {
    if (!dependencies.sessions)
      throw new Error('Dashboard requires authentication services');
    app.use(
      '/api/v1/dashboard',
      (_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      },
      createAuthenticationMiddleware(dependencies.sessions.authenticate),
      createDashboardRouter(dependencies.dashboard),
    );
  }
  if (dependencies.portal) {
    if (!dependencies.sessions)
      throw new Error('Portal requires authentication services');
    app.use(
      '/api/v1/clients/:clientId/portal',
      (_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      },
      createAuthenticationMiddleware(dependencies.sessions.authenticate),
      createPortalRouter(dependencies.portal),
    );
    app.use(
      '/api/v1/public/portal',
      createPublicPortalRouter(dependencies.portal),
    );
  }
  if (dependencies.clients) {
    if (!dependencies.sessions)
      throw new Error('Clients require authentication services');
    app.use(
      '/api/v1/clients',
      (_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      },
      createAuthenticationMiddleware(dependencies.sessions.authenticate),
      createClientRouter(dependencies.clients),
    );
  }
  if (dependencies.proposals || dependencies.sharing) {
    if (!dependencies.sessions)
      throw new Error('Proposals require authentication services');
    app.use(
      '/api/v1/proposals',
      (_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      },
      createAuthenticationMiddleware(dependencies.sessions.authenticate),
      ...(dependencies.proposals
        ? [createProposalRouter(dependencies.proposals)]
        : []),
      ...(dependencies.sharing
        ? [createProposalSharingRouter(dependencies.sharing)]
        : []),
    );
  }
  if (dependencies.sharing) {
    app.use(
      '/api/v1/public/proposals',
      createPublicProposalRouter(dependencies.sharing),
    );
  }
  if (dependencies.decisions)
    app.use(
      '/api/v1/public/proposals',
      createProposalDecisionRouter(dependencies.decisions, webOrigin),
    );
  if (dependencies.projects) {
    if (!dependencies.sessions)
      throw new Error('Projects require authentication services');
    app.use(
      '/api/v1/projects',
      (_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      },
      createAuthenticationMiddleware(dependencies.sessions.authenticate),
      createProjectRouter(dependencies.projects),
    );
  }
  if (dependencies.tasks) {
    if (!dependencies.sessions)
      throw new Error('Tasks require authentication services');
    app.use(
      '/api/v1/projects/:projectId/tasks',
      (_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      },
      createAuthenticationMiddleware(dependencies.sessions.authenticate),
      createTaskRouter(dependencies.tasks),
    );
  }
  if (dependencies.payments) {
    if (!dependencies.sessions)
      throw new Error('Payments require authentication services');
    app.use(
      '/api/v1/invoices/:invoiceId/payments',
      (_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      },
      createAuthenticationMiddleware(dependencies.sessions.authenticate),
      createPaymentRouter(dependencies.payments),
    );
  }
  if (dependencies.invoices || dependencies.invoiceSharing) {
    if (!dependencies.sessions)
      throw new Error('Invoices require authentication services');
    app.use(
      '/api/v1/invoices',
      (_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      },
      createAuthenticationMiddleware(dependencies.sessions.authenticate),
      ...(dependencies.invoices
        ? [createInvoiceRouter(dependencies.invoices)]
        : []),
      ...(dependencies.invoiceSharing
        ? [createInvoiceSharingRouter(dependencies.invoiceSharing)]
        : []),
    );
  }
  if (dependencies.invoiceSharing)
    app.use(
      '/api/v1/public/invoices',
      createPublicInvoiceRouter(dependencies.invoiceSharing),
    );
  app.use((_request, response) => {
    response.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Resource not found' },
    });
  });
  app.use(errorHandler);
  return app;
}
