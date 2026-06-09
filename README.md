# Project Management System - Backend API

A TypeScript-based REST API built with Hono and Prisma for managing collaborative project deliverables with advanced features like state-based permissions, task dependencies, and audit trails.

## Tech Stack

- **Runtime**: Node.js (TypeScript)
- **Framework**: Hono
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Auth**: JWT
- **Validation**: Zod

## Features

- ✅ Role-Based Access Control (RBAC) + Attribute-Based Access Control (ABAC)
- ✅ State-Based Permissions (permissions change based on task status)
- ✅ Task Dependencies with blocking logic
- ✅ Optimistic Locking for concurrency handling
- ✅ Immutable Audit Trail with soft deletes
- ✅ Multi-tenant isolation for client guests
- ✅ Data masking for sensitive information

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your database URL and JWT secret
```

3. Run Prisma migrations:
```bash
npm run db:migrate
```

4. Seed sample data:
```bash
npm run db:seed
```

### Development

```bash
npm run dev
```

Server runs on `http://localhost:3001`

### Production Build

```bash
npm run build
npm start
```

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `GET /auth/me` - Get current user

### Projects
- `GET /projects` - List projects
- `POST /projects` - Create project (PM only)
- `GET /projects/:id` - Get project details
- `PUT /projects/:id` - Update project (PM only)

### Tasks
- `GET /tasks/project/:projectId` - Get project tasks
- `POST /tasks` - Create task
- `PATCH /tasks/:id/status` - Update task status
- `PUT /tasks/:id` - Update task details
- `POST /tasks/:id/dependencies` - Add task dependency
- `GET /tasks/:id/blocked` - Check if task is blocked

### Audit & Reporting
- `GET /audit/project/:projectId` - Get audit logs
- `GET /audit/standup/:projectId` - Get daily standup summary

## Roles & Permissions

### Product Manager (PM)
- Full read/write access to projects and tasks
- Cannot mark task as DONE (only executor can)
- Can define task dependencies

### Internal Team (UI/UX, Frontend, Backend)
- View assigned project tasks
- Change task status based on dependencies
- Upload work attachments

### Client Guest
- View only client-visible tasks and aggregate metrics
- No access to internal details (names, comments, etc.)

## Concurrency Handling

The system uses optimistic locking with version fields. If a concurrent modification occurs, the API returns a 409 Conflict response.

## Deployment

The backend is configured for easy deployment to:
- Railway
- Render
- Fly.io
- Any Docker-compatible platform

Set the `DATABASE_URL` environment variable to your PostgreSQL connection string.

## License

MIT
# nodewave-backend-
# Updated
