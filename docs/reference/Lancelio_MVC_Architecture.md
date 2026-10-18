# Lancelio

> **Freelancer Management SaaS**  
> **Tagline:** Run your freelance business from one place.

---

## 1. Project Identity

- **Working name:** Lancelio
- **Product type:** Multi-tenant SaaS
- **Audience:** Freelancers, independent consultants, and small agencies
- **Core idea:** Manage the full client lifecycle—from proposal to payment—from one workspace.

> Before a commercial launch or domain purchase, perform a formal domain and trademark availability check.

---

## 2. Product Vision

Freelancers often use separate tools for messaging, task management, files, proposals, invoices, payments, and analytics. Lancelio brings the core workflow into one product.

```text
Client
  ↓
Proposal
  ↓ accepted
Project
  ↓
Tasks / Files / Messages
  ↓
Invoice
  ↓
Payment
  ↓
Analytics
```

### Product statement

> **Lancelio is a multi-tenant SaaS platform that helps freelancers manage the complete client lifecycle—from proposals and projects to invoices and payments—in one workspace.**

---

## 3. Roles

### Freelancer

Can manage:

- Workspace
- Clients
- Proposals
- Projects
- Tasks
- Invoices
- Notifications
- Dashboard analytics
- Client portal access

### Client

Can access only information intentionally shared with them:

- Proposal
- Project progress
- Client-visible tasks
- Invoice
- Shared files
- Messages

### Platform Admin

Future role for:

- User management
- Subscription management
- Account suspension
- Platform metrics
- Support/moderation

Admin functionality is **not required for MVP**.

---

## 4. MVP Scope

The MVP must prove the complete business workflow without unnecessary scope.

### MVP modules

1. Authentication
2. Workspace
3. Clients
4. Proposals
5. Projects
6. Tasks
7. Invoices
8. Dashboard
9. Client Portal
10. Basic Notifications

### MVP flow

```text
Register
   ↓
Workspace Created
   ↓
Add Client
   ↓
Create Proposal
   ↓
Share Proposal
   ↓
Client Accepts
   ↓
Project Created Automatically
   ↓
Create / Manage Tasks
   ↓
Create Invoice
   ↓
Track Payment Status
   ↓
Dashboard Analytics
```

---

## 5. Post-MVP Roadmap

### Phase 2

- Stripe payments
- Invoice PDF generation
- File uploads
- Email notifications
- Real-time chat
- Socket.IO notifications
- OAuth
- Email verification
- Forgot/reset password
- Project milestones

### Phase 3

- SaaS subscriptions
- Free / Pro / Agency plans
- Team members
- Workspace invitations
- Advanced analytics
- Custom branding
- Activity logs
- Contracts
- E-signatures
- Time tracking
- Recurring invoices

### Optional future features

- AI proposal assistant
- AI scope generator
- Revenue forecasting
- Automated reminders
- Public freelancer profile
- Custom domains

---

## 6. Tech Stack

### Frontend

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
TanStack Query
React Hook Form
Zod
Axios
```

### Backend

```text
Node.js
Express.js
TypeScript
MongoDB
Mongoose
Zod
JWT
bcrypt
```

### Later integrations

```text
Redis
Socket.IO
Stripe
Cloudinary / S3
Resend
BullMQ
```

### Deployment

```text
Web       → Vercel
API       → Railway / Render / Fly.io
Database  → MongoDB Atlas
Redis     → Upstash / Redis Cloud
Storage   → Cloudinary / S3
```

---

## 7. System Architecture

```text
                    ┌──────────────────┐
                    │     Next.js      │
                    │     Frontend     │
                    └────────┬─────────┘
                             │ HTTPS / REST
                             ▼
                    ┌──────────────────┐
                    │  Express.js API  │
                    │   TypeScript     │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
           MongoDB         Redis       Integrations
                                            │
                                  ┌─────────┼─────────┐
                                  ▼         ▼         ▼
                                Stripe    Storage    Email
