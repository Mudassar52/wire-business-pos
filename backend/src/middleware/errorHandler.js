export function notFoundHandler(req, res) {
  res.status(404).json({ ok: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error(err);

  if (err.name === "ZodError") {
    return res.status(400).json({
      ok: false,
      message: "Validation failed",
      errors: err.errors?.map((e) => ({ path: e.path.join("."), message: e.message })),
    });
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
