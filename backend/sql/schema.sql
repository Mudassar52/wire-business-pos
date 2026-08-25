-- ============================================================================
-- Wire Business POS — PostgreSQL / Supabase schema
-- Run this once in the Supabase SQL editor (or via `psql $DATABASE_URL -f schema.sql`)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- USERS  (admins + superadmin). Login is done by email, `role` gates access.
-- ---------------------------------------------------------------------------
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  username      text unique not null,
  email         text unique not null,
  password_hash text not null,
  name          text not null default '',
  phone         text not null default '',
  role          text not null check (role in ('admin','superadmin')),
  locked        boolean not null default false,
  plan          text check (plan in ('demo','month','year','custom')),
  plan_start    timestamptz,
  plan_end      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Subscription payments recorded by the super admin against an admin account
create table if not exists subscription_payments (
  id          bigserial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  amount      numeric(14,2) not null,
  method      text not null default '',
  note        text not null default '',
  date        timestamptz not null default now(),
  created_by  uuid references users(id)
);

-- ---------------------------------------------------------------------------
-- Per-business configuration lists (each admin/business owns its own lists)
-- ---------------------------------------------------------------------------
create table if not exists wire_types (
  id        bigserial primary key,
  owner_id  uuid not null references users(id) on delete cascade,
  name      text not null
);

create table if not exists thicknesses (
  id        bigserial primary key,
  owner_id  uuid not null references users(id) on delete cascade,
  name      text not null
);

create table if not exists expense_categories (
  id        bigserial primary key,
  owner_id  uuid not null references users(id) on delete cascade,
  name      text not null
);

create table if not exists settings (
  owner_id            uuid primary key references users(id) on delete cascade,
  business_name        text not null default 'Wire Business',
  currency             text not null default '$',
  phone                text not null default '',
  address              text not null default '',
  logo_data_url        text not null default '',
  owner_name            text not null default '',
  second_owner_name     text not null default '',
  second_owner_phone    text not null default '',
  invoice_heading       text not null default ''
);