```

---

# 8. Backend Architecture — MVC + Service Layer

The backend uses **MVC + Service Layer**.

```text
Request
  ↓
Route
  ↓
Middleware
  ↓
Controller
  ↓
Service
  ↓
Model
  ↓
MongoDB
```

### Route responsibility

Defines:

- HTTP method
- URL
- Middleware chain
- Controller

```ts
router.post(
  "/",
  authenticate,
  validate(createClientSchema),
  createClient
);
```

### Middleware responsibility

Handles:

- Authentication
- Authorization
- Validation
- Workspace resolution
- Rate limiting
- Error handling

### Controller responsibility

Controllers stay thin:

```ts
export const createClient = async (req, res, next) => {
  try {
    const client = await clientService.createClient(
      req.user.workspaceId,
      req.body
    );

    res.status(201).json({
      success: true,
      data: client,
    });
  } catch (error) {
    next(error);
  }
};
```

### Service responsibility

Business logic belongs here:

```ts
export const createClient = async (workspaceId, data) => {
  const existingClient = await Client.findOne({
    workspace: workspaceId,
    email: data.email,
  });

  if (existingClient) {
    throw new ApiError(409, "Client already exists");
  }

  return Client.create({
    ...data,
    workspace: workspaceId,
  });
};
```

### Model responsibility

Models define:

- Database schema
- Indexes
- Relations
- Database-level constraints

---

## 9. Repository Structure

```text
lancelio/
│
├── apps/
│   ├── web/                 # Next.js frontend
│   └── api/                 # Express backend
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── ERD.md
│
├── .gitignore
├── README.md
└── package.json
```

This document should live at:

```text
docs/ARCHITECTURE.md
```

---

## 10. Backend Folder Structure

```text
apps/api/
│
├── src/
│   ├── config/
│   │   ├── db.ts
│   │   ├── env.ts
│   │   ├── cors.ts
│   │   ├── stripe.ts
│   │   └── storage.ts
│   │
│   ├── models/
│   │   ├── User.model.ts
│   │   ├── Workspace.model.ts
│   │   ├── WorkspaceMember.model.ts
│   │   ├── Client.model.ts
│   │   ├── Proposal.model.ts
│   │   ├── Project.model.ts
│   │   ├── Task.model.ts
│   │   ├── Invoice.model.ts
│   │   ├── Payment.model.ts
│   │   ├── Message.model.ts
│   │   └── Notification.model.ts
│   │
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── client.controller.ts
│   │   ├── proposal.controller.ts
│   │   ├── project.controller.ts
│   │   ├── task.controller.ts
│   │   ├── invoice.controller.ts
│   │   ├── payment.controller.ts
│   │   ├── message.controller.ts
│   │   ├── notification.controller.ts
│   │   └── dashboard.controller.ts
│   │
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── client.service.ts
│   │   ├── proposal.service.ts
│   │   ├── project.service.ts
│   │   ├── task.service.ts
│   │   ├── invoice.service.ts
│   │   ├── payment.service.ts
│   │   ├── message.service.ts
│   │   ├── notification.service.ts
│   │   ├── email.service.ts
│   │   └── dashboard.service.ts
│   │
│   ├── routes/
│   │   ├── index.ts
│   │   ├── auth.routes.ts
│   │   ├── client.routes.ts
│   │   ├── proposal.routes.ts
│   │   ├── project.routes.ts
│   │   ├── task.routes.ts
│   │   ├── invoice.routes.ts
│   │   ├── payment.routes.ts
│   │   ├── message.routes.ts
│   │   ├── notification.routes.ts
│   │   └── dashboard.routes.ts
│   │
│   ├── middlewares/
│   │   ├── auth.middleware.ts
│   │   ├── role.middleware.ts
│   │   ├── workspace.middleware.ts
│   │   ├── validate.middleware.ts
│   │   ├── rateLimit.middleware.ts
│   │   ├── notFound.middleware.ts
│   │   └── error.middleware.ts
│   │
│   ├── validators/
│   │   ├── auth.validator.ts
│   │   ├── client.validator.ts
│   │   ├── proposal.validator.ts
│   │   ├── project.validator.ts
│   │   ├── task.validator.ts
│   │   └── invoice.validator.ts
│   │
│   ├── utils/
│   │   ├── ApiError.ts
│   │   ├── ApiResponse.ts
│   │   ├── asyncHandler.ts
│   │   ├── tokens.ts
│   │   ├── pagination.ts
│   │   └── constants.ts
│   │
│   ├── types/
│   │   └── express.d.ts
│   │
│   ├── app.ts
│   └── server.ts
│
├── tests/
├── .env
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 11. Next.js Folder Structure

