import { portalSignIn } from "@/app/actions";
import { ActionForm, Submit } from "@/components/ui";

export const metadata = { title: "Trade portal" };

export default function PortalLoginPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl text-sky-950">Trade account</h1>
      <p className="mt-2 text-sm text-stone-600">For NETC trade customers. Bellwoods retail customers do not have access. Nothing is emailed from here.</p>
      <div className="card mt-6 p-5">
        <ActionForm action={portalSignIn} className="space-y-3">
          <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="username" defaultValue="chris@harbour-joinery.example" required /></label>
          <label className="field"><span>Password</span><input className="input" name="password" type="password" autoComplete="current-password" defaultValue="Trade-portal-2026" required /></label>
          <Submit>Sign in</Submit>
        </ActionForm>
      </div>
    </div>
  );
}
