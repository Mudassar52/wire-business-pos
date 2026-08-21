import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "./api";

export type Product = { id: number; name: string; wireType: string; thickness: string; purchasePrice: number; salePrice: number; minStock: number };
export type Supplier = { id: number; name: string; company: string; phone: string; address: string; notes: string };
export type Customer = { id: number; name: string; phone: string; address: string };
export type Purchase = { id: number; supplierId: number; invoiceNumber: string; date: string; productId: number; quantityKg: number; purchaseRate: number; paidAmount: number; notes: string };
export type SaleLine = { productId: number; quantityKg: number; saleRate: number; purchaseRate: number; date?: string };
export type Sale = { id: number; date: string; customerId: number | null; walkInName?: string; walkInPhone?: string; walkInAddress?: string; paymentMethod: "cash" | "credit"; subtotal: number; grossProfit: number; paidAmount: number; lines: SaleLine[] };
export type Expense = { id: number; title: string; category: string; amount: number; date: string; description: string };
export type CreditTransaction = { id: number; customerId: number; saleId: number | null; type: "sale" | "payment"; amount: number; date: string; note: string };
export type SupplierPayment = { id: number; supplierId: number; purchaseId: number | null; amount: number; date: string; note: string };
export type Settings = { businessName: string; currency: string; phone: string; address: string; logoDataUrl: string; ownerName: string; secondOwnerName: string; secondOwnerPhone: string; invoiceHeading: string };

export type BusinessState = {
  products: Product[]; suppliers: Supplier[]; customers: Customer[]; purchases: Purchase[]; sales: Sale[];
  expenses: Expense[]; creditTransactions: CreditTransaction[]; supplierPayments: SupplierPayment[];
  wireTypes: string[]; thicknesses: string[]; expenseCategories: string[]; settings: Settings;
  loading: boolean;
};

type Result = { ok: boolean; message: string };

type ListKey = "wireTypes" | "thicknesses" | "expenseCategories";
type EntityKey = "products" | "suppliers" | "customers" | "expenses" | "purchases";

type BusinessActions = BusinessState & {
  add: (key: EntityKey | ListKey, item: any) => void;
  update: (key: EntityKey, id: number, item: any) => void;
  remove: (key: EntityKey | "supplierPayments", id: number) => void;
  removeListItem: (key: ListKey, value: string) => void;
  completeSale: (sale: Omit<Sale, "id"> & { id: 0 }, newCustomer?: { name: string; phone: string; address: string }) => Promise<Result>;
  editSale: (saleId: number, lines: SaleLine[], meta: { customerId: number | null; paymentMethod: "cash" | "credit"; paidAmount: number }) => Promise<Result>;
  removeSale: (saleId: number) => void;
  recordSalePayment: (saleId: number, amount: number, note: string, date?: string) => Promise<Result>;
  addPurchase: (purchase: Omit<Purchase, "id"> & { id: 0 }) => Promise<Result>;
  payPurchaseInvoice: (purchaseId: number, amount: number, date?: string, note?: string) => Promise<Result>;
  recordPayment: (customerId: number, amount: number, note: string, date?: string) => void;
  recordSupplierPayment: (supplierId: number, amount: number, note: string, date?: string) => void;
  updateSettings: (settings: Settings) => void;
  reset: () => void;
};

const LIST_ROUTES: Record<ListKey, string> = { wireTypes: "wire-types", thicknesses: "thicknesses", expenseCategories: "expense-categories" };
const ENTITY_ROUTES: Record<EntityKey, string> = { products: "/products", suppliers: "/suppliers", customers: "/customers", expenses: "/expenses", purchases: "/purchases" };

const DEFAULT_SETTINGS: Settings = { businessName: "Wire Business", currency: "$", phone: "", address: "", logoDataUrl: "", ownerName: "", secondOwnerName: "", secondOwnerPhone: "", invoiceHeading: "" };