Use the **App Router**.

```text
apps/web/
│
├── app/
│   ├── (marketing)/
│   │   ├── page.tsx
│   │   ├── features/page.tsx
│   │   ├── pricing/page.tsx
│   │   └── layout.tsx
│   │
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── layout.tsx
│   │
│   ├── dashboard/
│   │   ├── page.tsx
│   │   ├── clients/
│   │   ├── proposals/
│   │   ├── projects/
│   │   ├── invoices/
│   │   ├── notifications/
│   │   ├── settings/
│   │   └── layout.tsx
│   │
│   ├── proposal/[token]/page.tsx
│   ├── invoice/[token]/page.tsx
│   ├── portal/[token]/page.tsx
│   ├── layout.tsx
│   └── globals.css
│
├── components/
│   ├── ui/
│   ├── dashboard/
│   ├── clients/
│   ├── proposals/
│   ├── projects/
│   └── invoices/
│
├── hooks/
│
├── lib/
│   ├── api.ts
│   ├── auth.ts
│   ├── query-client.ts
│   └── utils.ts
│
├── services/
│   ├── auth.api.ts
│   ├── clients.api.ts
│   ├── proposals.api.ts
│   ├── projects.api.ts
│   ├── tasks.api.ts
│   └── invoices.api.ts
│
├── schemas/
├── types/
├── middleware.ts
├── .env.local
├── package.json
└── tsconfig.json
```

---

# 12. Database Models

## User

```text
User
├── _id
├── name
├── email
├── passwordHash
├── avatar
├── status
├── emailVerified
├── lastLoginAt
├── createdAt
└── updatedAt
```

```ts
type UserStatus = "active" | "suspended" | "deleted";
```

## Workspace

```text
Workspace
├── _id
├── name
├── slug
├── owner
├── logo
├── plan
├── settings
├── createdAt
└── updatedAt
```

```ts
type WorkspacePlan = "free" | "pro" | "agency";
```

## WorkspaceMember

Prepared for future teams.

```text
WorkspaceMember
├── _id
├── workspace
├── user
├── role
├── joinedAt
└── createdAt
```

```ts
type WorkspaceRole = "owner" | "admin" | "member";
```

## Client

```text
Client
├── _id
├── workspace
├── name
├── email
├── phone
├── company
├── avatar
├── notes
├── status
├── createdAt
└── updatedAt
```

```ts
type ClientStatus = "lead" | "active" | "inactive" | "archived";
```

## Proposal

```text
Proposal
├── _id
├── workspace
├── client
├── title
├── description
├── deliverables[]
├── price
├── currency
├── duration
├── status
├── publicToken
├── expiresAt
├── acceptedAt
├── rejectedAt
├── createdAt
└── updatedAt
```

```ts
type ProposalStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected"
  | "expired";
```

## Project

```text
Project
├── _id
├── workspace
├── client
├── proposal
├── title
├── description
├── budget
├── currency
├── startDate
├── deadline
├── status
├── progress
├── createdAt
└── updatedAt
```

```ts
type ProjectStatus =
  | "draft"
  | "active"
  | "on_hold"
  | "completed"
  | "cancelled";
```

## Task

