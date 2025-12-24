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
const AFTER_SAVE_ROUTE = "/";

// Key om form-data te bewaren tijdens iOS/Safari refresh/remount
const DRAFT_KEY = "add_wine_draft_v1";

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

  // Split busy: foto-verwerking vs opslaan
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Form velden
  const [name, setName] = useState("");
  const [producer, setProducer] = useState("");
  const [vintage, setVintage] = useState("");

  // 1) Herstel draft bij mount (iOS Safari kan remounten)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (typeof d?.name === "string") setName(d.name);
      if (typeof d?.producer === "string") setProducer(d.producer);
      if (typeof d?.vintage === "string") setVintage(d.vintage);
    } catch {
      // negeren
    }
  }, []);

  // 2) Bewaar draft bij wijziging
  useEffect(() => {
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ name, producer, vintage })
      );
    } catch {
      // negeren
    }
  }, [name, producer, vintage]);

  // 3) Object URL preview + cleanup
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

    // iOS kan soms twee keer onChange afvuren; guard.
    if (photoBusy) return;

    const file = e.target.files?.[0] || null;
    if (!file) return;

    // Belangrijk: maak het mogelijk om dezelfde foto opnieuw te kiezen
    // zonder dat Safari vast blijft hangen in "zelfde bestand" toestand.
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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

      // Upload foto
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

      // Public URL (enkel als bucket public is)
      const { data: pub } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
      const photoUrl = pub?.publicUrl ?? null;

      const payload: any = {
        name: name.trim(),
        producer: producer.trim() || null,
        vintage: vintage ? Number(vintage) : null,
        photo_url: photoUrl,
        photo_path: filePath,
      };

      const { error: insertErr } = await supabase.from(TABLE_NAME).insert(payload);
      if (insertErr) throw new Error(`Opslaan mislukt: ${insertErr.message}`);

      // Succes: draft wissen + reset + redirect
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      }
