import Link from "next/link";
import { ROLES, roleLabel } from "@/domain/labels";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/server/settings";
import { getSession } from "@/lib/auth";
import { moveStageOrder, saveOfficeSettings, saveStage, saveUser } from "@/app/actions";
import { ActionForm, PageHeader, Submit } from "@/components/ui";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await getSession();
  const [settings, stages, users] = await Promise.all([
    getSettings(),
    prisma.stage.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);
  const admin = session?.role === "ADMIN";
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" lede="Pipeline, VAT, the invoice tolerance and who can sign in.">
        <Link className="btn" href="/settings/api-keys">API keys</Link>
        <Link className="btn" href="/settings/webhooks">Webhooks</Link>
      </PageHeader>
      <section className="card p-4">
        <h2 className="text-xl">Money</h2>
        <p className="mt-1 text-sm text-stone-600">Financial year starts {settings.financialYearStartDay}/{settings.financialYearStartMonth}. VAT is stored in basis points. Tolerance is the absolute difference allowed before a supplier invoice needs review.</p>
        {admin && (
          <ActionForm action={saveOfficeSettings} className="mt-3 grid max-w-lg gap-2">
            <label className="field"><span>VAT %</span><input className="input" name="vatPercent" defaultValue={(settings.vatRateBps / 100).toString()} /></label>
            <label className="field"><span>Default deposit %</span><input className="input" name="defaultDepositPercent" defaultValue={settings.defaultDepositPercent} /></label>
            <label className="field"><span>Invoice tolerance £</span><input className="input" name="tolerancePounds" defaultValue={(settings.invoiceTolerancePence / 100).toFixed(2)} /></label>
            <Submit>Save settings</Submit>
          </ActionForm>
        )}
      </section>
      <section className="card p-4">
        <h2 className="text-xl">Pipeline</h2>
        <p className="mt-1 text-sm text-stone-600">The slug <code>ready-to-order</code> is the gate. Stages at or after it require a paid or skipped deposit and an uploaded survey. <code>complete</code> also needs a final invoice.</p>
        <ol className="mt-3 space-y-2">
          {stages.map((stage, index) => (
            <li key={stage.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: stage.colour }} />
              <span className="w-40 font-semibold">{stage.name}</span>
              <span className="text-stone-500">{stage.slug}</span>
              {admin && (
                <>
                  {index > 0 && (
                    <ActionForm action={moveStageOrder}>
                      <input type="hidden" name="ids" value={swap(stages.map((item) => item.id), index, index - 1).join(",")} />
                      <Submit tone="plain">Up</Submit>
                    </ActionForm>
                  )}
                  {index < stages.length - 1 && (
                    <ActionForm action={moveStageOrder}>
                      <input type="hidden" name="ids" value={swap(stages.map((item) => item.id), index, index + 1).join(",")} />
                      <Submit tone="plain">Down</Submit>
                    </ActionForm>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
        {admin && (
          <ActionForm action={saveStage} className="mt-4 flex flex-wrap gap-2">
            <input className="input max-w-[180px]" name="name" placeholder="Stage name" required />
            <input className="input max-w-[180px]" name="slug" placeholder="slug" required />
            <input className="input max-w-[120px]" name="colour" placeholder="#234237" defaultValue="#234237" />
            <Submit>Add stage</Submit>
          </ActionForm>
        )}
      </section>
      <section className="card p-4">
        <h2 className="text-xl">Users</h2>
        <table className="data mt-2">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{roleLabel(user.role)}</td>
                <td>{user.active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {admin && (
          <ActionForm action={saveUser} className="mt-4 grid max-w-lg gap-2">
            <input className="input" name="name" placeholder="Name" required />
            <input className="input" name="email" placeholder="Email" required />
            <input className="input" name="password" placeholder="Password" required />
            <select className="select" name="role">{ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <Submit>Add user</Submit>
          </ActionForm>
        )}
      </section>
    </div>
  );
}

function swap(ids: string[], a: number, b: number) {
  const next = [...ids];
  const [item] = next.splice(a, 1);
  next.splice(b, 0, item);
  return next;
}
