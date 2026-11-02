/**
 * One legal entity issues every customer invoice, whether the job is
 * Bellwoods retail or NETC trade. Trade is a workflow channel, not a company.
 * The VAT number is fictional demo data.
 */
export const BELLWOODS_COMPANY = {
  legalName: "Bellwoods Windows and Doors Ltd",
  tradingName: "Bellwoods Windows and Doors",
  address: "Unit 12, Blaydon Business Park, Blaydon, Tyne and Wear",
  postcode: "NE21 4BW",
  email: "accounts@bellwoods.example",
  phone: "0191 496 0140",
  vatNumber: "GB000000000",
} as const;

export function invoiceCompanyStamp() {
  return {
    companyLegalName: BELLWOODS_COMPANY.legalName,
    companyVatNumber: BELLWOODS_COMPANY.vatNumber,
  };
}
