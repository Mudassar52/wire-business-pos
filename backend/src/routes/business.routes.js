import { Router } from "express";
import { requireAuth, requireRole, requireActiveAccount } from "../middleware/auth.js";
import { getList, addListItem, removeListItem } from "../controllers/listsController.js";
import { listProducts, createProduct, updateProduct, removeProduct } from "../controllers/productsController.js";
import { listSuppliers, createSupplier, updateSupplier, removeSupplier } from "../controllers/suppliersController.js";
import { listCustomers, listCustomerBalances, createCustomer, updateCustomer, removeCustomer } from "../controllers/customersController.js";
import { listExpenses, createExpense, updateExpense, removeExpense } from "../controllers/expensesController.js";
import { getSettings, updateSettings } from "../controllers/settingsController.js";
import { listLossRecords, createLossRecord, removeLossRecord } from "../controllers/lossController.js";

const router = Router();

router.use(requireAuth, requireRole("admin"), requireActiveAccount);

// Configuration lists: wire-types | thicknesses | expense-categories
router.get("/lists/:list", getList);
router.post("/lists/:list", addListItem);
router.delete("/lists/:list/:name", removeListItem);

// Products
router.get("/products", listProducts);
router.post("/products", createProduct);
router.patch("/products/:id", updateProduct);
router.delete("/products/:id", removeProduct);

// Suppliers
router.get("/suppliers", listSuppliers);
router.post("/suppliers", createSupplier);
router.patch("/suppliers/:id", updateSupplier);
router.delete("/suppliers/:id", removeSupplier);

// Customers
router.get("/customers", listCustomers);
router.get("/customers/balances", listCustomerBalances);
router.post("/customers", createCustomer);
router.patch("/customers/:id", updateCustomer);
router.delete("/customers/:id", removeCustomer);

// Expenses
router.get("/expenses", listExpenses);
router.post("/expenses", createExpense);
router.patch("/expenses/:id", updateExpense);
router.delete("/expenses/:id", removeExpense);

// Loss / damage tracking
router.get("/loss-records", listLossRecords);
router.post("/loss-records", createLossRecord);
router.delete("/loss-records/:id", removeLossRecord);

// Settings
router.get("/settings", getSettings);
router.put("/settings", updateSettings);

export default router;
