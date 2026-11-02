export type Channel = "BELLWOODS" | "TRADE";

export function isTradeChannel(value: string | null | undefined) {
  return value === "TRADE" || value === "TC" || value === "trade";
}

export function channelFromType(type: string): Channel {
  return type === "TC" ? "TRADE" : "BELLWOODS";
}

/** Bellwoods retail and commercial stay together. Trade is NETC only. */
export function parseChannelFilter(value: string | undefined): Channel | "ALL" {
  if (!value || value === "all" || value === "ALL") return "ALL";
  if (isTradeChannel(value)) return "TRADE";
  return "BELLWOODS";
}

export function typeForChannel(channel: Channel, commercial = false) {
  if (channel === "TRADE") return "TC";
  return commercial ? "CM" : "BW";
}

export const TRADE_JOB_TYPES = [
  "Supply only",
  "Supply and fit",
  "Glass only",
  "Door only",
  "Bi-fold or patio",
  "Remake",
  "Commercial windows",
  "Other",
] as const;
