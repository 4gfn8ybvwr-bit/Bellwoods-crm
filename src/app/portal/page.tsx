import { redirect } from "next/navigation";
import { formatGbp } from "@/domain/money";
import { formatUkDate } from "@/domain/dates";
import { getPortalSession } from "@/lib/auth";
import { portalAccountForCustomer } from "@/server/portal";

export const metadata = { title: "Your jobs" };

export default async function PortalHomePage() {
  const session = await getPortalSession();
  if (!session) redirect("/portal/login");
  const account = await portalAccountForCustomer(session.customerId);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl text-sky-950">{account.customer.companyName || account.customer.name}</h1>
        <p className="text-sm text-stone-600">Signed in as {session.name}. Outstanding {formatGbp(account.outstandingGrossPence)} gross. {account.overdueCount} overdue.</p>
        <p className="mt-2 text-sm text-sky-950">{account.dueDateNote}</p>
      </div>
      {account.jobs.map((job) => (
        <article key={job.id} className="card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl">{job.number}</h2>
            <p className="text-sm">{job.stage}</p>
          </div>
          <p className="text-sm text-stone-600">{job.jobType} {job.customerReference && `· Your ref ${job.customerReference}`}</p>
          <p className="text-sm">{job.siteAddress}</p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-stone-500">Invoiced net</dt><dd className="num font-semibold">{formatGbp(job.invoicedNetPence)}</dd></div>
            <div><dt className="text-stone-500">Outstanding gross</dt><dd className="num font-semibold">{formatGbp(job.outstandingGrossPence)}</dd></div>
            <div>
              <dt className="text-stone-500">Due</dt>
              <dd className={job.overdue ? "font-semibold text-red-800" : ""}>
                {job.paymentDueDate ? formatUkDate(job.paymentDueDate) : "Not set"}
                {job.overdue ? " · Overdue" : ""}
                <span className="block text-xs text-stone-500">{job.paymentDueSource === "MANUAL" ? "Office date. Camden Direct later." : "No date yet."}</span>
              </dd>
            </div>
          </dl>
          {job.remakes.length > 0 && (
            <div className="mt-3">
              <h3 className="text-sm font-semibold">Remakes</h3>
              <ul className="mt-1 text-sm">
                {job.remakes.map((remake) => (
                  <li key={remake.id}>{remake.number} · {remake.supplier} · {remake.reason || "Remake"} · {formatGbp(remake.netPence)} · {remake.status}</li>
                ))}
              </ul>
            </div>
          )}
        </article>
      ))}
      {account.jobs.length === 0 && <p className="text-sm text-stone-600">No trade jobs on this account yet.</p>}
    </div>
  );
}
