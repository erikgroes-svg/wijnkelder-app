"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/app/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";

const BUCKET_NAME = "wine-photos"; // lowercase

type Wine = {
  id: string;
  producer: string;
  name: string;
  vintage: number | null;
  location: string | null;
  quantity: number;
  photo_path: string | null;
  rating: number | null;
  drink_from_year: number | null;
  drink_to_year: number | null;

  photo_url?: string | null;
};

function thisYear() {
  return new Date().getFullYear();
}

function isDrinkNow(w: Wine) {
  const y = thisYear();
  const from = w.drink_from_year;
  const to = w.drink_to_year;

  if (!from && !to) return false; // geen venster => niet in drink-now lijst
  if (from && y < from) return false;
  if (to && y > to) return false;
  return true;
}

async function attachSignedPhotoUrls(wines: Wine[]) {
  const withUrls = await Promise.all(
    wines.map(async (w) => {
      if (!w.photo_path) return { ...w, photo_url: null };

      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(w.photo_path, 60 * 60);

      if (error) return { ...w, photo_url: null };
      return { ...w, photo_url: data?.signedUrl ?? null };
    })
  );

  return withUrls;
}

export default function DrinkNowPage() {
  const [items, setItems] = useState<Wine[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [brokenImg, setBrokenImg] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    setStatus(null);
    setBrokenImg({});

    const { data, error } = await supabase
      .from("wines")
      .select(
        "id, producer, name, vintage, location, quantity, photo_path, rating, drink_from_year, drink_to_year"
      );

    if (error) {
      setLoading(false);
      setStatus("Fout bij laden: " + error.message);
      return;
    }

    const all = ((data as Wine[]) ?? []).filter((w) => (w.quantity || 0) > 0 && isDrinkNow(w));

    // sort: rating desc, then producer/name
    all.sort((a, b) => {
      const ra = a.rating ?? 0;
      const rb = b.rating ?? 0;
      if (rb !== ra) return rb - ra;
      const pa = (a.producer || "").localeCompare(b.producer || "");
      if (pa !== 0) return pa;
      return (a.name || "").localeCompare(b.name || "");
    });

    const withUrls = await attachSignedPhotoUrls(all);
    setItems(withUrls);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function takeOne(w: Wine) {
    setStatus(null);
    if (w.quantity <= 0) return;

    const next = w.quantity - 1;
    const { error } = await supabase.from("wines").update({ quantity: next }).eq("id", w.id);
    if (error) {
      setStatus("Fout bij uitnemen: " + error.message);
      return;
    }

    // UI update (en verwijder uit lijst als quantity 0 wordt)
    setItems((prev) =>
      prev
        .map((x) => (x.id === w.id ? { ...x, quantity: next } : x))
        .filter((x) => x.quantity > 0)
    );
  }

  return (
    <AuthGate>
      <main style={{ padding: 24, maxWidth: 720 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900 }}>Nu drinken</h1>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/" style={{ textDecoration: "underline" }}>
              Home
            </Link>
            <Link href="/cellar" style={{ textDecoration: "underline" }}>
              Wijnkelder
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 8, color: "#444", fontSize: 13 }}>
          Alleen wijnen binnen drinkvenster (jaar) en met voorraad &gt; 0. Gesorteerd op jouw score.
        </div>

        <div style={{ marginTop: 12 }}>
          <button onClick={load} style={pill} type="button">
            Herladen
          </button>
        </div>

        {status && <div style={{ marginTop: 12, color: "#b00020" }}>{status}</div>}

        {loading ? (
          <div style={{ marginTop: 16 }}>Laden…</div>
        ) : items.length === 0 ? (
          <div style={{ marginTop: 16 }}>
            Geen wijnen “nu drinken” met voorraad. Stel drinkvensters in op de detailpagina’s.
          </div>
        ) : (
          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            {items.map((w) => {
              const showImg = !!w.photo_url && !brokenImg[w.id];
              const subtitle = `${w.producer} – ${w.name}${w.vintage ? ` (${w.vintage})` : ""}`;

              return (
                <div
                  key={w.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 14,
                    padding: 12,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    {showImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={w.photo_url as string}
                        alt=""
                        onError={() => setBrokenImg((prev) => ({ ...prev, [w.id]: true }))}
                        style={{
                          width: 110,
                          height: 110,
                          borderRadius: 12,
                          objectFit: "cover",
                          background: "#f5f5f5",
                          border: "1px solid #eee",
                          flex: "0 0 auto",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 110,
                          height: 110,
                          borderRadius: 12,
                          background: "#f5f5f5",
                          border: "1px solid #eee",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#777",
                          fontSize: 12,
                          textAlign: "center",
                          padding: 6,
                          flex: "0 0 auto",
                        }}
                      >
                        Geen foto
                      </div>
                    )}

                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 900, fontSize: 16 }}>{subtitle}</div>
                      <div style={{ marginTop: 6, color: "#444" }}>
                        <b>Locatie:</b> {w.location || "—"} &nbsp;&nbsp; <b>Voorraad:</b> {w.quantity}
                      </div>
                      <div style={{ marginTop: 6, color: "#444" }}>
                        <b>Score:</b> {w.rating ?? "—"}/5
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => takeOne(w)} style={primaryBtn} type="button">
                      − Uitnemen
                    </button>
                    <Link href={`/wine/${w.id}`} style={secondaryLinkBtn}>
                      Details
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </AuthGate>
  );
}

const pill: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 999,
  border: "1px solid #ccc",
  background: "#fff",
  fontWeight: 900,
};

const primaryBtn: React.CSSProperties = {
  flex: 1,
  padding: 14,
  borderRadius: 12,
  border: "1px solid #000",
  background: "#000",
  color: "#fff",
  fontWeight: 900,
};

const secondaryLinkBtn: React.CSSProperties = {
  flex: 1,
  padding: 14,
  borderRadius: 12,
  border: "1px solid #ccc",
  background: "#fff",
  fontWeight: 900,
  textAlign: "center",
  textDecoration: "none",
  color: "#000",
};
