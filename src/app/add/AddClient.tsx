"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/**
 * Pas deze 2 constanten aan als jouw Supabase namen anders zijn.
 * Bucket en paden moeten lowercase zijn (jouw projectregel).
 */
const BUCKET_NAME = "wines"; // bv. "photos" of "winephotos"
const TABLE_NAME = "wines"; // bv. "bottles" of "cellar_items"

// Waar wil je na "Opslaan" naartoe?
const AFTER_SAVE_ROUTE = "/"; // bv. "/cellar" of "/wines"

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

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form velden
  const [name, setName] = useState("");
  const [producer, setProducer] = useState("");
  const [vintage, setVintage] = useState("");

  // Object URL cleanup (iPhone vriendelijk)
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
    const file = e.target.files?.[0] || null;
    if (!file) return;

    setRawFile(file);

    try {
      setBusy(true);
      const smaller = await downscaleImage(file);
      setUploadFile(smaller);
    } catch (err: any) {
      setUploadFile(null);
      setError(err?.message ?? "Foto verwerken mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!uploadFile) {
      setError("Kies eerst een foto.");
      return;
    }

    // Eenvoudige validatie
    if (!name.trim()) {
      setError("Vul minstens een naam in.");
      return;
    }

    try {
      setBusy(true);

      // 1) Upload foto naar Supabase Storage
      const fileName = `${crypto.randomUUID()}.jpg`;
      const filePath = `wines/${fileName}`; // lowercase pad

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

      // 3) Insert record in DB
      // Let op: TABLE_NAME + kolommen moeten bestaan in jouw schema.
      const payload: any = {
        name: name.trim(),
        producer: producer.trim() || null,
        vintage: vintage ? Number(vintage) : null,
        photo_url: photoUrl,
        photo_path: filePath,
      };

      const { error: insertErr } = await supabase.from(TABLE_NAME).insert(payload);
      if (insertErr) throw new Error(`Opslaan mislukt: ${insertErr.message}`);

      // 4) Reset en redirect
      setName("");
      setProducer("");
      setVintage("");
      setRawFile(null);
      setUploadFile(null);

      router.push(AFTER_SAVE_ROUTE);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Opslaan mislukt.");
    } finally {
      setBusy(false);
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
    fontSize: 16, // iOS: voorkomt zoom bij focus
  };

  const buttonStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #111827",
    background: busy ? "#374151" : "#111827",
    color: "white",
    fontWeight: 800,
    boxSizing: "border-box",
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.85 : 1,
  };

  return (
    <main style={containerStyle}>
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 10 }}>Wijn toevoegen</h1>

      <section style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Foto</div>

        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPickPhoto}
          style={{ width: "100%", boxSizing: "border-box" }}
          disabled={busy}
        />

        {busy && (
          <div style={{ marginTop: 10, fontSize: 14 }}>Foto wordt geoptimaliseerd…</div>
        )}

        {previewUrl && (
          <img
            src={previewUrl}
            alt="Preview"
            style={{
              width: "100%",
              marginTop: 10,
              borderRadius: 12,
              display: "block",
            }}
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
          <button type="submit" style={buttonStyle} disabled={busy}>
            {busy ? "Bezig…" : "Opslaan"}
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>
          Na opslaan ga je automatisch terug naar: <strong>{AFTER_SAVE_ROUTE}</strong>
        </div>
      </form>

      <div style={{ height: 24 }} />
    </main>
  );
}