```text
Task
├── _id
├── workspace
├── project
├── title
├── description
├── status
├── priority
├── dueDate
├── clientVisible
├── position
├── createdAt
└── updatedAt
```

```ts
type TaskStatus = "todo" | "in_progress" | "review" | "completed";
type TaskPriority = "low" | "medium" | "high" | "urgent";
```

## Invoice

```text
Invoice
├── _id
├── workspace
├── project
├── client
├── invoiceNumber
├── items[]
├── subtotal
├── discount
├── tax
├── total
├── currency
├── status
├── issueDate
├── dueDate
├── paidAt
├── publicToken
├── createdAt
└── updatedAt
```

```ts
type InvoiceStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "paid"
  | "partially_paid"
  | "overdue"
  | "cancelled";
```

```ts
type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};
```

## Payment — Phase 2

```text
Payment
├── _id
├── workspace
├── invoice
├── client
├── provider
├── providerPaymentId
├── amount
├── currency
├── status
├── paidAt
├── createdAt
└── updatedAt
```

## Notification

```text
Notification
├── _id
├── workspace
├── user
├── type
├── title
├── message
├── entityType
├── entityId
├── readAt
├── createdAt
└── updatedAt
```

## Message — Phase 2

```text
Message
├── _id
├── workspace
├── project
├── sender
├── senderType
├── body
├── attachments[]
├── readAt
├── createdAt
└── updatedAt
```

---

## 13. Main Relationships

```text
User
 │ owns
 ▼
Workspace
 │
 ├──────────── Client
 │                │
 │                ▼
 │             Proposal
 │                │ accepted
 │                ▼
 ├──────────── Project
 │                │
 │        ┌───────┼────────┐
 │        ▼       ▼        ▼
 │      Tasks   Invoice  Messages
 │                │
 │                ▼
 │             Payment
 │
 └──────────── Notifications
```

---

# 14. Multi-Tenant Security

Every business resource must belong to a workspace.

```ts
{
  _id: ObjectId,
  workspace: ObjectId
}
```

### Never do this for tenant data

```ts
await Project.findById(projectId);
```

### Do this

```ts
await Project.findOne({
  _id: projectId,
  workspace: req.user.workspaceId,
});
```

This rule applies to:

- Clients
- Proposals
- Projects
- Tasks
- Invoices
- Payments
- Messages
- Notifications

> **Main rule:** A protected resource must never be returned unless the authenticated user is authorized for the resource's workspace.

---

# 15. Authentication Strategy

Use:

```text
Access Token + Refresh Token
```

### Access token

- Short-lived
- Used for API authorization
- Recommended starting lifetime: `15m`

### Refresh token

- Longer-lived
- Stored in secure HttpOnly cookie
- Rotated on refresh
- Recommended starting lifetime: `7d`

Production cookie configuration should use secure settings appropriate to the deployment architecture.

Never commit secrets and avoid storing sensitive auth tokens in plain localStorage.

---

## 16. Authentication Endpoints

```http
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
```

Phase 2:

```http
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
POST /api/v1/auth/verify-email
POST /api/v1/auth/resend-verification
```

---

## 17. Client Endpoints

```http
POST   /api/v1/clients
GET    /api/v1/clients
GET    /api/v1/clients/:clientId
PATCH  /api/v1/clients/:clientId
DELETE /api/v1/clients/:clientId
```

Example query:

```text
/api/v1/clients?page=1&limit=20&search=ahmed&status=active&sort=-createdAt
```

---

## 18. Proposal Endpoints

```http
POST   /api/v1/proposals
GET    /api/v1/proposals
GET    /api/v1/proposals/:proposalId
PATCH  /api/v1/proposals/:proposalId
DELETE /api/v1/proposals/:proposalId
POST   /api/v1/proposals/:proposalId/send
```

Public proposal endpoints:

```http
GET  /api/v1/public/proposals/:token
POST /api/v1/public/proposals/:token/accept
POST /api/v1/public/proposals/:token/reject
```

