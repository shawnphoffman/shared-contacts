# CardDAV Shared Contacts Server Architecture

## Overview

A self-hostable CardDAV server for managing shared contacts with a modern web-based management interface. All authenticated users can access all contacts (public shared address book model).

## Architecture Components

### 1. CardDAV Server

**Radicale** - lightweight Python-based CardDAV/CalDAV server
- Simple configuration
- Supports file-based storage
- Well-documented Docker images available
- Handles CardDAV protocol for client synchronization

### 2. Database Layer

**PostgreSQL** - Primary data store for contacts
- Stores contact information in queryable format
- Used by management UI for fast queries
- Synced with CardDAV server storage

### 3. Sync Service

**Custom Node.js/TypeScript service** that:
- Watches PostgreSQL for contact changes
- Converts database records to vCard format
- Pushes updates to Radicale's storage
- Handles bidirectional sync (CardDAV → DB → UI)

### 4. Management UI

**TanStack Start** application providing:
- Contact CRUD operations
- Search and filtering
- User-friendly interface
- Protected by Better Auth

### 5. Authentication

**Better Auth** integrated with TanStack Start
- User registration/login
- Session management
- Protects UI routes
- User management

## Architecture Diagram

```
┌─────────────────┐
│  CardDAV Client │
│  (iOS, Android, │
│   Thunderbird)  │
└────────┬────────┘
         │ CardDAV Protocol
         │
┌────────▼────────┐
│   Radicale      │
│  CardDAV Server │
└────────┬────────┘
         │
         │ Reads/Writes vCards
         │
┌────────▼────────┐
│  File Storage   │
│  (Radicale DB)  │
└─────────────────┘
         │
         │ (Sync Service monitors)
         │
┌────────▼────────┐      ┌──────────────────┐
│   Sync Service  │◄────►│   PostgreSQL     │
│  (Node.js/TS)   │      │  (Contact Data)  │
└────────┬────────┘      └────────┬─────────┘
         │                        │
         │                        │ (Queries)
         │                        │
┌────────▼────────────────────────▼─────────┐
│         TanStack Start UI                 │
│         (Management Interface)            │
└────────┬──────────────────────────────────┘
         │
         │ (Protected by)
         │
┌────────▼────────┐
│  Better Auth    │
│  (Auth Service) │
└─────────────────┘
```

## Data Flow

1. **UI → Database**: User creates/updates contact via web UI, stored in PostgreSQL
2. **Database → Sync Service**: Sync service polls database for changes
3. **Sync Service → Radicale**: Sync service converts to vCard and writes to Radicale storage
4. **Radicale → CardDAV Clients**: Clients sync via CardDAV protocol
5. **CardDAV Clients → Radicale**: Clients push changes via CardDAV
6. **Radicale → Sync Service**: File watcher detects changes in Radicale storage
7. **Sync Service → Database**: Sync service parses vCard and updates PostgreSQL

## Technology Stack

- **CardDAV Server**: Radicale (Python)
- **Database**: PostgreSQL 15+
- **Sync Service**: Node.js + TypeScript
- **UI Framework**: TanStack Start (React)
- **Authentication**: Better Auth
- **Containerization**: Docker + Docker Compose
- **vCard Processing**: Custom vCard parser/generator

## Database Schema

### Contacts Table

```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vcard_id VARCHAR(255) UNIQUE,
  full_name VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  organization VARCHAR(255),
  job_title VARCHAR(255),
  address TEXT,
  notes TEXT,
  vcard_data TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Auth Tables

Better Auth automatically creates the following tables:
- `user` - User accounts
- `session` - Active sessions
- `account` - Authentication accounts
- `verification` - Email verification tokens

## Docker Services

- `postgres`: PostgreSQL database
- `radicale`: CardDAV server
- `sync-service`: Sync between Radicale and PostgreSQL
- `ui`: TanStack Start management interface

## Ports

- **PostgreSQL**: 5432 (default)
- **Radicale**: 5232 (default)
- **UI**: 3010 (default)

## Environment Variables

See `.env.example` for all required environment variables.

## Security Considerations

1. **Authentication**: All UI routes are protected by Better Auth
2. **Database**: PostgreSQL uses password authentication
3. **CardDAV**: Radicale uses htpasswd authentication
4. **Network**: Services communicate via Docker internal network
5. **Secrets**: Use strong secrets for `BETTER_AUTH_SECRET` in production

## Deployment

1. Copy `.env.example` to `.env` and configure
2. Run `docker-compose up -d`
3. Access UI at `http://localhost:3010`
4. Configure CardDAV clients to connect to `http://localhost:5232`

## Future Enhancements

- Multi-user support with per-user contact lists
- Contact sharing permissions
- Import/export functionality
- Advanced search and filtering
- Contact groups/tags
- Photo support
- WebDAV support for file attachments

