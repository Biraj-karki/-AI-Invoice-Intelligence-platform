# AI Invoice Intelligence

Upload a PDF invoice, get its fields extracted, checked and charted — with the
original document always one click away.

Built as a small, complete product rather than a demo: accounts, private data,
database migrations, a review queue and tests.

## What it does

1. You upload a PDF invoice.
2. The backend extracts the text and asks Gemini for the header fields and line items.
3. The numbers are re-checked in code (`subtotal + tax = total`, line items add up).
   Anything that disagrees is marked **review** with a list of issues instead of
   being trusted.
4. You approve it, correct the fields, or reject and delete it.
5. The dashboard charts spend per currency, vendor and month; the list is
   searchable, filterable and exportable as CSV; the stored PDF is previewable.

**Money is stored as `NUMERIC(12,2)` and moved as strings** — never floats, and
totals are never added across currencies.

**Invoices are private to the account that uploaded them.** Every query is
filtered by `owner_id`. Asking for another account's invoice answers `404`, not
`403`, so ids cannot be probed.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind, Recharts |
| Backend | Python 3.12, FastAPI, Pydantic, SQLAlchemy 2 |
| Database | PostgreSQL, Alembic migrations |
| Extraction | Gemini (`google-genai`), `pdfplumber` for text |
| Tests | pytest (backend), Vitest + Testing Library (frontend) |

## Layout

```
backend/
  app/api/v1/        HTTP endpoints (auth, invoices, health)
  app/core/          settings, password hashing, JWT dependency
  app/models/        SQLAlchemy models (users, invoices, line_items)
  app/services/      extraction, normalisation, stats, CSV, PDF storage
  alembic/versions/  schema history
  scripts/           demo seeder
  tests/             pytest suite (runs in its own "pytest" schema)
frontend/
  src/app/           routes: login, invoices, invoice detail, dashboard, account
  src/components/    screens and shared UI primitives
  src/lib/           API client, session storage, formatting
```

## Prerequisites

- Python 3.12+
- Node.js 22+
- PostgreSQL 15+ running locally

## Setup

### 1. Database

Create a database and a user (once):

```sql
CREATE USER invoice_user WITH PASSWORD 'your-password';
CREATE DATABASE invoice_db OWNER invoice_user;
```

### 2. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env      # then edit DATABASE_URL and GEMINI_API_KEY
python -m alembic upgrade head   # create/upgrade the tables
```

Optional demo data (18 invoices for one account):

```powershell
python scripts\seed_demo_invoices.py --email you@example.com
```

Start it:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

- API: <http://127.0.0.1:8000/api/v1/health>
- Interactive docs: <http://127.0.0.1:8000/docs>

### 3. Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local   # NEXT_PUBLIC_API_BASE_URL points at the backend
npm run dev
```

Open <http://localhost:3000>, create the first account, then upload a PDF.

## Configuration

Everything lives in `backend/.env` (see `.env.example` for the full list).

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (`postgresql+psycopg://...`) |
| `GEMINI_API_KEY` | Google AI Studio key; extraction fails with a clear error without it |
| `JWT_SECRET` | Signs session tokens — replace before deploying |
| `ACCESS_TOKEN_MINUTES` | Session lifetime, default one day |
| `ALLOW_REGISTRATION` | Set `false` once your account exists so strangers cannot sign up |
| `CORS_ORIGINS` | Browser origins allowed to call the API |
| `STORAGE_DIR` | Where uploaded PDFs are kept (default `backend/storage`) |

Frontend: `NEXT_PUBLIC_API_BASE_URL` (default `http://127.0.0.1:8000`).

## Checks

```powershell
# backend
cd backend
.\.venv\Scripts\python.exe -m pytest

# frontend
cd frontend
npm test
npm run lint
npm run build
```

Backend tests use a disposable `pytest` schema inside the development database,
so they never read or change the invoices you created through the UI.

## Schema changes

```powershell
cd backend
python -m alembic revision --autogenerate -m "what changed"
python -m alembic upgrade head
```

Never edit an applied migration; add a new one.

## Known gaps

- **Scanned / photographed invoices do not work yet.** Text is read from the
  PDF's text layer, so a photo of a paper bill has nothing to extract (OCR is
  the next step for that).
- Upload is **one PDF at a time**.
- **No duplicate detection** — uploading the same invoice twice counts it twice.
- Invoices have no paid/unpaid state yet.
- Files are stored on local disk; a host with an ephemeral disk needs object
  storage before deploying.