---

# 19. Proposal Acceptance Business Logic

This is a key product workflow.

```text
Validate token
   ↓
Find proposal
   ↓
Validate current status
   ↓
Check expiration
   ↓
Mark accepted
   ↓
Create project
   ↓
Attach client
   ↓
Copy proposal data
   ↓
Create notification
   ↓
Return project
```

Pseudo-service:

```ts
async function acceptProposal(token: string) {
  const proposal = await Proposal.findOne({ publicToken: token });

  if (!proposal) {
    throw new ApiError(404, "Proposal not found");
  }

  if (!["sent", "viewed"].includes(proposal.status)) {
    throw new ApiError(400, "Proposal cannot be accepted");
  }

  if (proposal.expiresAt && proposal.expiresAt < new Date()) {
    throw new ApiError(400, "Proposal has expired");
  }

  proposal.status = "accepted";
  proposal.acceptedAt = new Date();
  await proposal.save();

  const project = await Project.create({
    workspace: proposal.workspace,
    client: proposal.client,
    proposal: proposal._id,
    title: proposal.title,
    description: proposal.description,
    budget: proposal.price,
    currency: proposal.currency,
    status: "active",
  });

  return project;
}
```

For production hardening, use a MongoDB transaction where appropriate so acceptance and project creation do not end in a partial state.

---

## 20. Project Endpoints

```http
POST   /api/v1/projects
GET    /api/v1/projects
GET    /api/v1/projects/:projectId
PATCH  /api/v1/projects/:projectId
DELETE /api/v1/projects/:projectId
```

Actions:

```http
POST /api/v1/projects/:projectId/complete
POST /api/v1/projects/:projectId/archive
```

---

## 21. Task Endpoints

```http
POST   /api/v1/projects/:projectId/tasks
GET    /api/v1/projects/:projectId/tasks
GET    /api/v1/tasks/:taskId
PATCH  /api/v1/tasks/:taskId
DELETE /api/v1/tasks/:taskId
PATCH  /api/v1/tasks/:taskId/move
```

Example Kanban move body:

```json
{
  "status": "in_progress",
  "position": 2
}
```

---

## 22. Invoice Endpoints

```http
POST   /api/v1/invoices
GET    /api/v1/invoices
GET    /api/v1/invoices/:invoiceId
PATCH  /api/v1/invoices/:invoiceId
DELETE /api/v1/invoices/:invoiceId
POST   /api/v1/invoices/:invoiceId/send
```

Public invoice:

```http
GET /api/v1/public/invoices/:token
```

Phase 2:

```http
POST /api/v1/public/invoices/:token/pay
GET  /api/v1/invoices/:invoiceId/pdf
```

---

## 23. Dashboard Endpoints

```http
GET /api/v1/dashboard/summary
GET /api/v1/dashboard/revenue
GET /api/v1/dashboard/recent-projects
GET /api/v1/dashboard/recent-activity
```

Example:

```json
{
  "success": true,
  "data": {
    "clients": 15,
    "activeProjects": 7,
    "pendingProposals": 4,
    "outstandingInvoices": 1200,
    "totalRevenue": 4820
  }
}
```

---

# 24. API Response Standard

### Success

```json
{
  "success": true,
  "message": "Client created successfully",
  "data": {}
}
```

### List

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "CLIENT_ALREADY_EXISTS",
    "message": "Client already exists"
  }
}
```

### Validation error

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "fields": {
      "email": "Invalid email address"
    }
  }
}
```

---

## 25. HTTP Status Guidelines

```text
200 OK
201 Created
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
```

---

# 26. Error Handling

Use centralized errors.

```ts
class ApiError extends Error {
  statusCode: number;
  code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
```

All application errors eventually reach:

```text
error.middleware.ts
```

An `asyncHandler` helper can remove repeated controller try/catch blocks.

---

# 27. Validation

Use Zod on frontend and backend.

