import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  listUsers, createUser, updateUser, removeUser, setLocked,
  assignPlan, clearPlan, listPayments, recordPayment,
} from "../controllers/superadminController.js";

const router = Router();

router.use(requireAuth, requireRole("superadmin"));

router.get("/users", listUsers);
router.post("/users", createUser);
router.patch("/users/:id", updateUser);
router.delete("/users/:id", removeUser);
router.patch("/users/:id/lock", setLocked);
router.post("/users/:id/plan", assignPlan);
router.delete("/users/:id/plan", clearPlan);

router.get("/payments", listPayments);
router.post("/users/:id/payments", recordPayment);

export default router;
