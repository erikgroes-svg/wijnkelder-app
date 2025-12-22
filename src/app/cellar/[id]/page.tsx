"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  rating: number | null;
  photo_path: string | null;
  purchase_date: string | null;
  price: number | null;
};

function stars(rating: number | null) {
  const r = rating ?? 0;
  return "★".repeat(r) + "☆".repeat(5 - r);
}

export default function WineDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [wine, setWine] = useState<Wine | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [brokenImg, setBrokenImg] = useState(false);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const title = useMemo(() => {
    if (!wine) return "Wijn";
    return `${wine.producer} – ${wine.name}${wine.vintage ? ` (${wine.vintage})` : ""}`;
  }, [wine]);

  async function load() {
    setStatus(null);
    setBrokenImg(false);

    const { data, error } = await supabase
      .from("wines")
      .select("id, producer, name, vintage, location, quantity, rating, photo_path, purchase_date, price")
      .eq("id", id)
      .single();

    if (error) {
      setStatus("Fout bij laden: " + error.message);
      return;
    }

    const w = data as Wine;
    setWine(w);

    if (w.photo_path) {
      const { data: signed, error: sErr } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(w.photo_path, 60 * 60);

      if (!sErr) setPhotoUrl(signed?.signedUrl ?? null);
      else setPhotoUrl(null);
    } else {
      setPhotoUrl(null);
    }
  }

  useEffect(() => {
    if (!id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    if (!wine) return;
    setSaving(true);
    setStatus(null);

    const payload = {
      producer: wine.producer.trim(),
      name: wine.name.trim(),
      vintage: wine.vintage,
      location: wine.location?.trim() || null,
      quantity: Number(wine.quantity) || 0,
      rating: wine.rating,
      purchase_date: wine.purchase_date || null,
      price: wine.price ?? null,
    };

    const { error } = await supabase.from("wines").update(payload).eq("id", wine.id);

    if (error) {
      setSaving(false);
      setStatus("Fout bij opslaan: " + error.message);
      return;
    }

    setSaving(false);
    setStatus("Opgeslagen.");
  }

  async function deleteWine() {
    if (!wine) return;

    const ok = window.confirm(`Wijn verwijderen?\n\n${title}\n\nDit kan je niet ongedaan maken.`);
    if (!ok) return;

    const { error } = await supabase.from("wines").delete().eq("id", wine.id);
    if (error) {
      setStatus("Fout bij verwijderen: " + error.message);
      return;
    }

    if (wine.photo_path) {
      await supabase.storage.from(BUCKET_NAME).remove([wine.photo_path]);
    }

    router.push("/cellar");
  }

  async function changeQty(delta: number) {
    if (!wine) return;
    const next = Math.max(0, (wine.quantity || 0) + delta);
    setWine({ ...wine, quantity: next });

    const { error } = await supabase.from("wines").update({ quantity: next }).eq("id", wine.id);
    if (error) setStatus("Fout bij aanpassen aantal: " + error.message);
  }

  if (!wine) {
    return (
      <AuthGate>
        <main style={{ padding: 24, maxWidth: 720 }}>
          <div style={{ marginBottom: 12 }}>
            <Link href="/cellar" style={{ textDecoration: "underline" }}>
              ← Terug naar wijnkelder
            </Link>
          </div>
          <div>{status || "Laden…"}</div>
        </main>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <main style={{ padding: 24, maxWidth: 720 }}>
        <div style={{ marginBottom: 12 }}>
          <Link href="/cellar" style={{ textDecoration: "underline" }}>
            ← Terug naar wijnkelder
          </Link>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 900 }}>{title}</h1>

        {photoUrl && !brokenImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            onError={() => setBrokenImg(true)}
            style={{
              marginTop: 12,
              width: "100%",
              maxHeight: 380,
              objectFit: "contain",
              borderRadius: 14,
              background: "#f5f5f5",
              border: "1px solid #eee",
            }}
          />
        ) : (
          <div
            style={{
              marginTop: 12,
              width: "100%",
              height: 220,
              borderRadius: 14,
              background: "#f5f5f5",
              border: "1px solid #eee",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#777",
              fontWeight: 900,
            }}
          >
            Geen foto
          </div>
        )}

        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <input style={inputStyle} value={wine.producer} onChange={(e) => setWine({ ...wine, producer: e.target.value })} placeholder="Producent" />
          <input style={inputStyle} value={wine.name} onChange={(e) => setWine({ ...wine, name: e.target.value })} placeholder="Naam / cuvée" />

          <input
            style={inputStyle}
            value={wine.vintage ?? ""}
            onChange={(e) => setWine({ ...wine, vintage: e.target.value ? Number(e.target.value) : null })}
            placeholder="Jaargang"
            inputMode="numeric"
          />

          <input
            style={inputStyle}
            value={wine.location ?? ""}
            onChange={(e) => setWine({ ...wine, location: e.target.value })}
            placeholder="Locatie"
          />

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => changeQty(-1)} style={qtyBtn} type="button">
              − Uitnemen
            </button>
            <button onClick={() => changeQty(+1)} style={qtyBtn} type="button">
              + Toevoegen
            </button>
          </div>

          <div style={{ fontWeight: 900 }}>
            Aantal: {wine.quantity}
          </div>

          <div>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>
              Score: <span style={{ letterSpacing: 1 }}>{stars(wine.rating)}</span>{" "}
              {wine.rating ? <span style={{ color: "#666" }}>({wine.rating}/5)</span> : null}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setWine({ ...wine, rating: v })}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    border: "1px solid #ccc",
                    background: wine.rating && wine.rating >= v ? "#000" : "#fff",
                    color: wine.rating && wine.rating >= v ? "#fff" : "#000",
                    fontWeight: 900,
                  }}
                >
                  ★
                </button>
              ))}
              <button
                type="button"
                onClick={() => setWine({ ...wine, rating: null })}
                style={{
                  padding: "0 12px",
                  height: 44,
                  borderRadius: 12,
                  border: "1px solid #ccc",
                  background: "#fff",
                  fontWeight: 900,
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <input
            style={inputStyle}
            type="date"
            value={wine.purchase_date ?? ""}
            onChange={(e) => setWine({ ...wine, purchase_date: e.target.value || null })}
          />

          <input
            style={inputStyle}
            type="number"
            step="0.01"
            value={wine.price ?? ""}
            onChange={(e) => setWine({ ...wine, price: e.target.value ? Number(e.target.value) : null })}
            placeholder="Prijs"
          />

          {status && <div style={{ color: status.startsWith("Fout") ? "#b00020" : "#444" }}>{status}</div>}

          <button onClick={save} disabled={saving} style={saveBtn} type="button">
            {saving ? "Opslaan..." : "Opslaan"}
          </button>

          <button onClick={deleteWine} style={deleteBtn} type="button">
            Wijn verwijderen
          </button>
        </div>
      </main>
    </AuthGate>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid #ccc",
};

const qtyBtn: React.CSSProperties = {
  flex: 1,
  padding: 12,
  borderRadius: 12,
  border: "1px solid #ccc",
  background: "#fff",
  fontWeight: 900,
};

const saveBtn: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  border: "1px solid #000",
  background: "#000",
  color: "#fff",
  fontWeight: 900,
};

const deleteBtn: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  border: "1px solid #b00020",
  background: "#fff",
  color: "#b00020",
  fontWeight: 900,
};
