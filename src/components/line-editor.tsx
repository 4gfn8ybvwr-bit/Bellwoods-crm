"use client";

import { useMemo, useState } from "react";
import { PRODUCT_TYPES } from "@/domain/labels";

type Line = {
  productType: string;
  description: string;
  widthMm: string;
  heightMm: string;
  specification: string;
  quantity: string;
  unitPrice: string;
};

function blank(mode: "quote" | "po"): Line {
  return {
    productType: "WINDOW",
    description: "",
    widthMm: "",
    heightMm: "",
    specification: "",
    quantity: "1",
    unitPrice: "",
  };
}

export function LineEditor({
  mode,
  initial,
}: {
  mode: "quote" | "po";
  initial?: Line[];
}) {
  const [lines, setLines] = useState<Line[]>(initial?.length ? initial : [blank(mode)]);
  const total = useMemo(() => {
    return lines.reduce((sum, line) => {
      const qty = Number(line.quantity || 0);
      const price = Number(String(line.unitPrice).replace(/[£,]/g, "") || 0);
      if (!Number.isFinite(qty) || !Number.isFinite(price)) return sum;
      return sum + qty * price;
    }, 0);
  }, [lines]);

  function update(index: number, key: keyof Line, value: string) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, [key]: value } : line)));
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />
      {lines.map((line, index) => (
        <div key={index} className="grid gap-2 rounded-lg border border-line bg-white p-3 md:grid-cols-12">
          {mode === "quote" && (
            <label className="field md:col-span-2">
              <span>Type</span>
              <select className="select" value={line.productType} onChange={(event) => update(index, "productType", event.target.value)}>
                {PRODUCT_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          )}
          <label className={`field ${mode === "quote" ? "md:col-span-4" : "md:col-span-6"}`}>
            <span>Description</span>
            <input className="input" value={line.description} onChange={(event) => update(index, "description", event.target.value)} placeholder={mode === "po" ? "White casement frame pack" : "Rear bedroom window"} />
          </label>
          {mode === "quote" && (
            <>
              <label className="field md:col-span-1">
                <span>W mm</span>
                <input className="input" value={line.widthMm} onChange={(event) => update(index, "widthMm", event.target.value)} inputMode="numeric" />
              </label>
              <label className="field md:col-span-1">
                <span>H mm</span>
                <input className="input" value={line.heightMm} onChange={(event) => update(index, "heightMm", event.target.value)} inputMode="numeric" />
              </label>
              <label className="field md:col-span-4">
                <span>Specification</span>
                <input className="input" value={line.specification} onChange={(event) => update(index, "specification", event.target.value)} placeholder="A-rated, argon, white uPVC" />
              </label>
            </>
          )}
          <label className="field md:col-span-2">
            <span>Qty</span>
            <input className="input" value={line.quantity} onChange={(event) => update(index, "quantity", event.target.value)} inputMode="numeric" />
          </label>
          <label className="field md:col-span-2">
            <span>Unit £</span>
            <input className="input" value={line.unitPrice} onChange={(event) => update(index, "unitPrice", event.target.value)} inputMode="decimal" placeholder="0.00" />
          </label>
          <div className="flex items-end md:col-span-2">
            <button type="button" className="btn btn-small" onClick={() => setLines((current) => current.filter((_, i) => i !== index))} disabled={lines.length === 1}>
              Remove
            </button>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button type="button" className="btn" onClick={() => setLines((current) => [...current, blank(mode)])}>Add line</button>
        <p className="num text-sm font-semibold">Net {total.toLocaleString("en-GB", { style: "currency", currency: "GBP" })}</p>
      </div>
    </div>
  );
}
