"use client";

import { useMemo, useState } from "react";
import { TRADE_JOB_TYPES } from "@/domain/channel";
import { saveQuickTrade } from "@/app/actions";
import { ActionForm, Submit } from "./ui";

type CustomerOption = {
  id: string;
  name: string;
  companyName: string;
  email: string;
  site: string;
  lastJob: { number: string; jobType: string; description: string; customerReference: string; siteAddress: string } | null;
};

export function QuickTradeForm({
  customers,
  initialCustomerId,
  initialDescription,
  emailId,
}: {
  customers: CustomerOption[];
  initialCustomerId?: string;
  initialDescription?: string;
  emailId?: string;
}) {
  const [query, setQuery] = useState("");
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [mode, setMode] = useState(initialCustomerId ? "existing" : "existing");
  const [jobType, setJobType] = useState<string>(TRADE_JOB_TYPES[1]);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [reference, setReference] = useState("");
  const [site, setSite] = useState("");
  const [repeat, setRepeat] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? customers.filter((customer) => `${customer.companyName} ${customer.name} ${customer.email}`.toLowerCase().includes(q))
      : customers;
    return list.slice(0, 8);
  }, [customers, query]);
  const selected = customers.find((customer) => customer.id === customerId);

  function repeatLast() {
    if (!selected?.lastJob) return;
    setJobType(selected.lastJob.jobType || TRADE_JOB_TYPES[1]);
    setDescription(selected.lastJob.description);
    setSite(selected.lastJob.siteAddress);
    setRepeat(true);
  }

  return (
    <ActionForm action={saveQuickTrade} className="trade-surface space-y-4 p-4">
      <input type="hidden" name="customerMode" value={mode} />
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="emailId" value={emailId ?? ""} />
      {repeat && <input type="hidden" name="repeatLast" value="on" />}
      <div className="flex gap-2 text-sm">
        <button type="button" className={`btn ${mode === "existing" ? "btn-primary" : ""}`} onClick={() => setMode("existing")}>Existing customer</button>
        <button type="button" className={`btn ${mode === "new" ? "btn-primary" : ""}`} onClick={() => { setMode("new"); setCustomerId(""); }}>New trade customer</button>
      </div>
      {mode === "existing" ? (
        <div>
          <label className="field">
            <span>Find a trade account</span>
            <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Start typing a company" autoFocus />
          </label>
          <ul className="mt-2 max-h-48 overflow-auto rounded-md border border-sky-200 bg-white">
            {matches.map((customer) => (
              <li key={customer.id}>
                <button type="button" className={`block w-full px-3 py-2 text-left text-sm hover:bg-sky-50 ${customer.id === customerId ? "bg-sky-100" : ""}`} onClick={() => { setCustomerId(customer.id); setSite(customer.site); setRepeat(false); }}>
                  <span className="font-semibold">{customer.companyName || customer.name}</span>
                  <span className="block text-xs text-stone-500">{customer.name}{customer.lastJob ? ` · last ${customer.lastJob.number}` : ""}</span>
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className="px-3 py-3 text-sm text-stone-500">No trade account matches.</li>}
          </ul>
          {selected?.lastJob && (
            <button type="button" className="btn mt-2" onClick={repeatLast}>Repeat last job ({selected.lastJob.number})</button>
          )}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="field sm:col-span-2"><span>Company</span><input className="input" name="companyName" required={mode === "new"} /></label>
          <label className="field"><span>Contact</span><input className="input" name="contactName" /></label>
          <label className="field"><span>Email</span><input className="input" name="email" /></label>
          <label className="field"><span>Phone</span><input className="input" name="phone" /></label>
          <label className="field"><span>Town</span><input className="input" name="city" /></label>
          <label className="field"><span>Postcode</span><input className="input" name="postcode" /></label>
        </div>
      )}
      <label className="field">
        <span>Job type</span>
        <select className="select" name="jobType" value={jobType} onChange={(event) => setJobType(event.target.value)}>
          {TRADE_JOB_TYPES.map((type) => <option key={type}>{type}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Short description</span>
        <textarea className="textarea" name="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Plot 9, anthracite windows" />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="field"><span>Their reference / PO</span><input className="input" name="customerReference" value={reference} onChange={(event) => setReference(event.target.value)} /></label>
        <label className="field"><span>Site</span><input className="input" name="siteAddress" value={site} onChange={(event) => setSite(event.target.value)} /></label>
      </div>
      <label className="text-sm"><input className="mr-2" type="checkbox" name="surveyWaived" />No survey needed</label>
      <Submit>Save trade job</Submit>
    </ActionForm>
  );
}
