"use client";

import { useFormStatus } from "react-dom";
import { useActionState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ActionState } from "@/lib/action-state";

export function Submit({ children, tone = "primary" }: { children: React.ReactNode; tone?: "primary" | "dark" | "danger" | "plain" }) {
  const { pending } = useFormStatus();
  const toneClass = tone === "primary" ? "btn-primary" : tone === "dark" ? "btn-dark" : tone === "danger" ? "btn-danger" : "";
  return (
    <button className={`btn ${toneClass}`} disabled={pending}>
      {pending ? "Saving…" : children}
    </button>
  );
}

export function ActionForm({
  action,
  children,
  className,
  encType,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  encType?: "multipart/form-data";
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className={className} encType={encType}>
      {state.error && <p className="form-error mb-3">{state.error}</p>}
      {state.ok && <p className="form-ok mb-3">{state.ok}</p>}
      {state.createdKey && (
        <p className="notice mb-3">
          Copy this key now. It will not be shown again.
          <br />
          <code className="mt-1 block break-all font-mono text-xs">{state.createdKey}</code>
        </p>
      )}
      {children}
    </form>
  );
}

export function Notice() {
  const params = useSearchParams();
  const router = useRouter();
  const notice = params.get("notice");
  useEffect(() => {
    if (!notice) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("notice");
    const timer = window.setTimeout(() => router.replace(url.pathname + url.search), 6000);
    return () => window.clearTimeout(timer);
  }, [notice, router]);
  if (!notice) return null;
  return <p className="notice mb-4">{notice}</p>;
}

export function PageHeader({ title, lede, children }: { title: string; lede?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl text-forest">{title}</h1>
        {lede && <p className="mt-1 max-w-3xl text-sm text-stone-600">{lede}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-8 text-center text-sm text-stone-500">{children}</p>;
}
