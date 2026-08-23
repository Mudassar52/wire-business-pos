import { Router } from "express";
import { requireAuth, requireRole, requireActiveAccount } from "../middleware/auth.js";
import { getDashboard } from "../controllers/dashboardController.js";

const router = Router();

router.use(requireAuth, requireRole("admin"), requireActiveAccount);

// GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults to today)
router.get("/", getDashboard);

export default router;
