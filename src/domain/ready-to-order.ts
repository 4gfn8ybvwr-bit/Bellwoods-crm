export type ReadyToOrderInput = {
  depositSkipped: boolean;
  depositPaid: boolean;
  surveyUploaded: boolean;
};

export type ReadyToOrderResult = {
  ok: boolean;
  depositOk: boolean;
  surveyOk: boolean;
  reasons: string[];
};

/**
 * A job may enter Ready to Order only when the deposit is paid or explicitly
 * skipped, and a survey has been uploaded.
 */
export function readyToOrderGate(input: ReadyToOrderInput): ReadyToOrderResult {
  const depositOk = input.depositSkipped || input.depositPaid;
  const surveyOk = input.surveyUploaded;
  const reasons: string[] = [];
  if (!depositOk) reasons.push("The deposit has not been paid or skipped");
  if (!surveyOk) reasons.push("The survey has not been uploaded");
  return { ok: depositOk && surveyOk, depositOk, surveyOk, reasons };
}

export function stageRequiresReadyGate(
  targetSortOrder: number,
  readySortOrder: number | null,
) {
  if (readySortOrder == null) return false;
  return targetSortOrder >= readySortOrder;
}
