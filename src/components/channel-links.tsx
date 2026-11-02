import Link from "next/link";

export function ChannelLinks({
  current,
  path,
  extra,
}: {
  current: string;
  path: string;
  extra?: Record<string, string>;
}) {
  const items = [
    ["all", "All"],
    ["bellwoods", "Bellwoods"],
    ["trade", "Trade"],
  ] as const;
  return (
    <div className="flex gap-1">
      {items.map(([id, label]) => {
        const params = new URLSearchParams(extra);
        if (id !== "all") params.set("channel", id);
        const href = params.size ? `${path}?${params.toString()}` : path;
        const active = (current || "all") === id;
        return (
          <Link key={id} href={href} className={`btn btn-small ${active ? "btn-dark" : ""} ${id === "trade" && active ? "border-sky-700 bg-sky-700" : ""}`}>
            {label}
          </Link>
        );
      })}
    </div>
  );
}
