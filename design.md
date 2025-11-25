# MedLaunch Expense Report API Design

This document outlines the architecture and design of the MedLaunch Expense Report API.

## 1. Domain & Data Model

The API is modeled around a central `Report` resource, which represents an expense report. A Document-Oriented (NoSQL) structure was chosen to embed related data like entries and comments directly within the report, optimizing for read performance.

### Schema Overview

- **`Report`**: The root object containing metadata, status, and budget information.
  - `id: string` - Unique identifier.
  - `title: string` - Title of the report.
  - `ownerId: string` - ID of the user who owns the report.
  - `department?: string` - Department associated with the report.
  - `createdAt: string` - ISO timestamp of creation.
  - `updatedAt: string` - ISO timestamp of the last update.
  - `version: number` - Version number for optimistic concurrency control.
  - `budgetCap: number` - The budget limit for the report.
  - `budgetOverride?: boolean` - If true, allows exceeding the budget.
  - `status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'` - The current status of the report.
  - `entries: ReportEntry[]` - An array of expense entries.
  - `users?: { userId: string; access: 'VIEW' | 'EDIT' | 'COMMENT' }[]` - Users with specific access rights to the report.
  - `comments?: ReportComment[]` - An array of comments on the report.
  - `attachments?: ReportAttachment[]` - An array of file attachments.
  - `metrics?: ReportView` - Computed metrics like total amount and trend.

- **`ReportEntry`**: An individual expense item.
  - `id: string`
  - `description?: string`
  - `amount: number`
  - `category?: string`
  - `incurredAt?: string`

- **`User`**: A user of the system.
  - `id: string`
  - `name: string`
  - `email: string`
  - `password: string` (hashed)
  - `role: 'USER' | 'ADMIN'`

- **`ReportComment`**: A comment on a report.
- **`ReportAttachment`**: A file attached to a report.
- **`ReportView`**: Computed metrics for a report.

## 2. Custom Business Rule: The Strict Budget Gate

A key business rule is the "Strict Budget Gate," which governs the submission of expense reports.

**The Rule**: A `Report` cannot be transitioned from `DRAFT` to `SUBMITTED` status if the sum of its `entries` exceeds the `budgetCap`.

**The Exception**: This rule can be bypassed if the `budgetOverride` flag is set to `true`.

**Role Restriction**: Only users with the `ADMIN` role can set `budgetOverride` to `true`.

**Enforcement**: This rule is enforced in two scenarios:
1.  When a new report is created with the status `SUBMITTED`.
2.  When an existing report's status is updated from `DRAFT` to `SUBMITTED`.

## 3. Architecture & Assumptions

- **Transport Security**: The API assumes it is deployed behind a reverse proxy (e.g., Nginx) that handles TLS (HTTPS) termination.
- **Storage**: The application uses an in-memory database for this challenge, implemented via a `globalRepository`. The Repository Pattern is used to abstract data access, allowing for a future switch to a persistent database (like MongoDB or DynamoDB) with minimal changes to the business logic.
- **Concurrency Control**: Optimistic Concurrency Control (OCC) is used to handle simultaneous edits. Each `Report` has a `version` number. To update a report, a client must provide the `version` they are editing. If the server has a newer version, it rejects the update with a `409 Conflict` error, preventing lost updates.

## 4. Authentication & Authorization

- **Authentication**: Authentication is handled via JSON Web Tokens (JWT). Clients must include a bearer token in the `Authorization` header of their requests.
- **Authorization**: Role-Based Access Control (RBAC) is used to restrict access to resources.
  - **`USER`**: Can create reports for themselves, view reports they own or are shared with, and update their own reports.
  - **`ADMIN`**: Has full access to all reports, can change a report's owner, and can set the `budgetOverride` flag.

## 5. File Storage Strategy

- **Mechanism**: File uploads are handled using `multipart/form-data` and the `multer` library.
- **Storage**: Files are stored on the local filesystem in the `./uploads` directory.
- **Security**:
  - Files are renamed to random UUIDs to prevent directory traversal and filename collision attacks.
  - File types are restricted to a whitelist (e.g. PDF here).
  - A file size limit is enforced.
- **Download**: To prevent unauthorized access, file downloads are facilitated through a signed, short-lived URL. This URL contains a JWT that encodes the file's path and expires after a set time.

## 6. Asynchronous Side Effects

- **Trigger**: When a `Report` is created or updated, asynchronous side effects are triggered to perform tasks that should not block the user's request.
- **Implementation**: An in-memory `JobQueueService` is used to manage these tasks. For example, when a report is created, two jobs are enqueued:
  1.  `UPDATE_REPORT_VIEW`: Calculates and updates the `metrics` for the report.
  2.  `REPORT_CREATED_NOTIFICATION`: Simulates sending a notification about the new report.
- **Justification**: This ensures that the API remains responsive, providing a fast response to the user while background tasks are processed independently.

## 7. Code Quality & Scalability

- **Linting**: ESLint with a strict TypeScript configuration is used to maintain code quality and prevent common errors.
- **Separation of Concerns**: The codebase is structured to separate concerns into controllers (HTTP layer), services (business logic), and repositories (data access).
- **Scalability**:
  - The application is stateless, with JWTs containing all necessary authentication information.
  - The use of the Repository Pattern allows for easy migration to a more scalable database solution.
  - Structured JSON logging can be implemented to allow for easy log ingestion by monitoring tools.
