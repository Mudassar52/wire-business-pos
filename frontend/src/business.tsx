import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api";

// avgCost: the real weighted-average purchase cost from the Purchases
// ledger (what the backend actually uses to compute gross profit on a
// sale — see backend salesController.weightedAvgCost). purchasePrice is
// just the manually-typed catalogue field and can drift out of sync with
// it, so anything computing profit/cost should prefer avgCost when present.
export type Product = { id:number; name:string; wireType:string; thickness:string; purchasePrice:number; salePrice:number; minStock:number; avgCost?:number };
export type Supplier = { id:number; name:string; company:string; phone:string; address:string; notes:string };
export type Customer = { id:number; name:string; phone:string; address:string };
export type Purchase = { id:number; supplierId:number; invoiceNumber:string; date:string; productId:number; quantityKg:number; purchaseRate:number; discountAmount:number; paidAmount:number; notes:string };
export type SaleLine = { productId:number; quantityKg:number; saleRate:number; purchaseRate:number; date?:string };
export type Sale = { id:number; date:string; customerId:number|null; walkInName?:string; walkInPhone?:string; walkInAddress?:string; paymentMethod:"cash"|"credit"; lines:SaleLine[]; subtotal:number; discountAmount:number; grossProfit:number; paidAmount:number };
export type Expense = { id:number; title:string; category:string; amount:number; date:string; description:string };
export type CreditTransaction = { id:number; customerId:number; saleId:number|null; type:"sale"|"payment"; amount:number; date:string; note:string };
export type SupplierPayment = { id:number; supplierId:number; amount:number; date:string; note:string; purchaseId?:number|null };
export type BusinessState = { products:Product[]; wireTypes:string[]; thicknesses:string[]; expenseCategories:string[]; suppliers:Supplier[]; customers:Customer[]; purchases:Purchase[]; sales:Sale[]; expenses:Expense[]; creditTransactions:CreditTransaction[]; supplierPayments:SupplierPayment[]; settings:{ businessName:string; currency:string; phone:string; address:string; logoDataUrl:string; ownerName:string; secondOwnerName:string; secondOwnerPhone:string; invoiceHeading:string } };

// IMPORTANT: Date#toISOString() always converts to UTC before formatting.
// For a user in a timezone ahead of UTC (e.g. Pakistan, UTC+5), that meant
// during the first few hours after local midnight, `new Date().toISOString()`
// still reported the PREVIOUS day, because it hadn't rolled over in UTC yet.
// Every "today" filter (Dashboard, POS default sale date, Reports) used this
// value, so a sale completed first thing in the morning would save under
// what looked like yesterday's date and quietly miss every "today" stat.
// Building the string from local year/month/day instead avoids that shift.
export const toLocalISODate = (d:Date = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};
const today = toLocalISODate();

const emptyState:BusinessState = {
  products:[], wireTypes:[], thicknesses:[], expenseCategories:[],
  suppliers:[], customers:[], purchases:[], sales:[], expenses:[],
  creditTransactions:[], supplierPayments:[],
  settings:{businessName:"Wire Business",currency:"$",phone:"",address:"",logoDataUrl:"",ownerName:"",secondOwnerName:"",secondOwnerPhone:"",invoiceHeading:""},
};

// Total actually owed on a purchase invoice, net of any supplier discount
// (e.g. the supplier knocks a flat amount off, or gives some stock free).
export const purchaseTotal = (p:Purchase) => Math.max(0, p.quantityKg*p.purchaseRate - (p.discountAmount||0));

type ActionResult = {ok:boolean;message:string};
type Actions = {
  add:(key: keyof BusinessState, item:any)=>Promise<ActionResult>; update:(key:keyof BusinessState,id:number,item:any)=>Promise<ActionResult>; remove:(key:keyof BusinessState,id:number)=>Promise<ActionResult>; removeListItem:(key:"wireTypes"|"thicknesses"|"expenseCategories",value:string)=>Promise<ActionResult>;
  completeSale:(sale:Sale,newCustomer?:{name:string;phone:string;address:string})=>Promise<ActionResult>; addPurchase:(purchase:Purchase)=>Promise<ActionResult>;
  recordPayment:(customerId:number,amount:number,note:string,date?:string)=>Promise<ActionResult>; recordSupplierPayment:(supplierId:number,amount:number,note:string,date?:string)=>Promise<ActionResult>; reset:()=>void; updateSettings:(settings:BusinessState["settings"])=>Promise<ActionResult>;
  editSale:(saleId:number,lines:SaleLine[],meta:{customerId?:number|null;paymentMethod?:"cash"|"credit";paidAmount?:number;discountAmount?:number})=>Promise<ActionResult>;
  recordSalePayment:(saleId:number,amount:number,note:string,date?:string)=>Promise<ActionResult>;
  removeSale:(saleId:number)=>Promise<ActionResult>;
  payPurchaseInvoice:(purchaseId:number,amount:number,date?:string,note?:string)=>Promise<ActionResult>;
  updateCreditTransaction:(id:number,patch:{amount?:number;note?:string;date?:string})=>Promise<ActionResult>;
  removeCreditTransaction:(id:number)=>Promise<ActionResult>;
};
const BusinessContext = createContext<(BusinessState & Actions) | null>(null);

