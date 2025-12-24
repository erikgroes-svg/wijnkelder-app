import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

// Als je al metadata had, mag je dat behouden/aanpassen.
export const metadata: Metadata = {
  title: "Wijnkelder",
  description: "Wijnkelder app",
};

// Cruciaal voor iPhone/Safari (voorkomt “te brede” layout)
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
