"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function TradeShortcut() {
  const router = useRouter();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (event.altKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        router.push("/trade/new");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
