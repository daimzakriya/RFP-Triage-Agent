import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RFP Triage Agent · idiaz.io",
  description: "Drop in a government RFP and get an evidence-backed bid/no-bid report in about a minute.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
