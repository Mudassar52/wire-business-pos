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
  // Postgres foreign_key_violation
  if (err.code === "23503") {
    return res.status(409).json({ ok: false, message: "This record is referenced elsewhere and cannot be changed" });
  }

  const status = err.status || 500;
  res.status(status).json({ ok: false, message: err.message || "Internal server error" });
}