-- ---------------------------------------------------------------------------
-- Core business entities
-- ---------------------------------------------------------------------------
create table if not exists products (
  id              bigserial primary key,
  owner_id        uuid not null references users(id) on delete cascade,
  name            text not null,
  wire_type       text not null default '',
  thickness       text not null default '',
  purchase_price  numeric(14,6) not null default 0,
  sale_price      numeric(14,6) not null default 0,
  min_stock       numeric(14,3) not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists suppliers (
  id         bigserial primary key,
  owner_id   uuid not null references users(id) on delete cascade,
  name       text not null,
  company    text not null default '',
  phone      text not null default '',
  address    text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id         bigserial primary key,
  owner_id   uuid not null references users(id) on delete cascade,
  name       text not null,
  phone      text not null default '',
  address    text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists purchases (
  id              bigserial primary key,
  owner_id        uuid not null references users(id) on delete cascade,
  -- RESTRICT (not SET NULL): deleting a supplier/product that still has
  -- purchase invoices is blocked instead of silently detaching them. A
  -- detached purchase used to sit invisibly in the DB forever — never shown
  -- in the UI, but still counted in Dashboard's purchase-spend total and
  -- excluded from the per-product cost basis — which is exactly what
  -- caused historical gross/net profit to drift out of sync with reality.
  supplier_id     bigint references suppliers(id) on delete restrict,
  invoice_number  text not null default '',
  date            date not null default current_date,
  product_id      bigint references products(id) on delete restrict,
  quantity_kg     numeric(14,3) not null,
  purchase_rate   numeric(14,6) not null,
  paid_amount     numeric(14,2) not null default 0,
  notes           text not null default '',
  created_at      timestamptz not null default now()
);

create table if not exists sales (
  id              bigserial primary key,
  owner_id        uuid not null references users(id) on delete cascade,
  date            date not null default current_date,
  customer_id     bigint references customers(id) on delete set null,
  walk_in_name    text default '',
  walk_in_phone   text default '',
  walk_in_address text default '',
  payment_method  text not null check (payment_method in ('cash','credit')),
  subtotal        numeric(14,2) not null default 0,
  gross_profit    numeric(14,2) not null default 0,
  paid_amount     numeric(14,2) not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists sale_lines (
  id            bigserial primary key,
  sale_id       bigint not null references sales(id) on delete cascade,
  -- Same reasoning as purchases.product_id above: block the delete rather
  -- than silently orphaning historical sale records.
  product_id    bigint references products(id) on delete restrict,
  quantity_kg   numeric(14,3) not null,
  sale_rate     numeric(14,6) not null,
  purchase_rate numeric(14,6) not null,
  date          date
);

create table if not exists expenses (
  id          bigserial primary key,
  owner_id    uuid not null references users(id) on delete cascade,
  title       text not null,
  category    text not null default '',
  amount      numeric(14,2) not null,
  date        date not null default current_date,
  description text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists credit_transactions (
  id          bigserial primary key,
  owner_id    uuid not null references users(id) on delete cascade,
  customer_id bigint not null references customers(id) on delete cascade,
  sale_id     bigint references sales(id) on delete set null,
  type        text not null check (type in ('sale','payment')),
  amount      numeric(14,2) not null,
  date        date not null default current_date,
  note        text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists supplier_payments (
  id          bigserial primary key,
  owner_id    uuid not null references users(id) on delete cascade,
  supplier_id bigint not null references suppliers(id) on delete cascade,
  purchase_id bigint references purchases(id) on delete set null,
  amount      numeric(14,2) not null,
  date        date not null default current_date,
  note        text not null default '',
  created_at  timestamptz not null default now()
);

-- Loss / damage tracking module
create table if not exists loss_records (
  id          bigserial primary key,
  owner_id    uuid not null references users(id) on delete cascade,
  product_id  bigint references products(id) on delete set null,
  quantity_kg numeric(14,3) not null,
  reason      text not null default '',
  date        date not null default current_date,
  notes       text not null default '',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Discounts (added later — kept as separate ALTERs so this file stays safe
-- to re-run against a database that was created before these columns existed)
-- ---------------------------------------------------------------------------
alter table purchases add column if not exists discount_amount numeric(14,2) not null default 0;
alter table sales add column if not exists discount_amount numeric(14,2) not null default 0;

-- ---------------------------------------------------------------------------
-- Rate precision fix (added later — safe to re-run on every boot)
-- ---------------------------------------------------------------------------
-- `purchase_rate`/`sale_rate`/`purchase_price`/`sale_price` are all stored
-- per-Kg internally (the UI enters a per-Ton rate and divides by 1000 before
-- saving), so a per-Ton value with 3 decimal places — e.g. 1091.027 — becomes
-- a per-Kg value that needs 6 decimal places (1.091027) to round-trip
-- exactly. These columns used to be numeric(14,2), which silently rounded
-- that down to 1.09 on save and showed a wrong, rounded rate (1090 instead
-- of 1091.027) after every refresh. Widening the columns here fixes it for
-- both new and already-existing databases — `alter column ... type` is a
-- no-op once the column is already numeric(14,6), so this is safe to run on
-- every startup.
alter table products alter column purchase_price type numeric(14,6);
alter table products alter column sale_price type numeric(14,6);
alter table purchases alter column purchase_rate type numeric(14,6);
alter table sale_lines alter column sale_rate type numeric(14,6);
alter table sale_lines alter column purchase_rate type numeric(14,6);

-- ---------------------------------------------------------------------------
-- Helpful indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_products_owner on products(owner_id);
create index if not exists idx_suppliers_owner on suppliers(owner_id);
create index if not exists idx_customers_owner on customers(owner_id);
create index if not exists idx_purchases_owner on purchases(owner_id);
create index if not exists idx_sales_owner on sales(owner_id);
create index if not exists idx_sale_lines_sale on sale_lines(sale_id);
create index if not exists idx_expenses_owner on expenses(owner_id);
create index if not exists idx_credit_owner on credit_transactions(owner_id);
create index if not exists idx_credit_customer on credit_transactions(customer_id);
create index if not exists idx_supplier_payments_owner on supplier_payments(owner_id);
create index if not exists idx_loss_owner on loss_records(owner_id);

-- ---------------------------------------------------------------------------
-- NOTE on Row Level Security:
-- This backend uses the Postgres/Supabase connection string directly from a
-- trusted Node/Express server (service-role style access), and enforces the
-- "owner_id" scoping itself in every query — not via Supabase client-side
-- auth. So RLS is left disabled here. If you ever expose Supabase's REST/
-- client SDK directly to the browser, enable RLS on every table above and
-- add policies that check auth.uid() = owner_id before doing so.
-- ---------------------------------------------------------------------------
