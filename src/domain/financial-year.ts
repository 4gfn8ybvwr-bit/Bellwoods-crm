import { londonToUtc, partsInLondon, formatUkDate } from "./dates";

export type DateRange = {
  from: Date;
  toExclusive: Date;
  label: string;
};

export function financialYearContaining(today: Date, startMonth = 11, startDay = 1): DateRange {
  const p = partsInLondon(today);
  const onOrAfterStart = p.m > startMonth || (p.m === startMonth && p.d >= startDay);
  const startYear = onOrAfterStart ? p.y : p.y - 1;
  const from = londonToUtc(startYear, startMonth, startDay, 0, 0);
  const toExclusive = londonToUtc(startYear + 1, startMonth, startDay, 0, 0);
  return {
    from,
    toExclusive,
    label: `Financial year ${startYear}/${String(startYear + 1).slice(2)}`,
  };
}

export function previousFinancialYear(today: Date, startMonth = 11, startDay = 1): DateRange {
  const current = financialYearContaining(today, startMonth, startDay);
  const start = partsInLondon(current.from);
  const from = londonToUtc(start.y - 1, startMonth, startDay, 0, 0);
  return {
    from,
    toExclusive: current.from,
    label: `Financial year ${start.y - 1}/${String(start.y).slice(2)}`,
  };
}

export function rangeLabel(from: Date, toExclusive: Date) {
  const end = new Date(toExclusive.getTime() - 60_000);
  return `${formatUkDate(from)} – ${formatUkDate(end)}`;
}
