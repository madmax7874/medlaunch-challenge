1. Domain & Data Model
To satisfy the requirement of a complex resource with nested collections, I have modeled a Project Expense Report.

Schema Overview
We utilize a Document-Oriented (NoSQL) structure. This was chosen over a relational model to allow the entries (line items) to be embedded directly within the Report. This optimizes read performance, as reports are typically fetched in their entirety.

Root Object: Report (Contains metadata, status, and budget rules).

Nested Collection: entries (Array of individual expense items).

Computed Fields: totalAmount and isOverBudget are calculated at runtime during GET requests to ensure data consistency without requiring multi-step updates.

2. Custom Business Rule 


I have implemented a rule called "The Strict Budget Gate."

The Rule: A Report cannot be transitioned from DRAFT to SUBMITTED status if the calculated sum of its entries exceeds the budgetCap defined on the report.

The Exception: This invariant can be bypassed only if the budgetOverride boolean is set to true.

Role Restriction: Only users with the ADMIN role can set budgetOverride to true.

Impact: This affects the PUT validation logic. Before saving a status change, the system effectively "re-calculates" the total to ensure the invariant holds.

3. Architecture & Assumptions 


Assumptions
Transport Security: We assume the API sits behind a reverse proxy (like Nginx) or Load Balancer terminating TLS (HTTPS).


Storage: As per requirements, persistence is in-memory for this challenge. However, the data access layer is implemented using the Repository Pattern. This ensures that swapping the in-memory Map for a real database (like MongoDB or DynamoDB) would require changing only the Repository implementation, not the business logic.


Concurrency Control 



To handle simultaneous edits (e.g., two managers editing a report), I implemented Optimistic Concurrency Control (OCC).

Every resource has a version integer.

GET responses include the current version.

PUT requests must include an If-Match header (or version in body).

If request.version !== server.version, the server rejects the update with 409 Conflict.

Justification: This is superior to locking (pessimistic) for web APIs as it is stateless and prevents "zombie" locks.

4. Authentication & Authorization 


Authentication: Bearer Token (JWT).

Authorization: Role-Based Access Control (RBAC).

USER: Can read reports they own or are listed on (GET), and create/edit their own reports (POST/PUT).

ADMIN: Can edit any report and toggle the budgetOverride flag.

5. File Storage Strategy 


Mechanism: multipart/form-data uploads via multer.

Storage Abstraction: Files are currently stored on the local filesystem (./uploads).

Security:

Files are renamed to random UUIDs to prevent directory traversal attacks and filename collisions.

MIME types are validated against a whitelist (PDF, PNG, JPEG).

Download: Access is granted via a signed, short-lived URL (simulated via a temporary token endpoint) to prevent public hot-linking.

6. Asynchronous Side Effects 


Trigger: When a Report is created (POST), a "Notification" side effect is triggered.

Implementation: An in-memory Event Emitter (node:events) decouples the HTTP response from the background task.

Failure Handling:

The side effect is wrapped in a retry mechanism (Exponential Backoff).

If the side effect fails 3 times, it logs to a Dead Letter error stream for manual intervention.

Justification: This ensures the API remains responsive (fast 201 Created) even if the notification system is slow or down.

7. Code Quality & Scalability 


Linting: ESLint with strict TypeScript configuration ensures no implicit any types.

Separation of Concerns: logic is split into Controllers (HTTP layer), Services (Business Logic), and Repositories (Data Access).

Scalability Plan:

State: The app is stateless (tokens are self-contained JWTs).

Data: The Repository pattern allows sharding or migrating to a document store.

Observability: Structured JSON logging (via winston/pino) allows logs to be ingested by tools like Splunk or Datadog.