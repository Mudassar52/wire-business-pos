# Wire Business POS — Backend

Node.js + Express + PostgreSQL (Supabase) API for the Wire Business POS app.
Replaces the frontend's `localStorage` persistence with a real multi-tenant
database, JWT auth, and two roles:

- **superadmin** — manages admin (business) accounts, locks/unlocks them,
  assigns subscription plans, records subscription payments.
- **admin** — runs one business: products, suppliers, customers, purchases,
  sales/POS, expenses, credit, loss records, settings, dashboard.

Every admin's data is scoped by `owner_id`, so many businesses can share the
same database safely.

## 1. Set up Supabase (or any Postgres)

1. Create a project at https://supabase.com (or use any Postgres instance).
2. Open **SQL Editor** and run the contents of `sql/schema.sql` once.
3. Get your connection string: **Project Settings → Database → Connection
   string (URI)**.

## 2. Configure the server

```bash
cd backend
cp .env.example .env
# edit .env: paste your DATABASE_URL, set a strong JWT_SECRET,
# and set CORS_ORIGIN to your frontend URL
npm install
```

## 3. Create the first super admin

```bash
npm run seed:superadmin
```

This reads `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` from `.env` and
inserts the account once. Log in with those credentials, then create admin
(business) accounts from the super admin panel.

## 4. Run it

```bash
npm run dev     # nodemon, auto-restart
npm start       # plain node
```

Server listens on `http://localhost:4000` by default. Health check:
`GET /api/health`.

## Authentication

`POST /api/auth/login` with `{ "email": "...", "password": "..." }` returns
`{ token, user }`. Send the token on every other request:

```
Authorization: Bearer <token>
```

## API overview

### Auth (`/api/auth`)
| Method | Path | Notes |
|---|---|---|
| POST | `/login` | Email + password login (any role) |
| GET | `/me` | Current user |
| PATCH | `/me` | Update name/email/phone |
| POST | `/change-password` | `{ oldPassword, newPassword }` |

### Super admin (`/api/superadmin`, role = superadmin only)
| Method | Path | Notes |
|---|---|---|
| GET | `/users` | List all admin (business) accounts |
| POST | `/users` | Create an admin account `{ name, email, phone, password }` |
| PATCH | `/users/:id` | Update name/email/phone/password |
| DELETE | `/users/:id` | Remove an account |
| PATCH | `/users/:id/lock` | `{ locked: true|false }` |
| POST | `/users/:id/plan` | `{ plan: "demo"|"month"|"year"|"custom", customDays? }` |
| DELETE | `/users/:id/plan` | Clear the plan |
| GET | `/payments` | All subscription payments |
| POST | `/users/:id/payments` | Record a subscription payment `{ amount, method, note }` |

### Business data (role = admin, must be unlocked & plan active)
All under `/api`:

- `/products` (GET/POST, `/:id` PATCH/DELETE) — includes computed stock (`purchased`, `sold`, `remaining`, `cost`, `sale`, `profit`)
- `/suppliers` (GET/POST, `/:id` PATCH/DELETE)
- `/customers` (GET/POST, `/:id` PATCH/DELETE), `/customers/balances` (GET, with running credit balance)
- `/purchases` (GET/POST, `/:id` PATCH/DELETE), `/purchases/:id/pay` (POST, pay an invoice), `/purchases/payments/all` (GET), `/purchases/payments` (POST, free-standing supplier payment)
- `/sales` (GET/POST, `/:id` PATCH/DELETE) — POST does the full POS checkout with a stock check inside a DB transaction; `/sales/:id/payments` (GET/POST)
- `/credit` (GET all credit transactions), `/credit/payments` (POST, customer payment not tied to a specific sale)
- `/expenses` (GET/POST, `/:id` PATCH/DELETE)
- `/loss-records` (GET/POST, `/:id` DELETE)
- `/lists/:list` where `:list` is `wire-types` | `thicknesses` | `expense-categories` (GET/POST, `/:list/:name` DELETE)
- `/settings` (GET, PUT)
- `/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD` (GET) — revenue, purchase spend, gross profit, expenses, net profit, credit outstanding, stock valuation. Defaults to today; pass the same date twice for "yesterday", or a range for custom reports.

## Notes

- Passwords are hashed with bcrypt — never stored in plain text.
- Stock is never stored directly: it's always `sum(purchases.quantity_kg) - sum(sale_lines.quantity_kg)` for a product, computed live, exactly like the original frontend logic — so it can never drift out of sync.
- `completeSale` and `editSale` re-check available stock inside a Postgres transaction (`SELECT ... FOR UPDATE`) before writing, so two POS terminals selling the last of a product at the same time can't oversell it.
- A locked account or an expired plan is rejected on **every** request (not just at login), so a super admin's lock/expiry takes effect immediately.
- This server talks to Postgres directly with the `pg` driver using a
  trusted server-side connection, and enforces `owner_id` scoping in every
  query itself — so Supabase Row Level Security is intentionally left off
  (see the note at the bottom of `sql/schema.sql`). If you later expose
  Supabase's client SDK to the browser directly, enable RLS first.

## Connecting the existing React frontend

The frontend currently uses `localStorage` (`src/business.tsx`, `src/auth.tsx`)
directly. To wire it to this API, those two files' state/actions would be
replaced with `fetch`/`react-query` calls against the endpoints above (same
shapes, so most component code doesn't change). Ask me and I can do that
rewrite next.