const BusinessContext = createContext<BusinessActions | null>(null);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [wireTypes, setWireTypes] = useState<string[]>([]);
  const [thicknesses, setThicknesses] = useState<string[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const refreshProducts = async () => { try { const r = await api<{ products: Product[] }>("/products"); setProducts(r.products); } catch {} };
  const refreshSuppliers = async () => { try { const r = await api<{ suppliers: Supplier[] }>("/suppliers"); setSuppliers(r.suppliers); } catch {} };
  const refreshCustomers = async () => { try { const r = await api<{ customers: Customer[] }>("/customers"); setCustomers(r.customers); } catch {} };
  const refreshPurchases = async () => { try { const r = await api<{ purchases: Purchase[] }>("/purchases"); setPurchases(r.purchases); } catch {} };
  const refreshSales = async () => { try { const r = await api<{ sales: Sale[] }>("/sales"); setSales(r.sales); } catch {} };
  const refreshExpenses = async () => { try { const r = await api<{ expenses: Expense[] }>("/expenses"); setExpenses(r.expenses); } catch {} };
  const refreshCredit = async () => { try { const r = await api<{ creditTransactions: CreditTransaction[] }>("/credit"); setCreditTransactions(r.creditTransactions); } catch {} };
  const refreshSupplierPayments = async () => { try { const r = await api<{ supplierPayments: SupplierPayment[] }>("/purchases/payments/all"); setSupplierPayments(r.supplierPayments); } catch {} };
  const refreshLists = async () => {
    try {
      const [wt, th, ec] = await Promise.all([
        api<{ items: string[] }>("/lists/wire-types"),
        api<{ items: string[] }>("/lists/thicknesses"),
        api<{ items: string[] }>("/lists/expense-categories"),
      ]);
      setWireTypes(wt.items); setThicknesses(th.items); setExpenseCategories(ec.items);
    } catch {}
  };
  const refreshSettings = async () => { try { const r = await api<{ settings: Settings }>("/settings"); setSettings(r.settings); } catch {} };

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([
      refreshProducts(), refreshSuppliers(), refreshCustomers(), refreshPurchases(), refreshSales(),
      refreshExpenses(), refreshCredit(), refreshSupplierPayments(), refreshLists(), refreshSettings(),
    ]);
    setLoading(false);
  };

  useEffect(() => { refreshAll(); }, []);

  // ---------------------------------------------------------------------
  // Generic add / update / remove — optimistic locally, persisted via API,
  // reconciled by refetching the affected resource once the server replies.
  // ---------------------------------------------------------------------
  const add: BusinessActions["add"] = (key, item) => {
    if (key === "wireTypes" || key === "thicknesses" || key === "expenseCategories") {
      const setter = key === "wireTypes" ? setWireTypes : key === "thicknesses" ? setThicknesses : setExpenseCategories;
      setter((prev) => [...prev, item]);
      api(`/lists/${LIST_ROUTES[key]}`, { method: "POST", body: { name: item } }).catch(refreshLists);
      return;
    }
    const route = ENTITY_ROUTES[key as EntityKey];
    const refresher = { products: refreshProducts, suppliers: refreshSuppliers, customers: refreshCustomers, expenses: refreshExpenses, purchases: refreshPurchases }[key as EntityKey];
    api(route, { method: "POST", body: item }).then(refresher).catch(() => {});
  };

  const update: BusinessActions["update"] = (key, id, item) => {
    const route = ENTITY_ROUTES[key];
    const refresher = { products: refreshProducts, suppliers: refreshSuppliers, customers: refreshCustomers, expenses: refreshExpenses, purchases: refreshPurchases }[key];
    // Optimistic local merge for instant UI feedback.
    const setterMap: Record<EntityKey, (fn: (prev: any[]) => any[]) => void> = {
      products: setProducts as any, suppliers: setSuppliers as any, customers: setCustomers as any, expenses: setExpenses as any, purchases: setPurchases as any,
    };
    setterMap[key]((prev: any[]) => prev.map((x) => (x.id === id ? { ...x, ...item } : x)));
    api(`${route}/${id}`, { method: "PATCH", body: item }).then(refresher).catch(refresher);
  };

  const remove: BusinessActions["remove"] = (key, id) => {
    if (key === "supplierPayments") {
      setSupplierPayments((prev) => prev.filter((x) => x.id !== id));
      api(`/purchases/payments/${id}`, { method: "DELETE" }).catch(refreshSupplierPayments);
      return;
    }
    const route = ENTITY_ROUTES[key];
    const setterMap: Record<EntityKey, (fn: (prev: any[]) => any[]) => void> = {
      products: setProducts as any, suppliers: setSuppliers as any, customers: setCustomers as any, expenses: setExpenses as any, purchases: setPurchases as any,
    };
    setterMap[key]((prev: any[]) => prev.filter((x) => x.id !== id));
    api(`${route}/${id}`, { method: "DELETE" }).catch(() => {
      const refresher = { products: refreshProducts, suppliers: refreshSuppliers, customers: refreshCustomers, expenses: refreshExpenses, purchases: refreshPurchases }[key];
      refresher();
    });
  };

  const removeListItem: BusinessActions["removeListItem"] = (key, value) => {
    const setter = key === "wireTypes" ? setWireTypes : key === "thicknesses" ? setThicknesses : setExpenseCategories;
    setter((prev) => prev.filter((x) => x !== value));
    api(`/lists/${LIST_ROUTES[key]}/${encodeURIComponent(value)}`, { method: "DELETE" }).catch(refreshLists);
  };

  // ---------------------------------------------------------------------
  // Server-authoritative operations (stock checks, sale math, payments) —
  // these await the backend and surface its exact result to the caller.
  // ---------------------------------------------------------------------
  const completeSale: BusinessActions["completeSale"] = async (sale, newCustomer) => {
    try {
      const res = await api<{ message: string }>("/sales", {
        method: "POST",
        body: {
          date: sale.date, customerId: sale.customerId, walkInName: (sale as any).walkInName || "",
          walkInPhone: (sale as any).walkInPhone || "", walkInAddress: (sale as any).walkInAddress || "",
          paymentMethod: sale.paymentMethod, paidAmount: sale.paidAmount, lines: sale.lines, newCustomer,
        },
      });
      await Promise.all([refreshSales(), refreshCustomers(), refreshCredit()]);
      return { ok: true, message: res.message };
    } catch (err) {
      return { ok: false, message: err instanceof ApiError ? err.message : "Could not complete sale" };
    }
  };

  const editSale: BusinessActions["editSale"] = async (saleId, lines, meta) => {
    try {
      const res = await api<{ message: string }>(`/sales/${saleId}`, { method: "PATCH", body: { lines, ...meta } });
      await Promise.all([refreshSales(), refreshCredit()]);
      return { ok: true, message: res.message };
    } catch (err) {
      return { ok: false, message: err instanceof ApiError ? err.message : "Could not update sale" };
    }
  };

  const removeSale: BusinessActions["removeSale"] = (saleId) => {
    setSales((prev) => prev.filter((s) => s.id !== saleId));
    api(`/sales/${saleId}`, { method: "DELETE" }).then(() => { refreshCredit(); }).catch(refreshSales);
  };

  const recordSalePayment: BusinessActions["recordSalePayment"] = async (saleId, amount, note, date) => {
    try {
      const res = await api<{ message: string }>(`/sales/${saleId}/payments`, { method: "POST", body: { amount, note, date } });
      await refreshCredit();
      return { ok: true, message: res.message };
    } catch (err) {
      return { ok: false, message: err instanceof ApiError ? err.message : "Could not record payment" };
    }
  };

  const addPurchase: BusinessActions["addPurchase"] = async (purchase) => {
    try {
      const res = await api<{ message: string }>("/purchases", {
        method: "POST",
        body: {
          supplierId: purchase.supplierId, invoiceNumber: purchase.invoiceNumber, date: purchase.date,
          productId: purchase.productId, quantityKg: purchase.quantityKg, purchaseRate: purchase.purchaseRate,
          paidAmount: purchase.paidAmount, notes: purchase.notes,
        },
      });
      await refreshPurchases();
      return { ok: true, message: res.message };
    } catch (err) {
      return { ok: false, message: err instanceof ApiError ? err.message : "Could not save purchase" };
    }
  };

  const payPurchaseInvoice: BusinessActions["payPurchaseInvoice"] = async (purchaseId, amount, date, note) => {
    try {
      const res = await api<{ message: string }>(`/purchases/${purchaseId}/pay`, { method: "POST", body: { amount, date, note } });
      await Promise.all([refreshPurchases(), refreshSupplierPayments()]);
      return { ok: true, message: res.message };
    } catch (err) {
      return { ok: false, message: err instanceof ApiError ? err.message : "Could not record payment" };
    }
  };

  const recordPayment: BusinessActions["recordPayment"] = (customerId, amount, note, date) => {
    api("/credit/payments", { method: "POST", body: { customerId, amount, note, date } }).then(refreshCredit).catch(() => {});
  };

  const recordSupplierPayment: BusinessActions["recordSupplierPayment"] = (supplierId, amount, note, date) => {
    api("/purchases/payments", { method: "POST", body: { supplierId, amount, note, date } }).then(refreshSupplierPayments).catch(() => {});
  };

  const updateSettings: BusinessActions["updateSettings"] = (next) => {
    setSettings(next);
    api("/settings", { method: "PUT", body: next }).then(refreshSettings).catch(refreshSettings);
  };

  const reset: BusinessActions["reset"] = () => { refreshAll(); };

  const value: BusinessActions = {
    products, suppliers, customers, purchases, sales, expenses, creditTransactions, supplierPayments,
    wireTypes, thicknesses, expenseCategories, settings, loading,
    add, update, remove, removeListItem, completeSale, editSale, removeSale, recordSalePayment,
    addPurchase, payPurchaseInvoice, recordPayment, recordSupplierPayment, updateSettings, reset,
  };

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 text-sm font-semibold text-slate-500">
        Loading your business data…
      </div>
    );
  }

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useBusiness must be used within BusinessProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Pure helpers (unchanged shape from the original localStorage version) —
// they read from whatever BusinessState-shaped object is passed in.
// ---------------------------------------------------------------------------
export function money(n: number, currency = "$") {
  const v = Number.isFinite(n) ? n : 0;
  return `${currency}${Math.round(v).toLocaleString("en-US")}`;
}
export function qty(kg: number) {
  return `${Number((kg / 1000).toFixed(3)).toLocaleString("en-US")} Ton`;
}
export function dateLabel(d: string) {
  if (!d) return "";
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
}
export function inventoryStats(b: BusinessState, p: Product) {
  const purchased = b.purchases.filter((x) => x.productId === p.id).reduce((a, x) => a + x.quantityKg, 0);
  const sold = b.sales.flatMap((s) => s.lines).filter((l) => l.productId === p.id).reduce((a, l) => a + l.quantityKg, 0);
  const remaining = Math.max(0, purchased - sold);
  return {
    purchased, sold, remaining,
    cost: remaining * p.purchasePrice,
    sale: remaining * p.salePrice,
    profit: remaining * (p.salePrice - p.purchasePrice),
  };
}
export function saleCustomerLabel(b: BusinessState, s: Sale) {
  if (s.customerId) return b.customers.find((c) => c.id === s.customerId)?.name || "Walk-in customer";
  return s.walkInName?.trim() || "Walk-in customer";
}
export function salePaymentInfo(b: BusinessState, s: Sale) {
  const payments = b.creditTransactions.filter((t) => t.saleId === s.id && t.type === "payment").slice().sort((a, z) => a.date.localeCompare(z.date) || a.id - z.id);
  const paidAfterSale = payments.reduce((a, t) => a + t.amount, 0);
  const totalPaid = s.paidAmount + paidAfterSale;
  const remaining = Math.max(0, s.subtotal - totalPaid);
  return { payments, paidAfterSale, totalPaid, remaining };
}
