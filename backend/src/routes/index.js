import { Router } from "express";
import authRoutes from "./auth.routes.js";
import superadminRoutes from "./superadmin.routes.js";
import businessRoutes from "./business.routes.js";
import salesRoutes from "./sales.routes.js";
import purchasesRoutes from "./purchases.routes.js";
import creditRoutes from "./credit.routes.js";
import dashboardRoutes from "./dashboard.routes.js";

const router = Router();

router.get("/health", (req, res) => res.json({ ok: true, message: "Wire Business POS API is running" }));

router.use("/auth", authRoutes);
router.use("/superadmin", superadminRoutes);
router.use("/sales", salesRoutes);
router.use("/purchases", purchasesRoutes);
router.use("/credit", creditRoutes);
router.use("/dashboard", dashboardRoutes);
// Products, suppliers, customers, expenses, lists, loss-records, settings
router.use("/", businessRoutes);

export default router;
