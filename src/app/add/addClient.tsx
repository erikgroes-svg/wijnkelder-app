"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGate from "@/app/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";

const BUCKET_NAME = "wine-photos"; // lowercase

function extFromMime(mime: string) {
  const m = (mime || "").toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  return "jpg";
}

function safeInt(v: string): number | null {
  const t = (v || "").trim();
  if (!t) return null;
  const n = Number(t);
  if (Number.isNaN(n)) return null;
  return Math.trunc(n);
}

function safeFloat(v: string): number | null {
  const t = (v || "").trim();
  if (!t) return null;
  const n = Number(t);
  if (Number.isNaN(n)) return null;
  return n;
}

function thisYear() {
  return new Date().getFullYear();
}

function clampYear(n: number | null) {
  if (n === null) return null;
  if (Number.isNaN(n)) return null;
  if (n < 1900) return 1900;
  if (n > 2100) return 2100;
  return n;
}

export default function AddClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Prefill (optioneel) via query params, bv: /add?producer=...&name=...&vintage=2021
  const preProducer = searchParams?.get("producer") || "";
  const preName = searchParams?.get("name") || "";
  const preVintage = searchParams?.get("vintage") || "";

  const [producer, setProducer] = useState(preProducer);
  const [name, setName] = useState(preName);
  const [vintage, setVintage] = useState(preVintage);

  const [quantity, setQuantity] = useState("1");
  const [location, setLocation] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [price, setPrice] = useState("");

  const [rating, setRating] = useState<number | null>(null);

  const [drinkFromYear, setDrinkFromYear] = useState<string>("");
  const [drinkToYear, setDrinkToYear] = useState<string>("");

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const title = useMemo(() => {
    const p = producer.trim();
    const n = name.trim();
    const v = safeInt(vintage);
    if (!p && !n) return "Toevoegen";
    return `${p || "?"} – ${n || "?"}${v ? ` (${v})` : ""}`;
  }, [producer, name, vintage]);

  function setPresetWindow(preset: "now+1" | "now+3" | "now+5" | "clear") {
    const y = thisYear();
    if (preset === "clear") {
      setDrinkFromYear("");
      setDrinkToYear("");
      return;
    }
    const add = preset === "now+1" ? 1 : preset === "now+3" ? 3 : 5;
    setDrinkFromYear(String(y));
    setDrinkToYear(String(y + add));
  }

  function onPickPhoto() {
    setStatus(null);
    fileRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    e.target.value = "";
    setFile(f);
    setStatus(null);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (f) {
      const u = URL.createObjectURL(f);
      setPreviewUrl(u);
    }
  }

  function clearPhoto() {
    setFile(null);
    setStatus(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }

  async function save() {
    setStatus(null);

    const p = producer.trim();
    const n = name.trim();
    if (!p || !n) {
      setStatus("Vul minstens producent en naam in.");
      return;
    }

    const qty = Math.max(0, safeInt(quantity) ?? 0);
    const vint = safeInt(vintage);
    const pr = safeFloat(price);
    const fromY = clampYear(safeInt(drinkFromYear));
    const toY = clampYear(safeInt(drinkToYear));

    if (fromY && toY && fromY > toY) {
      setStatus("Drinkvenster: 'vanaf' mag niet groter zijn dan 'tot'.");
      return;
    }

    setSaving(true);

    // 1) user ophalen
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      setSaving(false);
      setStatus("Niet ingelogd. Log opnieuw in.");
      return;
    }

    // 2) Eerst wijn record aanmaken (zonder foto), zodat we een wine.id hebben
    const insertPayload: any = {
      user_id: user.id, // als je RLS policies user_id vereisen
      producer: p,
      name: n,
      vintage: vint,
      quantity: qty,
      location: location.trim() || null,
      rating: rating,
      purchase_date: purchaseDate || null,
      price: pr,
      drink_from_year: fromY,
      drink_to_year: toY,
    };

    const { data: inserted, error: insErr } = await supabase
      .from("wines")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      setSaving(false);
      setStatus("Fout bij opslaan wijn: " + (insErr?.message || "onbekend"));
      return;
    }

    const wineId = inserted.id as string;

    // 3) Als er een foto is: uploaden en daarna photo_path updaten
    if (file) {
      const ext = extFromMime(file.type);
      const path = `${user.id}/${wineId}-${Date.now()}.${ext}`.toLowerCase();

      const up = await supabase.storage.from(BUCKET_NAME).upload(path, file, {
        upsert: false,
        contentType: file.type || "image/jpeg",
      });

      if (up.error) {
        // Wijn is al aangemaakt, dus we tonen fout maar gaan wel naar detail (waar je foto kan vervangen)
        setSaving(false);
        setStatus("Wijn opgeslagen, maar foto upload faalde: " + up.error.message);
        router.push(`/wine/${wineId}`);
        return;
      }

      const { error: updErr } = await supabase.from("wines").update({ photo_path: path }).eq("id", wineId);

      if (updErr) {
        setSaving(false);
        setStatus("Wijn opgeslagen, maar photo_path kon niet worden opgeslagen: " + updErr.message);
        router.push(`/wine/${wineId}`);
        return;
      }
    }

    setSaving(false);
    router.push(`/wine/${wineId}`);
  }

  return (
    <AuthGate>
      <main style={{ padding: 24, maxWidth: 720 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900 }}>{title}</h1>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/" style={{ textDecoration: "underline" }}>
              Home
            </Link>
            <Link href="/cellar" style={{ textDecoration: "underline" }}>
              Wijnkelder
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 10, color: "#444" }}>
          Voeg een wijn manueel toe. Foto is optioneel.
        </div>

        {/* Foto */}
        <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} style={{ display: "none" }} />

        <div style={{ marginTop: 14 }}>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="preview"
              style={{
                width: "100%",
                maxHeight: 360,
                objectFit: "contain",
                borderRadius: 14,
                background: "#f5f5f5",
                border: "1px solid #eee",
              }}
            />
          ) : (
            <div
              style={{
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
              Geen foto gekozen
            </div>
          )}

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={onPickPhoto} style={primaryBtn} disabled={saving}>
              Foto kiezen
            </button>
            <button type="button" onClick={clearPhoto} style={secondaryBtn} disabled={saving}>
              Foto verwijderen
            </button>
          </div>
        </div>

        {/* Form */}
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <label style={labelStyle}>
            Producent *
            <input style={inputStyle} value={producer} onChange={(e) => setProducer(e.target.value)} />
          </label>

          <label style={labelStyle}>
            Naam / cuvée *
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label style={labelStyle}>
            Jaargang
            <input
              style={inputStyle}
              value={vintage}
              onChange={(e) => setVintage(e.target.value)}
              inputMode="numeric"
              placeholder="bv. 2021"
            />
          </label>

          <div style={{ display: "grid", gap: 10, padding: 12, borderRadius: 12, border: "1px solid #eee", background: "#fafafa" }}>
            <div style={{ fontWeight: 900 }}>Drinkvenster (jaartal)</div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setPresetWindow("now+1")} style={secondaryBtn} disabled={saving}>
                Nu → +1 jaar
              </button>
              <button type="button" onClick={() => setPresetWindow("now+3")} style={secondaryBtn} disabled={saving}>
                Nu → +3 jaar
              </button>
              <button type="button" onClick={() => setPresetWindow("now+5")} style={secondaryBtn} disabled={saving}>
                Nu → +5 jaar
              </button>
              <button type="button" onClick={() => setPresetWindow("clear")} style={secondaryBtn} disabled={saving}>
                Wissen
              </button>
            </div>

            <label style={labelStyle}>
              Drink vanaf (jaar)
              <input
                style={inputStyle}
                value={drinkFromYear}
                onChange={(e) => setDrinkFromYear(e.target.value)}
                inputMode="numeric"
                placeholder={`${thisYear()}`}
              />
            </label>

            <label style={labelStyle}>
              Drink tot (jaar)
              <input
                style={inputStyle}
                value={drinkToYear}
                onChange={(e) => setDrinkToYear(e.target.value)}
                inputMode="numeric"
                placeholder={`${thisYear() + 3}`}
              />
            </label>
          </div>

          <label style={labelStyle}>
            Locatie
            <input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="bv. rek A3" />
          </label>

          <label style={labelStyle}>
            Aantal
            <input
              style={inputStyle}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="numeric"
              placeholder="1"
            />
          </label>

          {/* Rating */}
          <div style={{ marginTop: 6 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Jouw score</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRating(v)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    border: "1px solid #ccc",
                    background: rating && rating >= v ? "#000" : "#fff",
                    color: rating && rating >= v ? "#fff" : "#000",
                    fontWeight: 900,
                  }}
                >
                  ★
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRating(null)}
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

          <label style={labelStyle}>
            Aankoopdatum
            <input style={inputStyle} type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </label>

          <label style={labelStyle}>
            Prijs
            <input
              style={inputStyle}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="bv. 18.50"
            />
          </label>

          {status && (
            <div style={{ color: status.startsWith("Fout") ? "#b00020" : "#444", fontWeight: 700 }}>
              {status}
            </div>
          )}

          <button type="button" onClick={save} style={saveBtn} disabled={saving}>
            {saving ? "Opslaan..." : "Opslaan"}
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

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontWeight: 800,
  color: "#333",
};

const primaryBtn: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #000",
  background: "#000",
  color: "#fff",
  fontWeight: 900,
};

const secondaryBtn: React.CSSProperties = {
  padding: "12px 14px",
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
