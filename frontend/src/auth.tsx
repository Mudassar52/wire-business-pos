import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "./api";

export type Role = "admin" | "superadmin";
export type PlanId = "demo" | "month" | "year";

export const PLAN_LABELS: Record<PlanId, string> = { demo: "Demo (3 days)", month: "Monthly plan (30 days)", year: "Yearly plan (365 days)" };
export const PLAN_DURATION_DAYS: Record<PlanId, number> = { demo: 3, month: 30, year: 365 };

// Note: `password` is intentionally never present here — the backend never
// sends password hashes to the client. `id` is the real database id
// (a uuid) used under the hood to talk to the backend; the rest of the app
// keeps addressing users by `username` as before.
export type AuthUser = {
  id?: string;
  username: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  locked?: boolean;
  plan?: PlanId | null;
  planStart?: string | null; // ISO datetime
  planEnd?: string | null; // ISO datetime
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
  date: string; // ISO datetime
};

type AuthActions = {
  user: AuthUser | null;
  users: AuthUser[];
  ready: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; message: string }>;
  logout: () => void;
  updateProfile: (data: Partial<Pick<AuthUser, "name" | "email" | "phone">>) => Promise<{ ok: boolean; message: string }>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ ok: boolean; message: string }>;
  addUser: (u: { username: string; password: string; name: string; email: string; phone: string; role: Role }) => Promise<{ ok: boolean; message: string }>;
  updateUser: (username: string, data: Partial<AuthUser> & { password?: string }) => void;
  removeUser: (username: string) => void;
  setLocked: (username: string, locked: boolean) => void;
  assignPlan: (username: string, plan: PlanId) => void;
  clearPlan: (username: string) => void;
  payments: Payment[];
  recordPayment: (username: string, amount: number, method: string, note: string) => Promise<{ ok: boolean; message: string }>;
};

const AuthContext = createContext<AuthActions | null>(null);

