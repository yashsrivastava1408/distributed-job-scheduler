# Distributed Job Scheduler

A highly reliable, production-grade distributed job scheduler built with **Node.js + TypeScript + Prisma + PostgreSQL + React (Vite + Tailwind CSS v4)**.

---

## Features

- **Atomic Claiming:** Implements raw PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` inside a transaction per queue to ensure no double-executions, even under massive worker concurrency.
- **Strict Concurrency Limits:** Enforces queue-level concurrency limits by counting active runs before worker claiming.
- **Multi-Tenancy & Isolation:** Double authentication pathways (JWT for dashboard, SHA-256 hashed API Keys for client daemons) with strict project isolation.
- **Resilient Recovery (Reaper):** Detects stalled or crashed workers via a heartbeat watchdog and automatically requeues lost executions.
- **Live Observability:** WebSocket updates via Socket.IO keep the React dashboard synchronized in real-time.
- **Dead Letter Queue (DLQ):** Exhausted job retries automatically route to DLQ with detailed error logs and manual requeuing.

---

## Architecture & Database Design

### System Architecture Diagram
This diagram shows how programmatic REST clients, the browser dashboard, API processes, Supabase DB, and worker processes interact:

```mermaid
flowchart TD
    Client[REST Clients / Daemons] -->|1. Submit Jobs via API Key| API[API Server HTTP Process]
    UserBrowser[React Dashboard User] -->|2. WebSockets & REST Auth| API
    API -->|3. Reads/Writes| DB[(Supabase PostgreSQL)]
    
    subgraph WorkersCluster [Workers compute cluster]
        WorkerInstance1[Worker Instance 1]
        WorkerInstance2[Worker Instance 2]
    end
    
    WorkerInstance1 -->|4. Atomic SELECT FOR UPDATE SKIP LOCKED| DB
    WorkerInstance2 -->|4. Atomic SELECT FOR UPDATE SKIP LOCKED| DB
    
    WorkerInstance1 -.->|5. REST internal event forwarding| API
    WorkerInstance2 -.->|5. REST internal event forwarding| API
    
    API -.->|6. Socket.IO Live Updates| UserBrowser
```

### Entity Relationship (ER) Diagram
The comprehensive database schema layout for the 12 normalized tables:

```mermaid
erDiagram
    User {
        string id PK
        string email
        string passwordHash
        string name
        string role
        datetime createdAt
    }
    Organization {
        string id PK
        string name
        datetime createdAt
    }
    OrganizationMember {
        string id PK
        string organizationId FK
        string userId FK
        string role
        datetime createdAt
    }
    Project {
        string id PK
        string organizationId FK
        string name
        string apiKey
        datetime createdAt
    }
    Queue {
        string id PK
        string projectId FK
        string name
        int priority
        int maxConcurrency
        boolean isPaused
        string retryPolicyId FK
        datetime createdAt
    }
    RetryPolicy {
        string id PK
        string projectId FK
        string name
        string strategy
        int maxAttempts
        int baseDelayMs
        int maxDelayMs
        boolean jitter
        datetime createdAt
    }
    Job {
        string id PK
        string queueId FK
        string batchId FK
        string type
        json payload
        string status
        int priority
        int maxAttempts
        int attemptsCount
        datetime runAt
        string claimedByWorkerId FK
        string idempotencyKey
        datetime createdAt
    }
    ScheduledJob {
        string id PK
        string queueId FK
        string type
        json payload
        string scheduleType
        string cronExpression
        datetime runAt
        datetime nextRunAt
        boolean isActive
        int maxAttempts
        datetime createdAt
    }
    JobBatch {
        string id PK
        string queueId FK
        string label
        int totalJobs
        int completedJobs
        int failedJobs
        datetime createdAt
    }
    JobExecution {
        string id PK
        string jobId FK
        string workerId FK
        int attemptNumber
        string status
        datetime startedAt
        datetime finishedAt
        int durationMs
        string errorMessage
    }
    JobLog {
        string id PK
        string jobExecutionId FK
        datetime timestamp
        string level
        string message
    }
    Worker {
        string id PK
        string hostname
        int pid
        string status
        string_array queues
        int concurrency
        datetime startedAt
        datetime lastHeartbeatAt
    }
    WorkerHeartbeat {
        string id PK
        string workerId FK
        datetime timestamp
        int activeJobCount
        float cpuPct
        float memMb
    }
    DeadLetterEntry {
        string id PK
        string jobId FK
        string queueId FK
        json payload
        string finalError
        int totalAttempts
        datetime movedAt
    }

    User ||--o{ OrganizationMember : "has memberships"
    Organization ||--o{ OrganizationMember : "contains members"
    Organization ||--o{ Project : "owns projects"
    Project ||--o{ Queue : "owns queues"
    Project ||--o{ RetryPolicy : "defines retry policies"
    Queue ||--o{ Job : "holds jobs"
    Queue ||--o{ ScheduledJob : "defines schedules"
    Queue ||--o{ JobBatch : "manages batches"
    Queue ||--o{ DeadLetterEntry : "sends to DLQ"
    RetryPolicy ||--o{ Queue : "configures default policy"
    RetryPolicy ||--o{ Job : "configures override policy"
    Worker ||--o{ Job : "claims jobs"
    Worker ||--o{ JobExecution : "runs executions"
    Worker ||--o{ WorkerHeartbeat : "reports heartbeats"
    Job ||--o{ JobExecution : "history of executions"
    Job ||--o| DeadLetterEntry : "is routed to DLQ"
    JobExecution ||--o{ JobLog : "writes logs"
```

For detailed explanations of major engineering trade-offs, index optimizations, normalization steps, and cascading behavior configurations, please refer to the complete **[DESIGN_DECISIONS.md](file:///Users/yashsrivastava32/.gemini/antigravity-ide/scratch/job-scheduler/DESIGN_DECISIONS.md)** file.

---

## Getting Started

### 1. Prerequisite Configuration

Clone the repository and copy the environment template:
```bash
cp .env.example .env
```
Update `.env` with your PostgreSQL database URL (e.g. Supabase or local instance) and session secret values.

### 2. Database Sync
Apply migrations or sync database schemas directly to the target database:
```bash
npx prisma db push
```

### 3. Local Development

#### Start the API Server:
```bash
npm run dev
```
Starts the API server on `http://localhost:3000`.

#### Start the Worker Processes:
```bash
# Starts a worker polling all queues with 5 slots of concurrency
npm run worker
```

#### Start the React Frontend Dashboard:
```bash
cd frontend
npm run dev
```
Serves the dashboard on `http://localhost:5173`.

---

## Running with Docker Compose

To spin up the entire stack (API, PostgreSQL database, Workers cluster, and Nginx-served Frontend dashboard) with a single command:
```bash
docker-compose up --build
```
- API Server: `http://localhost:3000`
- Frontend Dashboard: `http://localhost:80` (or the mapped Nginx port)
- Workers replica counts can be scaled dynamically.

---

## Running Tests

Execute the test suite (includes unit tests for backoff delays, atomic claim tests under worker concurrency, and worker crash recovery integration tests):
```bash
# Runs the tests in sequence to prevent concurrent DB table conflicts
npx vitest run --no-file-parallelism
```
