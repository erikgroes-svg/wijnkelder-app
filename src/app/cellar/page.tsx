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

function stars(rating: number | null) {
  const r = rating ?? 0;
  return "★".repeat(r) + "☆".repeat(5 - r);
}

function thisYear() {
  return new Date().getFullYear();
}

function drinkBadge(w: Wine) {
  const y = thisYear();
  const from = w.drink_from_year;
  const to = w.drink_to_year;

  if (!from && !to) return { label: "geen venster", tone: "neutral" as const };
  if (from && y < from) return { label: "te vroeg", tone: "warn" as const };
  if (to && y > to) return { label: "voorbij", tone: "bad" as const };
  return { label: "nu drinken", tone: "good" as const };
}

function badgeStyle(tone: "good" | "warn" | "bad" | "neutral") {
  if (tone === "good") return { background: "#eaffea", border: "1px solid #0a0", color: "#0a0" };
  if (tone === "warn") return { background: "#fff6df", border: "1px solid #b8860b", color: "#b8860b" };
  if (tone === "bad") return { background: "#ffe7ea", border: "1px solid #b00020", color: "#b00020" };
  return { background: "#f4f4f4", border: "1px solid #ccc", color: "#444" };
}

export default function CellarPage() {
  const [items, setItems] = useState<Wine[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState<"rating" | "producer" | "location">("rating");
  const [onlyDrinkNow, setOnlyDrinkNow] = useState(false);

  const [brokenImg, setBrokenImg] = useState<Record<string, boolean>>({});

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

  async function load() {
    setLoading(true);
    setStatus(null);
    setBrokenImg({});

    const { data, error } = await supabase
      .from("wines")
      .select(
        "id, producer, name, vintage, location, quantity, photo_path, rating, drink_from_year, drink_to_year, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setLoading(false);
      setStatus("Fout bij laden: " + error.message);
      return;
    }

    const wines = ((data as Wine[]) ?? []).map((w) => ({ ...w, photo_url: null }));
    const withUrls = await attachSignedPhotoUrls(wines);
    setItems(withUrls);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changeQty(id: string, newQty: number) {
    setStatus(null);
    const qty = Math.max(0, newQty);

    const { error } = await supabase.from("wines").update({ quantity: qty }).eq("id", id);
    if (error) {
      setStatus("Fout bij aanpassen aantal: " + error.message);
      return;
    }

    setItems((prev) => prev.map((w) => (w.id === id ? { ...w, quantity: qty } : w)));
  }

  async function deleteWine(w: Wine) {
    setStatus(null);

    const label = `${w.producer} – ${w.name}${w.vintage ? ` (${w.vintage})` : ""}`;
    const ok = window.confirm(`Wijn verwijderen?\n\n${label}\n\nDit kan je niet ongedaan maken.`);
    if (!ok) return;

    const { error: delError } = await supabase.from("wines").delete().eq("id", w.id);
    if (delError) {
      setStatus("Fout bij verwijderen: " + delError.message);
      return;
    }

    if (w.photo_path) {
      await supabase.storage.from(BUCKET_NAME).remove([w.photo_path]);
    }

    setItems((prev) => prev.filter((x) => x.id !== w.id));
    setStatus("Wijn verwijderd.");
  }

  const filtered = useMemo(() => {
    if (!onlyDrinkNow) return items;
    return items.filter((w) => drinkBadge(w).tone === "good");
  }, [items, onlyDrinkNow]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    if (sortBy === "rating") copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    if (sortBy === "producer") copy.sort((a, b) => (a.producer || "").localeCompare(b.producer || ""));
    if (sortBy === "location") copy.sort((a, b) => (a.location || "").localeCompare(b.location || ""));
    return copy;
  }, [filtered, sortBy]);

  return (
    <AuthGate>
      <main style={{ padding: 24, maxWidth: 720 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Wijnkelder</h1>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/" style={{ textDecoration: "underline" }}>
              Home
            </Link>
            <Link href="/scan" style={{ textDecoration: "underline" }}>
              Scan fles
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Sorteren:</div>

          <button onClick={() => setSortBy("rating")} style={sortBy === "rating" ? pillActive : pill}>
            Score
          </button>
          <button onClick={() => setSortBy("producer")} style={sortBy === "producer" ? pillActive : pill}>
            Producent
          </button>
          <button onClick={() => setSortBy("location")} style={sortBy === "location" ? pillActive : pill}>
            Locatie
          </button>

          <button onClick={load} style={{ ...pill, marginLeft: "auto" }}>
            Herladen
          </button>
        </div>

        {/* Filter */}
        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Filter:</div>

          <button onClick={() => setOnlyDrinkNow(false)} style={!onlyDrinkNow ? pillActive : pill} type="button">
            Alle
          </button>
          <button onClick={() => setOnlyDrinkNow(true)} style={onlyDrinkNow ? pillActive : pill} type="button">
            Nu drinken
          </button>

          <div style={{ marginLeft: "auto", color: "#444", fontSize: 13 }}>
            {onlyDrinkNow ? `${sorted.length} binnen venster` : `${sorted.length} totaal`}
          </div>
        </div>

        {status && <div style={{ marginTop: 12, color: "#b00020" }}>{status}</div>}

        {loading ? (
          <div style={{ marginTop: 16 }}>Laden…</div>
        ) : sorted.length === 0 ? (
          <div style={{ marginTop: 16 }}>
            {onlyDrinkNow ? "Geen wijnen binnen drinkvenster." : "Nog geen wijnen. Ga naar “Scan fles”."}
          </div>
        ) : (
          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            {sorted.map((w) => {
              const showImg = !!w.photo_url && !brokenImg[w.id];
              const b = drinkBadge(w);

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
                          width: 96,
                          height: 96,
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
                          width: 96,
                          height: 96,
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
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 900, fontSize: 16 }}>
                          {w.producer} – {w.name} {w.vintage ? `(${w.vintage})` : ""}
                        </div>

                        <div
                          style={{
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontWeight: 900,
                            fontSize: 12,
                            ...badgeStyle(b.tone),
                          }}
                        >
                          {b.label}
                          {w.drink_from_year || w.drink_to_year
                            ? ` (${w.drink_from_year ?? "?"}–${w.drink_to_year ?? "?"})`
                            : ""}
                        </div>
                      </div>

                      <div style={{ marginTop: 6, color: "#444" }}>
                        <b>Locatie:</b> {w.location || "—"} &nbsp;&nbsp; <b>Aantal:</b> {w.quantity}
                      </div>

                      <div style={{ marginTop: 6, color: "#111", fontSize: 16 }}>
                        <span style={{ fontWeight: 900, marginRight: 8 }}>Score:</span>
                        <span style={{ letterSpacing: 1 }}>{stars(w.rating)}</span>
                        {w.rating ? <span style={{ marginLeft: 8, color: "#666" }}>({w.rating}/5)</span> : null}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => changeQty(w.id, (w.quantity || 0) - 1)} style={qtyBtn} type="button">
                      − Uitnemen
                    </button>
                    <button onClick={() => changeQty(w.id, (w.quantity || 0) + 1)} style={qtyBtn} type="button">
                      + Toevoegen
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <Link href={`/wine/${w.id}`} style={detailsBtn}>
                      Details
                    </Link>

                    <button onClick={() => deleteWine(w)} style={deleteBtn} type="button">
                      Verwijderen
                    </button>
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
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid #ccc",
  background: "#fff",
  fontWeight: 900,
};

const pillActive: React.CSSProperties = {
  ...pill,
  background: "#000",
  color: "#fff",
  border: "1px solid #000",
};

const qtyBtn: React.CSSProperties = {
  flex: 1,
  padding: 12,
  borderRadius: 12,
  border: "1px solid #ccc",
  background: "#fff",
  fontWeight: 900,
};

const detailsBtn: React.CSSProperties = {
  flex: 1,
  padding: 12,
  borderRadius: 12,
  border: "1px solid #000",
  background: "#000",
  color: "#fff",
  fontWeight: 900,
  textAlign: "center",
  textDecoration: "none",
};

const deleteBtn: React.CSSProperties = {
  flex: 1,
  padding: 12,
  borderRadius: 12,
  border: "1px solid #b00020",
  background: "#fff",
  color: "#b00020",
  fontWeight: 900,
};
