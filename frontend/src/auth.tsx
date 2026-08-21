import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, getToken, setToken, clearToken } from "./api";

export type Role = "admin" | "superadmin";
export type PlanId = "demo" | "month" | "year" | "custom";

export const PLAN_LABELS: Record<PlanId, string> = { demo: "Demo (3 days)", month: "Monthly plan (30 days)", year: "Yearly plan (365 days)", custom: "Custom plan" };
export const PLAN_DURATION_DAYS: Record<PlanId, number> = { demo: 3, month: 30, year: 365, custom: 30 };

export type AuthUser = {
  id: string; // server-assigned uuid — needed to address /superadmin/users/:id
  username: string;
  password?: string; // never sent by the server; kept optional for type compatibility
  name: string;
  email: string;
  phone: string;
  role: Role;
  locked?: boolean;
  plan?: PlanId | null;
  planStart?: string | null;
  planEnd?: string | null;
};

export function isPlanExpired(u: AuthUser): boolean {
  if (!u.planEnd) return false;
  return new Date(u.planEnd).getTime() < Date.now();
}

export type Payment = {
  id: number;
  username: string;
  userName: string;
  amount: number;
  method: string;
  note: string;
  date: string;
};

type Result = { ok: boolean; message: string };

type AuthActions = {
  user: AuthUser | null;
  users: AuthUser[]; // admin/business accounts — populated for the super admin
  initializing: boolean;
  login: (email: string, password: string) => Promise<Result>;
  logout: () => void;
  updateProfile: (data: Partial<Pick<AuthUser, "name" | "email" | "phone">>) => Promise<Result>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<Result>;
  addUser: (u: { name: string; email: string; phone: string; password: string }) => Promise<Result>;
  updateUser: (username: string, data: Partial<AuthUser> & { password?: string }) => void;
  removeUser: (username: string) => void;
  setLocked: (username: string, locked: boolean) => void;
  assignPlan: (username: string, plan: PlanId, customDays?: number) => void;
  clearPlan: (username: string) => void;
  payments: Payment[];
  recordPayment: (username: string, amount: number, method: string, note: string) => Promise<Result>;
};

const AuthContext = createContext<AuthActions | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [initializing, setInitializing] = useState(true);

  // Restore session from a stored JWT on first load.
  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) { setInitializing(false); return; }
      try {
        const res = await api<{ user: AuthUser }>("/auth/me");
        setUser(res.user);
      } catch {
        clearToken();
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  const refreshUsers = async () => {
    try {
      const res = await api<{ users: AuthUser[] }>("/superadmin/users");
      setUsers(res.users);
    } catch { /* not a super admin, or not logged in yet */ }
  };
  const refreshPayments = async () => {
    try {
      const res = await api<{ payments: Payment[] }>("/superadmin/payments");
      setPayments(res.payments);
    } catch { /* not a super admin, or not logged in yet */ }
  };

  // Once we know we're a super admin, load the accounts + payments they manage.
  useEffect(() => {
    if (user?.role === "superadmin") {
      refreshUsers();
      refreshPayments();
    } else {
      setUsers([]);
      setPayments([]);
    }
  }, [user?.role]);

  const login = async (email: string, password: string): Promise<Result> => {
    try {
      const res = await api<{ message: string; token: string; user: AuthUser }>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setToken(res.token);
      setUser(res.user);
      return { ok: true, message: res.message };
    } catch (err) {
      return { ok: false, message: err instanceof ApiError ? err.message : "Could not sign in" };
    }
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  const updateProfile: AuthActions["updateProfile"] = async (data) => {
    try {
      const res = await api<{ message: string; user: AuthUser }>("/auth/me", { method: "PATCH", body: data });
      setUser(res.user);
      return { ok: true, message: res.message };
    } catch (err) {
      return { ok: false, message: err instanceof ApiError ? err.message : "Could not update profile" };
    }
  };

  const changePassword: AuthActions["changePassword"] = async (oldPassword, newPassword) => {
    try {
      const res = await api<{ message: string }>("/auth/change-password", { method: "POST", body: { oldPassword, newPassword } });
      return { ok: true, message: res.message };
    } catch (err) {
      return { ok: false, message: err instanceof ApiError ? err.message : "Could not change password" };
    }
  };

  const addUser: AuthActions["addUser"] = async (u) => {
    try {
      const res = await api<{ message: string }>("/superadmin/users", { method: "POST", body: u });
      await refreshUsers();
      return { ok: true, message: res.message };
    } catch (err) {
      return { ok: false, message: err instanceof ApiError ? err.message : "Could not create user" };
    }
  };

  const idFor = (username: string) => users.find((u) => u.username === username)?.id;

  const updateUser: AuthActions["updateUser"] = (username, data) => {
    const id = idFor(username);
    if (!id) return;
    api(`/superadmin/users/${id}`, { method: "PATCH", body: data }).then(refreshUsers).catch(() => {});
  };

  const removeUser: AuthActions["removeUser"] = (username) => {
    const id = idFor(username);
    if (!id) return;
    api(`/superadmin/users/${id}`, { method: "DELETE" }).then(refreshUsers).catch(() => {});
  };

  const setLocked: AuthActions["setLocked"] = (username, locked) => {
    const id = idFor(username);
    if (!id) return;
    // Optimistic local flip so the UI responds instantly; reconciled by refreshUsers().
    setUsers((prev) => prev.map((u) => (u.username === username ? { ...u, locked } : u)));
    api(`/superadmin/users/${id}/lock`, { method: "PATCH", body: { locked } }).then(refreshUsers).catch(refreshUsers);
  };

  const assignPlan: AuthActions["assignPlan"] = (username, plan, customDays) => {
    const id = idFor(username);
    if (!id) return;
    api(`/superadmin/users/${id}/plan`, { method: "POST", body: { plan, customDays } }).then(refreshUsers).catch(() => {});
  };

  const clearPlan: AuthActions["clearPlan"] = (username) => {
    const id = idFor(username);
    if (!id) return;
    api(`/superadmin/users/${id}/plan`, { method: "DELETE" }).then(refreshUsers).catch(() => {});
  };

  const recordPayment: AuthActions["recordPayment"] = async (username, amount, method, note) => {
    const id = idFor(username);
    if (!id) return { ok: false, message: "User not found" };
    try {
      const res = await api<{ message: string }>(`/superadmin/users/${id}/payments`, { method: "POST", body: { amount, method, note } });
      await refreshPayments();
      return { ok: true, message: res.message };
    } catch (err) {
      return { ok: false, message: err instanceof ApiError ? err.message : "Could not record payment" };
    }
  };

  return (
    <AuthContext.Provider value={{ user, users, initializing, login, logout, updateProfile, changePassword, addUser, updateUser, removeUser, setLocked, assignPlan, clearPlan, payments, recordPayment }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
