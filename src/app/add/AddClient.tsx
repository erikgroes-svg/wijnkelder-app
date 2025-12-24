"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/**
 * Pas deze constanten aan aan jouw Supabase setup.
 * Bucket/paden moeten lowercase blijven (jouw projectregel).
 */
const BUCKET_NAME = "wines";
const TABLE_NAME = "wines";

/**
 * Als jij al een echte overzichtspagina hebt, zet die hier.
 * Voorlopig laat ik dit leeg zodat we NIET automatisch redirecten.
 * Voorbeelden: "/cellar" of "/wines"
 */
const OVERVIEW_ROUTE = ""; // bv. "/cellar"

const DRAFT_KEY = "add_wine_draft_v2";

async function downscaleImage(file: File, maxW = 1600, maxH = 1600, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(maxW / bitmap.width, maxH / bitmap.height, 1);
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context niet beschikbaar.");
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Foto comprimeren mislukt."))),
      "image/jpeg",
      quality
    );
  });

  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

export default function AddClient() {
  const router = useRouter();

  const [rawFile, setRawFile] = useState<File | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [photoBusy, setPhotoBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Form velden
  const [name, setName] = useState("");
  const [producer, setProducer] = useState("");
  const [vintage, setVintage] = useState("");

  // Draft herstellen bij mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (typeof d?.name === "string") setName(d.name);
      if (typeof d?.producer === "string") setProducer(d.producer);
      if (typeof d?.vintage === "string") setVintage(d.vintage);
    } catch {}
  }, []);

  // Draft bewaren bij wijziging
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ name, producer, vintage }));
    } catch {}
  }, [name, producer, vintage]);

  // Preview URL
  useEffect(() => {
    if (!rawFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(rawFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [rawFile]);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSaved(false);

    if (photoBusy) return;

    const file = e.target.files?.[0] || null;
    if (!file) return;

    // laat toe om opnieuw hetzelfde bestand te selecteren
    e.target.value = "";

    setRawFile(file);

    try {
      setPhotoBusy(true);
      const smaller = await downscaleImage(file);
      setUploadFile(smaller);
    } catch (err: any) {
      setUploadFile(null);
      setError(err?.message ?? "Foto verwerken mislukt.");
    } finally {
      setPhotoBusy(false);
    }
  }

  function resetFormForNext() {
    setError(null);
    setSaved(false);

    setName("");
    setProducer("");
    setVintage("");

    setRawFile(null);
    setUploadFile(null);

    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (photoBusy) {
      setError("Wacht even tot de foto verwerkt is.");
      return;
    }

    if (!uploadFile) {
      setError("Kies eerst een foto.");
      return;
    }

    if (!name.trim()) {
      setError("Vul minstens een naam in.");
      return;
    }

    try {
      setSaveBusy(true);

      // 1) Upload foto
      const fileName = `${crypto.randomUUID()}.jpg`;
      const filePath = `wines/${fileName}`;

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, uploadFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: "image/jpeg",
        });

      if (uploadErr) throw new Error(`Upload mislukt: ${uploadErr.message}`);

      // 2) Public URL (werkt enkel als bucket public is)
      const { data: pub } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
      const photoUrl = pub?.publicUrl ?? null;

      // 3) Insert DB record (pas kolommen aan als jouw schema anders is)
      const payload: any = {
        name: name.trim(),
        producer: producer.trim() || null,
        vintage: vintage ? Number(vintage) : null,
        photo_url: photoUrl,
        photo_path: filePath,
      };

      const { error: insertErr } = await supabase.from(TABLE_NAME).insert(payload);
      if (insertErr) throw new Error(`Opslaan mislukt: ${insertErr.message}`);

      // 4) Succes: toon bevestiging, laat gebruiker kiezen wat erna
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {}

      setSaved(true);

      // We resetten NIET automatisch alles, zodat je nog kan zien wat je net deed.
      // Als je “Nog een wijn” klikt resetten we wel.
    } catch (err: any) {
      setError(err?.message ?? "Opslaan mislukt.");
      // extra debug voor jezelf in de browser console
      // (op iPhone zie je dit minder makkelijk, maar op desktop wel)
      console.error(err);
    } finally {
      setSaveBusy(false);
    }
  }

  const containerStyle: React.CSSProperties = {
    padding: 16,
    maxWidth: 520,
    margin: "0 auto",
    boxSizing: "border-box",
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 14,
    boxSizing: "border-box",
    background: "white",
  };

  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, marginTop: 12 };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    boxSizing: "border-box",
    fontSize: 16,
  };

  const primaryButton: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #111827",
    background: saveBusy ? "#374151" : "#111827",
    color: "white",
    fontWeight: 800,
    boxSizing: "border-box",
    cursor: saveBusy ? "not-allowed" : "pointer",
    opacity: saveBusy ? 0.85 : 1,
  };

  const secondaryButton: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #111827",
    background: "white",
    color: "#111827",
    fontWeight: 800,
    boxSizing: "border-box",
    cursor: "pointer",
  };

  return (
    <main style={containerStyle}>
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 10 }}>Wijn toevoegen</h1>

      {saved && (
        <section style={{ ...cardStyle, borderColor: "#16a34a" }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#166534" }}>
            Opgeslagen.
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: "#111827", lineHeight: 1.45 }}>
            De wijn is toegevoegd. Wat wil je nu doen?
          </div>

          <div style={{ marginTop: 12 }}>
            <button type="button" style={secondaryButton} onClick={resetFormForNext}>
              Nog een wijn toevoegen
            </button>
          </div>

          {OVERVIEW_ROUTE ? (
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                style={primaryButton}
                onClick={() => {
                  router.push(OVERVIEW_ROUTE);
                  router.refresh();
                }}
              >
                Naar overzicht
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
              Als je een overzichtspagina hebt, zet die route in <strong>OVERVIEW_ROUTE</strong>.
            </div>
          )}
        </section>
      )}

      <section style={{ ...cardStyle, marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Foto</div>

        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPickPhoto}
          style={{ width: "100%", boxSizing: "border-box" }}
        />

        {photoBusy && (
          <div style={{ marginTop: 10, fontSize: 14 }}>Foto wordt geoptimaliseerd…</div>
        )}

        {previewUrl && (
          <img
            src={previewUrl}
            alt="Preview"
            style={{ width: "100%", marginTop: 10, borderRadius: 12, display: "block" }}
          />
        )}
      </section>

      <form onSubmit={onSubmit} style={{ marginTop: 14, ...cardStyle }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Details</div>

        <div style={labelStyle}>Naam</div>
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />

        <div style={labelStyle}>Producent</div>
        <input value={producer} onChange={(e) => setProducer(e.target.value)} style={inputStyle} />

        <div style={labelStyle}>Jaargang</div>
        <input
          value={vintage}
          onChange={(e) => setVintage(e.target.value)}
          inputMode="numeric"
          pattern="\d*"
          style={inputStyle}
        />

        {error && (
          <div style={{ marginTop: 12, fontSize: 14, color: "#b91c1c", fontWeight: 700 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <button type="submit" style={primaryButton} disabled={saveBusy}>
            {saveBusy ? "Bezig…" : "Opslaan"}
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>
          Als Safari herlaadt, blijven je details bewaard.
        </div>
      </form>

      <div style={{ height: 24 }} />
    </main>
  );
}
