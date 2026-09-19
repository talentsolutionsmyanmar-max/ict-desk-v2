import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Edge — ICT Crypto Research Desk",
  description:
    "A live crypto research workspace. Venue-native charts, liquidity screening, transparent ICT setup gates and cost-aware risk planning. No automatic orders or profitability promises.",
  robots: { index: true, follow: true },
  applicationName: "ICT Edge Desk",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101613",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
