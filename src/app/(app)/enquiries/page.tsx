import Link from "next/link";
import { formatUkDate } from "@/domain/dates";
import { prisma } from "@/lib/prisma";
import { PageHeader, Empty } from "@/components/ui";
import { first, type SearchParams } from "@/lib/search";

export const metadata = { title: "Enquiries" };

export default async function EnquiriesPage({ searchParams }: { searchParams: SearchParams }) {
  const status = first((await searchParams).status) ?? "";
  const enquiries = await prisma.enquiry.findMany({
    where: status ? { status } : undefined,
    include: { customer: true, assignedTo: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageHeader title="Enquiries" lede="Leads before they become a contract.">
        <a className="btn" href="/api/v1/exports/enquiries" download>Export CSV</a>
        <Link className="btn btn-primary" href="/enquiries/new">New enquiry</Link>
      </PageHeader>
      <form className="mb-4" method="get">
        <select className="select max-w-[200px]" name="status" defaultValue={status}>
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="QUOTED">Quoted</option>
          <option value="WON">Won</option>
          <option value="LOST">Lost</option>
        </select>
        <button className="btn ml-2">Filter</button>
      </form>
      <div className="card">
        <table className="data">
          <thead><tr><th>Date</th><th>Customer</th><th>Interest</th><th>Source</th><th>Status</th><th>Owner</th></tr></thead>
          <tbody>
            {enquiries.map((enquiry) => (
              <tr key={enquiry.id}>
                <td className="num">{formatUkDate(enquiry.createdAt)}</td>
                <td><Link className="font-semibold text-forest" href={`/enquiries/${enquiry.id}`}>{enquiry.customer.name}</Link></td>
                <td>{enquiry.productInterest}</td>
                <td>{enquiry.source}</td>
                <td>{enquiry.status}</td>
                <td>{enquiry.assignedTo?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {enquiries.length === 0 && <Empty>No enquiries.</Empty>}
      </div>
    </div>
  );
}
