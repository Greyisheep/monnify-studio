import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monnify Studio",
  description: "Prove the system around the endpoint is correct.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ height: "100vh" }}>{children}</body>
    </html>
  );
}
