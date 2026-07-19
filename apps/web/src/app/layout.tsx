import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monnify Studio",
  description:
    "AI-native development environment for building reliable Monnify payment integrations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