```ts
const createClientSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  company: z.string().max(120).optional(),
});
```

Never trust frontend validation alone.

---

## 28. Recommended MongoDB Indexes

### User

```text
email → unique
```

### Workspace

```text
slug → unique
owner
```

### Client

```text
workspace + email
workspace + status
workspace + createdAt
```

### Proposal

```text
workspace + status
workspace + client
publicToken → unique
```

### Project

```text
workspace + status
workspace + client
workspace + deadline
```

### Invoice

```text
workspace + invoiceNumber → unique
workspace + status
publicToken → unique
```

---

# 29. Security Checklist

Before production:

- Password hashing with bcrypt
- Secure refresh token flow
- Refresh token rotation
- CORS allowlist
- Helmet
- Rate limiting
- Request validation
- NoSQL injection protection strategy
- Mass-assignment protection
- Workspace authorization
- Secure random public tokens
- Safe production error messages
- Environment validation
- Secure cookies
- HTTPS only
- File size limits
- File MIME/type validation
- Payment webhook signature verification
- Logs must not contain secrets

---

# 30. Public Tokens

Public links must not depend on sequential IDs.

Prefer:

```text
/proposal/b0f4138a90...
```

instead of:

```text
/proposal/123
```

Generate tokens using a cryptographically secure random generator.

---

# 31. Client Portal

Route:

```text
/portal/:token
```

The portal can expose:

- Client information
- Project
- Progress
- Client-visible tasks
- Invoice
- Deadline

Phase 2:

- Files
- Messages
- Online payment

The portal must never expose internal-only tasks or unrelated workspace resources.

---

## 32. Main Frontend Pages

### Marketing

```text
/
/features
/pricing
```

### Authentication

```text
/login
/register
```

### Dashboard

```text
/dashboard
/dashboard/clients
/dashboard/clients/:id
/dashboard/proposals
/dashboard/proposals/new
/dashboard/proposals/:id
/dashboard/projects
/dashboard/projects/:id
/dashboard/invoices
/dashboard/invoices/new
/dashboard/invoices/:id
/dashboard/notifications
/dashboard/settings
```

### Public

```text
/proposal/:token
/invoice/:token
/portal/:token
```

---

## 33. Dashboard UI

Initial widgets:

```text
Total Revenue
Active Projects
Pending Proposals
Outstanding Invoices
Total Clients
```

Sections:

```text
Revenue Chart
Recent Projects
Recent Clients
Upcoming Deadlines
Recent Activity
```

---

## 34. Project UI

Recommended tabs:

```text
Overview
Tasks
Invoices
Files
Messages
Activity
```

MVP starts with:

```text
Overview
Tasks
Invoices
```

---

# 35. Environment Variables

## API `.env.example`

```env
NODE_ENV=development
PORT=5000

MONGODB_URI=

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

CLIENT_URL=http://localhost:3000

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

RESEND_API_KEY=
```

## Web

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

Never commit `.env` files.

---

# 36. API Versioning

All API routes start with:

```text
/api/v1
```

Examples:

```text
/api/v1/auth/login
/api/v1/clients
/api/v1/projects
```

Breaking future changes can move to `/api/v2`.

---

## 37. Naming Conventions

### Backend files

```text
client.controller.ts
client.service.ts
client.routes.ts
client.validator.ts
Client.model.ts
```

### Code

```text
variables/functions → camelCase
classes/models/components → PascalCase
constants → UPPER_SNAKE_CASE
URLs → kebab-case
```

---

# 38. Git Strategy

Simple solo workflow:

```text
main
  └── develop
       ├── feature/auth
       ├── feature/clients
       ├── feature/proposals
       ├── feature/projects
       └── fix/...
```

Commit examples:

```text
feat: add client creation endpoint
fix: prevent cross-workspace project access
refactor: move proposal logic to service
docs: update API documentation
test: add auth service tests
chore: configure eslint
```

---

# 39. Development Order