function fromApiUser(u: any): AuthUser {
  return { id: u.id, username: u.username, name: u.name, email: u.email, phone: u.phone, role: u.role, locked: u.locked, plan: u.plan, planStart: u.planStart, planEnd: u.planEnd };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [ready, setReady] = useState(false);

  // Restore the session (if a token is already stored) once on load.
  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) { setReady(true); return; }
      try {
        const res: any = await api.auth.me();
        setUser(fromApiUser(res.user));
      } catch {
        setToken(null);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Once we know we're the super admin, load the admin accounts + payments
  // it manages.
  useEffect(() => {
    if (user?.role !== "superadmin") { setUsers([]); setPayments([]); return; }
    (async () => {
      try {
        const [u, p]: any[] = await Promise.all([api.superadmin.listUsers(), api.superadmin.listPayments()]);
        setUsers((u.users || []).map(fromApiUser));
        setPayments(p.payments || []);
      } catch (err) {
        console.error("Failed to load admin accounts", err);
      }
    })();
  }, [user?.role]);

  const findId = (username: string) => users.find(u => u.username === username)?.id;

  const login: AuthActions["login"] = async (email, password) => {
    try {
      const res: any = await api.auth.login(email, password);
      setToken(res.token);
      setUser(fromApiUser(res.user));
      return { ok: true, message: res.message || `Welcome back, ${res.user.name}` };
    } catch (err: any) {
      return { ok: false, message: err?.message || "Could not sign in" };
    }
  };

  const logout = () => { setToken(null); setUser(null); };

  const updateProfile: AuthActions["updateProfile"] = async (data) => {
    if (!user) return { ok: false, message: "Not signed in" };
    try {
      const res: any = await api.auth.updateProfile(data);
      setUser(u => u ? fromApiUser(res.user) : u);
      return { ok: true, message: res.message || "Profile updated" };
    } catch (err: any) {
      return { ok: false, message: err?.message || "Could not update profile" };
    }
  };

  const changePassword: AuthActions["changePassword"] = async (oldPassword, newPassword) => {
    if (!user) return { ok: false, message: "Not signed in" };
    try {
      const res: any = await api.auth.changePassword(oldPassword, newPassword);
      return { ok: true, message: res.message || "Password changed successfully" };
    } catch (err: any) {
      return { ok: false, message: err?.message || "Could not change password" };
    }
  };

  const addUser: AuthActions["addUser"] = async (u) => {
    if (!u.email?.trim()) return { ok: false, message: "Email is required" };
    if (!u.password) return { ok: false, message: "Password is required" };
    try {
      const res: any = await api.superadmin.createUser({ name: u.name, email: u.email, phone: u.phone, password: u.password });
      setUsers(prev => [...prev, fromApiUser(res.user)]);
      return { ok: true, message: res.message || "User created" };
    } catch (err: any) {
      return { ok: false, message: err?.message || "Could not create user" };
    }
  };

  // The remaining admin-management actions update the visible list right
  // away (so the panel feels instant) and sync to the backend in the
  // background — errors are logged and the super admin can retry.
  const updateUser: AuthActions["updateUser"] = (uname, data) => {
    setUsers(prev => prev.map(x => x.username === uname ? { ...x, ...data } : x));
    const id = findId(uname);
    if (id) api.superadmin.updateUser(id, data).catch(err => console.error("Failed to update user", err));
  };

  const removeUser: AuthActions["removeUser"] = (uname) => {
    const id = findId(uname);
    setUsers(prev => prev.filter(x => x.username !== uname));
    if (id) api.superadmin.removeUser(id).catch(err => console.error("Failed to remove user", err));
  };

  const setLocked: AuthActions["setLocked"] = (uname, locked) => {
    setUsers(prev => prev.map(x => x.username === uname ? { ...x, locked } : x));
    const id = findId(uname);
    if (id) api.superadmin.setLocked(id, locked).catch(err => console.error("Failed to lock/unlock user", err));
  };

  const assignPlan: AuthActions["assignPlan"] = (uname, plan) => {
    const start = new Date();
    const end = new Date(start.getTime() + PLAN_DURATION_DAYS[plan] * 86400000);
    setUsers(prev => prev.map(x => x.username === uname ? { ...x, plan, planStart: start.toISOString(), planEnd: end.toISOString() } : x));
    const id = findId(uname);
    if (id) api.superadmin.assignPlan(id, plan).then((res: any) => {
      if (res.user) setUsers(prev => prev.map(x => x.username === uname ? fromApiUser(res.user) : x));
    }).catch(err => console.error("Failed to assign plan", err));
  };

  const clearPlan: AuthActions["clearPlan"] = (uname) => {
    setUsers(prev => prev.map(x => x.username === uname ? { ...x, plan: null, planStart: null, planEnd: null } : x));
    const id = findId(uname);
    if (id) api.superadmin.clearPlan(id).catch(err => console.error("Failed to clear plan", err));
  };

  const recordPayment: AuthActions["recordPayment"] = async (uname, amount, method, note) => {
    const target = users.find(x => x.username === uname);
    if (!target?.id) return { ok: false, message: "User not found" };
    if (!amount || amount <= 0) return { ok: false, message: "Enter a valid amount" };
    try {
      const res: any = await api.superadmin.recordPayment(target.id, amount, method, note);
      const p = res.payment;
      const entry: Payment = { id: p.id, username: uname, userName: target.name, amount: Number(p.amount), method: p.method, note: p.note, date: p.date };
      setPayments(prev => [entry, ...prev]);
      return { ok: true, message: res.message || `Payment of ${amount} recorded for ${target.name}` };
    } catch (err: any) {
      return { ok: false, message: err?.message || "Could not record payment" };
    }
  };

  return (
    <AuthContext.Provider value={{ user, users, ready, login, logout, updateProfile, changePassword, addUser, updateUser, removeUser, setLocked, assignPlan, clearPlan, payments, recordPayment }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
