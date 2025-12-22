"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGate from "@/app/components/AuthGate";
import { supabase } from "@/lib/supabaseClient";

type Match = {
  producer: string;
  name: string;
  vintage: number | null;
  confidence: number;
  why: string[];
  imageUrl?: string | null;
  source?: {
    provider: "wikipedia";
    title: string;
    url: string;
    snippet?: string;
  };
};

export default function ScanPage() {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [producer, setProducer] = useState("");
  const [name, setName] = useState("");
  const [vintage, setVintage] = useState("");

  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [matches, setMatches] = useState<Match[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reset() {
    setMatches([]);
    setStatus(null);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);

    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);

    reset();
  }

  async function searchWine() {
    reset();

    if (!producer.trim() && !name.trim()) {
      setStatus("Vul minstens producent of naam in om te zoeken.");
      return;
    }

    setSearching(true);
    setStatus("Zoeken naar suggesties…");
    setMatches([]);

    try {
      const resp = await fetch("/api/recognize-wine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          producerGuess: producer.trim(),
          nameGuess: name.trim(),
          vintageGuess: vintage.trim(),
          ocrText: "",
        }),
      });

      const json = await resp.json();
      if (!json?.ok) {
        setStatus("Zoekfout: " + (json?.error ?? "onbekend"));
        setSearching(false);
        return;
      }

      setMatches((json.matches as Match[]) ?? []);
      setStatus("Kies de beste match of pas je invoer aan en zoek opnieuw.");
    } catch (e: any) {
      setStatus("Zoekfout: " + (e?.message ?? "onbekend"));
    } finally {
      setSearching(false);
    }
  }

  function useMatch(m: Match) {
    setProducer(m.producer || "");
    setName(m.name || "");
    setVintage(m.vintage ? String(m.vintage) : vintage);
    setStatus("Match gekozen. Je kan nu uploaden en verdergaan.");
  }

  async function uploadAndContinue() {
    if (!file) {
      setStatus("Neem of kies eerst een foto.");
      return;
    }
    if (!producer.trim() || !name.trim()) {
      setStatus("Vul minstens producent en naam in (eventueel via een match).");
      return;
    }

    setUploading(true);
    setStatus("Upload bezig…");

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) {
      setUploading(false);
      setStatus("Niet ingelogd.");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("wine-photos").upload(path, file, {
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

    if (error) {
      setUploading(false);
      setStatus("Upload fout: " + error.message);
      return;
    }

    const qp = new URLSearchParams();
    qp.set("photo", path);
    qp.set("producer", producer.trim());
    qp.set("name", name.trim());
    if (vintage.trim()) qp.set("vintage", vintage.trim());

    setUploading(false);
    router.push(`/add?${qp.toString()}`);
  }

  return (
    <AuthGate>
      <main style={{ padding: 24, maxWidth: 560 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Scan fles</h1>
          <Link href="/" style={{ textDecoration: "underline" }}>
            Home
          </Link>
        </div>

        <p style={{ marginTop: 12 }}>
          Foto blijft jouw referentie. “Zoek wijn” haalt gratis suggesties op en toont indien beschikbaar een afbeelding.
        </p>

        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <input type="file" accept="image/*" capture="environment" onChange={onPick} />

          {preview && (
            <div style={{ border: "1px solid #ccc", borderRadius: 12, padding: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="preview"
                style={{ width: "100%", borderRadius: 10, maxHeight: 360, objectFit: "contain" }}
              />

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <input
                  value={producer}
                  onChange={(e) => setProducer(e.target.value)}
                  placeholder="Producent (bv. Antinori)"
                  style={{ padding: 12, border: "1px solid #ccc", borderRadius: 10 }}
                />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Naam / Cuvée (bv. Tignanello)"
                  style={{ padding: 12, border: "1px solid #ccc", borderRadius: 10 }}
                />
                <input
                  value={vintage}
                  onChange={(e) => setVintage(e.target.value)}
                  placeholder="Jaargang (optioneel, bv. 2019)"
                  inputMode="numeric"
                  style={{ padding: 12, border: "1px solid #ccc", borderRadius: 10 }}
                />

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={searchWine}
                    disabled={searching || uploading}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 10,
                      border: "1px solid #ccc",
                      fontWeight: 900,
                    }}
                  >
                    {searching ? "Zoeken..." : "Zoek wijn"}
                  </button>

                  <button
                    onClick={uploadAndContinue}
                    disabled={uploading || searching}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 10,
                      border: "1px solid #000",
                      background: "#000",
                      color: "#fff",
                      fontWeight: 900,
                      opacity: uploading ? 0.7 : 1,
                    }}
                  >
                    {uploading ? "Uploaden..." : "Upload & verder"}
                  </button>
                </div>

                {status && <div style={{ marginTop: 6 }}>{status}</div>}
              </div>

              {matches.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Suggesties</div>

                  <div style={{ display: "grid", gap: 10 }}>
                    {matches.map((m, idx) => (
                      <div
                        key={idx}
                        style={{
                          border: "1px solid #ddd",
                          borderRadius: 12,
                          padding: 12,
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          {m.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.imageUrl}
                              alt="Match afbeelding"
                              style={{
                                width: 88,
                                height: 88,
                                borderRadius: 10,
                                objectFit: "cover",
                                background: "#f5f5f5",
                                border: "1px solid #eee",
                                flex: "0 0 auto",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 88,
                                height: 88,
                                borderRadius: 10,
                                background: "#f5f5f5",
                                border: "1px solid #eee",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 12,
                                color: "#777",
                                flex: "0 0 auto",
                                textAlign: "center",
                                padding: 6,
                              }}
                            >
                              Geen foto
                            </div>
                          )}

                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 900 }}>
                              {m.producer} – {m.name} {m.vintage ? `(${m.vintage})` : ""}
                            </div>

                            <div style={{ marginTop: 4, fontSize: 13, color: "#666" }}>
                              Score: <b>{m.confidence}</b>
                            </div>

                            {m.source?.snippet && (
                              <div style={{ marginTop: 8, fontSize: 13, color: "#444" }}>
                                {m.source.snippet}
                              </div>
                            )}
                          </div>
                        </div>

                        {m.why?.length > 0 && (
                          <ul style={{ marginTop: 0, paddingLeft: 18, color: "#444" }}>
                            {m.why.slice(0, 3).map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        )}

                        <div style={{ display: "flex", gap: 10 }}>
                          <button
                            onClick={() => useMatch(m)}
                            style={{
                              flex: 1,
                              padding: 10,
                              borderRadius: 10,
                              border: "1px solid #ccc",
                              fontWeight: 900,
                            }}
                          >
                            Gebruik deze
                          </button>

                          {m.source?.url && (
                            <a
                              href={m.source.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                flex: 1,
                                padding: 10,
                                borderRadius: 10,
                                border: "1px solid #ccc",
                                fontWeight: 900,
                                textAlign: "center",
                                textDecoration: "none",
                                color: "inherit",
                                display: "inline-block",
                              }}
                            >
                              Open bron
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 18 }}>
          <Link href="/cellar" style={{ textDecoration: "underline" }}>
            Naar Wijnkelder
          </Link>
        </div>
      </main>
    </AuthGate>
  );
}
