import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Bellwoods CRM", template: "%s · Bellwoods" },
  description: "Contracts, surveys and job costing for Bellwoods Windows and Doors.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
