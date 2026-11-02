import Link from "next/link";
import { signOut } from "@/app/actions";
import { roleLabel } from "@/domain/labels";

const LINKS = [
  ["Dashboard", "/"],
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

export function Shell({
  name,
  role,
  children,
}: {
  name: string;
  role: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-forest text-stone-100">
        <div className="border-b border-white/10 px-4 py-5">
          <p className="font-serif text-2xl leading-none tracking-tight">Bellwoods</p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-300">Windows &amp; Doors</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {LINKS.map(([label, href]) => (
            <Link key={href} href={href} className="block rounded-md px-3 py-2 text-sm text-stone-100 hover:bg-white/10">
              {label}
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
        <main className="mx-auto max-w-[1240px] px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
