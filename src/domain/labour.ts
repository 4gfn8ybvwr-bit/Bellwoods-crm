export function labourCostPence(
  person: { rateType: string; ratePence: number },
  input: { days: number; hours: number },
) {
  if (person.rateType === "DAY") return Math.round(person.ratePence * input.days);
  if (person.rateType === "HOUR") return Math.round(person.ratePence * input.hours);
  if (person.rateType === "WEEK") return Math.round((person.ratePence * input.days) / 5);
  return 0;
}

export function formatRate(person: { rateType: string; ratePence: number }) {
  const pounds = (person.ratePence / 100).toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
  });
  if (person.rateType === "DAY") return `${pounds}/day`;
  if (person.rateType === "HOUR") return `${pounds}/hour`;
  if (person.rateType === "WEEK") return `${pounds}/week`;
  return pounds;
}
