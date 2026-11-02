import { formatGbp, formatMargin } from "../src/domain/money";
import { defaultDashboardRange, getContractView, getDashboard } from "../src/server/queries";

async function main() {
  const view = await getContractView("BW23290");
  console.log("BW23290", formatGbp(view.costing.profitPence), formatMargin(view.costing.margin), view.costing.profitPence);
  const prev = await defaultDashboardRange("previous");
  const dash = await getDashboard(prev.from, prev.toExclusive);
  console.log("previous BW", dash.profit.byType.BW.profitPence, "TC", dash.profit.byType.TC.profitPence);
  const cur = await defaultDashboardRange("current");
  const dash2 = await getDashboard(cur.from, cur.toExclusive);
  console.log("current BW", dash2.profit.byType.BW.profitPence, dash2.counts);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
