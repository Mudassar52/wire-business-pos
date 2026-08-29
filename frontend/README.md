# Wire Business POS

A responsive React/Vite point-of-sale and inventory management system for businesses that sell wire by kilogram.

## Included modules

- Dashboard with live revenue, purchase spend, gross profit, expenses, net profit, credit, and stock metrics
- Point of Sale with kilogram-based stock validation and payment tracking
- Products / Wires catalog
- Inventory summary, stock movements, low-stock signals, and adjustments
- Purchases and supplier tracking
- Expenses
- Credit Management
- Loss / Damage tracking
- Reports with yesterday and custom date-range filters
- Settings

## Run locally

This app is part of the workspace monorepo. From the workspace root:

```bash
pnpm install
pnpm --filter @workspace/wire-business run dev
```

The app uses browser LocalStorage for persistence, so no database or API key is required.

## Verification

```bash
pnpm --filter @workspace/wire-business run typecheck
pnpm --filter @workspace/wire-business run build
```