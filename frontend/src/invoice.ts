import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type InvoiceLine = { label: string; qty: string; rate: string; total: string };
export type InvoiceTotal = { label: string; value: string; emphasis?: boolean };
export type InvoiceStatementTable = { head: string[]; rows: string[][]; rightAlignFrom?: number };
export type InvoiceData = {
  kind: string; 
  number: string;
  date: string;
  business: { name: string; address: string; phone: string; logoDataUrl?: string; ownerName?: string; secondOwnerName?: string; secondOwnerPhone?: string; heading?: string };
  partyLabel: string; 
  partyName: string;
  partyPhone?: string;
  partyAddress?: string;
  lines: InvoiceLine[];
  /** When set, this custom table (proper own columns, e.g. a running-balance statement)
   * is rendered instead of the default Description/Quantity/Rate/Amount line-items table,
   * so every value sits in its own cell instead of being crammed into one column. */
  statementTable?: InvoiceStatementTable;
  totals: InvoiceTotal[];
  note?: string;
};

const NAVY: [number, number, number] = [8, 46, 32];
const BLUE: [number, number, number] = [15, 111, 74];
const SLATE: [number, number, number] = [100, 116, 139];
const LIGHT: [number, number, number] = [237, 246, 241];
const CYAN: [number, number, number] = [20, 166, 129];

export function buildInvoicePDF(data: InvoiceData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageHFull = doc.internal.pageSize.getHeight();
  const margin = 40;

  
  doc.setDrawColor(...LIGHT);
  doc.setLineWidth(1);
  doc.rect(14, 14, pageW - 28, pageHFull - 28);

  
  const headerH = data.business.heading ? 108 : 96;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, headerH, "F");
  doc.setFillColor(...CYAN);
  doc.rect(0, headerH, pageW, 3, "F");
  doc.setTextColor(255, 255, 255);

  let logoW = 0;
  if (data.business.logoDataUrl) {
    try {
      const fmt = data.business.logoDataUrl.includes("image/png") ? "PNG" : "JPEG";
      doc.addImage(data.business.logoDataUrl, fmt, margin, 14, 40, 40);
      logoW = 52;
    } catch {
      
    }
  }
  const textX = margin + logoW;
  let headY = 26;
  if (data.business.heading) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(134, 239, 172);
    doc.text(data.business.heading.toUpperCase(), textX, headY);
    headY += 16;
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(data.business.name || "Wire Business", textX, headY);
  headY += 15;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const ownerLine = [data.business.ownerName, data.business.phone].filter(Boolean).join(" · ");
  if (ownerLine) { doc.text(ownerLine, textX, headY); headY += 13; }
  if (data.business.address) { doc.text(data.business.address, textX, headY); headY += 13; }
  if (data.business.secondOwnerName || data.business.secondOwnerPhone) {
    doc.text([data.business.secondOwnerName, data.business.secondOwnerPhone].filter(Boolean).join(" · "), textX, headY);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(data.kind.toUpperCase(), pageW - margin, 32, { align: "right" });
  doc.setDrawColor(...CYAN);
  doc.setLineWidth(1.4);
  const kindW = doc.getTextWidth(data.kind.toUpperCase());
  doc.line(pageW - margin - kindW, 39, pageW - margin, 39);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(`No. ${data.number}`, pageW - margin, 56, { align: "right" });
  doc.text(`Date: ${data.date}`, pageW - margin, 69, { align: "right" });

  
  let y = headerH + 40;
  doc.setTextColor(...SLATE);
  doc.setFontSize(8);
  doc.text(data.partyLabel.toUpperCase(), margin, y);
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(data.partyName || "Walk-in", margin, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  let py = y + 32;
  if (data.partyPhone) { doc.text(data.partyPhone, margin, py); py += 13; }
  if (data.partyAddress) { doc.text(data.partyAddress, margin, py, { maxWidth: 260 }); }

  
  if (data.statementTable) {
    const { head, rows, rightAlignFrom } = data.statementTable;
    const rightFrom = rightAlignFrom ?? Math.ceil(head.length / 2);
    const columnStyles: Record<number, any> = {};
    head.forEach((_, i) => { if (i >= rightFrom) columnStyles[i] = { halign: "right" }; });
    autoTable(doc, {
      startY: y + 60,
      head: [head],
      body: rows,
      theme: "striped",
      headStyles: { fillColor: BLUE, textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59], lineColor: LIGHT, lineWidth: 0.5, cellWidth: "wrap", overflow: "linebreak" },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles,
      margin: { left: margin, right: margin },
      tableLineColor: LIGHT,
      tableLineWidth: 0.5,
      styles: { overflow: "linebreak", cellWidth: "wrap" },
    });
  } else {
    autoTable(doc, {
      startY: y + 60,
      head: [["Description", "Quantity", "Rate", "Amount"]],
      body: data.lines.map(l => [l.label, l.qty, l.rate, l.total]),
      theme: "striped",
      headStyles: { fillColor: BLUE, textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: [30, 41, 59], lineColor: LIGHT, lineWidth: 0.5 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      margin: { left: margin, right: margin },
      tableLineColor: LIGHT,
      tableLineWidth: 0.5,
    });
  }

  
  
  let ty = (doc as any).lastAutoTable.finalY + 20;
  const boxW = 220, boxX = pageW - margin - boxW;
  const totalsBlockH = 16 + data.totals.length * 22 + (data.note ? 30 : 0);
  if (ty + totalsBlockH > pageHFull - 60) {
    doc.addPage();
    ty = 40;
  }
  doc.setDrawColor(...LIGHT);
  doc.setLineWidth(0.6);
  doc.line(boxX, ty - 16, boxX + boxW, ty - 16);
  data.totals.forEach(t => {
    if (t.emphasis) {
      doc.setFillColor(...NAVY);
      doc.rect(boxX, ty - 12, boxW, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(t.label, boxX + 10, ty + 4);
      doc.text(t.value, boxX + boxW - 10, ty + 4, { align: "right" });
    } else {
      doc.setTextColor(...SLATE);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.text(t.label, boxX + 10, ty + 4);
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "bold");
      doc.text(t.value, boxX + boxW - 10, ty + 4, { align: "right" });
    }
    ty += 22;
  });

  if (data.note) {
    doc.setTextColor(...SLATE);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.text(data.note, margin, ty + 10, { maxWidth: pageW - margin * 2 });
  }

  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...CYAN);
  doc.rect(margin, pageH - 54, 24, 2, "F");
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Thank you for your business.", margin, pageH - 34);
  doc.setTextColor(...SLATE);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`Generated by ${data.business.name || "Wire Business POS"}`, pageW - margin, pageH - 34, { align: "right" });

  return doc;
}

export function pdfBlob(doc: jsPDF): Blob {
  return doc.output("blob");
}

export function downloadInvoicePDF(doc: jsPDF, filename: string) {
  doc.save(filename);
}
