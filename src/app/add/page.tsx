"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGate from "@/app/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";

const BUCKET_NAME = "wine-photos"; // PAS AAN: exact je bucketnaam in Supabase Storage (hoofdletters tellen!)

export default function AddPage() {
  const router = useRouter();
  const params = useSearchParams();

  // Accepteer meerdere param namen (want scan-flow verschilt vaak)
  const photoPath =
    params.get("photo") ||
    params.get("photo_path") ||
    params.get("path") ||
    "";

  const [producer, setProducer] = useState(params.get("producer") || "");
  const [name, setName] = useState(params.get("name") || "");
  const [vintage, setVintage] = useState(params.get("vintage") || "");

  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [rating, setRating] = useState<number | null>(null);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Maak preview via signed URL (werkt ook als bucket private is)
  useEffect(() => {
    async function run() {
      setPhotoUrl(null);
      setPhotoErr(null);

      if (!photoPath) return;

      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(photoPath, 60 * 60);

      if (error) {
        setPhotoErr(error.message);
        return;
      }

      setPhotoUrl(data?.signedUrl ?? null);
    }

    run();
  }, [photoPath]);

  async function saveWine() {
    setError(null);
    setSaving(true);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      setError("Niet ingelogd (of auth error).");
      setSaving(false);
      return;
    }

    const payload = {
      user_id: user.id,
      producer: producer.trim(),
      name: name.trim(),
      vintage: vintage ? Number(vintage) : null,
      location: location.trim() || null,
      quantity: Number(quantity) || 0,
      rating,
      photo_path: photoPath || null, // <- dit moet vanaf nu gevuld zijn als photoPath bestaat
    };

    const { error: insertError } = await supabase.from("wines").insert(payload);

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push("/cellar");
  }

  return (
    <AuthGate>
      <main style={{ padding: 24, maxWidth: 520 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Wijn toevoegen</h1>

        <div style={{ marginTop: 10, fontSize: 13, color: "#444" }}>
          <b>Bucket:</b> {BUCKET_NAME}
          <br />
          <b>photoPath:</b> <code>{photoPath || "LEEG (komt niet door)"}</code>
        </div>

        {photoErr && (
          <div style={{ marginTop: 10, color: "#b00020", fontSize: 13 }}>
            Foto preview faalt: {photoErr}
          </div>
        )}

        {photoUrl && (
          <div style={{ marginTop: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt="Etiket"
              style={{
                width: "100%",
                maxHeight: 320,
                objectFit: "contain",
                borderRadius: 12,
                background: "#f5f5f5",
                border: "1px solid #eee",
              }}
            />
          </div>
        )}

        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <input value={producer} onChange={(e) => setProducer(e.target.value)} placeholder="Producent" style={inputStyle} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam / cuvée" style={inputStyle} />
          <input value={vintage} onChange={(e) => setVintage(e.target.value)} placeholder="Jaargang" inputMode="numeric" style={inputStyle} />

          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Locatie" style={inputStyle} />
          <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} placeholder="Aantal" style={inputStyle} />

          <div>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Jouw score</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRating(v)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
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
                  marginLeft: 6,
                  padding: "0 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: "#fff",
                  fontWeight: 900,
                }}
              >
                Reset
              </button>
            </div>
          </div>

          {error && <div style={{ color: "#b00020" }}>{error}</div>}

          <button
            onClick={saveWine}
            disabled={saving}
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 12,
              border: "1px solid #000",
              background: "#000",
              color: "#fff",
              fontWeight: 900,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Opslaan..." : "Opslaan in wijnkelder"}
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
