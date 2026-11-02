import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <Shell name={session.name} role={session.role}>
      <Suspense fallback={null}>
        <Notice />
      </Suspense>
      {children}
    </Shell>
  );
}
