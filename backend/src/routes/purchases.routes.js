import { Router } from "express";
import { requireAuth, requireRole, requireActiveAccount } from "../middleware/auth.js";
import {
  listPurchases, createPurchase, updatePurchase, removePurchase, payPurchaseInvoice,
} from "../controllers/purchasesController.js";
import { listSupplierPayments, recordSupplierPayment, removeSupplierPayment } from "../controllers/supplierPaymentsController.js";

const router = Router();

router.use(requireAuth, requireRole("admin"), requireActiveAccount);

router.get("/", listPurchases);
router.post("/", createPurchase);
router.patch("/:id", updatePurchase);
router.delete("/:id", removePurchase);
router.post("/:id/pay", payPurchaseInvoice);

router.get("/payments/all", listSupplierPayments);
router.post("/payments", recordSupplierPayment);
router.delete("/payments/:id", removeSupplierPayment);

export default router;
