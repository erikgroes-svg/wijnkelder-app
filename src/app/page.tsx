"use client";

import Link from "next/link";
import AuthGate from "@/app/components/AuthGate";

export default function HomePage() {
  return (
    <AuthGate>
      <main style={{ padding: 24, maxWidth: 720 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 8 }}>Wijnkelder</h1>
        <div style={{ color: "#444", marginBottom: 18 }}>
          Kies wat je wil doen.
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <Link href="/scan" style={primaryLink}>
            Scan fles
          </Link>

          <Link href="/cellar" style={secondaryLink}>
            Wijnkelder
          </Link>

          <Link href="/drink-now" style={secondaryLink}>
            Nu drinken
          </Link>
        </div>
      </main>
    </AuthGate>
  );
}

const primaryLink: React.CSSProperties = {
  padding: 16,
  borderRadius: 14,
  border: "1px solid #000",
  background: "#000",
  color: "#fff",
  fontWeight: 900,
  textAlign: "center",
  textDecoration: "none",
};

const secondaryLink: React.CSSProperties = {
  padding: 16,
  borderRadius: 14,
  border: "1px solid #ccc",
  background: "#fff",
  color: "#000",
  fontWeight: 900,
  textAlign: "center",
  textDecoration: "none",
};
