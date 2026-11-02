"use client";

import { useState } from "react";

export function ChannelField({
  defaultValue = "bellwoods",
  allowCommercial = false,
}: {
  defaultValue?: "bellwoods" | "trade";
  allowCommercial?: boolean;
}) {
  const [channel, setChannel] = useState<"bellwoods" | "trade">(defaultValue);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-stone-700">Bellwoods or trade</legend>
      <input type="hidden" name="channel" value={channel} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={`rounded-md border px-3 py-3 text-left text-sm font-semibold ${channel === "bellwoods" ? "border-forest bg-forest text-white" : "border-line bg-white"}`} onClick={() => setChannel("bellwoods")}>
          Bellwoods
          <span className="mt-1 block text-xs font-normal opacity-80">Retail and commercial</span>
        </button>
        <button type="button" className={`rounded-md border px-3 py-3 text-left text-sm font-semibold ${channel === "trade" ? "border-sky-400 bg-sky-100 text-sky-950" : "border-line bg-white"}`} onClick={() => setChannel("trade")}>
          Trade
          <span className="mt-1 block text-xs font-normal opacity-80">NETC. No separate company.</span>
        </button>
      </div>
      {allowCommercial && channel === "bellwoods" && (
        <label className="text-sm"><input className="mr-2" type="checkbox" name="commercial" />Commercial repair (still Bellwoods, prefix CM)</label>
      )}
      {channel === "trade" && <p className="text-xs text-sky-900">Trade jobs skip the deposit. Invoices are still raised by Bellwoods Windows and Doors Ltd.</p>}
    </fieldset>
  );
}
