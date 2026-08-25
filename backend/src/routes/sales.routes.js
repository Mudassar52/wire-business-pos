import { Router } from "express";
import { requireAuth, requireRole, requireActiveAccount } from "../middleware/auth.js";
import {
  listSales, completeSale, editSale, removeSale, recordSalePayment, getSalePaymentInfo,
} from "../controllers/salesController.js";

const router = Router();

router.use(requireAuth, requireRole("admin"), requireActiveAccount);

router.get("/", listSales);
router.post("/", completeSale);
router.patch("/:id", editSale);
router.delete("/:id", removeSale);
router.post("/:id/payments", recordSalePayment);
router.get("/:id/payments", getSalePaymentInfo);

export default router;
