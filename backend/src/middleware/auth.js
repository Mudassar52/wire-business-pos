import { verifyToken } from "../utils/jwt.js";
import { query } from "../db.js";

/**
 * Verifies the Bearer JWT and attaches { id, role, email } to req.user.
 * Does NOT hit the database — cheap, used on every request.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, message: "Missing or invalid Authorization header" });
  }
  try {
    const payload = verifyToken(token);
    req.user = payload; // { id, role, email }
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "Session expired or invalid token, please log in again" });
  }
}

/**
 * Restricts a route to one or more roles, e.g. requireRole("superadmin")
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, message: "You do not have permission to access this resource" });
    }
    next();
  };
}

/**
 * For admin (business-owner) routes only: re-checks the user's current
 * locked/plan status straight from the database on every request, so a
 * super admin locking an account or letting a plan expire takes effect
 * immediately — not just at the next login.
 */
export async function requireActiveAccount(req, res, next) {
  try {
    if (req.user.role !== "admin") return next();
    const { rows } = await query(
      "select locked, plan_end from users where id = $1",
      [req.user.id]
    );
    const record = rows[0];
    if (!record) {
      return res.status(401).json({ ok: false, message: "Account no longer exists" });
    }
    if (record.locked) {
      return res.status(403).json({
        ok: false,
        message: "This account has been locked by the administrator. Contact support to regain access.",
      });
    }
    if (record.plan_end && new Date(record.plan_end).getTime() < Date.now()) {
      return res.status(403).json({
        ok: false,
        message: "Your subscription has expired. Contact the administrator to renew your plan.",
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}
