import { formatUkDate } from "@/domain/dates";
import { toCsv } from "@/domain/csv";
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/domain/errors";

function pounds(pence: number) {
  return (pence / 100).toFixed(2);
}

export async function exportCsv(kind: string) {
  if (kind === "customers") {
    const rows = await prisma.customer.findMany({ include: { addresses: true }, orderBy: { name: "asc" } });
    return toCsv(
      ["Name", "Type", "Company", "Email", "Phone", "Postcode", "City"],
      rows.map((row) => {
        const address = row.addresses.find((item) => item.isPrimary) ?? row.addresses[0];
        return [row.name, row.type, row.companyName, row.email, row.phone, address?.postcode ?? "", address?.city ?? ""];
      }),
    );
  }
  if (kind === "enquiries") {
    const rows = await prisma.enquiry.findMany({ include: { customer: true, assignedTo: true }, orderBy: { createdAt: "desc" } });
    return toCsv(
      ["Created", "Customer", "Source", "Product interest", "Status", "Assigned to"],
      rows.map((row) => [formatUkDate(row.createdAt), row.customer.name, row.source, row.productInterest, row.status, row.assignedTo?.name ?? ""]),
    );
  }
  if (kind === "quotes") {
    const rows = await prisma.quote.findMany({ include: { customer: true }, orderBy: { createdAt: "desc" } });
    return toCsv(
      ["Number", "Customer", "Status", "Net", "VAT", "Gross", "Created"],
      rows.map((row) => [row.number, row.customer.name, row.status, pounds(row.netPence), pounds(row.vatPence), pounds(row.grossPence), formatUkDate(row.createdAt)]),
    );
  }
  if (kind === "contracts") {
    const rows = await prisma.contract.findMany({ include: { customer: true, stage: true }, orderBy: { number: "asc" } });
    return toCsv(
      ["Number", "Type", "Customer", "Stage", "Site", "Agreed net", "Survey uploaded", "Deposit skipped"],
      rows.map((row) => [row.number, row.type, row.customer.name, row.stage.name, row.siteAddress, pounds(row.salesValuePence), row.surveyUploaded ? "Yes" : "No", row.depositSkipped ? "Yes" : "No"]),
    );
  }
  if (kind === "purchase-orders") {
    const rows = await prisma.purchaseOrder.findMany({ include: { supplier: true, contract: true }, orderBy: { number: "asc" } });
    return toCsv(
      ["Number", "Contract", "Supplier", "Status", "Supplier reference", "Net", "Remake", "Reason"],
      rows.map((row) => [row.number, row.contract.number, row.supplier.name, row.status, row.supplierReference, pounds(row.netPence), row.remake ? "Yes" : "No", row.remakeReason]),
    );
  }
  if (kind === "supplier-invoices") {
    const rows = await prisma.supplierInvoice.findMany({
      include: { purchaseOrder: { include: { supplier: true, contract: true } } },
      orderBy: { invoiceDate: "desc" },
    });
    return toCsv(
      ["Invoice", "Date", "Supplier", "PO", "Contract", "Net", "VAT", "Gross", "Nominal", "Status", "Variance"],
      rows.map((row) => [
        row.invoiceNumber,
        formatUkDate(row.invoiceDate),
        row.purchaseOrder.supplier.name,
        row.purchaseOrder.number,
        row.purchaseOrder.contract.number,
        pounds(row.netPence),
        pounds(row.vatPence),
        pounds(row.grossPence),
        row.nominalCode,
        row.status,
        pounds(row.variancePence),
      ]),
    );
  }
  if (kind === "customer-invoices") {
    const rows = await prisma.customerInvoice.findMany({ include: { contract: { include: { customer: true } } }, orderBy: { invoiceDate: "desc" } });
    return toCsv(
      ["Number", "Date", "Type", "Contract", "Customer", "Net", "VAT", "Gross", "Status", "Xero id"],
      rows.map((row) => [
        row.number,
        formatUkDate(row.invoiceDate),
        row.type,
        row.contract.number,
        row.contract.customer.name,
        pounds(row.netPence),
        pounds(row.vatPence),
        pounds(row.grossPence),
        row.status,
        row.xeroInvoiceId ?? "",
      ]),
    );
  }
  throw new ServiceError(404, "Unknown export");
}
