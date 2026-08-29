// Central API client — every request the app makes to the real backend
// (Node/Express + PostgreSQL) goes through here. This file replaces the old
// localStorage-only persistence: nothing about the business data lives in
// the browser anymore, it's all fetched from and saved to the database.

// Base URL of the backend. Configure via a .env file:
//   VITE_API_URL=http://localhost:4000/api
const API_BASE: string =
  (import.meta as any).env?.VITE_API_URL || "http://localhost:4000/api";

// The JWT itself is the one piece of data we still keep in the browser —
// it's a login credential, not app data, and without it every request would
// need the user to sign in again on every page refresh. We use
// sessionStorage (not localStorage) so it never silently outlives the
// browser tab/session.
const TOKEN_KEY = "wire_pos_token";

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T = any>(
  path: string,
  options: { method?: string; body?: any } = {}
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(
      "Could not reach the server. Check your connection and that the backend is running.",
      0
    );
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }

  if (!res.ok || (data && data.ok === false)) {
    const message = data?.message || `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

const get = <T = any>(path: string) => request<T>(path);
const post = <T = any>(path: string, body?: any) => request<T>(path, { method: "POST", body });
const patch = <T = any>(path: string, body?: any) => request<T>(path, { method: "PATCH", body });
const put = <T = any>(path: string, body?: any) => request<T>(path, { method: "PUT", body });
const del = <T = any>(path: string) => request<T>(path, { method: "DELETE" });

export const api = {
  auth: {
    login: (email: string, password: string) => post("/auth/login", { email, password }),
    me: () => get("/auth/me"),
    updateProfile: (data: any) => patch("/auth/me", data),
    changePassword: (oldPassword: string, newPassword: string) =>
      post("/auth/change-password", { oldPassword, newPassword }),
  },
  superadmin: {
    listUsers: () => get("/superadmin/users"),
    createUser: (data: any) => post("/superadmin/users", data),
    updateUser: (id: string, data: any) => patch(`/superadmin/users/${id}`, data),
    removeUser: (id: string) => del(`/superadmin/users/${id}`),
    setLocked: (id: string, locked: boolean) => patch(`/superadmin/users/${id}/lock`, { locked }),
    assignPlan: (id: string, plan: string, customDays?: number) =>
      post(`/superadmin/users/${id}/plan`, { plan, customDays }),
    clearPlan: (id: string) => del(`/superadmin/users/${id}/plan`),
    listPayments: () => get("/superadmin/payments"),
    recordPayment: (id: string, amount: number, method: string, note: string) =>
      post(`/superadmin/users/${id}/payments`, { amount, method, note }),
  },
  products: {
    list: () => get("/products"),
    create: (data: any) => post("/products", data),
    update: (id: number, data: any) => patch(`/products/${id}`, data),
    remove: (id: number) => del(`/products/${id}`),
  },
  suppliers: {
    list: () => get("/suppliers"),
    create: (data: any) => post("/suppliers", data),
    update: (id: number, data: any) => patch(`/suppliers/${id}`, data),
    remove: (id: number) => del(`/suppliers/${id}`),
  },
  customers: {
    list: () => get("/customers"),
    create: (data: any) => post("/customers", data),
    update: (id: number, data: any) => patch(`/customers/${id}`, data),
    remove: (id: number) => del(`/customers/${id}`),
  },
  purchases: {
    list: () => get("/purchases"),
    create: (data: any) => post("/purchases", data),
    update: (id: number, data: any) => patch(`/purchases/${id}`, data),
    remove: (id: number) => del(`/purchases/${id}`),
    pay: (id: number, amount: number, date?: string, note?: string) =>
      post(`/purchases/${id}/pay`, { amount, date, note }),
    listPayments: () => get("/purchases/payments/all"),
    recordPayment: (data: any) => post("/purchases/payments", data),
    removePayment: (id: number) => del(`/purchases/payments/${id}`),
  },
  sales: {
    list: () => get("/sales"),
    complete: (data: any) => post("/sales", data),
    edit: (id: number, data: any) => patch(`/sales/${id}`, data),
    remove: (id: number) => del(`/sales/${id}`),
    recordPayment: (id: number, amount: number, note: string, date?: string) =>
      post(`/sales/${id}/payments`, { amount, note, date }),
    paymentInfo: (id: number) => get(`/sales/${id}/payments`),
  },
  credit: {
    list: () => get("/credit"),
    recordPayment: (customerId: number, amount: number, note: string, date?: string) =>
      post("/credit/payments", { customerId, amount, note, date }),
    updatePayment: (id: number, data: { amount?: number; note?: string; date?: string }) =>
      patch(`/credit/payments/${id}`, data),
    removePayment: (id: number) => del(`/credit/payments/${id}`),
  },
  expenses: {
    list: () => get("/expenses"),
    create: (data: any) => post("/expenses", data),
    update: (id: number, data: any) => patch(`/expenses/${id}`, data),
    remove: (id: number) => del(`/expenses/${id}`),
  },
  lossRecords: {
    list: () => get("/loss-records"),
    create: (data: any) => post("/loss-records", data),
    remove: (id: number) => del(`/loss-records/${id}`),
  },
  lists: {
    get: (list: string) => get(`/lists/${list}`),
    add: (list: string, name: string) => post(`/lists/${list}`, { name }),
    remove: (list: string, name: string) => del(`/lists/${list}/${encodeURIComponent(name)}`),
  },
  settings: {
    get: () => get("/settings"),
    update: (data: any) => put("/settings", data),
  },
  dashboard: {
    get: (from?: string, to?: string) => {
      const qs = from && to ? `?from=${from}&to=${to}` : "";
      return get(`/dashboard${qs}`);
    },
  },
};
