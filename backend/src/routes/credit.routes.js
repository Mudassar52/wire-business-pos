import { Router } from "express";
import { requireAuth, requireRole, requireActiveAccount } from "../middleware/auth.js";
import { listCreditTransactions, recordCustomerPayment } from "../controllers/creditController.js";

const router = Router();

router.use(requireAuth, requireRole("admin"), requireActiveAccount);

router.get("/", listCreditTransactions);
router.post("/payments", recordCustomerPayment);

export default router;
