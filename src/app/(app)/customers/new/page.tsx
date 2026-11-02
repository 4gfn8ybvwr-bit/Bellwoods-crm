import { CustomerFields } from "@/components/forms";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "New customer" };

export default function NewCustomerPage() {
  return (
    <div>
      <PageHeader title="New customer" lede="Use the household name for domestic work, and the buyer’s name plus company for trade." />
      <CustomerFields />
    </div>
  );
}
