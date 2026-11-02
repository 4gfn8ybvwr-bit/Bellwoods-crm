import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/domain/errors";
import { formatUkDateTime } from "@/domain/dates";
import { EnquiryFields, OpenContractForm } from "@/components/forms";
import { ActionForm, PageHeader, Submit } from "@/components/ui";
import { saveAppointment } from "@/app/actions";

export default async function EnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const enquiry = await prisma.enquiry.findUnique({
    where: { id },
    include: { customer: true, assignedTo: true, quotes: true, appointments: { include: { user: true } }, contract: true },
  });
  if (!enquiry) throw new ServiceError(404, "Enquiry not found");
  const [customers, users] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title={enquiry.customer.name} lede={`${enquiry.status} · ${enquiry.source}`}>
        <Link className="btn" href={`/quotes/new?customer=${enquiry.customerId}&enquiry=${enquiry.id}`}>Build a quote</Link>
        {enquiry.contract && <Link className="btn btn-primary" href={`/contracts/${enquiry.contract.id}`}>{enquiry.contract.number}</Link>}
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        <EnquiryFields customers={customers} users={users} enquiry={enquiry} />
        <div className="space-y-4">
          <ActionForm action={saveAppointment} className="card grid gap-3 p-4">
            <h2 className="text-xl">Book a survey</h2>
            <input type="hidden" name="customerId" value={enquiry.customerId} />
            <input type="hidden" name="enquiryId" value={enquiry.id} />
            <input type="hidden" name="contractId" value={enquiry.contractId ?? ""} />
            <input type="hidden" name="type" value="SURVEY" />
            <input type="hidden" name="back" value={`/enquiries/${enquiry.id}`} />
            <label className="field"><span>Title</span><input className="input" name="title" defaultValue={`Survey · ${enquiry.customer.name}`} required /></label>
            <label className="field"><span>When</span><input className="input" name="startsAt" placeholder="dd/mm/yyyy HH:mm" required /></label>
            <label className="field"><span>Salesperson</span>
              <select className="select" name="userId" defaultValue={enquiry.assignedToId ?? ""}>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Location</span><input className="input" name="location" placeholder="Site address" /></label>
            <Submit>Book survey</Submit>
          </ActionForm>
          <ul className="text-sm">
            {enquiry.appointments.map((appointment) => (
              <li key={appointment.id} className="py-1">{formatUkDateTime(appointment.startsAt)} · {appointment.title} · {appointment.user.name}</li>
            ))}
          </ul>
          {!enquiry.contract && <OpenContractForm customers={customers} customerId={enquiry.customerId} enquiryId={enquiry.id} />}
          <ul className="text-sm">
            {enquiry.quotes.map((quote) => <li key={quote.id}><Link href={`/quotes/${quote.id}`}>{quote.number}</Link> · {quote.status}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
