import { getPortalSession } from "@/lib/auth";
import { portalSignOut } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession();
  return (
    <div className="min-h-screen bg-[#e7f4fc] text-ink">
      <header className="flex items-center justify-between border-b border-sky-200 bg-white px-6 py-4">
        <div>
          <p className="font-serif text-2xl text-sky-950">Bellwoods trade</p>
          <p className="text-xs text-stone-500">Customer portal. Read only.</p>
        </div>
        {session && (
          <form action={portalSignOut}>
            <button className="btn">Sign out</button>
          </form>
        )}
      </header>
      <main className="mx-auto max-w-4xl px-6 py-6">{children}</main>
    </div>
  );
}
