"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGate from "@/app/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";

export default function AddPage() {
  const router = useRouter();
  const params = useSearchParams();

  // 👉 DIT IS CRUCIAAL
  const photoPath = params.get("photo"); // bv. userId/123456.jpg

  const [producer, setProducer] = useState(params.get("producer") || "");
  const [name, setName] = useState(params.get("name") || "");
  const [vintage, setVintage] = useState(params.get("vintage") || "");

  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [rating, setRating] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveWine() {
    setError(null);
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Niet ingelogd");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("wines").insert({
      user_id: user.id,
      producer,
      name,
      vintage: vintage ? Number(vintage) : null,
      location: location || null,
      quantity,
      rating,
      photo_path: photoPath || null, // ✅ HIER GEBEURT HET
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    router.push("/cellar");
  }

  return (
    <AuthGate>
      <main style={{ padding: 24, maxWidth: 520 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Wijn toevoegen</h1>

        {photoPath && (
          <div style={{ margin: "12px 0", fontSize: 13, color: "#666" }}>
            Foto gekoppeld: <code>{photoPath}</code>
          </div>
        )}

        <div style={{ display: "grid", gap: 12 }}>
          <input value={producer} onChange={(e) => setProducer(e.target.value)} placeholder="Producent" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam" />
          <input value={vintage} onChange={(e) => setVintage(e.target.value)} placeholder="Jaargang" />

          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Locatie" />
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            placeholder="Aantal"
          />

          <div>
            <b>Score</b>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  onClick={() => setRating(v)}
                  style={{
                    width: 40,
                    height: 40,
                    fontWeight: 900,
                    background: rating && rating >= v ? "#000" : "#fff",
                    color: rating && rating >= v ? "#fff" : "#000",
                    border: "1px solid #ccc",
                    borderRadius: 8,
                  }}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          {error && <div style={{ color: "red" }}>{error}</div>}

          <button
            onClick={saveWine}
            disabled={saving}
            style={{
              marginTop: 12,
              padding: 14,
              fontWeight: 900,
              background: "#000",
              color: "#fff",
              borderRadius: 10,
            }}
          >
            {saving ? "Opslaan..." : "Opslaan in wijnkelder"}
          </button>
        </div>
      </main>
    </AuthGate>
  );
}
