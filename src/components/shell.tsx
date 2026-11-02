import Link from "next/link";
import { signOut } from "@/app/actions";
import { roleLabel } from "@/domain/labels";
import { prisma } from "@/lib/prisma";
import { NotificationBell } from "./notification-bell";
import { TradeShortcut } from "./trade-shortcut";

const LINKS = [
  ["Dashboard", "/"],
  ["Inbox", "/inbox"],
  ["Enquiries", "/enquiries"],
  ["Diary", "/diary"],
  ["Quotes", "/quotes"],
  ["Contracts", "/contracts"],
  ["Board", "/contracts/board"],
  ["Customers", "/customers"],
  ["Purchasing", "/purchasing"],
  ["Invoice review", "/purchasing/review"],
  ["Customer invoices", "/invoices"],
  ["Suppliers", "/suppliers"],
  ["Labour", "/labour"],
  ["API docs", "/api-docs"],
  ["Settings", "/settings"],
];

export async function Shell({
  name,
  role,
  children,
}: {
  name: string;
  role: string;
  children: React.ReactNode;
}) {
  const [unread, recent] = await Promise.all([
    prisma.inboundEmail.count({ where: { readAt: null } }),
    prisma.inboundEmail.findMany({ where: { readAt: null }, orderBy: { receivedAt: "desc" }, take: 6, select: { id: true, subject: true, fromEmail: true } }),
  ]);
  return (
    <div className="flex min-h-screen">
      <TradeShortcut />
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-forest text-stone-100">
        <div className="border-b border-white/10 px-4 py-5">
          <p className="font-serif text-2xl leading-none tracking-tight">Bellwoods</p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-300">Windows &amp; Doors</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {LINKS.map(([label, href]) => (
            <Link key={href} href={href} className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-stone-100 hover:bg-white/10">
              <span>{label}</span>
              {href === "/inbox" && unread > 0 && <span className="rounded-full bg-copper px-1.5 text-xs text-white">{unread}</span>}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 px-4 py-4 text-sm">
          <p className="font-semibold">{name}</p>
          <p className="text-xs text-stone-300">{roleLabel(role)}</p>
          <form action={signOut} className="mt-3">
            <button className="text-xs underline decoration-white/30 underline-offset-2">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-paper/95 px-6 py-2 backdrop-blur">
          <Link href="/trade/new" className="btn btn-primary">New trade job <span className="font-normal opacity-80">Alt+T</span></Link>
          <NotificationBell count={unread} items={recent} />
        </div>
        <main className="mx-auto max-w-[1240px] px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