## Stage 0 — Foundation

- Repository
- Next.js
- Express
- TypeScript
- MongoDB
- ESLint / Prettier
- Environment validation
- Centralized error handling
- API response helpers
- GitHub

## Stage 1 — Authentication

- User model
- Workspace model
- Register
- Login
- Refresh
- Logout
- `/me`
- Auth middleware
- Workspace middleware

**Done when:**

```text
User can register
User can login
Protected endpoints work
Workspace is created
Unauthorized requests are rejected
```

## Stage 2 — Clients

- Client model
- CRUD
- Search
- Pagination
- Filtering
- Client list UI
- Client details UI

## Stage 3 — Proposals

- Proposal model
- CRUD
- Shareable token
- Public proposal UI
- Send
- Accept
- Reject
- Accepted proposal creates project

## Stage 4 — Projects + Tasks

- Project CRUD
- Task CRUD
- Kanban statuses
- Progress calculation

## Stage 5 — Invoices

- Invoice CRUD
- Invoice items
- Totals
- Invoice numbering
- Public invoice
- Manual payment status

## Stage 6 — Dashboard

- Summary
- Revenue
- Deadlines
- Recent activity
- Charts

## Stage 7 — Client Portal

- Secure portal token
- Project view
- Progress
- Visible tasks
- Invoice view

---

# 40. Sprint Plan

## Sprint 1 — Foundation + Auth

```text
Project setup
Database
User
Workspace
Register
Login
Refresh
Logout
/me
Security middleware
Protected dashboard
```

## Sprint 2 — Clients + Proposals

```text
Client CRUD
Search/filter/pagination
Proposal CRUD
Public proposal
Accept/reject
Proposal → Project automation
```

## Sprint 3 — Projects + Tasks

```text
Project CRUD
Task CRUD
Kanban
Progress
Project detail UI
```

## Sprint 4 — Invoices + Dashboard

```text
Invoice CRUD
Invoice calculations
Public invoice
Dashboard metrics
Charts
```

## Sprint 5 — Portal + Polish

```text
Client portal
Notifications
Responsive UI
Loading/error states
Tests
Security review
Deployment
```

---

# 41. Testing Strategy

Recommended backend tools:

```text
Vitest or Jest
Supertest
```

### Authentication tests

- Register success
- Duplicate email
- Login success
- Invalid password
- Refresh token
- Unauthorized protected route

### Critical multi-tenancy tests

```text
Workspace A cannot access Workspace B client
Workspace A cannot access Workspace B proposal
Workspace A cannot access Workspace B project
Workspace A cannot access Workspace B invoice
```

### Proposal tests

- Create proposal
- Accept proposal
- Reject proposal
- Cannot accept twice
- Expired proposal cannot be accepted
- Acceptance creates project

### Invoice tests

- Correct subtotal
- Correct total
- Invalid quantity rejected
- Workspace isolation

---

# 42. Logging

Development logs may include:

```text
method
path
status
response time
```

Never log:

- Passwords
- Access tokens
- Refresh tokens
- Stripe secrets
- Sensitive uploaded files

---

# 43. Pagination Standard

Request:

```http
GET /api/v1/clients?page=2&limit=20
```

Response:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 73,
    "pages": 4,
    "hasNext": true,
    "hasPrev": true
  }
}
```

Set a server-side maximum, for example:

```text
MAX_LIMIT = 100
```

---

# 44. Filtering and Sorting

Examples:

```http
GET /clients?status=active
GET /clients?search=ahmed
GET /projects?status=active
GET /projects?sort=-createdAt
GET /invoices?status=overdue
```

Every tenant query still includes:

```ts
workspace: req.user.workspaceId
```

---

# 45. SaaS Plans — Future

### Free

```text
3 Clients
2 Active Projects
Basic Dashboard
```

### Pro

```text
Unlimited Clients
Unlimited Projects
Invoices
Client Portal
Payments
Analytics
```

### Agency

```text
Everything in Pro
Team Members
Advanced Permissions
Custom Branding
Advanced Analytics
```

Do not implement billing/plans until the MVP workflow is stable.

---

# 46. Product Differentiator

Lancelio should not become a generic Trello clone.

The core positioning is:

> **The complete client workflow for freelancers — from proposal to payment.**

Core sequence:

```text
Client
  ↓
