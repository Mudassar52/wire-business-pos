import { Router } from "express";
import { requireAuth, requireRole, requireActiveAccount } from "../middleware/auth.js";
import { listCreditTransactions, recordCustomerPayment, updateCustomerPayment, removeCustomerPayment } from "../controllers/creditController.js";

const router = Router();

router.use(requireAuth, requireRole("admin"), requireActiveAccount);

router.get("/", listCreditTransactions);
router.post("/payments", recordCustomerPayment);
router.patch("/payments/:id", updateCustomerPayment);
router.delete("/payments/:id", removeCustomerPayment);

export default router;
