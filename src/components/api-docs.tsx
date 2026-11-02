"use client";

import { useEffect, useMemo, useState } from "react";

type Operation = {
  method: string;
  path: string;
  summary: string;
  tags: string[];
};

export function ApiDocs() {
  const [ops, setOps] = useState<Operation[]>([]);
  const [key, setKey] = useState("");
  const [active, setActive] = useState<Operation | null>(null);
  const [body, setBody] = useState("{\n}\n");
  const [result, setResult] = useState("");
  const [status, setStatus] = useState<number | null>(null);

  useEffect(() => {
    const stored = window.sessionStorage.getItem("bw_api_key");
    if (stored) setKey(stored);
    void fetch("/api/openapi.json")
      .then((response) => response.json())
      .then((spec: { paths: Record<string, Record<string, { summary?: string; tags?: string[] }>> }) => {
        const list: Operation[] = [];
        for (const [path, methods] of Object.entries(spec.paths)) {
          for (const [method, operation] of Object.entries(methods)) {
            list.push({
              method: method.toUpperCase(),
              path,
              summary: operation.summary ?? "",
              tags: operation.tags ?? ["Other"],
            });
          }
        }
        setOps(list);
      });
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, Operation[]>();
    for (const op of ops) {
      const tag = op.tags[0] ?? "Other";
      map.set(tag, [...(map.get(tag) ?? []), op]);
    }
    return Array.from(map.entries());
  }, [ops]);

  async function send() {
    if (!active) return;
    window.sessionStorage.setItem("bw_api_key", key);
    const headers: Record<string, string> = {};
    if (key.trim()) headers.authorization = `Bearer ${key.trim()}`;
    const init: RequestInit = { method: active.method, headers, credentials: "include" };
    if (!["GET", "DELETE"].includes(active.method)) {
      headers["content-type"] = "application/json";
      init.body = body;
    }
    const response = await fetch(`/api/v1${active.path.replace(/\{[^}]+\}/g, "REPLACE")}`, init);
    setStatus(response.status);
    const text = await response.text();
    try {
      setResult(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      setResult(text);
    }
  }

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[280px_1fr]">
      <nav className="card max-h-[70vh] overflow-auto p-3 text-sm">
        {groups.map(([tag, items]) => (
          <div key={tag} className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{tag}</p>
            {items.map((op) => (
              <button
                key={`${op.method}${op.path}`}
                type="button"
                className={`mt-1 block w-full rounded px-2 py-1 text-left hover:bg-stone-100 ${active === op ? "bg-orange-50" : ""}`}
                onClick={() => { setActive(op); setResult(""); setStatus(null); }}
              >
                <span className="font-mono text-[11px] text-copper">{op.method}</span> {op.path}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <section className="card p-4">
        {!active && <p className="text-sm text-stone-500">Choose an operation. Replace path parameters such as {"{id}"} before sending.</p>}
        {active && (
          <div className="space-y-3">
            <h2 className="text-2xl">{active.summary}</h2>
            <p className="font-mono text-sm">{active.method} /api/v1{active.path}</p>
            <label className="field">
              <span>API key (optional while signed in)</span>
              <input className="input font-mono text-xs" value={key} onChange={(event) => setKey(event.target.value)} placeholder="bw_live_…" />
            </label>
            <label className="field">
              <span>Path</span>
              <input className="input font-mono text-xs" value={active.path} onChange={(event) => setActive({ ...active, path: event.target.value })} />
            </label>
            {!["GET", "DELETE"].includes(active.method) && (
              <label className="field">
                <span>JSON body</span>
                <textarea className="textarea font-mono text-xs" value={body} onChange={(event) => setBody(event.target.value)} />
              </label>
            )}
            <button className="btn btn-primary" type="button" onClick={() => void send()}>Try it</button>
            {status != null && <p className="text-sm">HTTP {status}</p>}
            {result && <pre className="max-h-96 overflow-auto rounded-md bg-forest p-3 text-xs text-stone-100">{result}</pre>}
          </div>
        )}
      </section>
    </div>
  );
}
