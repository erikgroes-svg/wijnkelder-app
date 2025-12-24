"use client";

import React, { useEffect, useMemo, useState } from "react";

async function downscaleImage(file: File, maxW = 1600, maxH = 1600, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(maxW / bitmap.width, maxH / bitmap.height, 1);
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", quality);
  });

  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

export default function AddClient() {
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voorbeeldvelden
  const [name, setName] = useState("");
  const [producer, setProducer] = useState("");
  const [vintage, setVintage] = useState("");

  // Object URL cleanup
  useEffect(() => {
    if (!rawFile) return;
    const url = URL.createObjectURL(rawFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [rawFile]);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0] || null;
    if (!file) return;

    setRawFile(file);

    // Cruciaal: downscale async, zodat Safari niet "bevriest"
    try {
      setBusy(true);
      const smaller = await downscaleImage(file);
      setUploadFile(smaller);
    } catch (err: any) {
      setError(err?.message ?? "Foto verwerken mislukt.");
      setUploadFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); // voorkomt iOS reload / “vastlopen” door submit
    setError(null);

    // Hier doe je je echte save/upload
    // Belangrijk: gebruik uploadFile (verkleinde jpeg), niet rawFile/base64
    if (!uploadFile) {
      setError("Kies eerst een foto.");
      return;
    }

    // TODO: upload naar Supabase Storage + data in DB
    alert("OK (demo). Hier komt je save-logica.");
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
  };

  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, marginTop: 12 };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    boxSizing: "border-box",
    fontSize: 16, // iOS: voorkomt ongewenste zoom bij focus
  };

  const buttonStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #111827",
    background: "#111827",
    color: "white",
    fontWeight: 800,
    boxSizing: "border-box",
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
        />

        {busy && (
          <div style={{ marginTop: 10, fontSize: 14 }}>
            Foto wordt geoptimaliseerd…
          </div>
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
          <button type="submit" style={buttonStyle} disabled={busy}>
            Opslaan
          </button>
        </div>
      </form>

      <div style={{ height: 24 }} />
    </main>
  );
}
