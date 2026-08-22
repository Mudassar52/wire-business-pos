import { z } from "zod";
import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function toSettings(row) {
  if (!row) {
    return {
      businessName: "Wire Business", currency: "$", phone: "", address: "", logoDataUrl: "",
      ownerName: "", secondOwnerName: "", secondOwnerPhone: "", invoiceHeading: "",
    };
  }
  return {
    businessName: row.business_name,
    currency: row.currency,
    phone: row.phone,
    address: row.address,
    logoDataUrl: row.logo_data_url,
    ownerName: row.owner_name,
    secondOwnerName: row.second_owner_name,
    secondOwnerPhone: row.second_owner_phone,
    invoiceHeading: row.invoice_heading,
  };
}

export const getSettings = asyncHandler(async (req, res) => {
  const { rows } = await query("select * from settings where owner_id = $1", [req.user.id]);
  res.json({ ok: true, settings: toSettings(rows[0]) });
});

const schema = z.object({
  businessName: z.string().optional().default("Wire Business"),
  currency: z.string().optional().default("$"),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
  logoDataUrl: z.string().optional().default(""),
  ownerName: z.string().optional().default(""),
  secondOwnerName: z.string().optional().default(""),
  secondOwnerPhone: z.string().optional().default(""),
  invoiceHeading: z.string().optional().default(""),
});

export const updateSettings = asyncHandler(async (req, res) => {
  const s = schema.parse(req.body);
  const { rows } = await query(
    `insert into settings (owner_id, business_name, currency, phone, address, logo_data_url, owner_name, second_owner_name, second_owner_phone, invoice_heading)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (owner_id) do update set
       business_name = excluded.business_name, currency = excluded.currency, phone = excluded.phone,
       address = excluded.address, logo_data_url = excluded.logo_data_url, owner_name = excluded.owner_name,
       second_owner_name = excluded.second_owner_name, second_owner_phone = excluded.second_owner_phone,
       invoice_heading = excluded.invoice_heading
     returning *`,
    [req.user.id, s.businessName, s.currency, s.phone, s.address, s.logoDataUrl, s.ownerName, s.secondOwnerName, s.secondOwnerPhone, s.invoiceHeading]
  );
  res.json({ ok: true, message: "Settings saved", settings: toSettings(rows[0]) });
});