function normalizePurchase(p:any):Purchase { return { ...p, discountAmount: Number(p.discountAmount||0) }; }
function normalizeSale(s:any):Sale { return { ...s, discountAmount: Number(s.discountAmount||0) }; }

export function BusinessProvider({children}:{children:ReactNode}) {
  const [state,setState] = useState<BusinessState>(emptyState);
  const [loading,setLoading] = useState(true);
  const [loadError,setLoadError] = useState("");
  const loadedOnce = useRef(false);

  async function loadAll() {
    setLoadError("");
    try {
      const [products, suppliers, customers, purchases, sales, expenses, credit, supplierPayments, settingsRes, wireTypes, thicknesses, expenseCategories] = await Promise.all([
        api.products.list(), api.suppliers.list(), api.customers.list(), api.purchases.list(),
        api.sales.list(), api.expenses.list(), api.credit.list(), api.purchases.listPayments(),
        api.settings.get(), api.lists.get("wire-types"), api.lists.get("thicknesses"), api.lists.get("expense-categories"),
      ]);
      setState({
        products: products.products || [],
        suppliers: suppliers.suppliers || [],
        customers: customers.customers || [],
        purchases: (purchases.purchases || []).map(normalizePurchase),
        sales: (sales.sales || []).map(normalizeSale),
        expenses: expenses.expenses || [],
        creditTransactions: credit.creditTransactions || [],
        supplierPayments: supplierPayments.supplierPayments || [],
        settings: settingsRes.settings || emptyState.settings,
        wireTypes: wireTypes.items || [],
        thicknesses: thicknesses.items || [],
        expenseCategories: expenseCategories.items || [],
      });
    } catch (err:any) {
      setLoadError(err?.message || "Could not load business data from the server");
    } finally {
      setLoading(false);
      loadedOnce.current = true;
    }
  }

  useEffect(() => { loadAll(); }, []);

  const nextId = (items:any[]) => items.reduce((m,x)=>Math.max(m,Number(x.id)||0),0)+1;

  const LIST_ENDPOINT: Record<string, any> = {
    products: api.products, suppliers: api.suppliers, customers: api.customers,
    expenses: api.expenses,
  };
  const RESULT_KEY: Record<string,string> = { products:"product", suppliers:"supplier", customers:"customer", expenses:"expense" };

  const add = (key:keyof BusinessState,item:any):Promise<ActionResult> => {
    if (key==="wireTypes" || key==="thicknesses" || key==="expenseCategories") {
      const listName = key==="wireTypes"?"wire-types":key==="thicknesses"?"thicknesses":"expense-categories";
      setState(s=>({...s,[key]:[...(s[key] as string[]),String(item)]}));
      return api.lists.add(listName, String(item)).then(()=>({ok:true,message:"Added"})).catch((err:any)=>{
        setState(s=>({...s,[key]:(s[key] as string[]).filter(x=>x!==String(item))}));
        return {ok:false,message:err?.message||`Failed to save ${String(key)}. Please try again.`};
      });
    }
    const tempId = nextId(state[key] as any[]);
    const withTemp = {...item, id: tempId};
    setState(s=>({...s,[key]:[...(s[key] as any[]),withTemp]}));
    const endpoint = LIST_ENDPOINT[key as string];
    if (!endpoint) return Promise.resolve({ok:true,message:"Added"});
    return endpoint.create(item).then((res:any)=>{
      const saved = res[RESULT_KEY[key as string]];
      if (saved) setState(s=>({...s,[key]:(s[key] as any[]).map(x=>x.id===tempId?saved:x)}));
      return {ok:true,message:"Added"};
    }).catch((err:any)=>{
      // The server never confirmed this record, so don't leave a phantom
      // copy sitting only in local state — it would look fine until the
      // next refresh, then quietly vanish. Roll it back and report why.
      console.error(`Failed to save ${String(key)}`, err);
      setState(s=>({...s,[key]:(s[key] as any[]).filter(x=>x.id!==tempId)}));
      return {ok:false,message:err?.message||`Failed to save. Please check your connection and try again.`};
    });
  };
  const update = (key:keyof BusinessState,id:number,item:any):Promise<ActionResult> => {
    const previous = (state[key] as any[]).find(x=>x.id===id);
    setState(s=>({...s,[key]:(s[key] as any[]).map(x=>x.id===id?{...x,...item}:x)}));
    const endpoint = LIST_ENDPOINT[key as string];
    const call = endpoint ? endpoint.update(id, item) : (key==="purchases" ? api.purchases.update(id, item) : null);
    if (!call) return Promise.resolve({ok:true,message:"Updated"});
    return call.then(()=>({ok:true,message:"Updated"})).catch((err:any)=>{
      console.error(`Failed to update ${String(key)}`, err);
      if (previous) setState(s=>({...s,[key]:(s[key] as any[]).map(x=>x.id===id?previous:x)}));
      return {ok:false,message:err?.message||"Failed to save the change. Please try again."};
    });
  };
  const remove = (key:keyof BusinessState,id:number):Promise<ActionResult> => {
    const previous = (state[key] as any[]).find(x=>x.id===id);
    const previousIndex = (state[key] as any[]).findIndex(x=>x.id===id);
    setState(s=>({...s,[key]:(s[key] as any[]).filter(x=>x.id!==id)}));
    const endpoint = LIST_ENDPOINT[key as string];
    const call = endpoint ? endpoint.remove(id) : (key==="purchases" ? api.purchases.remove(id) : null);
    if (!call) return Promise.resolve({ok:true,message:"Deleted"});
    return call.then(()=>({ok:true,message:"Deleted"})).catch((err:any)=>{
      console.error(`Failed to remove ${String(key)}`, err);
      if (previous) setState(s=>{
        const arr=[...(s[key] as any[])];
        arr.splice(Math.min(previousIndex,arr.length),0,previous);
        return {...s,[key]:arr};
      });
      return {ok:false,message:err?.message||"Failed to delete. Please try again."};
    });
  };
  const removeListItem = (key:"wireTypes"|"thicknesses"|"expenseCategories",value:string):Promise<ActionResult> => {
    setState(s=>({...s,[key]:(s[key] as string[]).filter(x=>x!==value)}));
    const listName = key==="wireTypes"?"wire-types":key==="thicknesses"?"thicknesses":"expense-categories";
    return api.lists.remove(listName, value).then(()=>({ok:true,message:"Removed"})).catch((err:any)=>{
      console.error(`Failed to remove ${key} item`, err);
      setState(s=>({...s,[key]:[...(s[key] as string[]),value]}));
      return {ok:false,message:err?.message||"Failed to remove. Please try again."};
    });
  };

  const inventoryFor = (s:BusinessState,pid:number) => {
    const purchased=s.purchases.filter(x=>x.productId===pid).reduce((a,x)=>a+x.quantityKg,0);
    const sold=s.sales.flatMap(x=>x.lines).filter(x=>x.productId===pid).reduce((a,x)=>a+x.quantityKg,0);
    return purchased-sold;
  };

  const completeSale = async (sale:Sale,newCustomer?:{name:string;phone:string;address:string}):Promise<ActionResult> => {
    // Fast local pre-check so an obviously oversold cart is rejected instantly,
    // without waiting on the network — the server still re-checks stock for
    // real before it ever writes anything (see below), since local state can
    // be a moment out of date.
    for (const line of sale.lines) {
      if (line.quantityKg > inventoryFor(state, line.productId)) {
        const name = state.products.find(p=>p.id===line.productId)?.name || "selected product";
        return {ok:false, message:`Insufficient stock for ${name}`};
      }
    }
    const usedNewCustomer = !sale.customerId && !!newCustomer?.name.trim();
    const discountAmount = Math.max(0, sale.discountAmount||0);
    const payload:any = {
      date: sale.date, customerId: usedNewCustomer ? null : sale.customerId, walkInName: sale.walkInName||"",
      walkInPhone: sale.walkInPhone||"", walkInAddress: sale.walkInAddress||"", paymentMethod: sale.paymentMethod,
      paidAmount: sale.paidAmount, discountAmount, lines: sale.lines,
    };
    if (usedNewCustomer && newCustomer) payload.newCustomer = newCustomer;
    // IMPORTANT: unlike the other actions above, we deliberately do NOT touch
    // local state until the server has actually confirmed the sale. A sale
    // changes stock, money owed, and customer records all at once — writing
    // it into the UI optimistically and only finding out afterwards that the
    // server rejected it (insufficient stock re-check, a validation issue,
    // a dropped connection, etc) is exactly how a sale used to look
    // "completed" on screen and then quietly disappear the moment the page
    // was refreshed, because it had never actually been saved.
    try {
      const res:any = await api.sales.complete(payload);
      if (!res?.sale) return {ok:false, message: res?.message || "Could not complete the sale. Please try again."};
      const real = normalizeSale(res.sale);
      setState(s => ({
        ...s,
        customers: usedNewCustomer && real.customerId!=null && newCustomer && !s.customers.some(c=>c.id===real.customerId)
          ? [...s.customers, {id:real.customerId, name:newCustomer.name.trim(), phone:newCustomer.phone.trim(), address:newCustomer.address.trim()}]
          : s.customers,
        sales: [...s.sales, real],
        // The 'sale' ledger entry now always carries the full billed amount
        // (never netted against what's already been paid — see completeSale
        // in salesController.js for why), and any advance paid at checkout
        // gets its own 'payment' entry so it shows up as "Received" against
        // this exact invoice instead of being silently absorbed into a
        // smaller "Billed" number.
        creditTransactions: real.paymentMethod==="credit" && real.customerId
          ? [
              ...s.creditTransactions,
              {id:nextId(s.creditTransactions), customerId:real.customerId, saleId:real.id, type:"sale", amount:real.subtotal, date:real.date, note:"Credit sale"},
              ...(real.paidAmount>0 ? [{id:nextId(s.creditTransactions)+1, customerId:real.customerId, saleId:real.id, type:"payment" as const, amount:real.paidAmount, date:real.date, note:"Advance received at time of sale"}] : []),
            ]
          : s.creditTransactions,
      }));
      return {ok:true, message:"Sale completed successfully"};
    } catch (err:any) {
      console.error("Failed to save sale to server", err);
      return {ok:false, message: err?.message || "Could not reach the server — the sale was NOT saved. Please try again."};
    }
  };

  const addPurchase = async (purchase:Purchase):Promise<ActionResult> => {
    const discountAmount = Math.max(0, purchase.discountAmount||0);
    // Same reasoning as completeSale: a purchase changes stock and money owed
    // to a supplier, so it's only added to local state once the server has
    // actually confirmed it — never optimistically. Otherwise a failed save
    // (e.g. a dropped connection) would look like a successful purchase right
    // up until the next refresh, when it would silently vanish.
    try {
      const res:any = await api.purchases.create({
        supplierId:purchase.supplierId, invoiceNumber:purchase.invoiceNumber, date:purchase.date,
        productId:purchase.productId, quantityKg:purchase.quantityKg, purchaseRate:purchase.purchaseRate,
        discountAmount, paidAmount:purchase.paidAmount, notes:purchase.notes,
      });
      if (!res?.purchase) return {ok:false, message: res?.message || "Could not save the purchase. Please try again."};
      const saved = normalizePurchase(res.purchase);
      setState(s=>({...s,purchases:[...s.purchases,saved]}));
      return {ok:true,message:"Purchase added and inventory updated"};
    } catch (err:any) {
      console.error("Failed to save purchase to server", err);
      return {ok:false, message: err?.message || "Could not reach the server — the purchase was NOT saved. Please try again."};
    }
  };

  const recordPayment = async (customerId:number,amount:number,note:string,date?:string):Promise<ActionResult> => {
    if (amount<=0) return {ok:false, message:"Enter a valid payment amount"};
    try {
      const res:any = await api.credit.recordPayment(customerId,amount,note,date);
      const t = res.transaction || res.creditTransaction;
      if (!t) return {ok:false, message: res?.message || "Could not save the payment. Please try again."};
      setState(s=>({...s,creditTransactions:[...s.creditTransactions,{id:t.id,customerId:t.customerId??t.customer_id,saleId:t.saleId??t.sale_id,type:t.type,amount:Number(t.amount),date:t.date,note:t.note}]}));
      return {ok:true, message:"Payment recorded successfully"};
    } catch (err:any) {
      console.error("Failed to save customer payment", err);
      return {ok:false, message: err?.message || "Could not reach the server — the payment was NOT saved. Please try again."};
    }
  };

  // Edit or delete a manually-recorded entry in a customer's credit ledger
  // (general payments and payments recorded against a specific sale — both
  // live in creditTransactions as type:"payment"). The auto-generated
  // "sale" entry for an invoice, and the "Advance received at time of sale"
  // entry, are excluded on the server and should be changed via the sale
  // itself instead.
  const updateCreditTransaction = async (id:number,patch:{amount?:number;note?:string;date?:string}):Promise<ActionResult> => {
    const previous = state.creditTransactions.find(t=>t.id===id);
    if (!previous) return {ok:false, message:"Transaction not found"};
    setState(s=>({...s,creditTransactions:s.creditTransactions.map(t=>t.id===id?{...t,...patch}:t)}));
    try {
      const res:any = await api.credit.updatePayment(id, patch);
      const t = res?.transaction;
      if (t) setState(s=>({...s,creditTransactions:s.creditTransactions.map(x=>x.id===id?{id:t.id,customerId:t.customerId??t.customer_id,saleId:t.saleId??t.sale_id,type:t.type,amount:Number(t.amount),date:t.date,note:t.note}:x)}));
      return {ok:true, message:"Payment updated"};
    } catch (err:any) {
      console.error("Failed to update credit transaction", err);
      setState(s=>({...s,creditTransactions:s.creditTransactions.map(t=>t.id===id?previous:t)}));
      return {ok:false, message: err?.message || "Could not save the change. Please try again."};
    }
  };
  const removeCreditTransaction = async (id:number):Promise<ActionResult> => {
    const previous = state.creditTransactions.find(t=>t.id===id);
    const previousIndex = state.creditTransactions.findIndex(t=>t.id===id);
    setState(s=>({...s,creditTransactions:s.creditTransactions.filter(t=>t.id!==id)}));
    try {
      await api.credit.removePayment(id);
      return {ok:true, message:"Payment deleted"};
    } catch (err:any) {
      console.error("Failed to remove credit transaction", err);
      if (previous) setState(s=>{
        const arr=[...s.creditTransactions];
        arr.splice(Math.min(previousIndex,arr.length),0,previous);
        return {...s,creditTransactions:arr};
      });
      return {ok:false, message: err?.message || "Could not delete the payment. Please try again."};
    }
  };

  const recordSupplierPayment = async (supplierId:number,amount:number,note:string,date?:string):Promise<ActionResult> => {
    if (amount<=0) return {ok:false, message:"Enter a valid payment amount"};
    try {
      const res:any = await api.purchases.recordPayment({supplierId,amount,note,date});
      const p = res.supplierPayment || res.payment;
      if (!p) return {ok:false, message: res?.message || "Could not save the payment. Please try again."};
      setState(s=>({...s,supplierPayments:[...s.supplierPayments,p]}));
      return {ok:true, message:"Payment recorded successfully"};
    } catch (err:any) {
      console.error("Failed to save supplier payment", err);
      return {ok:false, message: err?.message || "Could not reach the server — the payment was NOT saved. Please try again."};
    }
  };

  const editSale = async (saleId:number,lines:SaleLine[],meta:{customerId?:number|null;paymentMethod?:"cash"|"credit";paidAmount?:number;discountAmount?:number}):Promise<ActionResult> => {
    const sale = state.sales.find(x=>x.id===saleId);
    if (!sale) return {ok:false, message:"Sale not found"};
    if (!lines.length) return {ok:false, message:"A sale needs at least one item"};
    const neededByProduct = new Map<number,number>();
    for (const l of lines) neededByProduct.set(l.productId,(neededByProduct.get(l.productId)||0)+l.quantityKg);
    for (const [pid,needed] of neededByProduct) {
      const purchased = state.purchases.filter(p=>p.productId===pid).reduce((a,x)=>a+x.quantityKg,0);
      const soldElsewhere = state.sales.filter(x=>x.id!==saleId).flatMap(x=>x.lines).filter(l=>l.productId===pid).reduce((a,x)=>a+x.quantityKg,0);
      const available = purchased-soldElsewhere;
      if (needed>available+1e-9) {
        const pname = state.products.find(p=>p.id===pid)?.name || "selected product";
        return {ok:false, message:`Insufficient stock for ${pname}. Available: ${(available/1000).toFixed(3)} Ton`};
      }
    }
    const stampedLines = lines.map(l=>({...l,date:l.date||sale.date}));
    const discountAmount = meta.discountAmount ?? sale.discountAmount ?? 0;
    const paidAmount = meta.paidAmount ?? sale.paidAmount;
    const paymentMethod = meta.paymentMethod ?? sale.paymentMethod;
    const customerId = meta.customerId!==undefined ? meta.customerId : sale.customerId;
    const payload = {lines:stampedLines,customerId,paymentMethod,paidAmount,discountAmount};
    // As with completeSale, we wait for the server's confirmation before
    // touching local state — an edit that "sticks" on screen but was never
    // actually saved is worse than one that visibly failed and can be retried.
    try {
      const res:any = await api.sales.edit(saleId, payload);
      if (!res?.sale) return {ok:false, message: res?.message || "Could not save the changes. Please try again."};
      const real = normalizeSale(res.sale);
      setState(s=>{
        const sales = s.sales.map(x=>x.id===saleId?real:x);
        let creditTransactions = s.creditTransactions;
        const existingDebtTx = creditTransactions.find(t=>t.saleId===saleId&&t.type==="sale");
        // Same fixed note used on the backend to identify the upfront-advance
        // entry specifically, so we update just that one row without
        // touching any other payments recorded against this sale.
        const existingAdvanceTx = creditTransactions.find(t=>t.saleId===saleId&&t.type==="payment"&&t.note==="Advance received at time of sale");
        if (real.paymentMethod==="credit" && real.customerId) {
          // 'sale' entry always carries the full billed amount, never netted
          // against paidAmount — see completeSale for why.
          creditTransactions = existingDebtTx
            ? creditTransactions.map(t=>t.id===existingDebtTx.id?{...t,amount:real.subtotal,customerId:real.customerId as number,date:t.date}:t)
            : [...creditTransactions,{id:nextId(creditTransactions),customerId:real.customerId as number,saleId,type:"sale",amount:real.subtotal,date:real.date,note:"Credit sale"}];
          if (real.paidAmount>0) {
            creditTransactions = existingAdvanceTx
              ? creditTransactions.map(t=>t.id===existingAdvanceTx.id?{...t,amount:real.paidAmount,customerId:real.customerId as number}:t)
              : [...creditTransactions,{id:nextId(creditTransactions),customerId:real.customerId as number,saleId,type:"payment",amount:real.paidAmount,date:real.date,note:"Advance received at time of sale"}];
          } else if (existingAdvanceTx) {
            creditTransactions = creditTransactions.filter(t=>t.id!==existingAdvanceTx.id);
          }
        } else {
          if (existingDebtTx) creditTransactions = creditTransactions.filter(t=>t.id!==existingDebtTx.id);
          if (existingAdvanceTx) creditTransactions = creditTransactions.filter(t=>t.id!==existingAdvanceTx.id);
        }
        return {...s,sales,creditTransactions};
      });
      return {ok:true, message:"Sale updated successfully"};
    } catch (err:any) {
      console.error("Failed to save sale edit", err);
      return {ok:false, message: err?.message || "Could not reach the server — the changes were NOT saved. Please try again."};
    }
  };

  const recordSalePayment = async (saleId:number,amount:number,note:string,date?:string):Promise<ActionResult> => {
    const sale = state.sales.find(x=>x.id===saleId);
    if (!sale || !sale.customerId) return {ok:false, message:"This sale has no linked customer account"};
    if (amount<=0) return {ok:false, message:"Enter a valid payment amount"};
    try {
      const res:any = await api.sales.recordPayment(saleId,amount,note,date);
      const t = res?.payment || res?.transaction || res?.creditTransaction;
      setState(s=>({...s,creditTransactions:[...s.creditTransactions, t
        ? {id:t.id,customerId:t.customerId??t.customer_id,saleId:t.saleId??t.sale_id,type:t.type,amount:Number(t.amount),date:t.date,note:t.note}
        : {id:nextId(s.creditTransactions),customerId:sale.customerId as number,saleId,type:"payment",amount,date:date||today,note:note||"Payment against this sale"}
      ]}));
      return {ok:true, message:"Payment recorded successfully"};
    } catch (err:any) {
      console.error("Failed to save sale payment", err);
      return {ok:false, message: err?.message || "Could not reach the server — the payment was NOT saved. Please try again."};
    }
  };

  const removeSale = async (saleId:number):Promise<ActionResult> => {
    try {
      await api.sales.remove(saleId);
      setState(s=>({...s,sales:s.sales.filter(x=>x.id!==saleId),creditTransactions:s.creditTransactions.filter(t=>t.saleId!==saleId)}));
      return {ok:true, message:"Sale deleted"};
    } catch (err:any) {
      console.error("Failed to remove sale", err);
      return {ok:false, message: err?.message || "Could not delete the sale. Please try again."};
    }
  };

  const payPurchaseInvoice = async (purchaseId:number,amount:number,date?:string,note?:string):Promise<ActionResult> => {
    const purchase = state.purchases.find(x=>x.id===purchaseId);
    if (!purchase) return {ok:false, message:"Purchase invoice not found"};
    if (amount<=0) return {ok:false, message:"Enter a valid payment amount"};
    const total = purchaseTotal(purchase);
    const remaining = total-purchase.paidAmount;
    if (amount>remaining+1e-9) return {ok:false, message:"Payment cannot exceed this invoice's outstanding balance"};
    try {
      const res:any = await api.purchases.pay(purchaseId,amount,date,note);
      if (!res?.purchase) return {ok:false, message: res?.message || "Could not save the payment. Please try again."};
      const savedPurchase = normalizePurchase(res.purchase);
      setState(s=>({
        ...s,
        purchases: s.purchases.map(x=>x.id===purchaseId?savedPurchase:x),
        supplierPayments: [...s.supplierPayments,{id:nextId(s.supplierPayments),supplierId:purchase.supplierId,amount,date:date||today,note:note||`Payment against ${purchase.invoiceNumber||`PUR-${purchase.id}`}`,purchaseId}],
      }));
      return {ok:true, message:"Payment recorded successfully"};
    } catch (err:any) {
      console.error("Failed to save purchase payment", err);
      return {ok:false, message: err?.message || "Could not reach the server — the payment was NOT saved. Please try again."};
    }
  };

  const reset=()=>{ loadAll(); };
  const updateSettings = async (settings:BusinessState["settings"]):Promise<ActionResult> => {
    const previous = state.settings;
    setState(s=>({...s,settings}));
    try {
      await api.settings.update(settings);
      return {ok:true, message:"Settings saved"};
    } catch (err:any) {
      console.error("Failed to save settings", err);
      setState(s=>({...s,settings:previous}));
      return {ok:false, message: err?.message || "Could not save settings. Please try again."};
    }
  };

  if(loading && !loadedOnce.current){
    return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-semibold text-slate-500">Loading your business data…</div>;
  }
  if(loadError){
    return <div className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center">
      <div>
        <p className="mb-3 font-display text-lg font-bold text-red-700">Could not load business data</p>
        <p className="mb-4 text-sm text-slate-500">{loadError}</p>
        <button className="btn btn-primary" onClick={()=>{setLoading(true);loadAll();}}>Try again</button>
      </div>
    </div>;
  }

  return <BusinessContext.Provider value={{...state,add,update,remove,removeListItem,completeSale,addPurchase,recordPayment,recordSupplierPayment,editSale,recordSalePayment,removeSale,payPurchaseInvoice,updateCreditTransaction,removeCreditTransaction,reset,updateSettings}}>{children}</BusinessContext.Provider>;
}
export function useBusiness(){const ctx=useContext(BusinessContext);if(!ctx)throw new Error("BusinessProvider missing");return ctx;}
export function inventoryStats(state:BusinessState,p:Product){const purchased=state.purchases.filter(x=>x.productId===p.id).reduce((a,x)=>a+x.quantityKg,0);const sold=state.sales.flatMap(x=>x.lines).filter(x=>x.productId===p.id).reduce((a,x)=>a+x.quantityKg,0);const remaining=Math.max(0,purchased-sold);const costRate=p.avgCost??p.purchasePrice;return {purchased,sold,remaining,cost:remaining*costRate,sale:remaining*p.salePrice,profit:remaining*(p.salePrice-costRate)};}
// Formats to dollars AND cents (e.g. $1,234.56) with cent-accurate rounding,
// so amounts never silently drift or get truncated to whole dollars.
export const money=(n:number)=>{const v=Math.round((Number(n)||0)*100)/100;return `$${v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;};
export const qty=(n:number)=>`${Number((n/1000).toFixed(3)).toLocaleString("en-US")} Ton`;
export const dateLabel=(d:string)=>new Date(`${d}T00:00:00`).toLocaleDateString("en-PK",{day:"2-digit",month:"short",year:"numeric"});
export const saleCustomerLabel=(state:BusinessState,sale:Sale)=>{if(sale.customerId){return state.customers.find(c=>c.id===sale.customerId)?.name||"Walk-in customer"} return sale.walkInName?.trim()||"Walk-in customer"};

// A "general" credit payment (recorded from Customer Accounts / a customer's
// profile without picking a specific invoice) used to only reduce the
// customer's overall balance — every individual sale invoice still showed
// its full amount as due, even after the customer's account was settled.
// This allocates general payments across that customer's credit sales,
// oldest invoice first (after invoice-linked payments are applied), so each
// invoice's own "balance due" reflects money that's actually been paid
// toward it. Only used for display (remaining/totalPaid); the actual
// payment rows are left exactly as recorded.
function customerCreditAllocation(state:BusinessState,customerId:number){
  const sales=state.sales.filter(s=>s.customerId===customerId&&s.paymentMethod==="credit").slice().sort((a,z)=>a.date.localeCompare(z.date)||a.id-z.id);
  const map=new Map<number,{totalPaid:number;remaining:number}>();
  for(const sale of sales) map.set(sale.id,{totalPaid:sale.paidAmount,remaining:Math.max(0,sale.subtotal-sale.paidAmount)});
  const directPayments=state.creditTransactions.filter(t=>t.type==="payment"&&t.saleId!=null&&map.has(t.saleId)&&t.note!=="Advance received at time of sale").slice().sort((a,z)=>a.date.localeCompare(z.date)||a.id-z.id);
  for(const t of directPayments){
    const entry=map.get(t.saleId as number)!;
    entry.totalPaid+=t.amount;
    entry.remaining=Math.max(0,entry.remaining-t.amount);
  }
  const generalPayments=state.creditTransactions.filter(t=>t.customerId===customerId&&t.type==="payment"&&t.saleId==null).slice().sort((a,z)=>a.date.localeCompare(z.date)||a.id-z.id);
  let pool=generalPayments.reduce((a,x)=>a+x.amount,0);
  for(const sale of sales){
    if(pool<=0.0001) break;
    const entry=map.get(sale.id)!;
    if(entry.remaining<=0.0001) continue;
    const applied=Math.min(pool,entry.remaining);
    entry.remaining-=applied;
    entry.totalPaid+=applied;
    pool-=applied;
  }
  return map;
}

export function salePaymentInfo(state:BusinessState,sale:Sale){
  const allPayments=state.creditTransactions.filter(t=>t.saleId===sale.id&&t.type==="payment").slice().sort((a,z)=>a.date.localeCompare(z.date)||a.id-z.id);
  // sale.paidAmount is the one true record of what was paid at checkout —
  // for CASH sales it's the only record of payment there is (cash sales
  // never get credit_transactions rows at all), so it must always be
  // counted. The advance-at-checkout ledger entry (see completeSale) exists
  // purely so the customer's ledger shows it as a "Received" line; since it
  // duplicates sale.paidAmount, exclude it here to avoid counting it twice.
  const payments=allPayments.filter(x=>x.note!=="Advance received at time of sale");
  if(sale.paymentMethod==="credit"&&sale.customerId){
    const alloc=customerCreditAllocation(state,sale.customerId).get(sale.id);
    if(alloc) return {payments,totalPaid:alloc.totalPaid,remaining:alloc.remaining};
  }
  const paidAfterSale=payments.reduce((a,x)=>a+x.amount,0);
  const totalPaid=sale.paidAmount+paidAfterSale;
  const remaining=Math.max(0,sale.subtotal-totalPaid);
  return {payments,totalPaid,remaining};
}
// The "Credit"/"Cash" badge shown on sale rows used to just echo the static
// paymentMethod field forever — so a credit sale that the customer fully
// paid off later (advance + follow-up payments) still showed as "credit"
// with no sign it had actually been settled. This looks at what's really
// been received (via salePaymentInfo) so the badge — and the amount shown
// alongside it — reflect the current, real state of the invoice.
export function salePaymentStatus(state:BusinessState,sale:Sale){
  const {totalPaid,remaining}=salePaymentInfo(state,sale);
  if(sale.paymentMethod==="cash"||remaining<=0.009) return {label:"Paid",cls:"status-good",totalPaid,remaining};
  if(totalPaid>0.009) return {label:"Partially paid",cls:"status-info",totalPaid,remaining};
  return {label:"Credit",cls:"status-low",totalPaid,remaining};
}
export const initialState=emptyState;
