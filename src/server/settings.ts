import { prisma } from "@/lib/prisma";

const DEFAULTS: Record<string, string> = {
  vatRateBps: "2000",
  invoiceTolerancePence: "100",
  defaultDepositPercent: "25",
  financialYearStartMonth: "11",
  financialYearStartDay: "1",
};

export async function getSettings() {
  const rows = await prisma.setting.findMany();
  const map = { ...DEFAULTS };
  for (const row of rows) map[row.key] = row.value;
  return {
    vatRateBps: Number(map.vatRateBps),
    invoiceTolerancePence: Number(map.invoiceTolerancePence),
    defaultDepositPercent: Number(map.defaultDepositPercent),
    financialYearStartMonth: Number(map.financialYearStartMonth),
    financialYearStartDay: Number(map.financialYearStartDay),
  };
}

export async function saveSettings(values: Record<string, string>) {
  await prisma.$transaction(
    Object.entries(values).map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } }),
    ),
  );
  return getSettings();
}
