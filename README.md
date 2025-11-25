# MedLaunch BE Challenge

This is the backend for the MedLaunch code challenge. It's a Node.js and Express application written in TypeScript.

## Getting Started

### Prerequisites

-   Node.js (I used LTS: v24.11.1 for this challenge)
-   npm

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

### Running the Server

-   **Development:**
    For development, a `dev` script is provided which uses `ts-node-dev` to automatically transpile and restart the server on file changes.
    ```bash
    npm run dev
    ```
-   **Production:**
    For production, first build the TypeScript source into JavaScript, then run the compiled output.
    ```bash
    npm run build
    npm start
    ```
    The server will start on the port defined by the `PORT` environment variable, or `3000` by default.

## Modules & Architecture

The project follows a modular architecture, separating concerns into different directories:

-   `src/controllers`: Handles the incoming requests, validates input, and contains the majority of the application's business logic.
-   `src/services`: Contains services that provide specific functionalities like Asyncrhonous Job queueing, or file storage service.
    -   `fileStorageService.ts`: A simple in-memory storage for files. For a production environment, this would be replaced with a more robust solution like Amazon S3 or a local filesystem-based storage.
    -   `jobQueueService.ts`: A mock job queue for "processing" reports. This simulates a background task by introducing a delay, after which the report status is updated. In a real-world application, this would be implemented with a dedicated queueing system like RabbitMQ or Redis.
-   `src/repositories`: Abstract the data layer.
    -   `globalRepository.ts`: A generic in-memory repository. This is used to simulate a database for users and reports. For a production application, this would be replaced with a proper database and ORM like Prisma or TypeORM.
-   `src/models`: Defines the data structures for `User` and `Report`.
-   `src/routes`: Defines the API endpoints and maps them to controllers.
-   `src/middleware`: Contains middleware for the application, such as authentication.
-   `src/types`: Contains type definitions, for example, extending the `express.Request` object.

### Dependencies Used

-   **Express**: Used to build the web server and define the API routes. It's the foundation of the application's communication over HTTP.
-   **TypeScript**: Used to write type-safe code. This helps to catch errors during development and improves code quality and maintainability.
-   **bcryptjs**: Used for security to hash user passwords before storing them. This prevents storing passwords in plaintext.
-   **jsonwebtoken**: Used to implement stateless authentication. After a user logs in, a JWT is created and sent to the client. This token is then used to authenticate subsequent requests.
-   **cors**: A middleware to enable Cross-Origin Resource Sharing. This is necessary if the frontend is served from a different domain than the backend.
-   **morgan**: A middleware for logging HTTP requests. This is useful for debugging and monitoring server activity.
-   **multer**: A middleware for handling file uploads (`multipart/form-data`). It's used in this project for uploading report attachments.
-   **nodemon**: A development tool that automatically recompiles and restarts the server when TypeScript files are changed, speeding up the development workflow.

## API Testing with Postman

A Postman collection is included in the root of the project: `Medlaunch.postman_collection.json`.

You can import this collection into Postman to easily test the API endpoints. There are tests which store the IDs so that testing is easier (without manually placing tokens and IDs for each API)

### Using the Collection

1.  Open Postman.
2.  Click on `Import` and select the `Medlaunch.postman_collection.json` file.
3.  The collection includes requests for all endpoints.

### Tests and Variables

The collection includes tests for some requests. For example, after registering a new user or logging in, the `token` and other details are stored in Postman variables. These variables are then automatically used in the headers of subsequent requests that require authentication, simplifying the testing process.

## API Endpoints (cURL)

**Note:** Replace `YOUR_AUTH_TOKEN`, `YOUR_REPORT_ID`, and `YOUR_ATTACHMENT_ID` with actual values.

*   #### Signup
    **Endpoint:** `POST /auth/signup`  
    **Description:** Registers a new user.  
    **Request Body:** `name`, `email`, `password`.  
    **Response:** A JWT for the new user.
    ```bash
    curl --location --request POST 'http://localhost:3000/auth/signup' \
    --header 'Content-Type: application/json' \
    --data-raw 
    {
        "name": "Viewer 1",
        "email": "viewer1@med.com",
        "password": "V!ewer1"
    }
    ```

*   #### Login
    **Endpoint:** `POST /auth/login`  
    **Description:** Logs in a user.  
    **Request Body:** `email`, `password`.  
    **Response:** A JWT for the user.
    ```bash
    curl --location --request POST 'http://localhost:3000/auth/login' \
    --header 'Content-Type: application/json' \
    --data-raw 
    {
        "email": "user1@med.com",
        "password": "User!No1"
    }
    ```

