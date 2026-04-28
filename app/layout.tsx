import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Maddock & Co VAT Registration Checker",
  description: "UK VAT registration threshold monitoring app",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