Proposal
  ↓
Project
  ↓
Tasks
  ↓
Invoice
  ↓
Payment
```

New features should strengthen this sequence.

---

# 47. MVP Definition of Done

The MVP is complete when a new freelancer can:

1. Register
2. Login
3. Create a client
4. Create a proposal
5. Share the proposal
6. Have the client accept it
7. Receive an automatically created project
8. Create and manage tasks
9. Track project progress
10. Create an invoice
11. Share the invoice
12. Track payment status
13. See useful dashboard metrics
14. Give the client a working portal
15. Do all of this without ever accessing another workspace's data

---

# 48. Explicitly Out of MVP

To prevent scope creep, do not initially build:

```text
AI features
Complex real-time chat
Mobile app
Custom domains
Contracts
E-signatures
Time tracking
Accounting integrations
Bank integrations
Workflow automation builder
Recurring invoices
Advanced subscriptions
Complex admin panel
```

---

# 49. Initial Project Checklist

```text
[ ] Create GitHub repository
[ ] Create root project
[ ] Setup apps/web
[ ] Setup apps/api
[ ] Setup TypeScript strict mode
[ ] Setup ESLint
[ ] Setup Prettier
[ ] Setup environment variables
[ ] Create MongoDB Atlas database
[ ] Create API health endpoint
[ ] Setup centralized errors
[ ] Setup validation
[ ] Setup auth skeleton
[ ] Create README.md
[ ] Create .env.example
[ ] Create docs folder
[ ] Add this file as docs/ARCHITECTURE.md
[ ] Commit initial architecture
```

---

# 50. First API Endpoint

Start with:

```http
GET /api/v1/health
```

Response:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "lancelio-api"
  }
}
```

Then start authentication.

---

# 51. First Milestone

> **A user can register, login, receive an authenticated session, and access a protected dashboard linked to their own workspace.**

Do not start Clients, Proposals, or Projects until the authentication/workspace foundation is reliable.

---

# 52. Engineering Rules

1. Controllers stay thin.
2. Business logic belongs in services.
3. All external input is validated.
4. Business resources belong to a workspace.
5. Never trust an ID received from the frontend.
6. Never query tenant data without workspace scope.
7. API responses follow one consistent format.
8. TypeScript strict mode stays enabled.
9. Avoid `any`.
10. Internal database errors are not exposed directly to users.
11. Sensitive data never enters logs.
12. Public links use secure random tokens.
13. Critical business workflows receive automated tests.
14. Every module follows the same MVC + Service pattern.
15. Do not expand scope before the main workflow is stable.

---

# 53. Architecture Summary

```text
Project        Lancelio
Type           Freelancer Management SaaS
Architecture   MVC + Service Layer
Frontend       Next.js + React + TypeScript
Backend        Node.js + Express + TypeScript
Database       MongoDB + Mongoose
Auth           JWT Access + Refresh Tokens
Tenancy        Workspace-based Multi-Tenant
Core MVP       Client → Proposal → Project → Task → Invoice
```

---

# 54. Next Action

Start **Sprint 1**:

```text
Repository
   ↓
Next.js + Express setup
   ↓
MongoDB connection
   ↓
User + Workspace models
   ↓
Register / Login
   ↓
Refresh token flow
   ↓
Auth middleware
   ↓
Workspace isolation
   ↓
Protected dashboard
```

After Sprint 1 is stable:

```text
Sprint 2 → Clients + Proposals
```

---

**Status:** Architecture Ready  
**Working Name:** Lancelio  
**Next Step:** Initialize the repository and implement Sprint 1.
