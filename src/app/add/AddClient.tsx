"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const BUILD_ID = "ADDCLIENT-DEBUG-2025-12-24-01";

// Pas aan indien nodig
const BUCKET_NAME = "wines-photos";
const TABLE_NAME = "wines";

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
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [photoBusy, setPhotoBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [status, setStatus] = useState<string>("Idle");
  const [lastActionTs, setLastActionTs] = useState<string>("");

  const [name, setName] = useState("");
  const [producer, setProducer] = useState("");
  const [vintage, setVintage] = useState("");

  useEffect(() => {
    const ts = new Date().toISOString();
    console.log(`[${BUILD_ID}] mounted at ${ts}`);
    setLastActionTs(ts);
  }, []);

  // Detecteer harde reloads: als dit telkens opnieuw “mounted” logt bij Opslaan,
  // dan is er effectief een page reload/remount.
  useEffect(() => {
    const handler = () => {
      const ts = new Date().toISOString();
      console.log(`[${BUILD_ID}] beforeunload at ${ts}`);
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

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
    setSavedMsg(null);

    if (photoBusy) return;

    const file = e.target.files?.[0] || null;
    if (!file) return;

    // zodat je dezelfde foto opnieuw kan kiezen
    e.target.value = "";

    setStatus("Foto gekozen — optimaliseren...");
    setRawFile(file);

    try {
      setPhotoBusy(true);
      const smaller = await downscaleImage(file);
      setUploadFile(smaller);
      setStatus("Foto klaar (verkleind) — klaar om op te slaan.");
      setLastActionTs(new Date().toISOString());
    } catch (err: any) {
      setUploadFile(null);
      setError(err?.message ?? "Foto verwerken mislukt.");
      setStatus("Fout bij foto verwerking.");
      setLastActionTs(new Date().toISOString());
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleSaveClick() {
    setError(null);
    setSavedMsg(null);

    console.log(`[${BUILD_ID}] Save clicked`);
    setLastActionTs(new Date().toISOString());

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

      setStatus("Stap 1/3: Upload naar storage...");
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

      setStatus("Stap 2/3: Public URL ophalen...");
      const { data: pub } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
      const photoUrl = pub?.publicUrl ?? null;

      setStatus("Stap 3/3: Record opslaan in database...");
      const payload: any = {
        name: name.trim(),
        producer: producer.trim() || null,
        vintage: vintage ? Number(vintage) : null,
        photo_url: photoUrl,
        photo_path: filePath,
      };

      const { error: insertErr } = await supabase.from(TABLE_NAME).insert(payload);
      if (insertErr) throw new Error(`Opslaan mislukt: ${insertErr.message}`);

      setStatus("Klaar: opgeslagen.");
      setSavedMsg("Opgeslagen. De wijn is toegevoegd.");
      setLastActionTs(new Date().toISOString());
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Opslaan mislukt.");
      setStatus("Fout bij opslaan.");
      setLastActionTs(new Date().toISOString());
    } finally {
      setSaveBusy(false);
    }
  }

  const containerStyle: React.CSSProperties = {
    padding: 16,
    maxWidth: 720,
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

  const buttonStyle: React.CSSProperties = {
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

  return (
    <main style={containerStyle}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>Wijn toevoegen</h1>

      {/* Onmiskenbare versie-indicator */}
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
        Build: <strong>{BUILD_ID}</strong>
      </div>

      {/* Statusblok */}
      <section style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>Status</div>
        <div style={{ fontSize: 13, lineHeight: 1.4 }}>
          <div><strong>State:</strong> {status}</div>
          <div><strong>Laatste actie:</strong> {lastActionTs}</div>
          <div><strong>photoBusy:</strong> {String(photoBusy)} | <strong>saveBusy:</strong> {String(saveBusy)}</div>
        </div>
      </section>

      {savedMsg && (
        <section style={{ ...cardStyle, borderColor: "#16a34a", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#166534" }}>{savedMsg}</div>
        </section>
      )}

      <section style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Foto</div>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPickPhoto}
          style={{ width: "100%", boxSizing: "border-box" }}
        />

        {previewUrl && (
          <img
            src={previewUrl}
            alt="Preview"
            style={{ width: "100%", marginTop: 10, borderRadius: 12, display: "block" }}
          />
        )}
      </section>

      <section style={{ marginTop: 14, ...cardStyle }}>
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
          <button type="button" style={buttonStyle} onClick={handleSaveClick} disabled={saveBusy}>
            {saveBusy ? "Bezig…" : "Opslaan"}
          </button>
        </div>
      </section>

      <div style={{ height: 24 }} />
    </main>
  );
}
