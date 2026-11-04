import type { Metadata } from "next";
import { DM_Sans, Libre_Caslon_Display } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const caslon = Libre_Caslon_Display({
  variable: "--font-caslon",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HIREhub — Work that travels with you",
  description:
    "A contributor directory and employer attestation network for EVM and Solana wallets, built on Rome.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} ${caslon.variable}`}>
      <body>{children}</body>
    </html>
  );
}
