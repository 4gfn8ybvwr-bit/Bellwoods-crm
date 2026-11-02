"use client";

import Link from "next/link";
import { useState } from "react";

export function NotificationBell({
  count,
  items,
}: {
  count: number;
  items: { id: string; subject: string; fromEmail: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" className="btn" aria-label="Notifications" onClick={() => setOpen((value) => !value)}>
        Inbox
        {count > 0 && <span className="rounded-full bg-copper px-1.5 text-xs text-white">{count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-line bg-card p-2 shadow-card">
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Unread mail</p>
          {items.length === 0 && <p className="px-2 py-2 text-sm text-stone-500">Nothing new.</p>}
          {items.map((item) => (
            <Link key={item.id} href={`/inbox/${item.id}`} className="block rounded px-2 py-2 text-sm hover:bg-sky-50" onClick={() => setOpen(false)}>
              <span className="font-semibold">{item.subject || "(no subject)"}</span>
              <span className="block text-xs text-stone-500">{item.fromEmail}</span>
            </Link>
          ))}
          <Link href="/inbox" className="mt-1 block px-2 py-2 text-sm font-semibold text-forest" onClick={() => setOpen(false)}>Open inbox</Link>
        </div>
      )}
    </div>
  );
}
