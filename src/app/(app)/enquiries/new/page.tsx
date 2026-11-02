import { prisma } from "@/lib/prisma";
import { EnquiryFields } from "@/components/forms";
import { PageHeader } from "@/components/ui";
import { first, type SearchParams } from "@/lib/search";

export const metadata = { title: "New enquiry" };

export default async function NewEnquiryPage({ searchParams }: { searchParams: SearchParams }) {
  const customerId = first((await searchParams).customer);
  const [customers, users] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="New enquiry" lede="Record where the lead came from and what they want surveyed." />
      <EnquiryFields customers={customers} users={users} customerId={customerId} />
    </div>
  );
}