*   #### Create a new report
    **Endpoint:** `POST /reports`  
    **Description:** Creates a new expense report.  
    **Authentication:** Requires a valid JWT.  
    **Request Body:** `title`, `budgetCap`, `department`, `entries`, `viewers`, `status`.  
    **Response:** The newly created report object.
    ```bash
    curl --location --request POST 'http://localhost:3000/reports' \
    --header 'Authorization: Bearer YOUR_AUTH_TOKEN' \
    --header 'Content-Type: application/json' \
    --data-raw 
    {
        "title": "Q4 Marketing Expenses",
        "budgetCap": 5000,
        "department": "Marketing",
        "entries": [
            {
                "id": "entry1",
                "title": "Social Media Ads",
                "amount": 2500,
                "date": "2025-10-15"
            },
            {
                "id": "entry2",
                "title": "Content Creation",
                "amount": 1500,
                "date": "2025-10-20"
            }
        ],
        "viewers": [
            "user1@med.com"
        ],
        "status": "DRAFT"
    }
    ```

*   #### Get all reports
    **Endpoint:** `GET /reports`  
    **Description:** Retrieves a list of reports visible to the authenticated user.  
    **Authentication:** Requires a valid JWT.  
    **Response:** An array of report objects.
    ```bash
    curl --location --request GET 'http://localhost:3000/reports' \
    --header 'Authorization: Bearer YOUR_AUTH_TOKEN'
    ```

*   #### Get a specific report
    **Endpoint:** `GET /reports/:id`  
    **Description:** Retrieves a single report by its ID.  
    **Authentication:** Requires a valid JWT.  
    **URL Parameters:** `id` (the report ID).  
    **Query Parameters (optional):** `include` (comma-separated list of fields to include), `offset`, `limit` (for pagination of entries), `entriesSort`, `entriesMinAmount`.  
    **Response:** The report object.
    ```bash
    curl --location --request GET 'http://localhost:3000/reports/YOUR_REPORT_ID?include=entries,comments,metadata&offset=0&limit=2&entriesSort=amount_desc&entriesMinAmount=100' \
    --header 'Authorization: Bearer YOUR_AUTH_TOKEN'
    ```

*   #### Upload an attachment
    **Endpoint:** `POST /reports/:id/attachment`  
    **Description:** Uploads a file as an attachment to a report.  
    **Authentication:** Requires a valid JWT.  
    **URL Parameters:** `id` (the report ID).  
    **Request Body:** `multipart/form-data` with a file field named `attachment`.  
    **Response:** The updated report object with the new attachment metadata.
    ```bash
    curl --location --request POST 'http://localhost:3000/reports/YOUR_REPORT_ID/attachment' \
    --header 'Authorization: Bearer YOUR_AUTH_TOKEN' \
    --form 'attachment=@"/path/to/your/file.pdf"'
    ```

*   #### Get a signed URL for an attachment
    **Endpoint:** `GET /reports/:id/attachments/:attachmentId/url`  
    **Description:** Generates a temporary, signed URL to download a report attachment.  
    **Authentication:** Requires a valid JWT.  
    **URL Parameters:** `id` (the report ID), `attachmentId` (the attachment ID).  
    **Response:** An object containing the `url` and `expiresIn`.
    ```bash
    curl --location --request GET 'http://localhost:3000/reports/YOUR_REPORT_ID/attachments/YOUR_ATTACHMENT_ID/url' \
    --header 'Authorization: Bearer YOUR_AUTH_TOKEN'
    ```

*   #### Update a report
    **Endpoint:** `PUT /reports/:id`  
    **Description:** Updates an existing report.  
    **Authentication:** Requires a valid JWT.  
    **URL Parameters:** `id` (the report ID).  
    **Request Body:** The fields to update (e.g., `title`, `status`), and the `version` of the report for optimistic concurrency control.  
    **Response:** The updated report object.
    ```bash
    curl --location --request PUT 'http://localhost:3000/reports/YOUR_REPORT_ID' \
    --header 'Authorization: Bearer YOUR_AUTH_TOKEN' \
    --header 'Content-Type: application/json' \
    --data-raw 
    {
        "title": "Updated Q3 Departmental Expenses",
        "status": "SUBMITTED",
        "version": 1
    }
    ```
