import { type ReactNode, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Link, Route, Switch, useLocation, useParams } from "wouter";
import { AlertTriangle, Archive, ArrowDownToLine, ArrowUpRight, BarChart3, Bell, Boxes, Calculator, CalendarDays, Check, ChevronRight, CircleDollarSign, Clock, CreditCard, Download, Eye, EyeOff, FileBarChart, FileText, ImageUp, LayoutDashboard, Lock, LockKeyhole, LogOut, Menu, Package, Pencil, Plus, Receipt, Search, Settings as SettingsIcon, ShieldCheck, ShoppingCart, SlidersHorizontal, Trash2, Truck, Unlock, User, Users, Wallet, X, Zap } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { BusinessProvider, dateLabel, inventoryStats, money, purchaseTotal, qty, saleCustomerLabel, salePaymentInfo, salePaymentStatus, toLocalISODate, useBusiness, type Product, type SaleLine } from "./business";
import { AuthProvider, useAuth, isPlanExpired, PLAN_LABELS, PLAN_DURATION_DAYS, type AuthUser, type Payment, type PlanId, type Role } from "./auth";
import { buildInvoicePDF, downloadInvoicePDF, type InvoiceData } from "./invoice";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";

const queryClient = new QueryClient();
type Icon = typeof LayoutDashboard;
const THEME_KEY = "wire-business-theme";
function useTheme(){
  const [dark,setDark]=useState(()=>{
    try { const saved=localStorage.getItem(THEME_KEY); if(saved) return saved==="dark"; return window.matchMedia?.("(prefers-color-scheme: dark)").matches||false; } catch { return false; }
  });
  useEffect(()=>{
    document.documentElement.classList.toggle("dark",dark);
    try { localStorage.setItem(THEME_KEY, dark?"dark":"light"); } catch {}
  },[dark]);
  return {dark,toggle:()=>setDark(d=>!d)};
}
function ThemeToggle({dark,onToggle}:{dark:boolean;onToggle:()=>void}){
  return <button
    type="button"
    onClick={onToggle}
    aria-label={dark?"Switch to light mode":"Switch to dark mode"}
    aria-pressed={dark}
    title={dark?"Light mode":"Dark mode"}
    className="btn btn-ghost !p-2"
    data-testid="button-theme-toggle"
  >
    {dark?<EyeOff size={18}/>:<Eye size={18}/>}
  </button>;
}
const nav = [
  {href:"/",label:"Dashboard",icon:LayoutDashboard},
  {href:"/pos",label:"Point of Sale",icon:ShoppingCart},
  {href:"/sales",label:"Sales",icon:FileText},
  {href:"/products",label:"Products / Wires",icon:Package},
  {href:"/inventory",label:"Inventory",icon:Boxes},
  {href:"/suppliers",label:"Supplier Purchase",icon:Truck},
  {href:"/expenses",label:"Expenses",icon:Receipt},
  {href:"/credit",label:"Customer Accounts",icon:CreditCard},
  {href:"/reports",label:"Reports",icon:FileBarChart},
  {href:"/settings",label:"Settings",icon:SettingsIcon},
];
const superAdminNav = [
  {href:"/admin",label:"Admin Dashboard",icon:ShieldCheck},
  {href:"/admin/users",label:"User Management",icon:Users},
  {href:"/admin/payments",label:"Payments",icon:Wallet},
  {href:"/admin/reports",label:"Reports",icon:FileBarChart},
];
function useNotifications(){
  const b=useBusiness();
  return useMemo(()=>{
    const stock=b.products.map(p=>({p,s:inventoryStats(b,p)}));
    const alerts=[
      ...stock.filter(x=>x.s.remaining===0).map(x=>({id:`out-${x.p.id}`,date:today,kind:"out" as const,title:"Out of stock",detail:`${x.p.name} has no remaining stock`})),
      ...stock.filter(x=>x.s.remaining>0&&x.s.remaining<=x.p.minStock).map(x=>({id:`low-${x.p.id}`,date:today,kind:"low" as const,title:"Low stock",detail:`${x.p.name} is at ${qty(x.s.remaining)}, below the ${qty(x.p.minStock)} minimum`})),
    ];
    const activity=[
      ...b.sales.slice().reverse().slice(0,8).map(x=>({id:`sale-${x.id}`,date:x.date,kind:"sale" as const,title:"Sale recorded",detail:`${saleCustomerLabel(b,x)} bought ${x.lines.length} item${x.lines.length===1?"":"s"} for ${money(x.subtotal)}`})),
      ...b.purchases.slice().reverse().slice(0,4).map(x=>({id:`purchase-${x.id}`,date:x.date,kind:"purchase" as const,title:"Stock received",detail:`${b.products.find(p=>p.id===x.productId)?.name||"Wire stock"} · ${qty(x.quantityKg)} received`})),
    ];
    return [...alerts,...activity].sort((a,z)=>z.date.localeCompare(a.date));
  },[b]);
}
const notificationIconFor=(k:string)=>k==="out"?<Archive size={16}/>:k==="low"?<AlertTriangle size={16}/>:k==="sale"?<ShoppingCart size={16}/>:<ArrowDownToLine size={16}/>;
const notificationToneFor=(k:string)=>k==="out"?"bg-red-50 text-red-700":k==="low"?"bg-amber-50 text-amber-700":k==="sale"?"bg-emerald-50 text-emerald-700":"bg-teal-50 text-teal-700";
function NotificationBell(){
  const notifications=useNotifications();
  const [open,setOpen]=useState(false);
  const [loc]=useLocation();
  
  
  
  
  useEffect(()=>{setOpen(false)},[loc]);
  const badgeCount=notifications.filter(n=>n.kind==="low"||n.kind==="out").length;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" className="btn btn-ghost relative !p-2" aria-label="Notifications" data-testid="button-notifications-bell">
        <Bell size={18}/>
        {badgeCount>0&&<span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">{badgeCount}</span>}
      </button>
    </PopoverTrigger>
    <PopoverContent
      align="end"
      alignOffset={-8}
      sideOffset={10}
      collisionPadding={12}
      avoidCollisions
      className="z-[60] w-[min(22rem,calc(100vw-1.5rem))] max-w-sm p-0"
      data-testid="popover-notifications"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-display text-sm font-bold text-slate-800">Notifications</h3>
        {badgeCount>0&&<span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">{badgeCount} need attention</span>}
      </div>
      <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
        {notifications.length?<div className="divide-y">{notifications.map(n=><div key={n.id} className="flex items-start gap-3 p-3" data-testid={`notification-${n.id}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${notificationToneFor(n.kind)}`}>{notificationIconFor(n.kind)}</span><div className="min-w-0 flex-1"><div className="text-xs font-bold text-slate-800">{n.title}</div><div className="mt-0.5 text-[11px] leading-4 text-slate-500">{n.detail}</div></div><div className="shrink-0 whitespace-nowrap text-[10px] text-slate-400">{dateLabel(n.date)}</div></div>)}</div>:<div className="px-4 py-10 text-center"><Bell size={20} className="mx-auto text-slate-300"/><p className="mt-2 text-xs text-slate-500">No notifications right now.</p></div>}
      </div>
    </PopoverContent>
  </Popover>;
}
function ProfileMenu(){
  const auth=useAuth();
  const [open,setOpen]=useState(false);
  const [loc,setLoc]=useLocation();
  useEffect(()=>{setOpen(false)},[loc]);
  const user=auth.user;
  const initials=(user?.name||"?").split(" ").filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase();
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-slate-100" data-testid="button-profile-menu" title="Account menu">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-bold text-white shadow-sm">{initials||"U"}</div>
        <div className="hidden text-left sm:block"><div className="text-xs font-bold text-slate-800">{user?.name||"Account"}</div><div className="text-[10px] text-slate-500 capitalize">{user?.role==="superadmin"?"Super Admin":"Administrator"}</div></div>
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" alignOffset={-4} sideOffset={10} className="z-[60] w-64 p-0" data-testid="popover-profile-menu">
      <div className="flex items-center gap-3 border-b p-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white">{initials||"U"}</div><div className="min-w-0"><div className="truncate text-sm font-bold text-slate-800">{user?.name}</div><div className="truncate text-xs text-slate-500">{user?.email}</div></div></div>
      <div className="p-2">
        <button type="button" onClick={()=>setLoc("/profile")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100" data-testid="link-my-profile"><User size={15}/> My profile</button>
        <button type="button" onClick={()=>setLoc("/settings")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100" data-testid="link-open-settings"><SettingsIcon size={15}/> Settings</button>
        <div className="my-1 h-px bg-slate-100"/>
        <button type="button" onClick={()=>auth.logout()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50" data-testid="button-logout"><LogOut size={15}/> Log out</button>
      </div>
    </PopoverContent>
  </Popover>;
}
// See toLocalISODate in business.tsx: toISOString() converts to UTC first,
// which made "today" resolve to the previous day during early local hours
// for timezones ahead of UTC (e.g. Pakistan) — sales looked completed but
// silently dropped out of every "today" stat. Use local date math instead.
const today = toLocalISODate();
const yesterday = toLocalISODate(new Date(Date.now()-86400000));
const blankProduct={name:"",wireType:"",thickness:"",purchasePrice:"",salePrice:"",minStock:""};
const Field=({label,children,wide=false}:{label:string;children:ReactNode;wide?:boolean})=><label className={wide?"md:col-span-2 block space-y-1":"block space-y-1"}><span className="text-xs font-bold text-slate-600">{label}</span>{children}</label>;
const AutoDate=({date,onChange,testId}:{date:string;onChange?:(v:string)=>void;testId?:string})=>onChange?<input type="date" className="input-field" value={date} onChange={e=>onChange(e.target.value)} data-testid={testId}/>:<div className="input-field flex items-center justify-between text-slate-700" data-testid={testId}><span className="font-semibold">{dateLabel(date)}</span><span className="text-xs text-slate-400">{new Date(`${date}T00:00:00`).toLocaleDateString("en-PK",{weekday:"long"})}</span></div>;
const Button=({children,variant="primary",onClick,disabled=false,testId,className=""}:{children:ReactNode;variant?:"primary"|"secondary"|"ghost"|"danger";onClick?:()=>void;disabled?:boolean;testId?:string;className?:string})=><button type="button" onClick={onClick} disabled={disabled} data-testid={testId} className={`btn btn-${variant} ${disabled?"opacity-50 cursor-not-allowed":""} ${className}`}>{children}</button>;
const KG_PER_TON=1000;
// Powers every Ton<->Kg and per-Ton-rate<->per-Kg-rate input in the app (see
// SaleQuantityInput, QuantityInput, PriceInput below). These fields store a
// small per-Kg number internally but let the user type in per-Ton units, so
// they convert on every keystroke. The old approach recomputed the
// displayed text straight from that converted number every render — which
// meant typing "0.08" one character at a time never worked: after typing
// "0" then ".", Number("0.") is 0, so the displayed text snapped back to
// "0" and the "." the user just typed vanished, making decimals like 0.08
// (80 Kg) or a bare trailing "." impossible to enter. This hook instead
// treats whatever the user is typing as the source of truth for display,
// and only reformats the text when the underlying value changes from
// somewhere else (e.g. the field being reset after "Add to cart").
function useRoundTripText(storedValue:string, onChangeStored:(v:string)=>void, toDisplay:(n:number)=>number, toStored:(n:number)=>number){
  const format=(v:string)=>v===""?"":String(Number(toDisplay(Number(v||0)).toFixed(9)));
  const [text,setText]=useState(()=>format(storedValue));
  useEffect(()=>{
    const storedFromText = text===""?0:toStored(Number(text)||0);
    if (Math.abs(storedFromText-Number(storedValue||0))>1e-9) setText(format(storedValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[storedValue]);
  const handleChange=(v:string)=>{
    setText(v);
    if(v===""){onChangeStored("");return}
    const n=Number(v);
    if(Number.isNaN(n))return;
    onChangeStored(String(toStored(n)));
  };
  return {text,handleChange};
}

function QuantityInput({kgValue,onChangeKg,testIdPrefix,label="Quantity"}:{kgValue:string;onChangeKg:(v:string)=>void;testIdPrefix:string;label?:string}){
  const kgNum=Number(kgValue||0);
  const {text,handleChange}=useRoundTripText(kgValue,onChangeKg,kg=>kg/KG_PER_TON,ton=>ton*KG_PER_TON);
  return <div>
    <div className="mb-1"><span className="text-xs font-bold text-slate-600">{label}</span></div>
    <input type="number" min="0" step="any" className="input-field" value={text} onChange={e=>handleChange(e.target.value)} placeholder="e.g. 0.5" data-testid={`input-${testIdPrefix}-quantity`}/>
    <div className="mt-1 text-[11px] text-slate-400">{kgNum>0?`= ${qty(kgNum)} · auto-calculates the total`:"Enter the quantity in Ton — auto-calculates the total"}</div>
  </div>;
}

function PriceInput({perKgValue,onChangePerKg,testIdPrefix,label="Rate per Ton"}:{perKgValue:string;onChangePerKg:(v:string)=>void;testIdPrefix:string;label?:string}){
  const perKgNum=Number(perKgValue||0);
  const {text,handleChange}=useRoundTripText(perKgValue,onChangePerKg,perKg=>perKg*KG_PER_TON,perTon=>perTon/KG_PER_TON);
  return <div>
    <div className="mb-1"><span className="text-xs font-bold text-slate-600">{label}</span></div>
    <input type="number" min="0" step="any" className="input-field" value={text} onChange={e=>handleChange(e.target.value)} placeholder="e.g. 510000" data-testid={`input-${testIdPrefix}-rate`}/>
    <div className="mt-1 text-[11px] text-slate-400">{perKgNum>0?"Auto-calculated on every sale or purchase":"Enter the rate you buy/sell at per Ton — auto-calculates on every sale"}</div>
  </div>;
}

function SaleQuantityInput({kgValue,onChangeKg,testIdPrefix,ratePerKg}:{kgValue:string;onChangeKg:(v:string)=>void;testIdPrefix:string;ratePerKg?:number}){
  const kgNum=Number(kgValue||0);
  const {text,handleChange}=useRoundTripText(kgValue,onChangeKg,kg=>kg/KG_PER_TON,ton=>ton*KG_PER_TON);
  return <div>
    <div className="mb-1"><span className="text-xs font-bold text-slate-600">Quantity (Ton)</span></div>
    <input type="number" min="0" step="any" className="input-field" value={text} onChange={e=>handleChange(e.target.value)} placeholder="e.g. 0.5" data-testid={`input-${testIdPrefix}-quantity`}/>
    <div className="mt-1 text-[11px] text-slate-400">{kgNum>0&&ratePerKg?`= ${money(kgNum*ratePerKg)} · price auto-detected`:"Enter how many Ton the customer is buying — price auto-detects"}</div>
  </div>;
}
function SuperAdminShell({children}:{children:ReactNode}) {
  const [loc]=useLocation(); const [open,setOpen]=useState(false); const {dark,toggle}=useTheme();
  const [railCollapsed,setRailCollapsed]=useState(()=>{try{return localStorage.getItem("wire-superadmin-rail")==="collapsed"}catch{return false}});
  useEffect(()=>{try{localStorage.setItem("wire-superadmin-rail",railCollapsed?"collapsed":"open")}catch{}},[railCollapsed]);
  const toggleMenu=()=>{ if(window.innerWidth<1024) setOpen(o=>!o); else setRailCollapsed(c=>!c); };
  useEffect(()=>{setOpen(false); window.scrollTo(0,0)},[loc]);
  const active=superAdminNav.find(x=>x.href===loc)?.label||(loc==="/profile"?"My profile":"Super Admin");
  const railW=railCollapsed?"w-[76px]":"w-[238px]";
  return <div className="app-shell flex">
     <aside className={`app-sidebar drawer-panel fixed inset-y-0 left-0 z-40 ${railW} max-h-dvh flex-col overflow-y-auto overscroll-contain px-3 py-5 transition-[width] duration-200 lg:flex ${open?"!flex":"hidden"}`} aria-label="Super admin navigation">
      <div className={`flex items-center gap-3 px-3 pb-8 ${railCollapsed?"lg:justify-center lg:px-0":""}`}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white"><ShieldCheck size={19}/></div><div className={railCollapsed?"lg:hidden":""}><div className="font-display text-lg font-bold tracking-tight text-emerald-600">Tech Riwaayat</div><div className="text-[10px] font-bold uppercase tracking-[.18em] text-teal-700">Super Admin</div></div><button className="ml-auto text-slate-500 lg:hidden" onClick={()=>setOpen(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className={`mb-3 px-3 text-[10px] font-bold uppercase tracking-[.15em] text-slate-400 ${railCollapsed?"lg:hidden":""}`}>Control center</div>
      <nav className="space-y-1">{superAdminNav.map(n=>{const I=n.icon;return <Link key={n.href} href={n.href} onClick={()=>setOpen(false)} title={railCollapsed?n.label:undefined} data-testid={`link-${n.label.toLowerCase().replaceAll(" ","-")}`} className={`sidebar-link ${loc===n.href?"active":""} ${railCollapsed?"lg:justify-center lg:px-0":""}`}><I size={16}/><span className={railCollapsed?"lg:hidden":""}>{n.label}</span></Link>})}</nav>
    </aside>
     {open&&<div className="fixed inset-0 z-30 touch-none overscroll-contain bg-slate-950/30 lg:hidden" onClick={()=>setOpen(false)} onTouchMove={e=>e.preventDefault()} aria-hidden="true"/>}
    <main className={`min-w-0 flex-1 transition-[margin] duration-200 ${railCollapsed?"lg:ml-[76px]":"lg:ml-[238px]"}`}>
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b bg-white/95 px-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-3"><button className="btn btn-ghost !p-2" onClick={toggleMenu} aria-label={open||!railCollapsed?"Collapse menu":"Expand menu"} data-testid="button-open-menu"><Menu size={20}/></button><div><div className="text-xs font-medium text-slate-500">Super Admin / {active}</div><h1 className="font-display text-lg font-bold text-emerald-950">{active}</h1></div></div>
        <div className="flex items-center gap-3"><ThemeToggle dark={dark} onToggle={toggle}/><div className="hidden h-8 w-px bg-slate-200 sm:block"/><ProfileMenu/></div>
      </header>
      <div className="mobile-content p-4 md:p-8"><div className="mx-auto max-w-[1500px]">{children}</div></div>
    </main>
  </div>;
}
function SuperAdminRouter(){return <Switch><Route path="/admin/users" component={UserManagement}/><Route path="/admin/payments" component={AdminPayments}/><Route path="/admin/reports" component={AdminReports}/><Route path="/profile" component={ProfilePage}/><Route path="/admin" component={SuperAdminDashboard}/><Route path="/" component={SuperAdminDashboard}/><Route component={NotFound}/></Switch>}
function Shell({children}:{children:ReactNode}) {
  const [loc,setLoc]=useLocation(); const [open,setOpen]=useState(false); const {dark,toggle}=useTheme();
  const [railCollapsed,setRailCollapsed]=useState(()=>{try{return localStorage.getItem("wire-business-rail")==="collapsed"}catch{return false}});
  useEffect(()=>{try{localStorage.setItem("wire-business-rail",railCollapsed?"collapsed":"open")}catch{}},[railCollapsed]);
  const toggleMenu=()=>{ if(window.innerWidth<1024) setOpen(o=>!o); else setRailCollapsed(c=>!c); };
   useEffect(()=>{
     if(!open) return;
     
     
     
     
     const scrollY=window.scrollY;
     const{style}=document.body;
     const prev={position:style.position,top:style.top,left:style.left,right:style.right,width:style.width,overflow:style.overflow};
     style.position="fixed"; style.top=`-${scrollY}px`; style.left="0"; style.right="0"; style.width="100%"; style.overflow="hidden";
     return ()=>{
       style.position=prev.position; style.top=prev.top; style.left=prev.left; style.right=prev.right; style.width=prev.width; style.overflow=prev.overflow;
       window.scrollTo(0,scrollY);
     };
   },[open]);
   useEffect(()=>{setOpen(false); window.scrollTo(0,0)},[loc]);
  const active=nav.find(x=>x.href===loc||(x.href!=="/"&&loc.startsWith(x.href+"/")))?.label||(loc.startsWith("/customers/")?"Customer Accounts":loc.startsWith("/sales/")?"Sales":"Wire Business");
  const railW=railCollapsed?"w-[76px]":"w-[238px]";
  return <div className="app-shell flex">
     <aside className={`app-sidebar drawer-panel desktop-sidebar fixed inset-y-0 left-0 z-40 ${railW} max-h-dvh flex-col overflow-y-auto overscroll-contain px-3 py-5 transition-[width] duration-200 lg:flex ${open?"!flex":"hidden"}`} aria-label="Primary navigation">
      <div className={`flex items-center gap-3 px-3 pb-8 ${railCollapsed?"lg:justify-center lg:px-0":""}`}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-400 text-slate-900"><Zap size={19} fill="currentColor"/></div><div className={railCollapsed?"lg:hidden":""}><div className="font-display text-lg font-bold tracking-tight text-emerald-600">Tech Riwaayat</div><div className="text-[10px] font-bold uppercase tracking-[.18em] text-teal-700">Business POS</div></div><button className="ml-auto text-slate-500 lg:hidden" onClick={()=>setOpen(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className={`mb-3 px-3 text-[10px] font-bold uppercase tracking-[.15em] text-slate-400 ${railCollapsed?"lg:hidden":""}`}>Workspace</div>
      <nav className="space-y-1">{nav.map(n=>{const I=n.icon;return <Link key={n.href} href={n.href} onClick={()=>setOpen(false)} title={railCollapsed?n.label:undefined} data-testid={`link-${n.label.toLowerCase().replaceAll(" ","-")}`} className={`sidebar-link ${loc===n.href?"active":""} ${railCollapsed?"lg:justify-center lg:px-0":""}`}><I size={16}/><span className={railCollapsed?"lg:hidden":""}>{n.label}</span></Link>})}</nav>
    </aside>
     {open&&<div className="fixed inset-0 z-30 touch-none overscroll-contain bg-slate-950/30 lg:hidden" onClick={()=>setOpen(false)} onTouchMove={e=>e.preventDefault()} aria-hidden="true"/>}
    <main className={`min-w-0 flex-1 transition-[margin] duration-200 ${railCollapsed?"lg:ml-[76px]":"lg:ml-[238px]"}`}>
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b bg-white/95 px-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-3"><button className="btn btn-ghost !p-2" onClick={toggleMenu} aria-label={open||!railCollapsed?"Collapse menu":"Expand menu"} data-testid="button-open-menu"><Menu size={20}/></button><div><div className="text-xs font-medium text-slate-500">Operations / {active}</div><h1 className="font-display text-lg font-bold text-emerald-950">{active}</h1></div></div>
        <div className="flex items-center gap-3"><ThemeToggle dark={dark} onToggle={toggle}/><NotificationBell/><div className="hidden h-8 w-px bg-slate-200 sm:block"/><ProfileMenu/></div>
      </header>
      <div className="mobile-content p-4 md:p-8"><div className="mx-auto max-w-[1500px]">{children}</div></div>
    </main>
  </div>;
}

function PageHead({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:ReactNode}){return <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="kicker">{eyebrow}</div><h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-emerald-950 md:text-3xl">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>{action}</div>}
function Metric({label,value,sub,icon:Icon,accent="emerald"}:{label:string;value:string;sub:string;icon:Icon;accent?:string}){return <div className="data-card reveal p-4"><div className="mb-4 flex items-start justify-between"><span className={`grid h-9 w-9 place-items-center rounded-lg ${accent==="teal"?"bg-teal-50 text-teal-700":accent==="amber"?"bg-amber-50 text-amber-700":"bg-emerald-50 text-emerald-700"}`}><Icon size={17}/></span><ArrowUpRight size={15} className="text-slate-300"/></div><div className="text-xs font-semibold text-slate-500">{label}</div><div className="metric-value mt-1" data-testid={`metric-${label.toLowerCase().replaceAll(" ","-")}`}>{value}</div><div className="mt-1 text-[11px] text-slate-400">{sub}</div></div>}
function SalesProfitChart({data}:{data:{day:string;revenue:number;profit:number}[]}){return <div className="mt-6 h-56 w-full" data-testid="chart-sales-profit"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{top:8,right:4,left:-18,bottom:0}} barCategoryGap="28%"><CartesianGrid vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-700" opacity={0.6}/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize:11,fill:"currentColor"}} className="text-slate-400 dark:text-slate-400"/><YAxis axisLine={false} tickLine={false} tick={{fontSize:10,fill:"currentColor"}} className="text-slate-400 dark:text-slate-400" tickFormatter={value=>value>=1000?`${Math.round(value/1000)}k`:String(value)}/><ChartTooltip cursor={{fill:"rgba(148,163,184,0.18)"}} contentStyle={{background:"hsl(var(--card))",border:"1px solid hsl(var(--border))",borderRadius:8,color:"hsl(var(--foreground))",fontSize:12}} formatter={(value:number,name:string)=>[money(value),name==="revenue"?"Revenue":"Gross profit"]}/><Bar dataKey="revenue" name="revenue" fill="#b7d5f7" radius={[4,4,0,0]}/><Bar dataKey="profit" name="profit" fill="#0eaec7" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>}
function Toast({message,onClose}:{message:string;onClose:()=>void}){useEffect(()=>{if(!message)return;const t=setTimeout(onClose,3200);return ()=>clearTimeout(t)},[message]);return message?<div className="fixed bottom-5 right-5 z-50 flex max-w-[90vw] items-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl" data-testid="toast-notification"><Check size={16} className="text-teal-300 shrink-0"/><span>{message}</span><button onClick={onClose} aria-label="Dismiss notification" className="shrink-0"><X size={15}/></button></div>:null}
function Confirm({message,onConfirm,onCancel}:{message:string;onConfirm:()=>void;onCancel:()=>void}){return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4"><div className="data-card w-full max-w-sm p-5"><div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-amber-50 text-amber-700"><AlertTriangle size={19}/></div><h3 className="font-display text-lg font-bold">Confirm action</h3><p className="mt-1 text-sm text-slate-500">{message}</p><div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onCancel} testId="button-cancel-confirm">Cancel</Button><Button variant="danger" onClick={onConfirm} testId="button-confirm-action">Continue</Button></div></div></div>}
function Empty({icon:Icon,title,description,action}:{icon:Icon;title:string;description:string;action?:ReactNode}){return <div className="flex flex-col items-center justify-center px-5 py-16 text-center"><div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon size={21}/></div><h3 className="mt-4 font-display font-bold text-slate-800">{title}</h3><p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>{action&&<div className="mt-4">{action}</div>}</div>}

const PAGE_SIZE=10;
function usePager<T>(items:T[],pageSize:number=PAGE_SIZE){
  const [page,setPage]=useState(1);
  const totalPages=Math.max(1,Math.ceil(items.length/pageSize));
  const safePage=Math.min(page,totalPages);
  
  
  useEffect(()=>{if(page>totalPages)setPage(totalPages)},[totalPages]);
  const start=(safePage-1)*pageSize;
  const pageItems=items.slice(start,start+pageSize);
  return {page:safePage,setPage,totalPages,pageItems,start};
}

function pagerRange(page:number,totalPages:number):(number|"...")[]{
  const delta=1;
  const range:(number|"...")[]=[];
  const start=Math.max(2,page-delta);
  const end=Math.min(totalPages-1,page+delta);
  range.push(1);
  if(start>2) range.push("...");
  for(let i=start;i<=end;i++) range.push(i);
  if(end<totalPages-1) range.push("...");
  if(totalPages>1) range.push(totalPages);
  return range;
}
function Pager({page,totalPages,onChange,testId}:{page:number;totalPages:number;onChange:(p:number)=>void;testId:string}){
  if(totalPages<=1) return null;
  const pages=pagerRange(page,totalPages);
  return <div className="flex flex-wrap items-center justify-center gap-1.5 border-t p-4 text-xs sm:justify-between">
    <button type="button" onClick={()=>onChange(page-1)} disabled={page<=1} className={`btn btn-secondary !px-3 !py-1.5 ${page<=1?"opacity-40 cursor-not-allowed":""}`} data-testid={`button-${testId}-prev`}>Prev</button>
    <div className="flex flex-wrap items-center justify-center gap-1">
      {pages.map((p,i)=>p==="..."?<span key={`ellipsis-${i}`} className="px-1.5 font-bold text-slate-400">…</span>:<button key={p} type="button" onClick={()=>onChange(p)} aria-current={p===page?"page":undefined} className={`h-7 min-w-7 rounded-md px-2 font-bold transition-colors ${p===page?"bg-emerald-600 text-white":"text-slate-500 hover:bg-slate-100"}`} data-testid={`button-${testId}-page-${p}`}>{p}</button>)}
    </div>
    <button type="button" onClick={()=>onChange(page+1)} disabled={page>=totalPages} className={`btn btn-secondary !px-3 !py-1.5 ${page>=totalPages?"opacity-40 cursor-not-allowed":""}`} data-testid={`button-${testId}-next`}>Next</button>
  </div>;
}
function invoiceBusiness(b:any){return {name:b.settings.businessName,address:b.settings.address,phone:b.settings.phone,logoDataUrl:b.settings.logoDataUrl||undefined,ownerName:b.settings.ownerName||undefined,secondOwnerName:b.settings.secondOwnerName||undefined,secondOwnerPhone:b.settings.secondOwnerPhone||undefined,heading:b.settings.invoiceHeading||undefined};}
function saleInvoiceData(b:any,sale:any):InvoiceData{
  const customer=sale.customerId?b.customers.find((c:any)=>c.id===sale.customerId):null;
  const partyName=saleCustomerLabel(b,sale);
  const partyPhone=customer?.phone||sale.walkInPhone||"";
  const partyAddress=customer?.address||sale.walkInAddress||"";
  const lines=sale.lines.map((l:any)=>{const p=b.products.find((z:any)=>z.id===l.productId);const addedNote=l.date&&l.date!==sale.date?` (added ${dateLabel(l.date)})`:"";return {label:(p?.name||"Wire product")+addedNote,qty:qty(l.quantityKg),rate:`${money(l.saleRate*KG_PER_TON)}/Ton`,total:money(l.quantityKg*l.saleRate)}});
  
  
  
  const {payments,remaining}=salePaymentInfo(b,sale);
  const paymentLines=payments.map((x:any)=>({label:x.note||"Payment received",qty:dateLabel(x.date),rate:"Received",total:`− ${money(x.amount)}`}));
  const allLines=[...lines,...paymentLines];
  const grossSubtotal=sale.lines.reduce((a:number,l:any)=>a+l.quantityKg*l.saleRate,0);
  const totals:InvoiceData["totals"]=[{label:"Subtotal",value:money(grossSubtotal)}];
  if(sale.discountAmount>0){totals.push({label:"Discount",value:`- ${money(sale.discountAmount)}`});totals.push({label:"Net total",value:money(sale.subtotal)})}
  totals.push({label:"Paid at time of sale",value:money(sale.paidAmount)});
  if(payments.length) totals.push({label:"Additional payments received",value:money(payments.reduce((a:number,x:any)=>a+x.amount,0))});
  totals.push(remaining>0?{label:"Balance due (this sale)",value:money(remaining),emphasis:true}:{label:"Balance",value:"Paid in full",emphasis:true});
  return {kind:"Sale Invoice",number:`SALE-${String(sale.id).padStart(4,"0")}`,date:dateLabel(sale.date),business:invoiceBusiness(b),partyLabel:"Billed to",partyName,partyPhone,partyAddress,lines:allLines,totals,note:sale.paymentMethod==="credit"?"This is a credit sale. Every payment received against this sale is itemized above.":"Paid in full at time of sale."};
}
function customerStatementInvoiceData(b:any,customer:any):InvoiceData{
  const {balance,tx}=customerBalance(b,customer);
  const sorted=tx.slice().sort((a:any,z:any)=>a.date.localeCompare(z.date)||a.id-z.id);
  let running=0;
  const rows:string[][]=sorted.map((x:any)=>{running+=x.type==="sale"?x.amount:-x.amount;return [dateLabel(x.date),x.note||(x.type==="sale"?"Credit sale":"Payment received"),x.type==="sale"?money(x.amount):"—",x.type==="payment"?money(x.amount):"—",money(running)]});
  const totalBilled=tx.filter((x:any)=>x.type==="sale").reduce((a:number,x:any)=>a+x.amount,0);
  const totalPaid=tx.filter((x:any)=>x.type==="payment").reduce((a:number,x:any)=>a+x.amount,0);
  if(rows.length) rows.push(["","TOTAL",money(totalBilled),money(totalPaid),money(running)]);
  const totals:InvoiceData["totals"]=[{label:"Total billed",value:money(totalBilled)},{label:"Total received",value:money(totalPaid)},{label:balance>0?"Balance due":balance<0?"Advance available":"Balance",value:balance!==0?money(Math.abs(balance)):"Fully settled",emphasis:true}];
  return {kind:"Credit Statement",number:`STMT-${String(customer.id).padStart(4,"0")}`,date:dateLabel(today),business:invoiceBusiness(b),partyLabel:"Customer",partyName:customer.name,partyPhone:customer.phone,partyAddress:customer.address,lines:[],statementTable:{head:["Date","Entry","Billed","Received","Balance"],rows,rightAlignFrom:2},totals,note:"Running balance shown after each entry, oldest first."};
}
function purchaseInvoiceData(b:any,purchase:any,supplier:any):InvoiceData{
  const p=b.products.find((z:any)=>z.id===purchase.productId);
  const gross=purchase.quantityKg*purchase.purchaseRate;
  const total=purchaseTotal(purchase);
  const lines=[{label:p?.name||"Wire product",qty:qty(purchase.quantityKg),rate:`${money(purchase.purchaseRate*KG_PER_TON)}/Ton`,total:money(gross)}];
  const totals:InvoiceData["totals"]=[{label:"Invoice total",value:money(gross)}];
  if(purchase.discountAmount>0) totals.push({label:"Supplier discount",value:`- ${money(purchase.discountAmount)}`});
  totals.push({label:"Net payable",value:money(total)},{label:"Paid",value:money(purchase.paidAmount)},{label:"Balance",value:money(total-purchase.paidAmount),emphasis:true});
  return {kind:"Purchase Invoice",number:purchase.invoiceNumber||`PUR-${String(purchase.id).padStart(4,"0")}`,date:dateLabel(purchase.date),business:invoiceBusiness(b),partyLabel:"Supplier",partyName:supplier?.name||"Supplier",partyPhone:supplier?.phone,partyAddress:supplier?.address,lines,totals,note:purchase.notes||undefined};
}
function supplierLedgerEntries(b:any,supplier:any){
  const ps=b.purchases.filter((x:any)=>x.supplierId===supplier.id);
  const payments=b.supplierPayments.filter((x:any)=>x.supplierId===supplier.id);
  const entries:{date:string;type:"purchase"|"payment";amount:number;note:string;refId:number}[]=[];
  ps.forEach((x:any)=>{
    const total=purchaseTotal(x);
    entries.push({date:x.date,type:"purchase",amount:total,note:`Purchase · ${x.invoiceNumber||`PUR-${x.id}`}`,refId:x.id});
    const linkedPaid=payments.filter((p:any)=>p.purchaseId===x.id).reduce((a:number,p:any)=>a+p.amount,0);
    const initialPaid=Math.max(0,x.paidAmount-linkedPaid);
    if(initialPaid>0.009) entries.push({date:x.date,type:"payment",amount:initialPaid,note:`Paid at purchase · ${x.invoiceNumber||`PUR-${x.id}`}`,refId:x.id});
  });
  payments.forEach((x:any)=>{
    const inv=x.purchaseId?ps.find((p:any)=>p.id===x.purchaseId):null;
    entries.push({date:x.date,type:"payment",amount:x.amount,note:x.note||(inv?`Payment · ${inv.invoiceNumber||`PUR-${inv.id}`}`:"Payment to supplier"),refId:x.id});
  });
  return entries.sort((a,z)=>a.date.localeCompare(z.date));
}
function supplierStatementInvoiceData(b:any,supplier:any):InvoiceData{
  const sorted=supplierLedgerEntries(b,supplier);
  let running=0;
  const rows:string[][]=sorted.map((x)=>{running+=x.type==="purchase"?x.amount:-x.amount;return [dateLabel(x.date),x.note,x.type==="purchase"?money(x.amount):"—",x.type==="payment"?money(x.amount):"—",money(running)]});
  const totalBilled=sorted.filter(x=>x.type==="purchase").reduce((a,x)=>a+x.amount,0);
  const totalPaid=sorted.filter(x=>x.type==="payment").reduce((a,x)=>a+x.amount,0);
  const balance=totalBilled-totalPaid;
  if(rows.length) rows.push(["","TOTAL",money(totalBilled),money(totalPaid),money(running)]);
  const totals:InvoiceData["totals"]=[{label:"Total purchased",value:money(totalBilled)},{label:"Total paid",value:money(totalPaid)},{label:balance>0?"Balance due (payable)":"Balance",value:balance>0?money(balance):"Fully settled",emphasis:true}];
  return {kind:"Supplier Statement",number:`STMT-SUP-${String(supplier.id).padStart(4,"0")}`,date:dateLabel(today),business:invoiceBusiness(b),partyLabel:"Supplier",partyName:supplier.name,partyPhone:supplier.phone,partyAddress:supplier.address,lines:[],statementTable:{head:["Date","Entry","Purchased","Paid","Balance"],rows,rightAlignFrom:2},totals,note:"Running balance shown after each entry, oldest first."};
}
function InvoiceActions({data,filename}:{data:InvoiceData;filename:string}){
  const [toast,setToast]=useState("");
  const onDownload=()=>{downloadInvoicePDF(buildInvoicePDF(data),filename);setToast("Invoice PDF downloaded")};
  return <div className="flex flex-wrap items-center gap-2" data-testid="invoice-actions">
    <Button onClick={onDownload} testId="button-invoice-download"><Download size={14}/> Download invoice PDF</Button>
    <Toast message={toast} onClose={()=>setToast("")}/>
  </div>;
}
function Dashboard(){
 const [,setLoc]=useLocation();
 const b=useBusiness();
 const [range,setRange]=useState<"today"|"week"|"month"|"year"|"all"|"custom">("week");
 const [customFrom,setCustomFrom]=useState(toLocalISODate(new Date(new Date().getFullYear(),new Date().getMonth(),1)));
 const [customTo,setCustomTo]=useState(today);
 const start=range==="today"?today:range==="week"?toLocalISODate(new Date(Date.now()-6*86400000)):range==="month"?toLocalISODate(new Date(new Date().getFullYear(),new Date().getMonth(),1)):range==="year"?`${new Date().getFullYear()}-01-01`:range==="all"?"0000-00-00":customFrom;
 const end=range==="custom"?customTo:today;
 const periodLabel=range==="today"?"today":range==="week"?"last 7 days":range==="month"?"this month":range==="year"?"this year":range==="all"?"all time":`${dateLabel(start)} – ${dateLabel(end)}`;
 const totals=useMemo(()=>{
  const periodSales=b.sales.filter(x=>x.date>=start&&x.date<=end);
  const periodExpenses=b.expenses.filter(x=>x.date>=start&&x.date<=end);
  const periodPurchases=b.purchases.filter(x=>x.date>=start&&x.date<=end);
  const sales=periodSales.reduce((a,x)=>a+x.subtotal,0);
  const expenses=periodExpenses.reduce((a,x)=>a+x.amount,0);
  const purchaseSpend=periodPurchases.reduce((a,x)=>a+purchaseTotal(x),0);
  // Gross profit = total sale revenue for the period minus the total amount
  // paid to suppliers for purchases in the same period (not a per-product
  // cost-of-goods calculation).
  const gross=sales-purchaseSpend;
  const stock=b.products.map(p=>inventoryStats(b,p));
  return {sales,gross,expenses,purchaseSpend,stock,periodSalesCount:periodSales.length,periodPurchasesCount:periodPurchases.length,net:gross-expenses,credit:b.creditTransactions.reduce((a,x)=>a+(x.type==="sale"?x.amount:-x.amount),0)};
 },[b,start,end]);
 const chartData=useMemo(()=>{
  const startDt=new Date(`${start}T00:00:00`),endDt=new Date(`${end}T00:00:00`);
  const dayCount=Math.max(1,Math.round((endDt.getTime()-startDt.getTime())/86400000)+1);
  if(dayCount<=31){
   return Array.from({length:dayCount},(_,index)=>{
    const d=new Date(startDt.getTime()+index*86400000);
    const key=toLocalISODate(d);
    const daySales=b.sales.filter(x=>x.date===key);
    const dayPurchases=b.purchases.filter(x=>x.date===key);
    const revenue=daySales.reduce((a,x)=>a+x.subtotal,0);
    const purchases=dayPurchases.reduce((a,x)=>a+purchaseTotal(x),0);
    return {day:dayCount<=7?d.toLocaleDateString("en-US",{weekday:"short"}):d.toLocaleDateString("en-US",{day:"2-digit",month:"short"}),revenue,profit:revenue-purchases};
   });
  }
  const months:{key:string;day:string;revenue:number;profit:number}[]=[];
  const cursor=new Date(startDt.getFullYear(),startDt.getMonth(),1);
  while(cursor.getTime()<=endDt.getTime()){
   months.push({key:`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}`,day:cursor.toLocaleDateString("en-US",{month:"short"}),revenue:0,profit:0});
   cursor.setMonth(cursor.getMonth()+1);
  }
  for(const s of b.sales){if(s.date<start||s.date>end)continue;const key=s.date.slice(0,7);const bucket=months.find(m=>m.key===key);if(bucket){bucket.revenue+=s.subtotal;bucket.profit+=s.subtotal;}}
  for(const p of b.purchases){if(p.date<start||p.date>end)continue;const key=p.date.slice(0,7);const bucket=months.find(m=>m.key===key);if(bucket){bucket.profit-=purchaseTotal(p);}}
  return months;
 },[b.sales,b.purchases,start,end]);
 return <><PageHead eyebrow="Overview" title={`Good morning, ${b.settings.businessName}`} description="A live view of sales, stock and the decisions that need your attention." action={<div className="flex flex-wrap items-center justify-end gap-2"><select className="input-field w-32 text-xs" value={range} onChange={e=>setRange(e.target.value as any)} data-testid="select-dashboard-range"><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="year">This year</option><option value="all">All time</option><option value="custom">Custom</option></select><ReportDateRangePicker from={range==="custom"?customFrom:start} to={range==="custom"?customTo:end} onChange={(f,t)=>{setCustomFrom(f);setCustomTo(t);setRange("custom")}}/></div>}/>
  <div className="content-grid">
   <div className="span-3"><Metric label="Sales revenue" value={money(totals.sales)} sub={`${totals.periodSalesCount} sales · ${periodLabel}`} icon={CircleDollarSign}/></div>
   <div className="span-3"><Metric label="Purchase (Maal Kharida)" value={money(totals.purchaseSpend)} sub={`${totals.periodPurchasesCount} purchases · ${periodLabel}`} icon={Truck} accent="amber"/></div>
   <div className="span-3"><Metric label="Gross profit" value={money(totals.gross)} sub={`${((totals.gross/Math.max(totals.sales,1))*100).toFixed(1)}% margin`} icon={BarChart3} accent="teal"/></div>
   <div className="span-3"><Metric label="Total expenses" value={money(totals.expenses)} sub={`Deducted from net profit · ${periodLabel}`} icon={Receipt} accent="amber"/></div>
   <div className="span-3"><Metric label="Net profit" value={money(totals.net)} sub="Gross profit − expenses" icon={Calculator}/></div>
   <div className="span-3"><Metric label="Stock cost value" value={money(totals.stock.reduce((a,x)=>a+x.cost,0))} sub={money(totals.stock.reduce((a,x)=>a+x.sale,0))+" sale value"} icon={Wallet}/></div>
   <div className="data-card span-12 reveal-2 p-5"><div className="flex items-center justify-between"><div><div className="kicker">Performance pulse</div><h3 className="mt-1 font-display text-lg font-bold">Revenue & profit, {periodLabel}</h3></div><span className="status status-info">Live calculations</span></div><SalesProfitChart data={chartData}/><div className="flex gap-5 text-xs text-slate-500"><span><i className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-200"/>Revenue</span><span><i className="mr-2 inline-block h-2 w-2 rounded-full bg-teal-500"/>Gross profit</span></div></div>
   <div className="data-card span-7 reveal-3"><div className="flex items-center justify-between border-b p-5"><div><div className="kicker">Latest movement</div><h3 className="mt-1 font-display text-lg font-bold">Recent sales</h3></div><Link href="/sales" className="text-xs font-bold text-emerald-700">View all sales</Link></div>{b.sales.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Sale</th><th>Customer</th><th>Payment</th><th className="text-right">Amount</th></tr></thead><tbody>{b.sales.slice(-4).reverse().map(s=>{const st=salePaymentStatus(b,s);return <tr key={s.id} data-testid={`row-sale-${s.id}`} className="cursor-pointer" onClick={()=>setLoc(`/sales/${s.id}`)}><td><div className="font-semibold text-slate-800">Sale #{String(s.id).padStart(4,"0")}</div><div className="text-[11px] text-slate-400">{dateLabel(s.date)}</div></td><td>{saleCustomerLabel(b,s)}</td><td><span className={`status ${st.cls}`}>{st.label}</span></td><td className="text-right"><div className="font-bold">{money(s.subtotal)}</div>{st.remaining>0&&<div className="text-[11px] text-amber-700">{money(st.remaining)} due</div>}</td></tr>})}</tbody></table></div>:<Empty icon={ShoppingCart} title="No sales yet" description="Completed sales will appear here."/>}</div>
   <div className="data-card span-5 reveal-3 p-5"><div className="kicker">Dashboard alerts</div><h3 className="mt-1 font-display text-lg font-bold">Attention required</h3><div className="mt-5 space-y-4">{[{l:"Low stock items",v:String(totals.stock.filter((s,i)=>s.remaining<=b.products[i].minStock&&s.remaining>0).length),c:"text-amber-700",i:AlertTriangle},{l:"Out of stock",v:String(totals.stock.filter(s=>s.remaining===0).length),c:"text-red-700",i:Archive},{l:"Open credit accounts",v:String(new Set(b.creditTransactions.filter(x=>x.type==="sale").map(x=>x.customerId)).size),c:"text-emerald-700",i:CreditCard}].map(x=><div key={x.l} className="flex items-center justify-between border-b border-slate-100 pb-3"><div className="flex items-center gap-3"><x.i size={16} className="text-slate-400"/><span className="text-sm text-slate-600">{x.l}</span></div><b className={x.c}>{x.v}</b></div>)}</div></div>
  </div>
 </>;
}

function Products(){const b=useBusiness();const [modal,setModal]=useState(false);const [editing,setEditing]=useState<Product|null>(null);const [form,setForm]=useState<any>(blankProduct);const [search,setSearch]=useState("");const [toast,setToast]=useState("");const [tab,setTab]=useState<"products"|"types">("products");const [newType,setNewType]=useState("");const [newThickness,setNewThickness]=useState("");
 const submit=async()=>{if(!form.name||!form.wireType||!form.thickness||Number(form.salePrice)<=0){setToast("Complete all product fields");return}const item={...form,purchasePrice:Number(form.purchasePrice),salePrice:Number(form.salePrice),minStock:Number(form.minStock)};const r=editing?await b.update("products",editing.id,item):await b.add("products",item);if(!r.ok){setToast(r.message);return}setModal(false);setEditing(null);setForm(blankProduct);setToast(editing?"Product updated":"Product added successfully")};
 const remove=async(id:number)=>{if(confirm("Delete this product?")){const r=await b.remove("products",id);setToast(r.ok?"Product deleted":r.message)}};const products=b.products.filter(p=>`${p.name} ${p.wireType} ${p.thickness}`.toLowerCase().includes(search.toLowerCase()));const {page,setPage,totalPages,pageItems:pagedProducts}=usePager(products);
 return <><PageHead eyebrow="Catalog" title="Products & wires" description="Control your sellable wire catalogue, rates and stock thresholds." action={tab==="products"?<Button onClick={()=>{setEditing(null);setForm(blankProduct);setModal(true)}} testId="button-add-product"><Plus size={16}/> Add product</Button>:null}/><div className="mb-4 flex items-center gap-2 border-b"><button onClick={()=>setTab("products")} className={`px-3 pb-3 text-sm font-bold ${tab==="products"?"border-b-2 border-emerald-700 text-emerald-700":"text-slate-400"}`} data-testid="tab-products">Products</button><button onClick={()=>setTab("types")} className={`px-3 pb-3 text-sm font-bold ${tab==="types"?"border-b-2 border-emerald-700 text-emerald-700":"text-slate-400"}`} data-testid="tab-wire-types">Wire types & thickness</button></div>{tab==="products"?<div className="data-card"><div className="flex flex-col justify-between gap-3 border-b p-4 md:flex-row md:items-center"><div><h3 className="font-display font-bold">Wire catalogue</h3><p className="text-xs text-slate-500">{products.length} active products</p></div><div className="relative w-full md:w-64"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className="input-field pl-9 text-xs" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search products..." data-testid="input-product-search"/></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Wire type</th><th>Thickness</th><th className="text-right">Purchase / Ton</th><th className="text-right">Sale / Ton</th><th className="text-right">Min stock</th><th className="text-right">Action</th></tr></thead><tbody>{pagedProducts.map(p=><tr key={p.id} data-testid={`row-product-${p.id}`}><td className="font-bold text-slate-800">{p.name}</td><td><span className="status status-info">{p.wireType}</span></td><td>{p.thickness}</td><td className="text-right"><div>{money(p.purchasePrice*KG_PER_TON)}</div></td><td className="text-right font-bold text-emerald-700"><div>{money(p.salePrice*KG_PER_TON)}</div></td><td className="text-right"><div>{qty(p.minStock)}</div></td><td className="text-right"><div className="flex justify-end gap-1"><Button variant="ghost" onClick={()=>{setEditing(p);setForm(p);setModal(true)}} testId={`button-edit-product-${p.id}`}><Pencil size={14}/></Button><Button variant="danger" onClick={()=>remove(p.id)} testId={`button-delete-product-${p.id}`}><Trash2 size={14}/></Button></div></td></tr>)}</tbody></table>{!products.length&&<Empty icon={Package} title="No products found" description="Adjust your search or add the first wire product."/>}<Pager page={page} totalPages={totalPages} onChange={setPage} testId="products"/></div></div>:<div className="content-grid"><div className="data-card span-6 p-5"><div className="kicker">Classifications</div><h3 className="mt-1 font-display text-lg font-bold">Wire types</h3><div className="mt-4 flex gap-2"><input className="input-field" value={newType} onChange={e=>setNewType(e.target.value)} placeholder="e.g. Braided" data-testid="input-new-wire-type"/><Button onClick={async()=>{if(newType.trim()&&!b.wireTypes.includes(newType.trim())){const r=await b.add("wireTypes",newType.trim());if(r.ok){setNewType("");setToast("Wire type added")}else{setToast(r.message)}}}} testId="button-add-wire-type"><Plus size={15}/></Button></div><div className="mt-5 flex flex-wrap gap-2">{b.wireTypes.map(x=><span key={x} className="status status-info inline-flex items-center gap-1.5 pr-1.5">{x}<button type="button" onClick={async()=>{if(confirm(`Remove wire type "${x}"?`)){const r=await b.removeListItem("wireTypes",x);setToast(r.ok?"Wire type removed":r.message)}}} className="rounded-full p-0.5 hover:bg-black/10" aria-label={`Remove ${x}`} data-testid={`button-remove-wire-type-${x}`}><X size={11}/></button></span>)}{b.wireTypes.length===0&&<p className="text-xs text-slate-400">No wire types yet — add one above.</p>}</div></div><div className="data-card span-6 p-5"><div className="kicker">Specifications</div><h3 className="mt-1 font-display text-lg font-bold">Thickness values</h3><div className="mt-4 flex gap-2"><input className="input-field" value={newThickness} onChange={e=>setNewThickness(e.target.value)} placeholder="e.g. 1.35mm" data-testid="input-new-thickness"/><Button onClick={async()=>{if(newThickness.trim()&&!b.thicknesses.includes(newThickness.trim())){const r=await b.add("thicknesses",newThickness.trim());if(r.ok){setNewThickness("");setToast("Thickness added")}else{setToast(r.message)}}}} testId="button-add-thickness"><Plus size={15}/></Button></div><div className="mt-5 flex flex-wrap gap-2">{b.thicknesses.map(x=><span key={x} className="status status-good inline-flex items-center gap-1.5 pr-1.5">{x}<button type="button" onClick={async()=>{if(confirm(`Remove thickness "${x}"?`)){const r=await b.removeListItem("thicknesses",x);setToast(r.ok?"Thickness removed":r.message)}}} className="rounded-full p-0.5 hover:bg-black/10" aria-label={`Remove ${x}`} data-testid={`button-remove-thickness-${x}`}><X size={11}/></button></span>)}{b.thicknesses.length===0&&<p className="text-xs text-slate-400">No thickness values yet — add one above.</p>}</div></div></div>}<Toast message={toast} onClose={()=>setToast("")}/>{modal&&<div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/35 p-4"><div className="data-card max-h-[90vh] w-full max-w-xl overflow-y-auto p-5"><div className="mb-5 flex justify-between"><div><div className="kicker">Catalog record</div><h3 className="font-display text-xl font-bold text-emerald-950">{editing?"Edit product":"Add product"}</h3></div><button onClick={()=>setModal(false)} aria-label="Close dialog"><X size={18}/></button></div><div className="grid gap-4 md:grid-cols-2"><Field label="Product name"><input className="input-field" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} data-testid="input-product-name"/></Field><Field label="Wire type"><select className="input-field" value={form.wireType} onChange={e=>setForm({...form,wireType:e.target.value})} data-testid="select-product-wire-type"><option value="">Select type</option>{b.wireTypes.map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Thickness"><select className="input-field" value={form.thickness} onChange={e=>setForm({...form,thickness:e.target.value})} data-testid="select-product-thickness"><option value="">Select thickness</option>{b.thicknesses.map(x=><option key={x}>{x}</option>)}</select></Field><PriceInput perKgValue={String(form.purchasePrice||"")} onChangePerKg={v=>setForm({...form,purchasePrice:v})} testIdPrefix="product-purchase" label="Purchase rate"/><PriceInput perKgValue={String(form.salePrice||"")} onChangePerKg={v=>setForm({...form,salePrice:v})} testIdPrefix="product-sale" label="Sale rate"/><QuantityInput kgValue={String(form.minStock||"")} onChangeKg={v=>setForm({...form,minStock:v})} testIdPrefix="product-min-stock"/></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={()=>setModal(false)}>Cancel</Button><Button onClick={submit} testId="button-save-product"><Check size={15}/> Save product</Button></div></div></div>}</>}

function Inventory(){
 const b=useBusiness();
 const rows=b.products.map(p=>({p,s:inventoryStats(b,p)}));
 const sum=rows.reduce((a,x)=>({remaining:a.remaining+x.s.remaining,cost:a.cost+x.s.cost,sale:a.sale+x.s.sale,profit:a.profit+x.s.profit,sold:a.sold+x.s.sold}),{remaining:0,cost:0,sale:0,profit:0,sold:0});
 const lowKg=rows.reduce((a,{p,s})=>a+(s.remaining>0&&s.remaining<=p.minStock?s.remaining:0),0);
 const outCount=rows.filter(({s})=>s.remaining===0).length;
 const [stockFilter,setStockFilter]=useState<"all"|"in"|"low"|"out">("all");
 const filteredRows=rows.filter(({p,s})=>stockFilter==="all"?true:stockFilter==="out"?s.remaining===0:stockFilter==="low"?(s.remaining>0&&s.remaining<=p.minStock):(s.remaining>p.minStock));
 const invPager=usePager(filteredRows);
 return <><PageHead eyebrow="Stock control" title="Inventory" description="Formula-driven stock position across every wire product." action={<Link href="/suppliers" className="btn btn-primary" data-testid="link-inventory-purchase"><Plus size={16}/> Record purchase</Link>}/>
  <div className="content-grid mb-5">
   {[{l:"Stock on hand",v:qty(sum.remaining),s:`${qty(sum.sold)} sold to date`,i:Boxes},{l:"Cost value",v:money(sum.cost),s:"Purchase cost of stock",i:Wallet},{l:"Sale value",v:money(sum.sale),s:"At current sale rates",i:CircleDollarSign},{l:"Expected profit",v:money(sum.profit),s:"Stock sale value − cost",i:BarChart3},{l:"Total sold",v:qty(sum.sold),s:"Across all products",i:ShoppingCart},{l:"Low stock",v:qty(lowKg),s:"Needs replenishment",i:AlertTriangle},{l:"Out of stock",v:String(outCount),s:"Products unavailable",i:Archive}].map((x,i)=><div key={x.l} className="span-3"><Metric label={x.l} value={x.v} sub={x.s} icon={x.i} accent={i===3?"teal":i===5||i===6?"amber":"emerald"}/></div>)}
  </div>
  <div className="data-card"><div className="flex items-center justify-between border-b p-5 gap-3 flex-wrap"><div><h3 className="font-display font-bold">Stock ledger</h3><p className="text-xs text-slate-500">Purchased − sold = remaining</p></div><div className="flex items-center gap-2"><SlidersHorizontal size={18} className="text-slate-400"/><select className="input-field w-40 text-xs" value={stockFilter} onChange={e=>{setStockFilter(e.target.value as any);invPager.setPage(1)}} data-testid="select-inventory-stock-filter"><option value="all">All stock</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th className="text-right">Purchased</th><th className="text-right">Sold</th><th className="text-right">Remaining</th><th className="text-right">Cost value</th><th className="text-right">Sale value</th><th className="text-right">Expected profit</th><th className="text-right">Status</th></tr></thead><tbody>{invPager.pageItems.length===0?<tr><td colSpan={8} className="text-center text-slate-500 py-8">No products match this filter</td></tr>:invPager.pageItems.map(({p,s})=><tr key={p.id} data-testid={`row-inventory-${p.id}`}><td><div className="font-bold">{p.name}</div><div className="text-[11px] text-slate-400">{p.wireType} · {p.thickness}</div></td><td className="text-right">{qty(s.purchased)}</td><td className="text-right">{qty(s.sold)}</td><td className="text-right font-bold">{qty(s.remaining)}</td><td className="text-right">{money(s.cost)}</td><td className="text-right">{money(s.sale)}</td><td className="text-right font-bold text-emerald-700">{money(s.profit)}</td><td className="text-right">{s.remaining===0?<span className="status status-out">Out of stock</span>:s.remaining<=p.minStock?<span className="status status-low">Low stock</span>:<span className="status status-good">In Stock</span>}</td></tr>)}</tbody></table><Pager page={invPager.page} totalPages={invPager.totalPages} onChange={invPager.setPage} testId="inventory"/></div></div>
 </>;
}

function POS(){const b=useBusiness();const [cart,setCart]=useState<any[]>([]);const [pid,setPid]=useState("");const [q,setQ]=useState("1000");const qKg=Number(q||0);const [customer,setCustomer]=useState("");const [walkInName,setWalkInName]=useState("");const [walkInPhone,setWalkInPhone]=useState("");const [walkInAddress,setWalkInAddress]=useState("");const [method,setMethod]=useState<"cash"|"credit">("cash");const [paid,setPaid]=useState("");const [discount,setDiscount]=useState("");const [saleDate,setSaleDate]=useState(today);const [toast,setToast]=useState("");const [saving,setSaving]=useState(false);const selected=b.products.find(p=>p.id===Number(pid));const totals=cart.reduce((a,x)=>({sub:a.sub+x.quantityKg*x.saleRate,profit:a.profit+x.quantityKg*(x.saleRate-x.purchaseRate)}),{sub:0,profit:0});const discountNum=Math.min(Math.max(0,Number(discount||0)),totals.sub);const netSub=Math.max(0,totals.sub-discountNum);const netProfit=totals.profit-discountNum;const addLine=()=>{if(!selected||qKg<=0){setToast("Select a product and enter a valid quantity");return}const stock=inventoryStats(b,selected).remaining;const existing=cart.find(x=>x.productId===selected.id)?.quantityKg||0;if(qKg+existing>stock){setToast(`Insufficient stock. Available: ${qty(stock)}`);return}setCart(c=>{const found=c.find(x=>x.productId===selected.id);return found?c.map(x=>x.productId===selected.id?{...x,quantityKg:x.quantityKg+qKg}:x):[...c,{productId:selected.id,quantityKg:qKg,saleRate:selected.salePrice,purchaseRate:selected.avgCost??selected.purchasePrice}]});setQ("1000")};const complete=async()=>{if(!cart.length){setToast("Add at least one wire to the cart");return}if(method==="credit"&&!customer){setToast("Select a customer for credit sales");return}if(saving)return;setSaving(true);const result=await b.completeSale({id:0,date:saleDate||today,customerId:customer?Number(customer):null,paymentMethod:method,lines:cart,subtotal:netSub,discountAmount:discountNum,grossProfit:netProfit,paidAmount:paid===""?(method==="cash"?netSub:0):Number(paid)},!customer&&walkInName.trim()?{name:walkInName,phone:walkInPhone,address:walkInAddress}:undefined);setSaving(false);setToast(result.message);if(result.ok){setCart([]);setPaid("");setDiscount("");setCustomer("");setWalkInName("");setWalkInPhone("");setWalkInAddress("");setSaleDate(today)}};return <><PageHead eyebrow="Counter sales" title="Point of Sale" description="Build a multi-line Ton sale with live stock checks and margin visibility."/><div className="content-grid"><div className="data-card span-7 p-5"><div className="flex items-center justify-between"><div><div className="kicker">Add to ticket</div><h3 className="mt-1 font-display text-lg font-bold">Select wire</h3></div></div><div className="mt-5 grid gap-4 md:grid-cols-[1fr_140px_auto] md:items-end"><Field label="Product"><select className="input-field" value={pid} onChange={e=>setPid(e.target.value)} data-testid="select-pos-product"><option value="">Choose wire product</option>{b.products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.thickness}</option>)}</select></Field><SaleQuantityInput kgValue={q} onChangeKg={setQ} testIdPrefix="pos" ratePerKg={selected?.salePrice}/><Button onClick={addLine} testId="button-add-to-cart"><Plus size={16}/> Add</Button></div>{selected&&<div className="mt-4 flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3 text-xs"><span className="font-semibold text-emerald-900">{selected.name} · {money(selected.salePrice*KG_PER_TON)}/Ton</span><span className="text-emerald-700">Available: {qty(inventoryStats(b,selected).remaining)}</span></div>}<div className="mt-7 border-t pt-5"><div className="mb-3 flex items-center justify-between"><h3 className="font-display font-bold">Current ticket</h3><span className="text-xs text-slate-400">{cart.length} line{cart.length===1?"":"s"}</span></div>{cart.length?<div className="space-y-2">{cart.map((x,i)=>{const p=b.products.find(z=>z.id===x.productId)!;return <div key={x.productId} className="flex items-center justify-between rounded-lg border bg-slate-50/70 p-3" data-testid={`cart-line-${x.productId}`}><div><div className="text-sm font-bold">{p.name}</div><div className="text-xs text-slate-500">{qty(x.quantityKg)} × {money(x.saleRate*KG_PER_TON)}/Ton</div></div><div className="flex items-center gap-3"><div className="text-right"><div className="text-sm font-bold">{money(x.quantityKg*x.saleRate)}</div></div><Button variant="danger" onClick={()=>setCart(c=>c.filter((_,j)=>j!==i))} testId={`button-remove-cart-${x.productId}`}><X size={14}/></Button></div></div>})}</div>:<Empty icon={ShoppingCart} title="Ticket is empty" description="Choose a product above to start the sale."/>}</div></div><div className="data-card span-5 p-5"><div className="kicker">Settlement</div><h3 className="mt-1 font-display text-lg font-bold">Sale summary</h3><div className="mt-5 space-y-3 border-b pb-5 text-sm"><div className="flex justify-between text-slate-500"><span>Subtotal</span><b className="text-slate-800">{money(totals.sub)}</b></div>{discountNum>0&&<div className="flex justify-between text-amber-700"><span>Discount</span><b>- {money(discountNum)}</b></div>}{discountNum>0&&<div className="flex justify-between text-slate-500"><span>Net total</span><b className="text-slate-800">{money(netSub)}</b></div>}</div><div className="mt-5 space-y-4"><Field label="Customer (required for credit)"><select className="input-field" value={customer} onChange={e=>setCustomer(e.target.value)} data-testid="select-pos-customer"><option value="">Walk-in customer</option>{b.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>{!customer&&<div className="grid gap-3 rounded-lg border border-dashed border-slate-200 p-3"><p className="text-[11px] font-semibold text-slate-500">Walk-in customer details (optional)</p><input className="input-field text-xs" value={walkInName} onChange={e=>setWalkInName(e.target.value)} placeholder="Customer name" data-testid="input-walkin-name"/><input className="input-field text-xs" value={walkInPhone} onChange={e=>setWalkInPhone(e.target.value)} placeholder="Phone number" data-testid="input-walkin-phone"/><input className="input-field text-xs" value={walkInAddress} onChange={e=>setWalkInAddress(e.target.value)} placeholder="Address" data-testid="input-walkin-address"/></div>}<Field label="Discount ($)"><input type="number" step="0.01" min="0" max={totals.sub||undefined} className="input-field" value={discount} onChange={e=>setDiscount(e.target.value)} placeholder="0.00" data-testid="input-pos-discount"/></Field><Field label="Payment method"><div className="grid grid-cols-2 gap-2">{(["cash","credit"] as const).map(x=><button key={x} onClick={()=>setMethod(x)} className={`rounded-lg border px-3 py-2 text-sm font-bold ${method===x?"border-emerald-600 bg-emerald-50 text-emerald-800":"border-slate-200 text-slate-500"}`} data-testid={`button-payment-${x}`}>{x==="cash"?"Cash":"Credit"}</button>)}</div></Field><Field label="Sale date"><AutoDate date={saleDate} onChange={setSaleDate} testId="input-pos-sale-date"/></Field>{method==="credit"&&<Field label="Paid today"><input className="input-field" type="number" step="0.01" min="0" value={paid} onChange={e=>setPaid(e.target.value)} placeholder="0.00" data-testid="input-pos-paid"/></Field>}<div className="rounded-xl bg-slate-900 p-4 text-white"><div className="text-xs text-white/60">Amount due</div><div className="mt-1 font-display text-2xl font-bold">{money(netSub)}</div>{method==="credit"&&<div className="mt-1 text-xs text-teal-300">Remaining credit: {money(Math.max(0,netSub-(Number(paid)||0)))}</div>}</div><Button onClick={complete} disabled={saving} className="w-full py-3" testId="button-complete-sale"><Check size={16}/> {saving?"Saving…":"Complete sale"}</Button></div></div></div><Toast message={toast} onClose={()=>setToast("")}/></>}

function Modal({title,eyebrow,onClose,children}:{title:string;eyebrow:string;onClose:()=>void;children:ReactNode}){return <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/35 p-4"><div className="data-card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5"><div className="mb-5 flex justify-between"><div><div className="kicker">{eyebrow}</div><h3 className="font-display text-xl font-bold text-emerald-950">{title}</h3></div><button onClick={onClose} aria-label="Close dialog"><X size={18}/></button></div>{children}</div></div>}

function EditSaleLineRow({line,index,productName,saleDate,updateLine,removeLine}:{line:SaleLine;index:number;productName?:string;saleDate:string;updateLine:(i:number,patch:Partial<SaleLine>)=>void;removeLine:(i:number)=>void}){
  const qty=useRoundTripText(String(line.quantityKg||""),v=>updateLine(index,{quantityKg:Number(v||0)}),kg=>kg/KG_PER_TON,ton=>ton*KG_PER_TON);
  const rate=useRoundTripText(String(line.saleRate||""),v=>updateLine(index,{saleRate:Number(v||0)}),perKg=>perKg*KG_PER_TON,perTon=>perTon/KG_PER_TON);
  return <div className="grid grid-cols-2 items-center gap-2 rounded-lg border bg-slate-50/70 p-3 text-xs md:grid-cols-[1.4fr_1fr_1fr_1fr_auto]" data-testid={`edit-sale-line-${index}`}>
    <div className="font-bold text-slate-700 md:col-span-1 col-span-2">{productName||"Product"}</div>
    <label className="block"><span className="mb-0.5 block text-[10px] font-bold text-slate-400">Qty (Ton)</span><input type="number" min="0" step="any" className="input-field !py-1.5 text-xs" value={qty.text} onChange={e=>qty.handleChange(e.target.value)} data-testid={`input-edit-sale-line-qty-${index}`}/></label>
    <label className="block"><span className="mb-0.5 block text-[10px] font-bold text-slate-400">Rate /Ton</span><input type="number" min="0" step="any" className="input-field !py-1.5 text-xs" value={rate.text} onChange={e=>rate.handleChange(e.target.value)} data-testid={`input-edit-sale-line-rate-${index}`}/></label>
    <label className="block"><span className="mb-0.5 block text-[10px] font-bold text-slate-400">Date</span><input type="date" className="input-field !py-1.5 text-xs" value={line.date||saleDate} onChange={e=>updateLine(index,{date:e.target.value})} data-testid={`input-edit-sale-line-date-${index}`}/></label>
    <button type="button" onClick={()=>removeLine(index)} className="justify-self-end text-red-600 md:self-end md:pb-1.5" aria-label="Remove item" data-testid={`button-edit-sale-remove-line-${index}`}><Trash2 size={14}/></button>
  </div>;
}
function SaleEditModal({sale,onClose,onSaved}:{sale:any;onClose:()=>void;onSaved:(msg:string)=>void}){
  const b=useBusiness();
  const [lines,setLines]=useState<SaleLine[]>(()=>sale.lines.map((l:SaleLine)=>({...l,date:l.date||sale.date})));
  const [customerId,setCustomerId]=useState<string>(sale.customerId?String(sale.customerId):"");
  const [paymentMethod,setPaymentMethod]=useState<"cash"|"credit">(sale.paymentMethod);
  const [paidAmount,setPaidAmount]=useState<string>(String(sale.paidAmount));
  const [addPid,setAddPid]=useState("");
  const [addQty,setAddQty]=useState("");
  const [addDate,setAddDate]=useState(today);
  const [err,setErr]=useState("");
  const subtotal=lines.reduce((a,l)=>a+l.quantityKg*l.saleRate,0);
  const addProduct=b.products.find(p=>p.id===Number(addPid));
  const addAvailable=addProduct?inventoryStats(b,addProduct).remaining:0;
  const updateLine=(i:number,patch:Partial<SaleLine>)=>setLines(ls=>ls.map((l,idx)=>idx===i?{...l,...patch}:l));
  const removeLine=(i:number)=>setLines(ls=>ls.filter((_,idx)=>idx!==i));
  const addItem=()=>{
    if(!addProduct||Number(addQty)<=0){setErr("Select a product and enter a valid quantity");return}
    setLines(ls=>[...ls,{productId:addProduct.id,quantityKg:Number(addQty)*KG_PER_TON,saleRate:addProduct.salePrice,purchaseRate:addProduct.avgCost??addProduct.purchasePrice,date:addDate}]);
    setAddPid("");setAddQty("");setErr("");
  };
  const save=async()=>{
    if(!lines.length){setErr("A sale needs at least one item");return}
    const result=await b.editSale(sale.id,lines,{customerId:customerId?Number(customerId):null,paymentMethod,paidAmount:Number(paidAmount||0)});
    if(!result.ok){setErr(result.message);return}
    onSaved(result.message);
  };
  return <Modal title={`Edit Sale #${String(sale.id).padStart(4,"0")}`} eyebrow="Sale record" onClose={onClose}>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Customer"><select className="input-field" value={customerId} onChange={e=>setCustomerId(e.target.value)} data-testid="select-edit-sale-customer"><option value="">Walk-in customer</option>{b.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Payment method"><div className="grid grid-cols-2 gap-2">{(["cash","credit"] as const).map(x=><button key={x} type="button" onClick={()=>setPaymentMethod(x)} className={`rounded-lg border px-3 py-2 text-sm font-bold ${paymentMethod===x?"border-emerald-600 bg-emerald-50 text-emerald-800":"border-slate-200 text-slate-500"}`} data-testid={`button-edit-sale-payment-${x}`}>{x==="cash"?"Cash":"Credit"}</button>)}</div></Field>
      <Field label="Paid at time of sale"><input type="number" min="0" className="input-field" value={paidAmount} onChange={e=>setPaidAmount(e.target.value)} data-testid="input-edit-sale-paid"/></Field>
    </div>
    <div className="mt-6 border-t pt-4">
      <h4 className="font-display text-sm font-bold">Items in this sale</h4>
      <div className="mt-3 space-y-2">
        {lines.map((l,i)=><EditSaleLineRow key={i} line={l} index={i} productName={b.products.find(x=>x.id===l.productId)?.name} saleDate={sale.date} updateLine={updateLine} removeLine={removeLine}/>)}
      </div>
    </div>
    <div className="mt-5 rounded-lg border border-dashed border-slate-200 p-3">
      <p className="mb-2 text-[11px] font-semibold text-slate-500">Customer bought more later? Add it here — it's saved into this same invoice, dated separately.</p>
      <div className="grid gap-3 md:grid-cols-[1fr_130px_150px_auto] md:items-end">
        <Field label="Product"><select className="input-field text-xs" value={addPid} onChange={e=>setAddPid(e.target.value)} data-testid="select-edit-sale-add-product"><option value="">Choose product</option>{b.products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Quantity (Ton)"><input type="number" min="0" step="any" className="input-field text-xs" value={addQty} onChange={e=>setAddQty(e.target.value)} placeholder="e.g. 2" data-testid="input-edit-sale-add-qty"/></Field>
        <Field label="Date added"><input type="date" className="input-field text-xs" value={addDate} onChange={e=>setAddDate(e.target.value)} data-testid="input-edit-sale-add-date"/></Field>
        <Button onClick={addItem} testId="button-edit-sale-add-item"><Plus size={14}/> Add item</Button>
      </div>
      {addProduct&&<div className="mt-2 text-[11px] text-slate-400">Available stock: {qty(addAvailable)} · {money(addProduct.salePrice*KG_PER_TON)}/Ton</div>}
    </div>
    <div className="mt-5 flex items-center justify-between rounded-lg bg-emerald-50 p-4"><span className="text-sm font-semibold text-emerald-900">New subtotal</span><b className="font-display text-xl text-emerald-800">{money(subtotal)}</b></div>
    {err&&<div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{err}</div>}
    <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} testId="button-save-edit-sale"><Check size={15}/> Save changes</Button></div>
  </Modal>;
}

function SupplierCard({s}:{s:any}){
  const b=useBusiness();const [,setLoc]=useLocation();
  const ps=b.purchases.filter(x=>x.supplierId===s.id);
  const total=ps.reduce((a,x)=>a+purchaseTotal(x),0),paid=ps.reduce((a,x)=>a+x.paidAmount,0)+b.supplierPayments.filter(x=>x.supplierId===s.id&&!x.purchaseId).reduce((a,x)=>a+x.amount,0),due=total-paid;
  const initials=(s.name||"?").split(" ").filter(Boolean).slice(0,2).map((w:string)=>w[0]).join("").toUpperCase();
  return <div onClick={()=>setLoc(`/suppliers/${s.id}`)} className="data-card reveal cursor-pointer p-5" data-testid={`card-supplier-${s.id}`}>
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-sm font-bold text-white">{initials||"S"}</div>
        <div className="min-w-0"><div className="truncate font-display font-bold text-slate-800">{s.name}</div><div className="truncate text-xs text-slate-500">{s.company||"—"}</div></div>
      </div>
      <ChevronRight size={16} className="mt-2 shrink-0 text-slate-300"/>
    </div>
    <div className="mt-4 space-y-1 text-xs text-slate-500"><div>{s.phone||"No phone on file"}</div><div className="truncate">{s.address||"No address on file"}</div></div>
    <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-4 text-center">
      <div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Purchases</div><div className="mt-0.5 text-sm font-bold text-slate-800">{money(total)}</div></div>
      <div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Paid</div><div className="mt-0.5 text-sm font-bold text-emerald-700">{money(paid)}</div></div>
      <div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Balance due</div><div className="mt-0.5 text-sm font-bold text-amber-700">{money(due)}</div></div>
    </div>
  </div>;
}
function Suppliers(){const b=useBusiness();const [show,setShow]=useState(false);const [form,setForm]=useState<any>({name:"",company:"",phone:"",address:"",notes:""});const [search,setSearch]=useState("");const [toast,setToast]=useState("");const save=async()=>{if(!form.name){setToast("Supplier name is required");return}const r=await b.add("suppliers",form);if(!r.ok){setToast(r.message);return}setShow(false);setForm({name:"",company:"",phone:"",address:"",notes:""});setToast("Supplier added successfully")};
 const blankPurchase={supplierId:"",invoiceNumber:"",date:today,productId:"",quantityKg:"",purchaseRate:"",discountAmount:"",paidAmount:"",notes:""};
 const [showPurchase,setShowPurchase]=useState(false);const [purchaseForm,setPurchaseForm]=useState<any>(blankPurchase);
 const openPurchase=()=>{setPurchaseForm(blankPurchase);setShowPurchase(true)};
 const purchaseGross=Number(purchaseForm.quantityKg||0)*Number(purchaseForm.purchaseRate||0);
 const purchaseNet=Math.max(0,purchaseGross-Number(purchaseForm.discountAmount||0));
 const savePurchase=async()=>{if(!purchaseForm.supplierId){setToast("Select a supplier");return}if(!purchaseForm.productId||Number(purchaseForm.quantityKg)<=0||Number(purchaseForm.purchaseRate||0)<0){setToast("Select a product and enter a valid quantity");return}const r=await b.addPurchase({id:0,supplierId:Number(purchaseForm.supplierId),invoiceNumber:purchaseForm.invoiceNumber,date:purchaseForm.date,productId:Number(purchaseForm.productId),quantityKg:Number(purchaseForm.quantityKg),purchaseRate:Number(purchaseForm.purchaseRate||0),discountAmount:Number(purchaseForm.discountAmount||0),paidAmount:Number(purchaseForm.paidAmount||0),notes:purchaseForm.notes});setToast(r.message);if(r.ok){setShowPurchase(false);setPurchaseForm(blankPurchase)}};
 const list=b.suppliers.filter(x=>`${x.name} ${x.company}`.toLowerCase().includes(search.toLowerCase()));const supPager=usePager(list,9);return <><PageHead eyebrow="Vendor network" title="Supplier Purchase" description="Tap a supplier to open their profile, record purchases and track their account." action={<div className="flex flex-wrap items-center justify-end gap-2"><Button variant="secondary" onClick={openPurchase} testId="button-record-purchase-top"><ArrowDownToLine size={16}/> Record purchase</Button><Button onClick={()=>setShow(true)} testId="button-add-supplier"><Plus size={16}/> Add supplier</Button></div>}/><div className="mb-5 flex items-center justify-between gap-3"><p className="text-xs font-semibold text-slate-500">{list.length} connected suppliers</p><div className="relative w-full max-w-xs"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className="input-field pl-9 text-xs" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search suppliers..." data-testid="input-supplier-search"/></div></div>{list.length?<><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{supPager.pageItems.map(s=><SupplierCard key={s.id} s={s}/>)}</div><div className="data-card mt-4"><Pager page={supPager.page} totalPages={supPager.totalPages} onChange={supPager.setPage} testId="suppliers"/></div></>:<div className="data-card"><Empty icon={Truck} title="No suppliers found" description="Adjust your search or add your first supplier."/></div>}{show&&<Modal title="Add supplier" eyebrow="Vendor network" onClose={()=>setShow(false)}><div className="grid gap-4 md:grid-cols-2"><Field label="Supplier name"><input className="input-field" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} data-testid="input-supplier-name"/></Field><Field label="Company / shop"><input className="input-field" value={form.company} onChange={e=>setForm({...form,company:e.target.value})} data-testid="input-supplier-company"/></Field><Field label="Phone"><input className="input-field" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} data-testid="input-supplier-phone"/></Field><Field label="Address"><input className="input-field" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} data-testid="input-supplier-address"/></Field><Field label="Notes" wide><textarea className="input-field min-h-20" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} data-testid="input-supplier-notes"/></Field></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={()=>setShow(false)}>Cancel</Button><Button onClick={save} testId="button-save-supplier">Save supplier</Button></div></Modal>}
 {showPurchase&&<Modal title="Record purchase" eyebrow="Vendor network" onClose={()=>setShowPurchase(false)}><div className="grid gap-4 md:grid-cols-2"><Field label="Supplier" wide><select className="input-field" value={purchaseForm.supplierId} onChange={e=>setPurchaseForm({...purchaseForm,supplierId:e.target.value})} data-testid="select-purchase-supplier"><option value="">Select supplier</option>{b.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}{s.company?` · ${s.company}`:""}</option>)}</select></Field><Field label="Invoice number (optional)"><input className="input-field" value={purchaseForm.invoiceNumber} onChange={e=>setPurchaseForm({...purchaseForm,invoiceNumber:e.target.value})} placeholder="Leave blank to auto-generate" data-testid="input-top-purchase-invoice"/></Field><Field label="Purchase date"><AutoDate date={purchaseForm.date} onChange={v=>setPurchaseForm({...purchaseForm,date:v})} testId="input-top-purchase-date"/></Field><Field label="Product"><select className="input-field" value={purchaseForm.productId} onChange={e=>{const p=b.products.find(x=>x.id===Number(e.target.value));setPurchaseForm({...purchaseForm,productId:e.target.value,purchaseRate:p?.purchasePrice||""})}} data-testid="select-top-purchase-product"><option value="">Select product</option>{b.products.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field><QuantityInput kgValue={purchaseForm.quantityKg} onChangeKg={v=>setPurchaseForm({...purchaseForm,quantityKg:v})} testIdPrefix="top-purchase"/><PriceInput perKgValue={purchaseForm.purchaseRate} onChangePerKg={v=>setPurchaseForm({...purchaseForm,purchaseRate:v})} testIdPrefix="top-purchase" label="Purchase rate"/><Field label="Supplier discount ($)"><input type="number" step="0.01" min="0" className="input-field" value={purchaseForm.discountAmount} onChange={e=>setPurchaseForm({...purchaseForm,discountAmount:e.target.value})} placeholder="0.00" data-testid="input-top-purchase-discount"/></Field><Field label="Paid amount"><input type="number" step="0.01" min="0" className="input-field" value={purchaseForm.paidAmount} onChange={e=>setPurchaseForm({...purchaseForm,paidAmount:e.target.value})} placeholder="0.00 (0 if received free)" data-testid="input-top-purchase-paid"/></Field><Field label="Notes" wide><input className="input-field" value={purchaseForm.notes} onChange={e=>setPurchaseForm({...purchaseForm,notes:e.target.value})} data-testid="input-top-purchase-notes"/></Field></div><div className="mt-5 space-y-1 rounded-lg bg-emerald-50 p-4">{Number(purchaseForm.discountAmount||0)>0&&<div className="flex items-center justify-between text-xs text-emerald-800"><span>Gross cost</span><span>{money(purchaseGross)}</span></div>}{Number(purchaseForm.discountAmount||0)>0&&<div className="flex items-center justify-between text-xs text-emerald-800"><span>Supplier discount</span><span>- {money(Number(purchaseForm.discountAmount||0))}</span></div>}<div className="flex items-center justify-between"><span className="text-sm font-semibold text-emerald-900">Total purchase cost</span><b className="font-display text-xl text-emerald-800">{money(purchaseNet)}</b></div></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={()=>setShowPurchase(false)}>Cancel</Button><Button onClick={savePurchase} testId="button-save-purchase-top"><Check size={15}/> Save purchase</Button></div></Modal>}
 <Toast message={toast} onClose={()=>setToast("")}/></>}

function SupplierProfile(){
  const b=useBusiness();const {id}=useParams<{id:string}>();const supplierId=Number(id);
  const supplier=b.suppliers.find(x=>x.id===supplierId);
  const [editSupplier,setEditSupplier]=useState(false);const [supplierForm,setSupplierForm]=useState<any>(supplier||{});
  const blankPurchase={invoiceNumber:"",date:today,productId:"",quantityKg:"",purchaseRate:"",discountAmount:"",paidAmount:"",notes:""};
  const [show,setShow]=useState(false);const [editingPurchase,setEditingPurchase]=useState<any>(null);const [form,setForm]=useState<any>(blankPurchase);const [payAmount,setPayAmount]=useState("");const [payNote,setPayNote]=useState("");const [payDate,setPayDate]=useState(today);const [payInvoiceId,setPayInvoiceId]=useState("");const [toast,setToast]=useState("");const [viewPurchaseId,setViewPurchaseId]=useState<number|null>(null);
  const [invPayAmount,setInvPayAmount]=useState("");const [invPayDate,setInvPayDate]=useState(today);const [invPayNote,setInvPayNote]=useState("");
  if(!supplier) return <><PageHead eyebrow="Vendor network" title="Supplier not found" description="This supplier record does not exist or was removed."/><Empty icon={Truck} title="No such supplier" description="Go back to Suppliers and pick a valid record."/></>;
  const ps=b.purchases.filter(x=>x.supplierId===supplierId).slice().sort((a,z)=>z.date.localeCompare(a.date));
  const viewingPurchase=viewPurchaseId?ps.find(x=>x.id===viewPurchaseId)||null:null;
  const payments=b.supplierPayments.filter(x=>x.supplierId===supplierId).slice().sort((a,z)=>z.date.localeCompare(a.date));
  const psPager=usePager(ps);
  const paymentsPager=usePager(payments);
  const ledgerEntries=(()=>{let running=0;return supplierLedgerEntries(b,supplier).map(x=>{running+=x.type==="purchase"?x.amount:-x.amount;return {...x,runningBalance:running}})})().slice().reverse();
  const ledgerPager=usePager(ledgerEntries);
  
  
  
  const total=ps.reduce((a,x)=>a+purchaseTotal(x),0),paidOnInvoices=ps.reduce((a,x)=>a+x.paidAmount,0),paidSeparately=payments.filter(x=>!x.purchaseId).reduce((a,x)=>a+x.amount,0),paid=paidOnInvoices+paidSeparately,due=total-paid,kgTotal=ps.reduce((a,x)=>a+x.quantityKg,0);
  
  const payableInvoices=ps.filter(x=>purchaseTotal(x)-x.paidAmount>0.009);
  const payInvoice=payInvoiceId?ps.find(x=>x.id===Number(payInvoiceId)):null;
  const payInvoiceRemaining=payInvoice?purchaseTotal(payInvoice)-payInvoice.paidAmount:0;
  const purchaseGrossCalc=Number(form.quantityKg||0)*Number(form.purchaseRate||0);
  const totalCalc=Math.max(0,purchaseGrossCalc-Number(form.discountAmount||0));
  const openNew=()=>{setEditingPurchase(null);setForm(blankPurchase);setShow(true)};
  const openEdit=(x:any)=>{setEditingPurchase(x);setForm({invoiceNumber:x.invoiceNumber,date:x.date,productId:String(x.productId),quantityKg:String(x.quantityKg),purchaseRate:String(x.purchaseRate),discountAmount:String(x.discountAmount||0),paidAmount:String(x.paidAmount),notes:x.notes});setShow(true)};
  const save=async()=>{if(!form.productId||Number(form.quantityKg)<=0||Number(form.purchaseRate||0)<0){setToast("Select a product and enter a valid quantity");return}const payload={supplierId,invoiceNumber:form.invoiceNumber,date:form.date,productId:Number(form.productId),quantityKg:Number(form.quantityKg),purchaseRate:Number(form.purchaseRate||0),discountAmount:Number(form.discountAmount||0),paidAmount:Number(form.paidAmount||0),notes:form.notes};if(editingPurchase){const r=await b.update("purchases",editingPurchase.id,payload);setToast(r.ok?"Purchase updated":r.message);if(!r.ok)return}else{const r=await b.addPurchase({...payload,id:0});setToast(r.message);if(!r.ok)return}setShow(false);setEditingPurchase(null);setForm(blankPurchase)};
  const removePurchase=async(pid:number)=>{if(confirm("Delete this purchase record? Stock will be adjusted accordingly.")){const r=await b.remove("purchases",pid);setToast(r.ok?"Purchase deleted":r.message)}};
  
  
  
  const savePayment=async()=>{
    if(Number(payAmount)<=0){setToast("Enter a valid payment amount");return}
    if(payInvoiceId){
      const r=await b.payPurchaseInvoice(Number(payInvoiceId),Number(payAmount),payDate,payNote);
      setToast(r.message);
      if(!r.ok) return;
    } else {
      if(Number(payAmount)>due){setToast("Payment cannot exceed the outstanding balance");return}
      const r=await b.recordSupplierPayment(supplierId,Number(payAmount),payNote||"Payment to supplier",payDate);
      setToast(r.message);
      if(!r.ok) return;
    }
    setPayAmount("");setPayNote("");setPayDate(today);setPayInvoiceId("");
  };
  const removePayment=async(pid:number)=>{
    const payment=payments.find(x=>x.id===pid);
    if(confirm("Delete this payment record?")){
      if(payment?.purchaseId){
        const inv=b.purchases.find(x=>x.id===payment.purchaseId);
        if(inv) await b.update("purchases",inv.id,{paidAmount:Math.max(0,inv.paidAmount-payment.amount)});
      }
      const r=await b.remove("supplierPayments",pid);setToast(r.ok?"Payment deleted":r.message);
    }
  };
  const saveSupplier=async()=>{if(!supplierForm.name){setToast("Supplier name is required");return}const r=await b.update("suppliers",supplierId,supplierForm);if(!r.ok){setToast(r.message);return}setEditSupplier(false);setToast("Supplier updated")};
  const initials=(supplier.name||"?").split(" ").filter(Boolean).slice(0,2).map((w:string)=>w[0]).join("").toUpperCase();
  return <><PageHead eyebrow="Vendor network" title={supplier.name} description="Full purchase account for this supplier — every invoice, payment and balance in one ledger." action={<div className="flex gap-2"><Link href="/suppliers" className="btn btn-secondary" data-testid="link-back-to-suppliers">Back to suppliers</Link><Button onClick={openNew} testId="button-add-purchase"><Plus size={16}/> Record purchase</Button></div>}/>
  <div className="content-grid mb-5">
   <div className="span-3"><Metric label="Total purchases" value={money(total)} sub={`${ps.length} invoice${ps.length===1?"":"s"}`} icon={ArrowDownToLine}/></div>
   <div className="span-3"><Metric label="Paid to supplier" value={money(paid)} sub="Settled so far" icon={CircleDollarSign} accent="teal"/></div>
   <div className="span-3"><Metric label="Balance due (payable)" value={money(due)} sub="Outstanding balance" icon={Wallet} accent="amber"/></div>
   <div className="span-3"><Metric label="Stock received" value={qty(kgTotal)} sub="Total across all invoices" icon={Boxes}/></div>
  </div>
  <div className="content-grid">
   <div className="data-card span-4 p-5">
    <div className="flex items-center justify-between"><div className="kicker">Supplier profile</div><Button variant="ghost" onClick={()=>{setSupplierForm(supplier);setEditSupplier(true)}} testId="button-edit-supplier"><Pencil size={14}/></Button></div>
    <div className="mt-3 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-sm font-bold text-white">{initials||"S"}</div><div><div className="font-display text-lg font-bold">{supplier.name}</div><div className="text-xs text-slate-500">{supplier.company||"—"}</div></div></div>
    <div className="mt-5 space-y-3 text-sm"><div className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-500">Phone</span><span className="font-semibold">{supplier.phone||"—"}</span></div><div className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-500">Address</span><span className="text-right font-semibold">{supplier.address||"—"}</span></div>{supplier.notes&&<div className="text-xs text-slate-500">{supplier.notes}</div>}</div>
    <Button variant="danger" className="mt-5 w-full" onClick={async()=>{if(confirm("Delete this supplier? Purchase history will remain in reports.")){const r=await b.remove("suppliers",supplierId);if(r.ok){setToast("Supplier deleted")}else{setToast(r.message)}}}} testId="button-delete-supplier">Delete supplier</Button>
   </div>
   <div className="data-card span-8"><div className="border-b p-5"><h3 className="font-display font-bold">Purchase ledger</h3><p className="text-xs text-slate-500">Every purchase from this supplier, with quantity shown in Ton.</p></div>
    {ps.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Invoice / date</th><th>Product</th><th className="text-right">Quantity</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th className="text-right">Action</th></tr></thead><tbody>{psPager.pageItems.map(x=>{const p=b.products.find(z=>z.id===x.productId),t=purchaseTotal(x);return <tr key={x.id} data-testid={`row-purchase-${x.id}`}><td><b>{x.invoiceNumber||`PUR-${x.id}`}</b><div className="text-[11px] text-slate-400">{dateLabel(x.date)}</div></td><td>{p?.name}</td><td className="text-right">{qty(x.quantityKg)}</td><td className="text-right font-bold">{money(t)}</td><td className="text-right">{money(x.paidAmount)}</td><td className="text-right font-bold text-amber-700">{money(t-x.paidAmount)}</td><td className="text-right"><div className="flex justify-end gap-1"><Button variant="ghost" onClick={()=>setViewPurchaseId(x.id)} testId={`button-view-purchase-${x.id}`}><FileText size={14}/></Button><Button variant="ghost" onClick={()=>openEdit(x)} testId={`button-edit-purchase-${x.id}`}><Pencil size={14}/></Button><Button variant="danger" onClick={()=>removePurchase(x.id)} testId={`button-delete-purchase-${x.id}`}><Trash2 size={14}/></Button></div></td></tr>})}</tbody></table><Pager page={psPager.page} totalPages={psPager.totalPages} onChange={psPager.setPage} testId="supplier-purchases"/></div>:<Empty icon={ArrowDownToLine} title="No purchases yet" description="Record the first purchase from this supplier to start their ledger."/>}
   </div>
  </div>
  <div className="content-grid mt-4">
   <div className="data-card span-4 p-5">
    <div className="kicker">Payables</div><h3 className="mt-1 font-display text-lg font-bold">Record payment</h3><p className="mt-1 text-xs text-slate-500">Pick the invoice this payment is against, or leave it general to just reduce the overall balance.</p>
    <div className="mt-4 space-y-3">
     <Field label="Apply to invoice"><select className="input-field" value={payInvoiceId} onChange={e=>setPayInvoiceId(e.target.value)} data-testid="select-supplier-payment-invoice"><option value="">General (not tied to an invoice)</option>{payableInvoices.map(x=><option key={x.id} value={x.id}>{x.invoiceNumber||`PUR-${x.id}`} · {dateLabel(x.date)} · Due {money(purchaseTotal(x)-x.paidAmount)}</option>)}</select></Field>
     <Field label="Payment amount"><input type="number" className="input-field" value={payAmount} onChange={e=>setPayAmount(e.target.value)} placeholder="0" data-testid="input-supplier-payment-amount"/></Field>
     <Field label="Payment date"><AutoDate date={payDate} onChange={setPayDate} testId="input-supplier-payment-date"/></Field>
     <Field label="Note"><input className="input-field" value={payNote} onChange={e=>setPayNote(e.target.value)} placeholder="Reference or note" data-testid="input-supplier-payment-note"/></Field>
    </div>
    <div className="mt-3 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"><span>{payInvoice?`Balance due on ${payInvoice.invoiceNumber||`PUR-${payInvoice.id}`}`:"Current overall balance due"}</span><span>{money(payInvoice?payInvoiceRemaining:due)}</span></div>
    <Button onClick={savePayment} className="mt-4 w-full" testId="button-record-supplier-payment"><Check size={15}/> Record payment</Button>
   </div>
   <div className="data-card span-8"><div className="border-b p-5"><h3 className="font-display font-bold">Payment history</h3><p className="text-xs text-slate-500">Every payment to this supplier, invoice-linked or general, newest first.</p></div>
    {payments.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Invoice</th><th>Note</th><th className="text-right">Amount</th><th className="text-right">Action</th></tr></thead><tbody>{paymentsPager.pageItems.map(x=>{const inv=x.purchaseId?ps.find(p=>p.id===x.purchaseId):null;return <tr key={x.id} data-testid={`row-supplier-payment-${x.id}`}><td>{dateLabel(x.date)}</td><td>{inv?<span className="status status-info">{inv.invoiceNumber||`PUR-${inv.id}`}</span>:<span className="text-slate-400">General</span>}</td><td className="text-slate-600">{x.note}</td><td className="text-right font-bold text-emerald-700">{money(x.amount)}</td><td className="text-right"><Button variant="danger" onClick={()=>removePayment(x.id)} testId={`button-delete-supplier-payment-${x.id}`}><Trash2 size={14}/></Button></td></tr>})}</tbody></table><Pager page={paymentsPager.page} totalPages={paymentsPager.totalPages} onChange={paymentsPager.setPage} testId="supplier-payments"/></div>:<Empty icon={Wallet} title="No payments yet" description="Payments made to this supplier will show up here."/>}
   </div>
  </div>
  <div className="data-card span-12 mt-4">
   <div className="flex items-center justify-between border-b p-5 flex-wrap gap-3"><div><h3 className="font-display font-bold">Purchase & payment ledger</h3><p className="text-xs text-slate-500">Every purchase and payment to {supplier.name}, in one chronological statement — download it as a PDF anytime.</p></div>{ledgerEntries.length?<InvoiceActions data={supplierStatementInvoiceData(b,supplier)} filename={`statement-${supplier.name.replace(/\s+/g,"-").toLowerCase()}.pdf`}/>:null}</div>
   {ledgerEntries.length?<><div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Entry</th><th className="text-right">Purchased</th><th className="text-right">Paid</th><th className="text-right">Running balance</th></tr></thead><tbody>{ledgerPager.pageItems.map((x,i)=><tr key={`${x.type}-${x.refId}-${x.date}-${i}`} data-testid={`row-supplier-ledger-${i}`}><td>{dateLabel(x.date)}</td><td>{x.note}</td><td className="text-right font-bold text-slate-700">{x.type==="purchase"?money(x.amount):"—"}</td><td className="text-right font-bold text-emerald-700">{x.type==="payment"?money(x.amount):"—"}</td><td className="text-right font-bold text-amber-700">{money(x.runningBalance)}</td></tr>)}</tbody><tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 font-bold" data-testid="row-supplier-ledger-totals"><td colSpan={2}>Total</td><td className="text-right text-slate-800">{money(total)}</td><td className="text-right text-emerald-700">{money(paid)}</td><td className="text-right text-amber-700">{money(due)}</td></tr></tfoot></table></div><Pager page={ledgerPager.page} totalPages={ledgerPager.totalPages} onChange={ledgerPager.setPage} testId="supplier-ledger"/></>:<Empty icon={FileBarChart} title="No ledger activity yet" description="Purchases and payments for this supplier will appear together here."/>}
  </div>
  {show&&<Modal title={editingPurchase?"Edit purchase":"Record purchase"} eyebrow={supplier.name} onClose={()=>setShow(false)}><div className="grid gap-4 md:grid-cols-2"><Field label="Invoice number (optional)"><input className="input-field" value={form.invoiceNumber} onChange={e=>setForm({...form,invoiceNumber:e.target.value})} placeholder="Leave blank to auto-generate" data-testid="input-purchase-invoice"/></Field><Field label="Purchase date"><AutoDate date={form.date} onChange={v=>setForm({...form,date:v})} testId="input-purchase-date"/></Field><Field label="Product"><select className="input-field" value={form.productId} onChange={e=>{const p=b.products.find(x=>x.id===Number(e.target.value));setForm({...form,productId:e.target.value,purchaseRate:p?.purchasePrice||""})}} data-testid="select-purchase-product"><option value="">Select product</option>{b.products.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field><QuantityInput kgValue={form.quantityKg} onChangeKg={v=>setForm({...form,quantityKg:v})} testIdPrefix="purchase"/><PriceInput perKgValue={form.purchaseRate} onChangePerKg={v=>setForm({...form,purchaseRate:v})} testIdPrefix="purchase" label="Purchase rate"/><Field label="Supplier discount ($)"><input type="number" step="0.01" min="0" className="input-field" value={form.discountAmount} onChange={e=>setForm({...form,discountAmount:e.target.value})} placeholder="0.00" data-testid="input-purchase-discount"/></Field><Field label="Paid amount"><input type="number" step="0.01" min="0" className="input-field" value={form.paidAmount} onChange={e=>setForm({...form,paidAmount:e.target.value})} placeholder="0.00 (0 if received free)" data-testid="input-purchase-paid"/></Field><Field label="Notes" wide><input className="input-field" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} data-testid="input-purchase-notes"/></Field></div><div className="mt-5 space-y-1 rounded-lg bg-emerald-50 p-4">{Number(form.discountAmount||0)>0&&<div className="flex items-center justify-between text-xs text-emerald-800"><span>Gross cost</span><span>{money(purchaseGrossCalc)}</span></div>}{Number(form.discountAmount||0)>0&&<div className="flex items-center justify-between text-xs text-emerald-800"><span>Supplier discount</span><span>- {money(Number(form.discountAmount||0))}</span></div>}<div className="flex items-center justify-between"><span className="text-sm font-semibold text-emerald-900">Total purchase cost</span><b className="font-display text-xl text-emerald-800">{money(totalCalc)}</b></div></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={()=>setShow(false)}>Cancel</Button><Button onClick={save} testId="button-save-purchase"><Check size={15}/> Save purchase</Button></div></Modal>}
  {viewingPurchase&&<Modal title={viewingPurchase.invoiceNumber||`PUR-${viewingPurchase.id}`} eyebrow="Purchase invoice" onClose={()=>{setViewPurchaseId(null);setInvPayAmount("");setInvPayNote("")}}>
    {(()=>{const inv=purchaseInvoiceData(b,viewingPurchase,supplier);const invBalance=purchaseTotal(viewingPurchase)-viewingPurchase.paidAmount;return <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-4"><div><div className="font-display text-lg font-bold text-emerald-950">{inv.business.name}</div><div className="text-xs text-slate-500">{inv.business.address}</div><div className="text-xs text-slate-500">{inv.business.phone}</div></div><div className="text-right"><div className="text-xs font-bold uppercase tracking-wide text-slate-400">Purchase invoice</div><div className="font-display text-base font-bold">{inv.number}</div><div className="text-xs text-slate-500">{inv.date}</div></div></div>
        <div className="mt-4"><div className="kicker">Supplier</div><div className="font-bold">{inv.partyName}</div><div className="text-xs text-slate-500">{inv.partyPhone} · {inv.partyAddress}</div></div>
        <div className="mt-4 table-wrap"><table className="data-table"><thead><tr><th>Item</th><th className="text-right">Quantity</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead><tbody>{inv.lines.map((l,i)=><tr key={i}><td>{l.label}</td><td className="text-right">{l.qty}</td><td className="text-right">{l.rate}</td><td className="text-right font-bold">{l.total}</td></tr>)}</tbody></table></div>
        <div className="mt-4 space-y-1 border-t pt-3 text-sm">{inv.totals.map((t,i)=><div key={i} className={`flex justify-between ${t.emphasis?"font-bold text-emerald-900":"text-slate-500"}`}><span>{t.label}</span><span>{t.value}</span></div>)}</div>
      </div>
      <InvoiceActions data={inv} filename={`${inv.number}.pdf`}/>
      {invBalance>0.009&&<div className="rounded-xl border border-slate-200 p-5">
        <div className="kicker">Payables</div><h3 className="mt-1 font-display text-base font-bold">Add payment to this invoice</h3>
        <p className="mt-1 text-xs text-slate-500">Record a payment without leaving this invoice — it updates the balance above instantly.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Amount"><input type="number" className="input-field" value={invPayAmount} onChange={e=>setInvPayAmount(e.target.value)} placeholder="0" data-testid="input-invoice-payment-amount"/></Field>
          <Field label="Date"><AutoDate date={invPayDate} onChange={setInvPayDate} testId="input-invoice-payment-date"/></Field>
          <Field label="Note"><input className="input-field" value={invPayNote} onChange={e=>setInvPayNote(e.target.value)} placeholder="Reference" data-testid="input-invoice-payment-note"/></Field>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"><span>Balance due on this invoice</span><span>{money(invBalance)}</span></div>
        <Button onClick={async()=>{const amt=Number(invPayAmount||0);if(amt<=0){setToast("Enter a valid payment amount");return}if(amt>invBalance+0.009){setToast("Payment cannot exceed the outstanding balance");return}const r=await b.payPurchaseInvoice(viewingPurchase.id,amt,invPayDate,invPayNote||"Payment against invoice");setToast(r.message);if(r.ok){setInvPayAmount("");setInvPayNote("")}}} className="mt-4 w-full" testId="button-record-invoice-payment"><Check size={15}/> Record payment</Button>
      </div>}
    </div>})()}
  </Modal>}
  {editSupplier&&<Modal title="Edit supplier" eyebrow="Vendor network" onClose={()=>setEditSupplier(false)}><div className="grid gap-4 md:grid-cols-2"><Field label="Supplier name"><input className="input-field" value={supplierForm.name} onChange={e=>setSupplierForm({...supplierForm,name:e.target.value})} data-testid="input-edit-supplier-name"/></Field><Field label="Company / shop"><input className="input-field" value={supplierForm.company} onChange={e=>setSupplierForm({...supplierForm,company:e.target.value})} data-testid="input-edit-supplier-company"/></Field><Field label="Phone"><input className="input-field" value={supplierForm.phone} onChange={e=>setSupplierForm({...supplierForm,phone:e.target.value})} data-testid="input-edit-supplier-phone"/></Field><Field label="Address"><input className="input-field" value={supplierForm.address} onChange={e=>setSupplierForm({...supplierForm,address:e.target.value})} data-testid="input-edit-supplier-address"/></Field><Field label="Notes" wide><textarea className="input-field min-h-20" value={supplierForm.notes} onChange={e=>setSupplierForm({...supplierForm,notes:e.target.value})} data-testid="input-edit-supplier-notes"/></Field></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={()=>setEditSupplier(false)}>Cancel</Button><Button onClick={saveSupplier} testId="button-save-edit-supplier">Save changes</Button></div></Modal>}
  <Toast message={toast} onClose={()=>setToast("")}/></>;
}

function Expenses(){
 const b=useBusiness(); const [show,setShow]=useState(false); const [editing,setEditing]=useState<any>(null); const [tab,setTab]=useState<"expenses"|"categories">("expenses"); const [newCat,setNewCat]=useState(""); const [form,setForm]=useState<any>({title:"",category:"",amount:"",date:today,description:""}); const [filter,setFilter]=useState(""); const [range,setRange]=useState("all"); const [toast,setToast]=useState("");
 const cats=b.expenseCategories;
 const rangeStart=range==="day"?today:range==="week"?toLocalISODate(new Date(Date.now()-6*86400000)):range==="month"?toLocalISODate(new Date(new Date().getFullYear(),new Date().getMonth(),1)):range==="year"?`${new Date().getFullYear()}-01-01`:"0000-00-00";
 const periodExpenses=b.expenses.filter(x=>x.date>=rangeStart);
 const save=async()=>{if(!form.title||Number(form.amount)<=0){setToast("Enter a title and positive amount");return}const item={...form,amount:Number(form.amount)};const r=editing?await b.update("expenses",editing.id,item):await b.add("expenses",item);if(!r.ok){setToast(r.message);return}setShow(false);setEditing(null);setForm({title:"",category:cats[0]||"",amount:"",date:today,description:""});setToast("Expense saved successfully")};
 const list=periodExpenses.filter(x=>!filter||x.category===filter);
 const expPager=usePager(list.slice().reverse());
 const monthStart=toLocalISODate(new Date(new Date().getFullYear(),new Date().getMonth(),1));
 const yearStart=`${new Date().getFullYear()}-01-01`;
 const totalPeriod=periodExpenses.reduce((a,x)=>a+x.amount,0);
 const totalMonth=b.expenses.filter(x=>x.date>=monthStart).reduce((a,x)=>a+x.amount,0);
 const totalYear=b.expenses.filter(x=>x.date>=yearStart).reduce((a,x)=>a+x.amount,0);
 const totalAll=b.expenses.reduce((a,x)=>a+x.amount,0);
 const topCategory=cats.map(c=>({c,total:b.expenses.filter(x=>x.category===c).reduce((a,x)=>a+x.amount,0)})).sort((a,z)=>z.total-a.total)[0];
 return <><PageHead eyebrow="Operating costs" title="Expenses" description="Track the costs that shape your net profit." action={tab==="expenses"?<div className="flex flex-wrap items-center justify-end gap-2"><span className="text-xs font-bold text-slate-500">Period</span><select className="input-field w-32 text-xs" value={range} onChange={e=>setRange(e.target.value)} data-testid="select-expense-range"><option value="day">Today</option><option value="week">This week</option><option value="month">This month</option><option value="year">This year</option><option value="all">All time</option></select><Button onClick={()=>{setForm({title:"",category:cats[0]||"",amount:"",date:today,description:""});setShow(true)}} testId="button-add-expense"><Plus size={16}/> Add expense</Button></div>:null}/>
  <div className="mb-4 flex items-center gap-2 border-b"><button onClick={()=>setTab("expenses")} className={`px-3 pb-3 text-sm font-bold ${tab==="expenses"?"border-b-2 border-emerald-700 text-emerald-700":"text-slate-400"}`} data-testid="tab-expenses">Expenses</button><button onClick={()=>setTab("categories")} className={`px-3 pb-3 text-sm font-bold ${tab==="categories"?"border-b-2 border-emerald-700 text-emerald-700":"text-slate-400"}`} data-testid="tab-expense-categories">Categories</button></div>
  {tab==="categories"?<div className="data-card span-6 p-5" style={{maxWidth:520}}>
    <div className="kicker">Classifications</div><h3 className="mt-1 font-display text-lg font-bold">Expense categories</h3>
    <div className="mt-4 flex gap-2"><input className="input-field" value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="e.g. Fuel" data-testid="input-new-expense-category"/><Button onClick={async()=>{if(newCat.trim()&&!cats.includes(newCat.trim())){const r=await b.add("expenseCategories",newCat.trim());if(r.ok){setNewCat("");setToast("Category added")}else{setToast(r.message)}}}} testId="button-add-expense-category"><Plus size={15}/></Button></div>
    <div className="mt-5 flex flex-wrap gap-2">{cats.map(x=><span key={x} className="status status-info inline-flex items-center gap-1.5 pr-1.5">{x}<button type="button" onClick={async()=>{if(confirm(`Remove category "${x}"?`)){const r=await b.removeListItem("expenseCategories",x);setToast(r.ok?"Category removed":r.message)}}} className="rounded-full p-0.5 hover:bg-black/10" aria-label={`Remove ${x}`} data-testid={`button-remove-expense-category-${x}`}><X size={11}/></button></span>)}{cats.length===0&&<p className="text-xs text-slate-400">No categories yet — add one above.</p>}</div>
  </div>:<>
   <div className="content-grid mb-5">
    <div className="span-3"><Metric label="Selected period" value={money(totalPeriod)} sub={`${periodExpenses.length} expense${periodExpenses.length===1?"":"s"}`} icon={Receipt} accent="amber"/></div>
    <div className="span-3"><Metric label="This month" value={money(totalMonth)} sub="Month to date" icon={CalendarDays}/></div>
    <div className="span-3"><Metric label="This year" value={money(totalYear)} sub="Year to date" icon={BarChart3} accent="teal"/></div>
    <div className="span-3"><Metric label="All-time total" value={money(totalAll)} sub={topCategory&&topCategory.total>0?`Top: ${topCategory.c}`:"Across every category"} icon={Wallet}/></div>
   </div>
    <div className="data-card"><div className="flex justify-between border-b p-4"><div><h3 className="font-display font-bold">Expense ledger</h3><p className="text-xs text-slate-500">Expenses are automatically deducted from net profit.</p></div><select className="input-field max-w-[180px] text-xs" value={filter} onChange={e=>setFilter(e.target.value)} data-testid="select-expense-filter"><option value="">All categories</option>{cats.map(x=><option key={x}>{x}</option>)}</select></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Expense</th><th>Category</th><th>Date</th><th>Description</th><th className="text-right">Amount</th><th className="text-right">Action</th></tr></thead><tbody>{expPager.pageItems.map(x=><tr key={x.id} data-testid={`row-expense-${x.id}`}><td className="font-bold">{x.title}</td><td><span className="status status-info">{x.category}</span></td><td>{dateLabel(x.date)}</td><td className="text-slate-500">{x.description||"—"}</td><td className="text-right font-bold">{money(x.amount)}</td><td className="text-right"><div className="flex justify-end gap-1"><Button variant="ghost" onClick={()=>{setEditing(x);setForm(x);setShow(true)}} testId={`button-edit-expense-${x.id}`}><Pencil size={14}/></Button><Button variant="danger" onClick={async()=>{if(confirm("Delete this expense?")){const r=await b.remove("expenses",x.id);setToast(r.ok?"Expense deleted":r.message)}}} testId={`button-delete-expense-${x.id}`}><Trash2 size={14}/></Button></div></td></tr>)}</tbody></table><Pager page={expPager.page} totalPages={expPager.totalPages} onChange={expPager.setPage} testId="expenses"/></div></div>
  </>}
  {show&&<Modal title={editing?"Edit expense":"Add expense"} eyebrow="Operating costs" onClose={()=>setShow(false)}><div className="grid gap-4 md:grid-cols-2"><Field label="Expense title"><input className="input-field" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} data-testid="input-expense-title"/></Field><Field label="Category"><select className="input-field" value={form.category} onChange={e=>setForm({...form,category:e.target.value})} data-testid="select-expense-category"><option value="">Select category</option>{cats.map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Amount"><input className="input-field" type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} data-testid="input-expense-amount"/></Field><Field label="Date"><AutoDate date={form.date} onChange={v=>setForm({...form,date:v})} testId="input-expense-date"/></Field><Field label="Description" wide><textarea className="input-field min-h-20" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} data-testid="input-expense-description"/></Field></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={()=>setShow(false)}>Cancel</Button><Button onClick={save} testId="button-save-expense">Save expense</Button></div></Modal>}
  <Toast message={toast} onClose={()=>setToast("")}/></>;
}

function customerBalance(b:any,c:any){const tx=b.creditTransactions.filter((x:any)=>x.customerId===c.id);const balance=tx.reduce((a:number,x:any)=>a+(x.type==="sale"?x.amount:-x.amount),0);return {...c,balance,tx}}
function CustomerCard({c}:{c:any}){
  const b=useBusiness();const [,setLoc]=useLocation();
  const {balance}=customerBalance(b,c);
  const initials=(c.name||"?").split(" ").filter(Boolean).slice(0,2).map((w:string)=>w[0]).join("").toUpperCase();
  return <div onClick={()=>setLoc(`/customers/${c.id}`)} className="data-card reveal cursor-pointer p-5" data-testid={`card-customer-${c.id}`}>
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-sm font-bold text-white">{initials||"C"}</div>
        <div className="min-w-0"><div className="truncate font-display font-bold text-slate-800">{c.name}</div><div className="truncate text-xs text-slate-500">{c.phone||"—"}</div></div>
      </div>
      <ChevronRight size={16} className="mt-1 shrink-0 text-slate-300"/>
    </div>
    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
      <span className="text-slate-500">{balance>0?"Balance due":balance<0?"Advance available":"Settled"}</span>
      <b className={balance>0?"text-amber-700":balance<0?"text-emerald-700":"text-slate-500"}>{money(Math.abs(balance))}</b>
    </div>
  </div>;
}
function Credit(){
  const b=useBusiness();const [show,setShow]=useState(false);const [form,setForm]=useState<any>({name:"",phone:"",address:""});const [search,setSearch]=useState("");const [toast,setToast]=useState("");
  const balances=b.customers.map(c=>customerBalance(b,c));
  const totalDue=balances.reduce((a,c)=>a+Math.max(0,c.balance),0);
  const totalAdvance=balances.reduce((a,c)=>a+Math.max(0,-c.balance),0);
  const openAccounts=balances.filter(c=>c.balance>0).length;
  const save=async()=>{if(!form.name){setToast("Customer name is required");return}const r=await b.add("customers",form);if(!r.ok){setToast(r.message);return}setShow(false);setForm({name:"",phone:"",address:""});setToast("Customer added successfully")};
  const list=balances.filter(c=>`${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase()));
  const custPager=usePager(list,9);
  const blankPay={customerId:"",amount:"",note:"",date:today};
  const [showPay,setShowPay]=useState(false);const [payForm,setPayForm]=useState<any>(blankPay);
  const openPay=()=>{setPayForm(blankPay);setShowPay(true)};
  const payCustomer=payForm.customerId?balances.find(c=>c.id===Number(payForm.customerId)):null;
  const payIsAdvance=payForm.amount!==""&&!!payCustomer&&Number(payForm.amount)>Math.max(0,payCustomer.balance);
  const savePay=()=>{if(!payForm.customerId){setToast("Select a customer");return}if(Number(payForm.amount)<=0){setToast("Enter a valid payment amount");return}b.recordPayment(Number(payForm.customerId),Number(payForm.amount),payForm.note||(payIsAdvance?"Advance payment":"Credit payment"),payForm.date);setToast(payIsAdvance?"Advance payment recorded — it will apply to future purchases":"Credit payment recorded successfully");setShowPay(false);setPayForm(blankPay)};
  return <><PageHead eyebrow="Receivables" title="Customer Accounts" description="Add customers here and tap one to open their full profile — invoices, balance and advance payments." action={<div className="flex flex-wrap items-center justify-end gap-2"><Button variant="secondary" onClick={openPay} testId="button-record-payment-top"><Wallet size={15}/> Record payment</Button><Button onClick={()=>setShow(true)} testId="button-add-customer"><Plus size={15}/> Add customer</Button><Link href="/pos" className="btn btn-secondary" data-testid="link-credit-sale"><ShoppingCart size={15}/> Create credit sale</Link></div>}/>
  <div className="content-grid mb-5">
   <div className="span-4"><Metric label="Outstanding receivables" value={money(totalDue)} sub={`${openAccounts} open account${openAccounts===1?"":"s"}`} icon={Wallet} accent="amber"/></div>
   <div className="span-4"><Metric label="Customer advances held" value={money(totalAdvance)} sub="Pre-paid, ready to use on future sales" icon={CircleDollarSign} accent="teal"/></div>
   <div className="span-4"><Metric label="Total customers" value={String(b.customers.length)} sub="In the credit book" icon={Users}/></div>
  </div>
  <div className="mb-5 flex items-center justify-between gap-3"><p className="text-xs font-semibold text-slate-500">{list.length} customers</p><div className="relative w-full max-w-xs"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className="input-field pl-9 text-xs" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search customers..." data-testid="input-customer-search"/></div></div>
  {list.length?<><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{custPager.pageItems.map(c=><CustomerCard key={c.id} c={c}/>)}</div><div className="data-card mt-4"><Pager page={custPager.page} totalPages={custPager.totalPages} onChange={custPager.setPage} testId="customers"/></div></>:<div className="data-card"><Empty icon={CreditCard} title="No customers found" description="Adjust your search or add your first customer."/></div>}
  {show&&<Modal title="Add customer" eyebrow="Receivables" onClose={()=>setShow(false)}><div className="grid gap-4 md:grid-cols-2"><Field label="Customer name"><input className="input-field" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} data-testid="input-customer-name"/></Field><Field label="Phone"><input className="input-field" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} data-testid="input-customer-phone"/></Field><Field label="Address" wide><input className="input-field" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} data-testid="input-customer-address"/></Field></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={()=>setShow(false)}>Cancel</Button><Button onClick={save} testId="button-save-customer">Save customer</Button></div></Modal>}
  {showPay&&<Modal title="Record payment or advance" eyebrow="Receivables" onClose={()=>setShowPay(false)}>
    <p className="mb-4 -mt-2 text-xs text-slate-500">Pick a customer and enter more than their balance due to record it as an advance for future purchases.</p>
    <div className="grid gap-4 md:grid-cols-2"><Field label="Customer" wide><select className="input-field" value={payForm.customerId} onChange={e=>setPayForm({...payForm,customerId:e.target.value})} data-testid="select-payment-customer"><option value="">Select customer</option>{b.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Payment amount"><input type="number" className="input-field" value={payForm.amount} onChange={e=>setPayForm({...payForm,amount:e.target.value})} data-testid="input-top-credit-payment"/></Field><Field label="Payment date"><AutoDate date={payForm.date} onChange={v=>setPayForm({...payForm,date:v})} testId="input-top-credit-payment-date"/></Field><Field label="Note" wide><input className="input-field" value={payForm.note} onChange={e=>setPayForm({...payForm,note:e.target.value})} placeholder="Reference or note" data-testid="input-top-credit-payment-note"/></Field></div>
    {payCustomer&&<div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{payCustomer.balance>0?`Current balance due: ${money(payCustomer.balance)}`:payCustomer.balance<0?`Existing advance: ${money(-payCustomer.balance)}`:"This customer is fully settled"}</div>}
    {payIsAdvance&&<div className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800">This will be recorded as an advance payment of {money(Number(payForm.amount)-Math.max(0,payCustomer?.balance||0))}.</div>}
    <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={()=>setShowPay(false)}>Cancel</Button><Button onClick={savePay} testId="button-save-payment-top"><Check size={15}/> Record payment</Button></div>
  </Modal>}
  <Toast message={toast} onClose={()=>setToast("")}/></>;
}
function CustomerProfile(){
  const b=useBusiness();const {id}=useParams<{id:string}>();const customerId=Number(id);
  const customer=b.customers.find(x=>x.id===customerId);
  const [editCustomer,setEditCustomer]=useState(false);const [customerForm,setCustomerForm]=useState<any>(customer||{});
  const [amount,setAmount]=useState("");const [note,setNote]=useState("");const [payDate,setPayDate]=useState(today);const [toast,setToast]=useState("");const [payInvoiceId,setPayInvoiceId]=useState("");
  const [editingSale,setEditingSale]=useState<any>(null);const [confirmDeleteSale,setConfirmDeleteSale]=useState<any>(null);
  const [editingTx,setEditingTx]=useState<any>(null);const [confirmDeleteTx,setConfirmDeleteTx]=useState<any>(null);
  if(!customer) return <><PageHead eyebrow="Receivables" title="Customer not found" description="This customer record does not exist or was removed."/><Empty icon={Users} title="No such customer" description="Go back to Customer Accounts and pick a valid record."/></>;
  const {balance,tx}=customerBalance(b,customer);
  const sales=b.sales.filter(x=>x.customerId===customerId).slice().sort((a,z)=>z.date.localeCompare(a.date));
  const salesPager=usePager(sales);
  const txPager=usePager(tx.slice().reverse());
  const totalBilled=tx.filter((x:any)=>x.type==="sale").reduce((a:number,x:any)=>a+x.amount,0);
  const totalPaid=tx.filter((x:any)=>x.type==="payment").reduce((a:number,x:any)=>a+x.amount,0);
  const ledgerEntries=(()=>{let running=0;return tx.slice().sort((a:any,z:any)=>a.date.localeCompare(z.date)||a.id-z.id).map((x:any)=>{running+=x.type==="sale"?x.amount:-x.amount;return {...x,runningBalance:running}})})().slice().reverse();
  const ledgerPager=usePager(ledgerEntries);
  const payableInvoices=sales.filter(s=>s.paymentMethod==="credit"&&salePaymentInfo(b,s).remaining>0.009);
  const payInvoice=payInvoiceId?sales.find(s=>s.id===Number(payInvoiceId)):null;
  const payInvoiceRemaining=payInvoice?salePaymentInfo(b,payInvoice).remaining:0;
  const isAdvance=!payInvoiceId&&amount!==""&&Number(amount)>Math.max(0,balance);
  const save=async()=>{
    if(Number(amount)<=0){setToast("Enter a valid payment amount");return}
    if(payInvoiceId){
      const r=await b.recordSalePayment(Number(payInvoiceId),Number(amount),note||"Payment against invoice",payDate);
      setToast(r.message);
      if(!r.ok)return;
    } else {
      const r=await b.recordPayment(customerId,Number(amount),note||(isAdvance?"Advance payment":"Credit payment"),payDate);
      setToast(r.ok?(isAdvance?"Advance payment recorded — it will apply to future purchases":"Credit payment recorded successfully"):r.message);
      if(!r.ok)return;
    }
    setAmount("");setNote("");setPayDate(today);setPayInvoiceId("");
  };
  const saveCustomer=async()=>{if(!customerForm.name){setToast("Customer name is required");return}const r=await b.update("customers",customerId,customerForm);if(!r.ok){setToast(r.message);return}setEditCustomer(false);setToast("Customer updated")};
  const doDeleteSale=async()=>{if(!confirmDeleteSale)return;const r=await b.removeSale(confirmDeleteSale.id);setToast(r.ok?"Invoice deleted":r.message);setConfirmDeleteSale(null)};
  const doDeleteTx=async()=>{if(!confirmDeleteTx)return;const r=await b.removeCreditTransaction(confirmDeleteTx.id);setToast(r.ok?"Transaction deleted":r.message);setConfirmDeleteTx(null)};
  const initials=(customer.name||"?").split(" ").filter(Boolean).slice(0,2).map((w:string)=>w[0]).join("").toUpperCase();
  return <><PageHead eyebrow="Receivables" title={customer.name} description="Full credit account for this customer — every invoice, payment and advance in one place." action={<div className="flex flex-wrap gap-2"><Link href="/credit" className="btn btn-secondary" data-testid="link-back-to-credit">Back to customers</Link><Link href="/pos" className="btn btn-primary" data-testid="link-customer-credit-sale"><ShoppingCart size={15}/> New credit sale</Link></div>}/>
  <div className="content-grid mb-5">
   <div className="span-3"><Metric label="Total billed" value={money(totalBilled)} sub={`${sales.length} sale${sales.length===1?"":"s"}`} icon={FileText}/></div>
   <div className="span-3"><Metric label="Total paid" value={money(totalPaid)} sub="Across all payments" icon={CircleDollarSign} accent="teal"/></div>
   <div className="span-3"><Metric label={balance>0?"Balance due":"Advance available"} value={money(Math.abs(balance))} sub={balance>0?"Outstanding":balance<0?"Ready for next purchase":"Fully settled"} icon={Wallet} accent={balance>0?"amber":"teal"}/></div>
   <div className="span-3"><Metric label="Credit transactions" value={String(tx.length)} sub="Sales and payments" icon={CreditCard}/></div>
  </div>
  <div className="content-grid">
   <div className="data-card span-4 p-5">
    <div className="flex items-center justify-between"><div className="kicker">Customer profile</div><Button variant="ghost" onClick={()=>{setCustomerForm(customer);setEditCustomer(true)}} testId="button-edit-customer"><Pencil size={14}/></Button></div>
    <div className="mt-3 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-sm font-bold text-white">{initials||"C"}</div><div><div className="font-display text-lg font-bold">{customer.name}</div><div className="text-xs text-slate-500">{customer.phone||"—"}</div></div></div>
    <div className="mt-5 space-y-3 text-sm"><div className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-500">Phone</span><span className="font-semibold">{customer.phone||"—"}</span></div><div className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-500">Address</span><span className="text-right font-semibold">{customer.address||"—"}</span></div></div>
    {balance<0&&<div className="mt-4 rounded-lg bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800">This customer has {money(-balance)} in advance — it will automatically reduce their next credit sale balance.</div>}
    <Button variant="danger" className="mt-5 w-full" onClick={async()=>{if(confirm("Delete this customer? Sale history will remain in reports.")){const r=await b.remove("customers",customerId);setToast(r.ok?"Customer deleted":r.message)}}} testId="button-delete-customer">Delete customer</Button>
   </div>
   <div className="data-card span-8 p-5">
    <div className="kicker">Receivables</div><h3 className="mt-1 font-display text-lg font-bold">Record payment or advance</h3><p className="mt-1 text-xs text-slate-500">Pick a specific invoice to pay it down, or leave it general to reduce the overall balance. Enter more than the balance due to record an advance.</p>
    <div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Apply to invoice" wide><select className="input-field" value={payInvoiceId} onChange={e=>setPayInvoiceId(e.target.value)} data-testid="select-customer-payment-invoice"><option value="">General (reduces overall balance)</option>{payableInvoices.map(s=><option key={s.id} value={s.id}>Sale #{String(s.id).padStart(4,"0")} · {dateLabel(s.date)} · Due {money(salePaymentInfo(b,s).remaining)}</option>)}</select></Field><Field label="Payment amount"><input type="number" className="input-field" value={amount} onChange={e=>setAmount(e.target.value)} data-testid="input-credit-payment"/></Field><Field label="Payment date"><AutoDate date={payDate} onChange={setPayDate} testId="input-credit-payment-date"/></Field><Field label="Note"><input className="input-field" value={note} onChange={e=>setNote(e.target.value)} placeholder="Reference or note" data-testid="input-credit-payment-note"/></Field></div>
    <div className="mt-3 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"><span>{payInvoice?`Balance due on Sale #${String(payInvoice.id).padStart(4,"0")}`:"Current overall balance due"}</span><span>{money(payInvoice?payInvoiceRemaining:Math.max(0,balance))}</span></div>
    {isAdvance&&<div className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800">This will be recorded as an advance payment of {money(Number(amount)-Math.max(0,balance))}.</div>}
    <Button onClick={save} className="mt-4" testId="button-record-credit-payment"><Check size={15}/> Record payment</Button>
    <div className="mt-7 border-t pt-5"><div className="flex items-center justify-between"><h4 className="font-display font-bold">Transaction history</h4>{tx.length?<InvoiceActions data={customerStatementInvoiceData(b,customer)} filename={`statement-${customer.name.replace(/\s+/g,"-").toLowerCase()}.pdf`}/>:null}</div>{tx.length?<><div className="mt-3 space-y-2">{txPager.pageItems.map((x:any)=>{const editable=x.type==="payment"&&x.note!=="Advance received at time of sale";return <div key={x.id} className="flex items-center justify-between border-b border-slate-100 pb-3 text-sm" data-testid={`row-credit-transaction-${x.id}`}><div className="flex items-center gap-2"><span className={`status ${x.type==="payment"?"status-good":"status-low"}`}>{x.type==="payment"?"Payment":"Sale"}</span><div><div className="font-semibold">{x.note}</div><div className="text-xs text-slate-400">{dateLabel(x.date)}</div></div></div><div className="flex items-center gap-2"><b className={x.type==="payment"?"text-emerald-700":"text-amber-700"}>{x.type==="payment"?"−":"+"}{money(x.amount)}</b>{editable&&<div className="flex gap-1"><Button variant="ghost" onClick={()=>setEditingTx(x)} testId={`button-edit-credit-transaction-${x.id}`}><Pencil size={13}/></Button><Button variant="danger" onClick={()=>setConfirmDeleteTx(x)} testId={`button-delete-credit-transaction-${x.id}`}><Trash2 size={13}/></Button></div>}</div></div>})}</div><Pager page={txPager.page} totalPages={txPager.totalPages} onChange={txPager.setPage} testId="credit-transactions"/></>:<Empty icon={CreditCard} title="No credit activity" description="This customer has no recorded credit transactions."/>}</div>
   </div>
  </div>
  <div className="data-card span-12 mt-4"><div className="border-b p-5"><h3 className="font-display font-bold">Purchase / invoice history</h3><p className="text-xs text-slate-500">Every sale made to {customer.name}, with products, quantities and a downloadable invoice.</p></div>
   {sales.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Sale</th><th>Date</th><th>Products bought</th><th>Payment</th><th className="text-right">Amount</th><th className="text-right">Action</th></tr></thead><tbody>{salesPager.pageItems.map(s=>{const st=salePaymentStatus(b,s);return <tr key={s.id} data-testid={`row-customer-sale-${s.id}`}><td className="font-bold">Sale #{String(s.id).padStart(4,"0")}</td><td>{dateLabel(s.date)}</td><td>{s.lines.map((l,i)=>{const p=b.products.find(z=>z.id===l.productId);return <div key={i} className="text-slate-600">{p?.name||"Wire product"} · {qty(l.quantityKg)}</div>})}</td><td><span className={`status ${st.cls}`}>{st.label}</span></td><td className="text-right"><div className="font-bold">{money(s.subtotal)}</div>{st.remaining>0&&<div className="text-[11px] text-amber-700">{money(st.remaining)} due</div>}</td><td className="text-right"><div className="flex justify-end gap-1"><Link href={`/sales/${s.id}`} className="btn btn-ghost !p-2" title="View invoice" data-testid={`link-view-customer-sale-${s.id}`}><FileText size={14}/></Link><Button variant="ghost" onClick={()=>setEditingSale(s)} testId={`button-edit-customer-sale-${s.id}`}><Pencil size={14}/></Button><Button variant="danger" onClick={()=>setConfirmDeleteSale(s)} testId={`button-delete-customer-sale-${s.id}`}><Trash2 size={14}/></Button></div></td></tr>})}</tbody></table><Pager page={salesPager.page} totalPages={salesPager.totalPages} onChange={salesPager.setPage} testId="customer-sales"/></div>:<Empty icon={ShoppingCart} title="No purchases yet" description="Sales made to this customer will appear here."/>}
  </div>
  <div className="data-card span-12 mt-4">
   <div className="flex items-center justify-between border-b p-5 flex-wrap gap-3"><div><h3 className="font-display font-bold">Purchase & payment ledger</h3><p className="text-xs text-slate-500">Every sale and payment for {customer.name}, in one chronological statement — download it as a PDF anytime.</p></div>{ledgerEntries.length?<InvoiceActions data={customerStatementInvoiceData(b,customer)} filename={`statement-${customer.name.replace(/\s+/g,"-").toLowerCase()}.pdf`}/>:null}</div>
   {ledgerEntries.length?<><div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Entry</th><th className="text-right">Billed</th><th className="text-right">Received</th><th className="text-right">Running balance</th></tr></thead><tbody>{ledgerPager.pageItems.map((x:any,i:number)=><tr key={`${x.type}-${x.id}-${x.date}-${i}`} data-testid={`row-customer-ledger-${i}`}><td>{dateLabel(x.date)}</td><td>{x.note||(x.type==="sale"?"Credit sale":"Payment received")}</td><td className="text-right font-bold text-slate-700">{x.type==="sale"?money(x.amount):"—"}</td><td className="text-right font-bold text-emerald-700">{x.type==="payment"?money(x.amount):"—"}</td><td className="text-right font-bold text-amber-700">{money(x.runningBalance)}</td></tr>)}</tbody><tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 font-bold" data-testid="row-customer-ledger-totals"><td colSpan={2}>Total</td><td className="text-right text-slate-800">{money(totalBilled)}</td><td className="text-right text-emerald-700">{money(totalPaid)}</td><td className="text-right text-amber-700">{money(Math.max(0,balance))}</td></tr></tfoot></table></div><Pager page={ledgerPager.page} totalPages={ledgerPager.totalPages} onChange={ledgerPager.setPage} testId="customer-ledger"/></>:<Empty icon={FileBarChart} title="No ledger activity yet" description="Sales and payments for this customer will appear together here."/>}
  </div>
  {editCustomer&&<Modal title="Edit customer" eyebrow="Receivables" onClose={()=>setEditCustomer(false)}><div className="grid gap-4 md:grid-cols-2"><Field label="Customer name"><input className="input-field" value={customerForm.name} onChange={e=>setCustomerForm({...customerForm,name:e.target.value})} data-testid="input-edit-customer-name"/></Field><Field label="Phone"><input className="input-field" value={customerForm.phone} onChange={e=>setCustomerForm({...customerForm,phone:e.target.value})} data-testid="input-edit-customer-phone"/></Field><Field label="Address" wide><input className="input-field" value={customerForm.address} onChange={e=>setCustomerForm({...customerForm,address:e.target.value})} data-testid="input-edit-customer-address"/></Field></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={()=>setEditCustomer(false)}>Cancel</Button><Button onClick={saveCustomer} testId="button-save-edit-customer">Save changes</Button></div></Modal>}
  {editingSale&&<SaleEditModal sale={editingSale} onClose={()=>setEditingSale(null)} onSaved={msg=>{setEditingSale(null);setToast(msg)}}/>}
  {confirmDeleteSale&&<Confirm message={`Delete Sale #${String(confirmDeleteSale.id).padStart(4,"0")}? This also removes its credit ledger entries and restores its stock.`} onConfirm={doDeleteSale} onCancel={()=>setConfirmDeleteSale(null)}/>}
  {editingTx&&<EditCreditTransactionModal tx={editingTx} onClose={()=>setEditingTx(null)} onSaved={msg=>{setEditingTx(null);setToast(msg)}}/>}
  {confirmDeleteTx&&<Confirm message={`Delete this ${confirmDeleteTx.type==="payment"?"payment":"transaction"} of ${money(confirmDeleteTx.amount)}? This cannot be undone.`} onConfirm={doDeleteTx} onCancel={()=>setConfirmDeleteTx(null)}/>}
  <Toast message={toast} onClose={()=>setToast("")}/></>;
}

function EditCreditTransactionModal({tx,onClose,onSaved}:{tx:any;onClose:()=>void;onSaved:(msg:string)=>void}){
  const b=useBusiness();
  const [amount,setAmount]=useState(String(tx.amount));
  const [note,setNote]=useState(tx.note||"");
  const [date,setDate]=useState(tx.date);
  const [err,setErr]=useState("");
  const [saving,setSaving]=useState(false);
  const save=async()=>{
    if(Number(amount)<=0){setErr("Enter a valid amount");return}
    if(saving)return;setSaving(true);
    const r=await b.updateCreditTransaction(tx.id,{amount:Number(amount),note,date});
    setSaving(false);
    if(!r.ok){setErr(r.message);return}
    onSaved(r.message);
  };
  return <Modal title="Edit payment" eyebrow="Transaction history" onClose={onClose}>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Amount"><input type="number" min="0" step="0.01" className="input-field" value={amount} onChange={e=>setAmount(e.target.value)} data-testid="input-edit-credit-tx-amount"/></Field>
      <Field label="Date"><AutoDate date={date} onChange={setDate} testId="input-edit-credit-tx-date"/></Field>
      <Field label="Note" wide><input className="input-field" value={note} onChange={e=>setNote(e.target.value)} placeholder="Reference or note" data-testid="input-edit-credit-tx-note"/></Field>
    </div>
    {err&&<div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{err}</div>}
    <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving} testId="button-save-edit-credit-tx"><Check size={15}/> {saving?"Saving…":"Save changes"}</Button></div>
  </Modal>;
}

function ReportDateRangePicker({from,to,onChange}:{from:string;to:string;onChange:(from:string,to:string)=>void}){
 const [open,setOpen]=useState(false);
 const parse=(d:string)=>{const dt=new Date(`${d}T00:00:00`);return Number.isNaN(dt.getTime())?undefined:dt};
 const fmt=(d:Date)=>{const off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,10)};
 const fromDate=parse(from),toDate=parse(to);
 const range:DateRange|undefined=fromDate?{from:fromDate,to:toDate??fromDate}:undefined;
 return <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
   <button type="button" className="input-field flex items-center gap-2 text-xs font-semibold" data-testid="button-report-date-range">
    <CalendarDays size={14} className="text-slate-400 shrink-0"/>
    <span className="whitespace-nowrap">{dateLabel(from)} – {dateLabel(to)}</span>
   </button>
  </PopoverTrigger>
  <PopoverContent align="end" sideOffset={10} collisionPadding={12} avoidCollisions className="z-[60] w-[min(21rem,calc(100vw-1.5rem))] p-3" data-testid="popover-report-date-range">
   <div className="grid grid-cols-2 gap-2">
    <label className="block space-y-1"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">From</span><input type="date" className="input-field text-xs" value={from} max={to} onChange={e=>{if(e.target.value) onChange(e.target.value,to)}} data-testid="input-report-from"/></label>
    <label className="block space-y-1"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">To</span><input type="date" className="input-field text-xs" value={to} min={from} onChange={e=>{if(e.target.value) onChange(from,e.target.value)}} data-testid="input-report-to"/></label>
   </div>
   <div className="mt-3 border-t pt-2">
    <Calendar mode="range" numberOfMonths={1} defaultMonth={toDate} selected={range} onSelect={r=>{if(r?.from) onChange(fmt(r.from),fmt(r.to??r.from))}} className="mx-auto"/>
   </div>
  </PopoverContent>
 </Popover>;
}
function Reports(){
 const b=useBusiness(); const [range,setRange]=useState("month"); const [from,setFrom]=useState(toLocalISODate(new Date(new Date().getFullYear(),new Date().getMonth(),1))); const [to,setTo]=useState(today);
 const start=range==="today"?today:range==="yesterday"?yesterday:range==="week"?toLocalISODate(new Date(Date.now()-7*86400000)):range==="month"?toLocalISODate(new Date(new Date().getFullYear(),new Date().getMonth(),1)):range==="custom"?from:"2000-01-01";
 const end=range==="today"?today:range==="yesterday"?yesterday:range==="custom"?to:today;
 const sales=b.sales.filter(x=>x.date>=start&&x.date<=end); const expenses=b.expenses.filter(x=>x.date>=start&&x.date<=end); const periodPurchases=b.purchases.filter(x=>x.date>=start&&x.date<=end);
 // Gross profit = total sale revenue for the period minus the total amount
 // paid to suppliers for purchases in the same period — a simple period
 // cash-flow figure, not a per-product/per-sale cost-of-goods calculation.
 const saleTotal=sales.reduce((a,x)=>a+x.subtotal,0),purchaseTotalAmt=periodPurchases.reduce((a,x)=>a+purchaseTotal(x),0),gross=saleTotal-purchaseTotalAmt,kg=sales.flatMap(x=>x.lines).reduce((a,x)=>a+x.quantityKg,0),expenseTotal=expenses.reduce((a,x)=>a+x.amount,0);
 const rows=b.products.map(p=>({p,s:inventoryStats(b,p)})); const maxSale=Math.max(...rows.map(x=>x.s.sale),1);
 const salesPager=usePager(sales.slice().reverse(),8);
 const valueByWirePager=usePager(rows,8);
 const valuationPager=usePager(rows);
 return <><PageHead eyebrow="Business intelligence" title="Reports" description="Read sales, profit, inventory and adjustment performance from the same live ledger." action={<div className="flex flex-wrap items-center justify-end gap-2"><span className="text-xs font-bold text-slate-500">Period</span><select className="input-field w-36 text-xs" value={range} onChange={e=>setRange(e.target.value)} data-testid="select-report-range"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="week">Last 7 days</option><option value="month">This month</option><option value="custom">Custom range</option><option value="all">All time</option></select><ReportDateRangePicker from={range==="all"?from:start} to={range==="all"?to:end} onChange={(f,t)=>{setFrom(f);setTo(t);setRange("custom")}}/></div>}/>
  <div className="content-grid mb-5"><div className="span-3"><Metric label="Sales amount" value={money(saleTotal)} sub={`${sales.length} sales`} icon={CircleDollarSign}/></div><div className="span-3"><Metric label="Purchases" value={money(purchaseTotalAmt)} sub={`${periodPurchases.length} purchases`} icon={Truck} accent="amber"/></div><div className="span-3"><Metric label="Gross profit" value={money(gross)} sub="Sales revenue − purchases" icon={BarChart3} accent="teal"/></div><div className="span-3"><Metric label="Sold" value={qty(kg)} sub="Across all products" icon={ShoppingCart}/></div><div className="span-3"><Metric label="Expenses" value={money(expenseTotal)} sub={`${expenses.length} recorded`} icon={Receipt} accent="amber"/></div><div className="span-3"><Metric label="Net profit" value={money(gross-expenseTotal)} sub={`Less ${money(expenseTotal)} expenses`} icon={Calculator} accent="teal"/></div><div className="span-3"><Metric label="Remaining stock" value={qty(rows.reduce((a,x)=>a+x.s.remaining,0))} sub="Current available stock" icon={Boxes}/></div><div className="span-3"><Metric label="Low stock items" value={String(rows.filter(({p,s})=>s.remaining>0&&s.remaining<=p.minStock).length)} sub="Needs replenishment" icon={SlidersHorizontal} accent="amber"/></div><div className="span-3"><Metric label="Out of stock" value={String(rows.filter(({s})=>s.remaining===0).length)} sub="Unavailable products" icon={Archive}/></div></div>
  <div className="content-grid"><div className="data-card span-7 p-5"><div className="kicker">Sales report</div><h3 className="mt-1 font-display text-lg font-bold">Revenue mix</h3><div className="mt-6 space-y-4">{sales.length?salesPager.pageItems.map(x=><div key={x.id}><div className="mb-1 flex justify-between text-xs"><span className="font-semibold">Sale #{String(x.id).padStart(4,"0")} · {dateLabel(x.date)}</span><b>{money(x.subtotal)}</b></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{width:`${Math.min(100,(x.subtotal/Math.max(saleTotal,1))*100*2.8)}%`}}/></div></div>):<Empty icon={FileBarChart} title="No sales for this period" description="Change the period or complete a sale to populate this report."/>}</div>{sales.length>0&&<Pager page={salesPager.page} totalPages={salesPager.totalPages} onChange={salesPager.setPage} testId="reports-sales"/>}</div><div className="data-card span-5 p-5"><div className="kicker">Inventory report</div><h3 className="mt-1 font-display text-lg font-bold">Value by wire</h3><div className="mt-5 space-y-4">{valueByWirePager.pageItems.map(({p,s})=><div key={p.id}><div className="flex justify-between text-xs"><span className="font-semibold">{p.name}</span><b>{money(s.sale)}</b></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-teal-500" style={{width:`${Math.min(100,s.sale/maxSale*100)}%`}}/></div><div className="mt-1 text-[11px] text-slate-400">{qty(s.remaining)} on hand · {s.remaining===0?"Out of stock":s.remaining<=p.minStock?"Needs attention":"In Stock"}</div></div>)}</div><Pager page={valueByWirePager.page} totalPages={valueByWirePager.totalPages} onChange={valueByWirePager.setPage} testId="reports-value-by-wire"/></div><div className="data-card span-12"><div className="border-b p-5"><h3 className="font-display font-bold">Inventory valuation detail</h3><p className="text-xs text-slate-500">Current inventory, with selected-period sales context above.</p></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th className="text-right">Remaining</th><th className="text-right">Sold</th><th className="text-right">Cost value</th><th className="text-right">Expected profit</th></tr></thead><tbody>{valuationPager.pageItems.map(({p,s})=><tr key={p.id}><td className="font-bold">{p.name}</td><td className="text-right">{qty(s.remaining)}</td><td className="text-right">{qty(s.sold)}</td><td className="text-right">{money(s.cost)}</td><td className="text-right font-bold text-emerald-700">{money(s.profit)}</td></tr>)}</tbody></table><Pager page={valuationPager.page} totalPages={valuationPager.totalPages} onChange={valuationPager.setPage} testId="reports-valuation"/></div></div></div>
 </>;
}

function downloadJSON(data:any,filename:string){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function LogoPicker({value,onChange}:{value:string;onChange:(v:string)=>void}){
  const inputId="logo-upload-input";
  const onFile=(file:File|undefined)=>{
    if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>onChange(String(reader.result||""));
    reader.readAsDataURL(file);
  };
  return <div className="flex items-center gap-3">
    <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[10px] font-semibold text-slate-400">
      {value?<img src={value} alt="Business logo" className="h-full w-full object-contain"/>:"No Logo"}
    </div>
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="btn btn-secondary cursor-pointer !py-1.5 text-xs" data-testid="button-upload-logo">
        <ImageUp size={14}/> Upload logo
        <input id={inputId} type="file" accept="image/png,image/jpeg" className="hidden" onChange={e=>onFile(e.target.files?.[0])} data-testid="input-upload-logo"/>
      </label>
      {value&&<button type="button" onClick={()=>onChange("")} className="text-left text-[11px] font-semibold text-red-600" data-testid="button-remove-logo">Remove logo</button>}
      <p className="text-[11px] text-slate-400">PNG or JPG. Business name shows if no logo is set.</p>
    </div>
  </div>;
}
function Settings(){const b=useBusiness();const [form,setForm]=useState(b.settings);const [toast,setToast]=useState("");const save=async()=>{const r=await b.updateSettings(form);setToast(r.message)};
 const backup=()=>{downloadJSON({...b,exportedAt:new Date().toISOString()},`wire-business-backup-${today}.json`);setToast("Complete backup downloaded")};
 return <><PageHead eyebrow="Workspace controls" title="Settings" description="Keep business identity and invoice details in one quiet place."/><div className="content-grid"><div className="data-card span-8 p-5"><div className="kicker">Invoice settings</div><h3 className="mt-1 font-display text-lg font-bold">Billed from details</h3><p className="mt-1 text-xs text-slate-500">These details appear in the "Billed From" section of every invoice.</p><div className="mt-5 space-y-4"><LogoPicker value={form.logoDataUrl||""} onChange={v=>setForm({...form,logoDataUrl:v})}/><div className="grid gap-4 md:grid-cols-2"><Field label="Owner / Contact name"><input className="input-field" value={form.ownerName||""} onChange={e=>setForm({...form,ownerName:e.target.value})} data-testid="input-settings-owner-name"/></Field><Field label="Business name"><input className="input-field" value={form.businessName} onChange={e=>setForm({...form,businessName:e.target.value})} data-testid="input-settings-business-name"/></Field><Field label="Phone number"><input className="input-field" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} data-testid="input-settings-phone"/></Field><Field label="Address"><input className="input-field" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} data-testid="input-settings-address"/></Field><Field label="2nd owner / contact name (optional)"><input className="input-field" value={form.secondOwnerName||""} onChange={e=>setForm({...form,secondOwnerName:e.target.value})} data-testid="input-settings-second-owner-name"/></Field><Field label="2nd owner phone number (optional)"><input className="input-field" value={form.secondOwnerPhone||""} onChange={e=>setForm({...form,secondOwnerPhone:e.target.value})} data-testid="input-settings-second-owner-phone"/></Field><Field label="Invoice heading text"><input className="input-field" value={form.invoiceHeading||""} onChange={e=>setForm({...form,invoiceHeading:e.target.value})} placeholder="Shows above the business name" data-testid="input-settings-invoice-heading"/></Field><Field label="Currency label"><input className="input-field" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})} data-testid="input-settings-currency"/></Field></div></div><Button onClick={save} className="mt-6" testId="button-save-settings"><Check size={15}/> Save settings</Button></div><div className="data-card span-4 p-5"><div className="kicker">Backup</div><h3 className="mt-1 font-display text-lg font-bold">Download complete backup</h3><p className="mt-2 text-sm leading-6 text-slate-500">Save every product, sale, purchase, expense and customer record as one file, covering the complete history at any time.</p><Button variant="secondary" onClick={backup} className="mt-5 w-full" testId="button-download-backup"><Download size={15}/> Download complete backup</Button></div></div><Toast message={toast} onClose={()=>setToast("")}/></>}

function SuppliersRoute(){return <Suppliers/>}
function NotFound(){return <div className="grid min-h-[70vh] place-items-center"><div className="text-center"><div className="kicker">404</div><h2 className="mt-2 font-display text-3xl font-bold">Page not found</h2><Link href="/" className="btn btn-primary mt-5">Back to dashboard</Link></div></div>}
function Sales(){
 const b=useBusiness(); const [search,setSearch]=useState(""); const [range,setRange]=useState("all"); const [editing,setEditing]=useState<any>(null); const [confirmDelete,setConfirmDelete]=useState<any>(null); const [toast,setToast]=useState("");
 const rangeStart=range==="day"?today:range==="week"?toLocalISODate(new Date(Date.now()-6*86400000)):range==="month"?toLocalISODate(new Date(new Date().getFullYear(),new Date().getMonth(),1)):range==="year"?`${new Date().getFullYear()}-01-01`:"0000-00-00";
 const rows=b.sales.slice().reverse().filter(s=>s.date>=rangeStart).filter(s=>{const name=saleCustomerLabel(b,s).toLowerCase();return !search||name.includes(search.toLowerCase())||String(s.id).includes(search)});
 const {page,setPage,totalPages,pageItems}=usePager(rows);
 const doDelete=()=>{if(!confirmDelete)return;b.removeSale(confirmDelete.id);setToast("Sale deleted");setConfirmDelete(null)};
 return <><PageHead eyebrow="Sale records" title="Sales" description="Every completed sale, with a full record you can open any time." action={<Link href="/pos" className="btn btn-primary" data-testid="link-new-sale-from-sales"><Plus size={16}/> New sale</Link>}/>
  <div className="data-card"><div className="flex flex-col justify-between gap-3 border-b p-4 md:flex-row md:items-center"><div><h3 className="font-display font-bold">Sale history</h3><p className="text-xs text-slate-500">{rows.length} of {b.sales.length} completed sales</p></div><div className="flex flex-wrap items-center gap-2"><select className="input-field w-32 text-xs" value={range} onChange={e=>setRange(e.target.value)} data-testid="select-sales-range"><option value="day">Today</option><option value="week">This week</option><option value="month">This month</option><option value="year">This year</option><option value="all">All time</option></select><input className="input-field max-w-xs text-xs" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by customer or sale #..." data-testid="input-sales-search"/></div></div>
  <div className="table-wrap"><table className="data-table"><thead><tr><th>Sale</th><th>Date</th><th>Customer</th><th>Payment</th><th className="text-right">Amount</th><th className="text-right">Action</th></tr></thead><tbody>{pageItems.map(s=>{const st=salePaymentStatus(b,s);return <tr key={s.id} data-testid={`row-sale-record-${s.id}`}><td className="font-bold">Sale #{String(s.id).padStart(4,"0")}</td><td>{dateLabel(s.date)}</td><td>{saleCustomerLabel(b,s)}</td><td><span className={`status ${st.cls}`}>{st.label}</span></td><td className="text-right"><div className="font-bold">{money(s.subtotal)}</div>{st.remaining>0&&<div className="text-[11px] text-amber-700">{money(st.remaining)} due</div>}</td><td className="text-right"><div className="flex justify-end gap-1"><Link href={`/sales/${s.id}`} className="btn btn-ghost !p-2" title="View invoice" data-testid={`link-view-sale-${s.id}`}><FileText size={14}/></Link><Button variant="ghost" onClick={()=>setEditing(s)} testId={`button-edit-sale-${s.id}`}><Pencil size={14}/></Button><Button variant="danger" onClick={()=>setConfirmDelete(s)} testId={`button-delete-sale-${s.id}`}><Trash2 size={14}/></Button></div></td></tr>})}</tbody></table>{!rows.length&&<Empty icon={ShoppingCart} title="No sales found" description="Adjust the period or search, or complete a new sale."/>}<Pager page={page} totalPages={totalPages} onChange={setPage} testId="sales"/></div></div>
  {editing&&<SaleEditModal sale={editing} onClose={()=>setEditing(null)} onSaved={msg=>{setEditing(null);setToast(msg)}}/>}
  {confirmDelete&&<Confirm message={`Delete Sale #${String(confirmDelete.id).padStart(4,"0")}? This also removes its credit ledger entries and restores its stock.`} onConfirm={doDelete} onCancel={()=>setConfirmDelete(null)}/>}
  <Toast message={toast} onClose={()=>setToast("")}/>
 </>;
}
function SaleDetail(){
 const b=useBusiness(); const {id}=useParams<{id:string}>();
 const sale=b.sales.find(s=>s.id===Number(id));
 const customer=sale?.customerId?b.customers.find(c=>c.id===sale.customerId):null;
 const [editing,setEditing]=useState(false); const [confirmDelete,setConfirmDelete]=useState(false); const [toast,setToast]=useState("");
 const [payAmount,setPayAmount]=useState(""); const [payDate,setPayDate]=useState(today); const [payNote,setPayNote]=useState("");
 const [,setLoc]=useLocation();
 if(!sale) return <><PageHead eyebrow="Sale record" title="Sale not found" description="This sale record does not exist or was removed."/><Empty icon={ShoppingCart} title="No such sale" description="Go back to Sales and pick a valid record."/></>;
 const invoiceData=saleInvoiceData(b,sale);
 
 
 const {payments,totalPaid,remaining}=salePaymentInfo(b,sale);
 const saleStatus=salePaymentStatus(b,sale);
 const paymentsPager=usePager(payments,6);
 const savePayment=async()=>{
   const r=await b.recordSalePayment(sale.id,Number(payAmount||0),payNote,payDate);
   setToast(r.message);
   if(r.ok){setPayAmount("");setPayNote("");setPayDate(today)}
 };
 const doDelete=async()=>{const r=await b.removeSale(sale.id);if(r.ok){setLoc("/sales")}else{setToast(r.message)}};
 return <><PageHead eyebrow="Sale record" title={`Sale #${String(sale.id).padStart(4,"0")}`} description={`Recorded on ${dateLabel(sale.date)}`} action={<div className="flex flex-wrap gap-2"><Link href="/sales" className="btn btn-secondary" data-testid="link-back-to-sales">Back to sales</Link><Button variant="secondary" onClick={()=>setEditing(true)} testId="button-edit-this-sale"><Pencil size={14}/> Edit sale</Button><Button variant="danger" onClick={()=>setConfirmDelete(true)} testId="button-delete-this-sale"><Trash2 size={14}/> Delete</Button></div>}/>
  <div className="content-grid">
   <div className="data-card span-8 p-5"><div className="kicker">Items purchased</div><h3 className="mt-1 font-display text-lg font-bold">Sale lines</h3>
    <div className="table-wrap mt-4"><table className="data-table"><thead><tr><th>Product</th><th>Date</th><th className="text-right">Quantity</th><th className="text-right">Rate</th><th className="text-right">Line total</th></tr></thead><tbody>{sale.lines.map((l,i)=>{const p=b.products.find(z=>z.id===l.productId);const lineDate=l.date||sale.date;return <tr key={i}><td className="font-bold">{p?.name||"Wire product"}</td><td>{dateLabel(lineDate)}{lineDate!==sale.date&&<span className="ml-1 status status-info">added later</span>}</td><td className="text-right">{qty(l.quantityKg)}</td><td className="text-right">{money(l.saleRate*KG_PER_TON)}</td><td className="text-right font-bold">{money(l.quantityKg*l.saleRate)}</td></tr>})}</tbody></table></div>
    <div className="mt-5 flex items-center justify-between rounded-lg bg-emerald-50 p-4"><span className="text-sm font-semibold text-emerald-900">Subtotal</span><b className="font-display text-xl text-emerald-800">{money(sale.subtotal)}</b></div>
    <div className="mt-5 border-t pt-4"><div className="kicker mb-2">Invoice</div>
      <div className="rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-4"><div><div className="font-display text-lg font-bold text-emerald-950">{invoiceData.business.name}</div><div className="text-xs text-slate-500">{invoiceData.business.address}</div><div className="text-xs text-slate-500">{invoiceData.business.phone}</div></div><div className="text-right"><div className="text-xs font-bold uppercase tracking-wide text-slate-400">{invoiceData.kind}</div><div className="font-display text-base font-bold">{invoiceData.number}</div><div className="text-xs text-slate-500">{invoiceData.date}</div></div></div>
        <div className="mt-4"><div className="kicker">{invoiceData.partyLabel}</div><div className="font-bold">{invoiceData.partyName}</div><div className="text-xs text-slate-500">{invoiceData.partyPhone} {invoiceData.partyPhone&&invoiceData.partyAddress?"·":""} {invoiceData.partyAddress}</div></div>
        <div className="mt-4 table-wrap"><table className="data-table"><thead><tr><th>Item</th><th className="text-right">Quantity</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead><tbody>{invoiceData.lines.map((l,i)=><tr key={i}><td>{l.label}</td><td className="text-right">{l.qty}</td><td className="text-right">{l.rate}</td><td className="text-right font-bold">{l.total}</td></tr>)}</tbody></table></div>
        <div className="mt-4 space-y-1 border-t pt-3 text-sm">{invoiceData.totals.map((t,i)=><div key={i} className={`flex justify-between ${t.emphasis?"font-bold text-emerald-900":"text-slate-500"}`}><span>{t.label}</span><span>{t.value}</span></div>)}</div>
        {invoiceData.note&&<p className="mt-3 text-xs italic text-slate-400">{invoiceData.note}</p>}
      </div>
      <div className="mt-4"><InvoiceActions data={invoiceData} filename={`${invoiceData.number}.pdf`}/></div>
    </div>
   </div>
   <div className="data-card span-4 p-5"><div className="kicker">Customer</div><h3 className="mt-1 font-display text-lg font-bold">{saleCustomerLabel(b,sale)}</h3>
    {customer?<div className="mt-3 space-y-1 text-sm text-slate-600"><div>{customer.phone}</div><div>{customer.address}</div></div>:sale.walkInPhone||sale.walkInAddress?<div className="mt-3 space-y-1 text-sm text-slate-600"><div>{sale.walkInPhone}</div><div>{sale.walkInAddress}</div></div>:<p className="mt-3 text-xs text-slate-400">No contact details recorded.</p>}
    <div className="mt-6 space-y-3 border-t pt-4 text-sm"><div className="flex justify-between text-slate-500"><span>Payment status</span><span className={`status ${saleStatus.cls}`}>{saleStatus.label}</span></div><div className="flex justify-between text-slate-500"><span>Total paid so far</span><b className="text-slate-800">{money(totalPaid)}</b></div>{remaining>0?<div className="flex justify-between text-slate-500"><span>Balance remaining</span><b className="text-amber-700">{money(remaining)}</b></div>:<div className="flex justify-between text-slate-500"><span>Balance remaining</span><b className="text-emerald-700">Fully paid</b></div>}</div>
   </div>
  </div>
  {sale.paymentMethod==="credit"&&<div className="content-grid mt-4">
   <div className="data-card span-4 p-5">
    <div className="kicker">Receivables</div><h3 className="mt-1 font-display text-lg font-bold">Record payment for this sale</h3><p className="mt-1 text-xs text-slate-500">Every time this customer pays something toward this specific order — log it here with its date. It also updates their overall account balance.</p>
    <div className="mt-4 space-y-3"><Field label="Payment amount"><input type="number" className="input-field" value={payAmount} onChange={e=>setPayAmount(e.target.value)} placeholder="0" data-testid="input-sale-payment-amount"/></Field><Field label="Payment date"><AutoDate date={payDate} onChange={setPayDate} testId="input-sale-payment-date"/></Field><Field label="Note"><input className="input-field" value={payNote} onChange={e=>setPayNote(e.target.value)} placeholder="e.g. Cash received" data-testid="input-sale-payment-note"/></Field></div>
    <div className="mt-3 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"><span>Balance remaining on this sale</span><span>{money(remaining)}</span></div>
    <Button onClick={savePayment} className="mt-4 w-full" testId="button-record-sale-payment"><Check size={15}/> Record payment</Button>
   </div>
   <div className="data-card span-8"><div className="border-b p-5"><h3 className="font-display font-bold">Payments received for this sale</h3><p className="text-xs text-slate-500">Amount paid at time of sale: {money(sale.paidAmount)}. Every payment since, with its date, is listed below.</p></div>
    {payments.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Note</th><th className="text-right">Amount</th><th className="text-right">Balance after</th></tr></thead><tbody>{(()=>{let running=sale.subtotal-sale.paidAmount;return paymentsPager.pageItems.map(x=>{running-=x.amount;return <tr key={x.id} data-testid={`row-sale-payment-${x.id}`}><td>{dateLabel(x.date)}</td><td className="text-slate-600">{x.note}</td><td className="text-right font-bold text-emerald-700">{money(x.amount)}</td><td className="text-right font-semibold text-slate-600">{money(Math.max(0,running))}</td></tr>})})()}</tbody></table><Pager page={paymentsPager.page} totalPages={paymentsPager.totalPages} onChange={paymentsPager.setPage} testId="sale-payments"/></div>:<Empty icon={Wallet} title="No payments recorded yet" description="Payments made toward this sale after the initial amount will appear here."/>}
   </div>
  </div>}
  {editing&&<SaleEditModal sale={sale} onClose={()=>setEditing(false)} onSaved={msg=>{setEditing(false);setToast(msg)}}/>}
  {confirmDelete&&<Confirm message={`Delete Sale #${String(sale.id).padStart(4,"0")}? This also removes its credit ledger entries and restores its stock.`} onConfirm={doDelete} onCancel={()=>setConfirmDelete(false)}/>}
  <Toast message={toast} onClose={()=>setToast("")}/>
 </>;
}

function Router(){return <Switch><Route path="/" component={Dashboard}/><Route path="/pos" component={POS}/><Route path="/sales/:id" component={SaleDetail}/><Route path="/sales" component={Sales}/><Route path="/products" component={Products}/><Route path="/inventory" component={Inventory}/><Route path="/suppliers/:id" component={SupplierProfile}/><Route path="/suppliers" component={SuppliersRoute}/><Route path="/expenses" component={Expenses}/><Route path="/credit" component={Credit}/><Route path="/customers/:id" component={CustomerProfile}/><Route path="/reports" component={Reports}/><Route path="/settings" component={Settings}/><Route path="/profile" component={ProfilePage}/><Route component={NotFound}/></Switch>}
function LoginPage(){
  const auth=useAuth();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const [error,setError]=useState("");
  const [toast,setToast]=useState("");
  const [busy,setBusy]=useState(false);
  const submit=async (e?:any)=>{
    e?.preventDefault?.();
    if(!email.trim()||!password){setError("Enter your email and password");return}
    setBusy(true);
    const r=await auth.login(email,password);
    setBusy(false);
    if(!r.ok){setError(r.message);return}
    setError("");setToast(r.message);
  };
  return <div className="app-shell flex min-h-dvh items-center justify-center p-4">
    <div className="w-full max-w-md">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-400 text-slate-900"><Zap size={24} fill="currentColor"/></div>
        <div className="font-display text-xl font-bold tracking-tight text-emerald-700">Tech Riwaayat</div>
        <div className="text-xs font-bold uppercase tracking-[.18em] text-teal-700">Business POS</div>
      </div>
      <form onSubmit={submit} className="data-card p-6" data-testid="form-login">
        <div className="kicker">Sign in</div>
        <h1 className="mt-1 font-display text-xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to access your workspace.</p>
        <div className="mt-5 space-y-4">
          <Field label="Email"><input type="email" className="input-field" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" autoComplete="username" data-testid="input-login-username"/></Field>
          <Field label="Password"><div className="relative"><input type={showPassword?"text":"password"} className="input-field pr-10" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" data-testid="input-login-password"/><button type="button" onClick={()=>setShowPassword(s=>!s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label={showPassword?"Hide password":"Show password"}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></Field>
        </div>
        {error&&<div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" data-testid="text-login-error">{error}</div>}
        <Button onClick={submit} disabled={busy} className="mt-5 w-full" testId="button-login-submit"><LockKeyhole size={15}/> {busy?"Signing in…":"Sign in"}</Button>
      </form>
    </div>
    <Toast message={toast} onClose={()=>setToast("")}/>
  </div>;
}
function useCountdown(target?:string|null){
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{ if(!target) return; const t=setInterval(()=>setNow(Date.now()),1000); return ()=>clearInterval(t); },[target]);
  if(!target) return null;
  const diff=new Date(target).getTime()-now;
  const expired=diff<=0;
  const abs=Math.abs(diff);
  const days=Math.floor(abs/86400000);
  const hours=Math.floor((abs%86400000)/3600000);
  const minutes=Math.floor((abs%3600000)/60000);
  const seconds=Math.floor((abs%60000)/1000);
  return {expired,days,hours,minutes,seconds};
}
function SubscriptionCard({user}:{user:AuthUser}){
  const cd=useCountdown(user.planEnd);
  if(!user.plan) return <div className="data-card span-12 p-5"><div className="kicker">Subscription</div><h3 className="mt-1 font-display text-lg font-bold">No active plan</h3><p className="mt-1 text-sm text-slate-500">Ask your super admin to assign a plan to activate a subscription timer here.</p></div>;
  return <div className="data-card span-12 p-5">
    <div className="flex items-center justify-between flex-wrap gap-2"><div><div className="kicker">Subscription</div><h3 className="mt-1 font-display text-lg font-bold">{PLAN_LABELS[user.plan]}</h3></div><span className={`status ${cd?.expired?"status-out":"status-good"}`}>{cd?.expired?"Expired":"Active"}</span></div>
    {cd&&<div className="mt-5 grid grid-cols-4 gap-3 text-center">
      {[["Days",cd.days],["Hours",cd.hours],["Minutes",cd.minutes],["Seconds",cd.seconds]].map(([label,val])=>
        <div key={label as string} className="rounded-xl bg-slate-50 py-4"><div className="font-display text-2xl font-bold text-emerald-700">{String(val).padStart(2,"0")}</div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div></div>
      )}
    </div>}
    <p className="mt-4 text-xs text-slate-500">{cd?.expired?"Your subscription has expired — contact the super admin to renew.":`Time remaining until this plan ends on ${new Date(user.planEnd!).toLocaleString()}.`}</p>
  </div>;
}
function ProfilePage(){
  const auth=useAuth();
  const user=auth.user!;
  const [form,setForm]=useState({name:user.name,phone:user.phone});
  const [toast,setToast]=useState("");
  const initials=(user.name||"?").split(" ").filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase();
  const saveProfile=async ()=>{const r=await auth.updateProfile(form);setToast(r.message)};
  return <><PageHead eyebrow="Account" title="My profile" description="Manage your personal details."/>
  <div className="content-grid">
    <div className="data-card span-4 p-5">
      <div className="flex flex-col items-center text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-bold text-white">{initials||"U"}</div>
        <div className="mt-3 font-display text-lg font-bold">{user.name}</div>
        <div className="text-xs text-slate-500">{user.email}</div>
        <span className="status status-info mt-2 capitalize">{user.role==="superadmin"?"Super Admin":"Administrator"}</span>
      </div>
    </div>
    <div className="data-card span-8 p-5">
      <div className="kicker">Personal details</div>
      <h3 className="mt-1 font-display text-lg font-bold">Edit profile</h3>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Full name"><input className="input-field" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} data-testid="input-profile-name"/></Field>
        <Field label="Email"><input type="email" className="input-field" value={user.email} disabled title="Email cannot be changed" data-testid="input-profile-email"/></Field>
        <Field label="Phone"><input className="input-field" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} data-testid="input-profile-phone"/></Field>
        <Field label="Username"><input className="input-field" value={user.username} disabled data-testid="input-profile-username"/></Field>
      </div>
      <Button onClick={saveProfile} className="mt-5" testId="button-save-profile"><Check size={15}/> Save changes</Button>
    </div>
    {user.role==="admin"&&<SubscriptionCard user={user}/>}
  </div>
  <Toast message={toast} onClose={()=>setToast("")}/>
  </>;
}
function requireSuperAdmin<P extends object>(Comp:(p:P)=>JSX.Element){
  return function Guarded(props:P){
    const auth=useAuth();
    if(auth.user?.role!=="superadmin") return <div className="data-card p-8 text-center"><ShieldCheck size={28} className="mx-auto text-slate-300"/><h3 className="mt-3 font-display text-lg font-bold">Super admin access required</h3><p className="mt-1 text-sm text-slate-500">You don't have permission to view this page.</p></div>;
    return <Comp {...props}/>;
  };
}
function SuperAdminDashboardInner(){
  const auth=useAuth();
  const users=auth.users;
  const admins=users.filter(u=>u.role==="admin");
  const active=admins.filter(u=>!u.locked&&!isPlanExpired(u));
  const locked=admins.filter(u=>u.locked);
  const expired=admins.filter(u=>!u.locked&&isPlanExpired(u));
  const planCounts:Record<string,number>={demo:0,month:0,year:0,none:0};
  admins.forEach(u=>{ planCounts[u.plan||"none"]=(planCounts[u.plan||"none"]||0)+1; });
  return <><PageHead eyebrow="Super Admin" title="Admin control center" description="A live overview of every admin account, subscription and access status."/>
  <div className="content-grid">
    <div className="span-3"><Metric label="Total admins" value={String(admins.length)} sub="Registered accounts" icon={Users}/></div>
    <div className="span-3"><Metric label="Active" value={String(active.length)} sub="In good standing" icon={ShieldCheck} accent="teal"/></div>
    <div className="span-3"><Metric label="Locked" value={String(locked.length)} sub="Access suspended" icon={Lock} accent="amber"/></div>
    <div className="span-3"><Metric label="Expired plans" value={String(expired.length)} sub="Needs renewal" icon={CalendarDays} accent="amber"/></div>
    <div className="data-card span-12 p-5">
      <div className="kicker">Plan distribution</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {(["demo","month","year","none"] as const).map(p=>
          <div key={p} className="rounded-xl bg-slate-50 p-4"><div className="text-2xl font-display font-bold text-emerald-700">{planCounts[p]}</div><div className="text-xs font-semibold text-slate-500 capitalize">{p==="none"?"No plan assigned":PLAN_LABELS[p as PlanId]}</div></div>
        )}
      </div>
    </div>
    <div className="data-card span-12 p-5">
      <div className="flex items-center justify-between"><div><div className="kicker">Accounts</div><h3 className="mt-1 font-display text-lg font-bold">Recent admin accounts</h3></div><Link href="/admin/users" className="btn btn-secondary" data-testid="link-manage-users">Manage users <ChevronRight size={14}/></Link></div>
      <div className="table-wrap mt-4"><table className="data-table"><thead><tr><th>Name</th><th>Plan</th><th>Status</th><th className="text-right">Expires</th></tr></thead><tbody>
        {admins.length===0?<tr><td colSpan={4} className="text-center text-slate-500 py-8">No admin accounts yet</td></tr>:admins.map(u=>
          <tr key={u.username}><td><div className="font-bold">{u.name}</div><div className="text-xs text-slate-500">{u.email}</div></td><td>{u.plan?PLAN_LABELS[u.plan]:"—"}</td><td>{u.locked?<span className="status status-out">Locked</span>:isPlanExpired(u)?<span className="status status-low">Expired</span>:<span className="status status-good">Active</span>}</td><td className="text-right text-xs text-slate-500">{u.planEnd?new Date(u.planEnd).toLocaleDateString():"—"}</td></tr>
        )}
      </tbody></table></div>
    </div>
  </div>
  </>;
}
const SuperAdminDashboard=requireSuperAdmin(SuperAdminDashboardInner);
function UserManagementInner(){
  const auth=useAuth();
  const [toast,setToast]=useState("");
  const [show,setShow]=useState(false);
  const blankForm={username:"",password:"",name:"",email:"",phone:"",role:"admin" as Role};
  const [form,setForm]=useState(blankForm);
  const admins=auth.users.filter(u=>u.role!=="superadmin");
  const createUser=async ()=>{
    if(!form.email||!form.password||!form.name){setToast("Fill in name, email and password");return}
    const r=await auth.addUser(form);
    setToast(r.message);
    if(r.ok){setForm(blankForm);setShow(false)}
  };
  return <><PageHead eyebrow="Super Admin" title="User management" description="Create accounts, grant admin access, assign plans and lock or unlock users." action={<Button onClick={()=>setShow(true)} testId="button-add-user"><Plus size={15}/> Add user</Button>}/>
  <div className="data-card">
    <div className="table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Role</th><th>Plan</th><th>Status</th><th className="text-right">Actions</th></tr></thead><tbody>
      {admins.length===0?<tr><td colSpan={5} className="text-center text-slate-500 py-8">No users yet — add one to get started</td></tr>:admins.map(u=>
        <UserRow key={u.username} u={u} auth={auth} setToast={setToast}/>
      )}
    </tbody></table></div>
  </div>
  {show&&<Modal title="Add new user" eyebrow="User management" onClose={()=>setShow(false)}>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name"><input className="input-field" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} data-testid="input-new-user-name"/></Field>
      <Field label="Username"><input className="input-field" value={form.username} onChange={e=>setForm({...form,username:e.target.value})} data-testid="input-new-user-username"/></Field>
      <Field label="Password"><input type="password" className="input-field" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} data-testid="input-new-user-password"/></Field>
      <Field label="Email"><input type="email" className="input-field" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} data-testid="input-new-user-email"/></Field>
      <Field label="Phone"><input className="input-field" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} data-testid="input-new-user-phone"/></Field>
      <Field label="Access level"><select className="input-field" value={form.role} onChange={e=>setForm({...form,role:e.target.value as Role})} data-testid="select-new-user-role"><option value="admin">Admin</option><option value="superadmin">Super Admin</option></select></Field>
    </div>
    <Button onClick={createUser} className="mt-5 w-full" testId="button-create-user"><Check size={15}/> Create user</Button>
  </Modal>}
  <Toast message={toast} onClose={()=>setToast("")}/>
  </>;
}
function UserRow({u,auth,setToast}:{u:AuthUser;auth:ReturnType<typeof useAuth>;setToast:(s:string)=>void}){
  const [planPick,setPlanPick]=useState<PlanId>("month");
  const [showDetail,setShowDetail]=useState(false);
  const expired=isPlanExpired(u);
  return <tr>
    <td><div className="font-bold">{u.name}</div><div className="text-xs text-slate-500">{u.email||u.username}</div></td>
    <td><span className="status status-info capitalize">{u.role}</span></td>
    <td>
      <div className="flex items-center gap-2">
        <select className="input-field w-36 text-xs" value={planPick} onChange={e=>setPlanPick(e.target.value as PlanId)} data-testid={`select-plan-${u.username}`}>
          {(["demo","month","year"] as const).map(p=><option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
        </select>
        <Button variant="secondary" onClick={()=>{auth.assignPlan(u.username,planPick);setToast(`${PLAN_LABELS[planPick]} assigned to ${u.name}`)}} testId={`button-assign-plan-${u.username}`}>Assign</Button>
      </div>
      {u.plan&&<div className={`mt-1 text-[11px] font-semibold ${expired?"text-red-600":"text-emerald-700"}`}>{expired?"Expired":"Active"} · {u.plan?PLAN_LABELS[u.plan]:""} · ends {u.planEnd?new Date(u.planEnd).toLocaleDateString():"—"}</div>}
    </td>
    <td>{u.locked?<span className="status status-out">Locked</span>:expired?<span className="status status-low">Expired</span>:<span className="status status-good">Active</span>}</td>
    <td className="text-right"><div className="inline-flex items-center gap-1">
      <Button variant="ghost" onClick={()=>setShowDetail(true)} testId={`button-view-user-${u.username}`}><Eye size={14}/></Button>
      <Button variant="ghost" onClick={()=>{auth.setLocked(u.username,!u.locked);setToast(u.locked?`${u.name} unlocked`:`${u.name} locked`)}} testId={`button-toggle-lock-${u.username}`}>{u.locked?<Unlock size={14}/>:<Lock size={14}/>}</Button>
      <Button variant="ghost" onClick={()=>{if(confirm(`Remove ${u.name}?`)){auth.removeUser(u.username);setToast("User removed")}}} testId={`button-remove-user-${u.username}`}><Trash2 size={14}/></Button>
    </div></td>
    {showDetail&&<UserDetailModal u={u} auth={auth} setToast={setToast} onClose={()=>setShowDetail(false)}/>}
  </tr>;
}
// View/edit modal for a single admin account — lets the super admin see the
// full record (including plan dates) and edit the editable fields (name,
// email, phone, password) without leaving the User management page.
function UserDetailModal({u,auth,setToast,onClose}:{u:AuthUser;auth:ReturnType<typeof useAuth>;setToast:(s:string)=>void;onClose:()=>void}){
  const [form,setForm]=useState({name:u.name,email:u.email,phone:u.phone,password:""});
  const [saving,setSaving]=useState(false);
  const expired=isPlanExpired(u);
  const save=async()=>{
    if(!form.name.trim()||!form.email.trim()){setToast("Name and email are required");return}
    setSaving(true);
    const patch:Partial<AuthUser> & {password?:string} = {name:form.name.trim(),email:form.email.trim(),phone:form.phone.trim()};
    if(form.password.trim()) patch.password=form.password.trim();
    auth.updateUser(u.username,patch);
    setSaving(false);
    setToast(`${form.name.trim()} updated`);
    onClose();
  };
  return <Modal title={u.name} eyebrow="User details" onClose={onClose}>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="status status-info capitalize">{u.role}</span>
      <span className={`status ${u.locked?"status-out":expired?"status-low":"status-good"}`}>{u.locked?"Locked":expired?"Plan expired":"Active"}</span>
      {u.plan&&<span className="status status-info">{PLAN_LABELS[u.plan]} · ends {u.planEnd?new Date(u.planEnd).toLocaleDateString():"—"}</span>}
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name"><input className="input-field" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} data-testid={`input-view-user-name-${u.username}`}/></Field>
      <Field label="Username"><input className="input-field" value={u.username} disabled data-testid={`input-view-user-username-${u.username}`}/></Field>
      <Field label="Email"><input type="email" className="input-field" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} data-testid={`input-view-user-email-${u.username}`}/></Field>
      <Field label="Phone"><input className="input-field" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} data-testid={`input-view-user-phone-${u.username}`}/></Field>
      <Field label="New password (leave blank to keep current)"><input type="password" className="input-field" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="••••••••" data-testid={`input-view-user-password-${u.username}`}/></Field>
    </div>
    <Button onClick={save} disabled={saving} className="mt-5 w-full" testId={`button-save-view-user-${u.username}`}><Check size={15}/> {saving?"Saving…":"Save changes"}</Button>
  </Modal>;
}
const UserManagement=requireSuperAdmin(UserManagementInner);
function AdminPaymentsInner(){
  const auth=useAuth();
  const admins=auth.users.filter(u=>u.role==="admin");
  const [selected,setSelected]=useState(admins[0]?.username||"");
  const [amount,setAmount]=useState("");
  const [method,setMethod]=useState("Cash");
  const [note,setNote]=useState("");
  const [toast,setToast]=useState("");
  const totalCollected=auth.payments.reduce((a,p)=>a+p.amount,0);
  const thisMonth=auth.payments.filter(p=>new Date(p.date).getMonth()===new Date().getMonth()&&new Date(p.date).getFullYear()===new Date().getFullYear()).reduce((a,p)=>a+p.amount,0);
  const paymentsPager=usePager(auth.payments,10);
  const submit=async ()=>{
    const amt=Number(amount||0);
    const r=await auth.recordPayment(selected,amt,method,note);
    setToast(r.message);
    if(r.ok){setAmount("");setNote("")}
  };
  return <><PageHead eyebrow="Super Admin" title="Payments" description="Collect and track subscription payments from admin accounts."/>
  <div className="content-grid mb-5">
    <div className="span-4"><Metric label="Total collected" value={money(totalCollected)} sub="All-time" icon={Wallet}/></div>
    <div className="span-4"><Metric label="This month" value={money(thisMonth)} sub={new Date().toLocaleString(undefined,{month:"long",year:"numeric"})} icon={CircleDollarSign} accent="teal"/></div>
    <div className="span-4"><Metric label="Transactions" value={String(auth.payments.length)} sub="Recorded payments" icon={Receipt}/></div>
  </div>
  <div className="content-grid">
    <div className="data-card span-5 p-5">
      <div className="kicker">Collect payment</div>
      <h3 className="mt-1 font-display text-lg font-bold">Record a new payment</h3>
      <div className="mt-5 space-y-4">
        <Field label="Admin account"><select className="input-field" value={selected} onChange={e=>setSelected(e.target.value)} data-testid="select-payment-user">{admins.length===0?<option value="">No admin accounts</option>:admins.map(u=><option key={u.username} value={u.username}>{u.name} ({u.username})</option>)}</select></Field>
        <Field label="Amount (Rs)"><input type="number" className="input-field" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" data-testid="input-payment-amount"/></Field>
        <Field label="Method"><select className="input-field" value={method} onChange={e=>setMethod(e.target.value)} data-testid="select-payment-method"><option>Cash</option><option>Bank transfer</option><option>Card</option><option>Mobile wallet</option><option>Other</option></select></Field>
        <Field label="Note"><input className="input-field" value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. Monthly plan renewal" data-testid="input-payment-note"/></Field>
      </div>
      <Button onClick={submit} disabled={!selected} className="mt-5 w-full" testId="button-record-payment"><Check size={15}/> Record payment</Button>
    </div>
    <div className="data-card span-7">
      <div className="border-b p-5"><h3 className="font-display font-bold">Payment history</h3><p className="text-xs text-slate-500">Every payment collected from admin accounts.</p></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Method</th><th className="text-right">Amount</th><th className="text-right">Date</th></tr></thead><tbody>
        {paymentsPager.pageItems.length===0?<tr><td colSpan={4} className="text-center text-slate-500 py-8">No payments recorded yet</td></tr>:paymentsPager.pageItems.map(p=>
          <tr key={p.id}><td><div className="font-bold">{p.userName}</div>{p.note&&<div className="text-xs text-slate-500">{p.note}</div>}</td><td>{p.method}</td><td className="text-right font-bold text-emerald-700">{money(p.amount)}</td><td className="text-right text-xs text-slate-500">{new Date(p.date).toLocaleString()}</td></tr>
        )}
      </tbody></table></div>
      {auth.payments.length>0&&<Pager page={paymentsPager.page} totalPages={paymentsPager.totalPages} onChange={paymentsPager.setPage} testId="admin-payments"/>}
    </div>
  </div>
  <Toast message={toast} onClose={()=>setToast("")}/>
  </>;
}
const AdminPayments=requireSuperAdmin(AdminPaymentsInner);
function AdminReportsInner(){
  const auth=useAuth();
  const admins=auth.users.filter(u=>u.role==="admin");
  const totalCollected=auth.payments.reduce((a,p)=>a+p.amount,0);
  const months:{label:string;total:number}[]=[];
  for(let i=5;i>=0;i--){
    const d=new Date(); d.setMonth(d.getMonth()-i);
    const label=d.toLocaleString(undefined,{month:"short",year:"2-digit"});
    const total=auth.payments.filter(p=>{const pd=new Date(p.date);return pd.getMonth()===d.getMonth()&&pd.getFullYear()===d.getFullYear()}).reduce((a,p)=>a+p.amount,0);
    months.push({label,total});
  }
  const maxMonth=Math.max(...months.map(m=>m.total),1);
  const byMethod=auth.payments.reduce((acc:Record<string,number>,p)=>{acc[p.method]=(acc[p.method]||0)+p.amount;return acc},{});
  const topPayers=admins.map(u=>({u,total:auth.payments.filter(p=>p.username===u.username).reduce((a,p)=>a+p.amount,0)})).filter(x=>x.total>0).sort((a,z)=>z.total-a.total).slice(0,8);
  const planCounts:Record<string,number>={demo:0,month:0,year:0,none:0};
  admins.forEach(u=>{planCounts[u.plan||"none"]=(planCounts[u.plan||"none"]||0)+1});
  return <><PageHead eyebrow="Super Admin" title="Reports" description="Revenue, subscriptions and account activity across the platform."/>
  <div className="content-grid mb-5">
    <div className="span-3"><Metric label="Total revenue" value={money(totalCollected)} sub="All-time payments" icon={CircleDollarSign}/></div>
    <div className="span-3"><Metric label="Total admins" value={String(admins.length)} sub="Registered accounts" icon={Users} accent="teal"/></div>
    <div className="span-3"><Metric label="Active plans" value={String(admins.filter(u=>u.plan&&!isPlanExpired(u)&&!u.locked).length)} sub="Currently active" icon={ShieldCheck}/></div>
    <div className="span-3"><Metric label="Locked accounts" value={String(admins.filter(u=>u.locked).length)} sub="Access suspended" icon={Lock} accent="amber"/></div>
  </div>
  <div className="content-grid">
    <div className="data-card span-7 p-5">
      <div className="kicker">Revenue report</div>
      <h3 className="mt-1 font-display text-lg font-bold">Monthly collections (last 6 months)</h3>
      <div className="mt-6 space-y-4">{months.map(m=><div key={m.label}><div className="mb-1 flex justify-between text-xs"><span className="font-semibold">{m.label}</span><b>{money(m.total)}</b></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{width:`${Math.min(100,(m.total/maxMonth)*100)}%`}}/></div></div>)}</div>
    </div>
    <div className="data-card span-5 p-5">
      <div className="kicker">Breakdown</div>
      <h3 className="mt-1 font-display text-lg font-bold">Payments by method</h3>
      <div className="mt-5 space-y-3">{Object.keys(byMethod).length===0?<Empty icon={Wallet} title="No payments yet" description="Collected payments will be broken down here by method."/>:Object.entries(byMethod).map(([m,total])=><div key={m} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"><span className="text-sm font-semibold">{m}</span><span className="text-sm font-bold text-emerald-700">{money(total)}</span></div>)}</div>
      <div className="mt-6 kicker">Plan distribution</div>
      <div className="mt-3 grid grid-cols-2 gap-2">{(["demo","month","year","none"] as const).map(p=><div key={p} className="rounded-lg bg-slate-50 px-3 py-2 text-center"><div className="font-display text-lg font-bold text-emerald-700">{planCounts[p]}</div><div className="text-[10px] font-semibold text-slate-500 capitalize">{p==="none"?"No plan":p}</div></div>)}</div>
    </div>
    <div className="data-card span-12">
      <div className="border-b p-5"><h3 className="font-display font-bold">Top paying accounts</h3><p className="text-xs text-slate-500">Admin accounts ranked by total payments collected.</p></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Account</th><th>Plan</th><th className="text-right">Total paid</th></tr></thead><tbody>
        {topPayers.length===0?<tr><td colSpan={3} className="text-center text-slate-500 py-8">No payments recorded yet</td></tr>:topPayers.map(({u,total})=>
          <tr key={u.username}><td><div className="font-bold">{u.name}</div><div className="text-xs text-slate-500">{u.email}</div></td><td>{u.plan?PLAN_LABELS[u.plan]:"—"}</td><td className="text-right font-bold text-emerald-700">{money(total)}</td></tr>
        )}
      </tbody></table></div>
    </div>
  </div>
  </>;
}
const AdminReports=requireSuperAdmin(AdminReportsInner);
function AuthGate(){
  const auth=useAuth();
  if(!auth.ready) return <div className="grid min-h-dvh place-items-center bg-slate-50 text-sm font-semibold text-slate-500">Loading…</div>;
  if(!auth.user) return <LoginPage/>;
  if(auth.user.role==="superadmin") return <SuperAdminShell><SuperAdminRouter/></SuperAdminShell>;
  return <BusinessProvider><Shell><Router/></Shell></BusinessProvider>;
}
function App(){return <QueryClientProvider client={queryClient}><TooltipProvider><AuthProvider><AuthGate/></AuthProvider><Toaster/></TooltipProvider></QueryClientProvider>}
export default App;
