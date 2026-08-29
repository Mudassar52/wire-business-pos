export function notFoundHandler(req, res) {
  res.status(404).json({ ok: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error(err);

  if (err.name === "ZodError") {
    const fieldErrors = err.errors?.map((e) => ({ path: e.path.join("."), message: e.message })) || [];
    // Surface the first field-level problem in the top-level `message` too —
    // the frontend's error toast only ever shows `message`, so a generic
    // "Validation failed" with no detail leaves the user guessing which
    // field was the problem. The full list is still in `errors` for anyone
    // who wants it.
    const first = fieldErrors[0];
    const message = first ? `${first.path ? `${first.path}: ` : ""}${first.message}` : "Validation failed";
    return res.status(400).json({ ok: false, message, errors: fieldErrors });
  }

  // Postgres unique_violation
  if (err.code === "23505") {
    return res.status(409).json({ ok: false, message: "A record with these details already exists" });
  }
  // Postgres foreign_key_violation — e.g. trying to delete a Product or
  // Supplier that still has Purchase/Sale records pointing at it. These FKs
  // are intentionally ON DELETE RESTRICT (not SET NULL): silently detaching
  // a purchase/sale from its product instead of blocking the delete used to
  // leave "orphan" records behind — invisible in the UI, but still quietly
  // counted in Dashboard totals — which is exactly the profit-mismatch bug
  // this system had. Blocking the delete keeps every purchase/sale
  // permanently and correctly linked to a real product/supplier.
  if (err.code === "23503") {
    return res.status(409).json({
      ok: false,
      message:
        "This can't be deleted because it still has purchase or sale records linked to it. Remove those records first (or edit them to point at a different product/supplier).",
    });
  }

  const status = err.status || 500;
  res.status(status).json({ ok: false, message: err.message || "Internal server error" });
}
