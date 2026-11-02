import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { signIn } from "@/app/actions";
import { ActionForm, Submit } from "@/components/ui";
import { first, type SearchParams } from "@/lib/search";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (session) redirect("/");
  const params = await searchParams;
  const next = first(params.next) || "/";
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-copper">North East England</p>
        <h1 className="mt-2 text-4xl text-forest">Bellwoods</h1>
        <p className="mt-1 text-sm text-stone-600">Windows and doors. Contracts, surveys and job costing.</p>
        <div className="card mt-6 p-5">
          <ActionForm action={signIn} className="space-y-3">
            <input type="hidden" name="next" value={next.startsWith("/") ? next : "/"} />
            <label className="field">
              <span>Email</span>
              <input className="input" name="email" type="email" autoComplete="username" defaultValue="david@bellwoods.example" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input className="input" name="password" type="password" autoComplete="current-password" defaultValue="Bellwoods-demo-2026" required />
            </label>
            <Submit>Sign in</Submit>
          </ActionForm>
        </div>
        <div className="mt-4 text-xs leading-5 text-stone-500">
          <p>Demo office: david@bellwoods.example · password Bellwoods-demo-2026</p>
          <p>Also seeded: sarah.quinn (sales), helen.crowe (office), tom.adeyemi (fitter), same password.</p>
        </div>
      </div>
    </div>
  );
}
