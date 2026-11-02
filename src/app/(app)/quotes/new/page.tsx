import { prisma } from "@/lib/prisma";
import { QuoteFields } from "@/components/forms";
import { PageHeader } from "@/components/ui";
import { first, type SearchParams } from "@/lib/search";

export const metadata = { title: "New quote" };

export default async function NewQuotePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const customerId = first(params.customer);
  const enquiryId = first(params.enquiry);
  const [customers, enquiries] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.enquiry.findMany({ where: { status: { in: ["OPEN", "QUOTED"] } }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <div>
      <PageHeader title="New quote" lede="Price each window and door. VAT is added at the rate in settings, normally 20%." />
      <QuoteFields customers={customers} enquiries={enquiries} customerId={customerId} enquiryId={enquiryId} />
    </div>
  );
}
