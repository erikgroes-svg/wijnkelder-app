"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

  drink_from_year: number | null;
  drink_to_year: number | null;
};

function stars(rating: number | null) {
  const r = rating ?? 0;
  return "★".repeat(r) + "☆".repeat(5 - r);
}

function extFromMime(mime: string) {
  const m = (mime || "").toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  return "jpg";
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

export default function WineDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [wine, setWine] = useState<Wine | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [brokenImg, setBrokenImg] = useState(false);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const title = useMemo(() => {
    if (!wine) return "Wijn";
    return `${wine.producer} – ${wine.name}${wine.vintage ? ` (${wine.vintage})` : ""}`;
  }, [wine]);

  const drinkStatus = useMemo(() => {
    if (!wine) return { label: "", tone: "neutral" as const };

    const y = thisYear();
    const from = wine.drink_from_year;
    const to = wine.drink_to_year;

    if (!from && !to) return { label: "Geen drinkvenster ingesteld", tone: "neutral" as const };

    if (from && y < from) return { label: `Te vroeg (vanaf ${from})`, tone: "warn" as const };
    if (to && y > to) return { label: `Voorbij drinkvenster (tot ${to})`, tone: "bad" as const };

    if (from && to) return { label: `Nu drinken (${from}–${to})`, tone: "good" as const };
    if (from && !to) return { label: `Nu drinken (vanaf ${from})`, tone: "good" as const };
    return { label: `Nu drinken (tot ${to})`, tone: "good" as const };
  }, [wine]);

  async function refreshSignedPhoto(path: string | null) {
    setBrokenImg(false);
    if (!path) {
      setPhotoUrl(null);
      return;
    }
    const { data: signed, error: sErr } = await supabase.storage.from(BUCKET_NAME).createSignedUrl(path, 60 * 60);
    if (sErr) {
      setPhotoUrl(null);
      return;
    }
    setPhotoUrl(signed?.signedUrl ?? null);
  }

  async function load() {
    setStatus(null);
    setBrokenImg(false);

    const { data, error } = await supabase
      .from("wines")
      .select(
        "id, producer, name, vintage, location, quantity, rating, photo_path, purchase_date, price, drink_from_year, drink_to_year"
      )
      .eq("id", id)
      .single();

    if (error) {
      setStatus("Fout bij laden: " + error.message);
      return;
    }

    const w = data as Wine;
    setWine(w);
    await refreshSignedPhoto(w.photo_path);
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
      drink_from_year: clampYear(wine.drink_from_year),
      drink_to_year: clampYear(wine.drink_to_year),
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

  function onClickReplacePhoto() {
    setStatus(null);
    fileInputRef.current?.click();
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      if (!wine) return;

      const file = e.target.files?.[0] || null;
      e.target.value = "";
      if (!file) return;

      setUploading(true);
      setStatus(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        setUploading(false);
        setStatus("Niet ingelogd.");
        return;
      }

      const ext = extFromMime(file.type);
      const newPath = `${user.id}/${wine.id}-${Date.now()}.${ext}`.toLowerCase();

      const up = await supabase.storage.from(BUCKET_NAME).upload(newPath, file, {
        upsert: false,
        contentType: file.type || "image/jpeg",
      });

      if (up.error) {
        setUploading(false);
        setStatus("Fout bij upload: " + up.error.message);
        return;
      }

      const { error: updErr } = await supabase.from("wines").update({ photo_path: newPath }).eq("id", wine.id);
      if (updErr) {
        setUploading(false);
        setStatus("Fout bij opslaan photo_path: " + updErr.message);
        return;
      }

      if (wine.photo_path) {
        await supabase.storage.from(BUCKET_NAME).remove([wine.photo_path]);
      }

      const updated: Wine = { ...wine, photo_path: newPath };
      setWine(updated);
      await refreshSignedPhoto(newPath);

      setUploading(false);
      setStatus("Foto vervangen.");
    } catch (err) {
      console.error(err);
      setUploading(false);
      setStatus("Onverwachte fout bij foto vervangen.");
    }
  }

  function bumpWindow(preset: "now+1" | "now+3" | "now+5" | "clear") {
    if (!wine) return;
    const y = thisYear();

    if (preset === "clear") {
      setWine({ ...wine, drink_from_year: null, drink_to_year: null });
      return;
    }

    const add = preset === "now+1" ? 1 : preset === "now+3" ? 3 : 5;
    setWine({
      ...wine,
      drink_from_year: y,
      drink_to_year: y + add,
    });
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

  const drinkToneStyle =
    drinkStatus.tone === "good"
      ? { border: "1px solid #0a0", color: "#0a0" }
      : drinkStatus.tone === "warn"
      ? { border: "1px solid #b8860b", color: "#b8860b" }
      : drinkStatus.tone === "bad"
      ? { border: "1px solid #b00020", color: "#b00020" }
      : { border: "1px solid #ccc", color: "#444" };

  return (
    <AuthGate>
      <main style={{ padding: 24, maxWidth: 720 }}>
        <div style={{ marginBottom: 12 }}>
          <Link href="/cellar" style={{ textDecoration: "underline" }}>
            ← Terug naar wijnkelder
          </Link>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 900 }}>{title}</h1>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onFileSelected}
          style={{ display: "none" }}
        />

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

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={onClickReplacePhoto} disabled={uploading} style={primaryBtn} type="button">
            {uploading ? "Uploaden..." : "Foto vervangen"}
          </button>

          <button onClick={() => refreshSignedPhoto(wine.photo_path)} disabled={uploading} style={secondaryBtn} type="button">
            Foto herladen
          </button>
        </div>

        {/* Drinkvenster status */}
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            background: "#fff",
            fontWeight: 900,
            ...drinkToneStyle,
          }}
        >
          {drinkStatus.label}
        </div>

        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          {/* Drinkvenster velden */}
          <div style={{ display: "grid", gap: 10, padding: 12, borderRadius: 12, border: "1px solid #eee", background: "#fafafa" }}>
            <div style={{ fontWeight: 900 }}>Drinkvenster (jaartal)</div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={() => bumpWindow("now+1")} style={secondaryBtn}>
                Nu → +1 jaar
              </button>
              <button type="button" onClick={() => bumpWindow("now+3")} style={secondaryBtn}>
                Nu → +3 jaar
              </button>
              <button type="button" onClick={() => bumpWindow("now+5")} style={secondaryBtn}>
                Nu → +5 jaar
              </button>
              <button type="button" onClick={() => bumpWindow("clear")} style={secondaryBtn}>
                Wissen
              </button>
            </div>

            <label style={labelStyle}>
              Drink vanaf (jaar)
              <input
                style={inputStyle}
                type="number"
                inputMode="numeric"
                placeholder={`${thisYear()}`}
                value={wine.drink_from_year ?? ""}
                onChange={(e) =>
                  setWine({ ...wine, drink_from_year: e.target.value ? Number(e.target.value) : null })
                }
              />
            </label>

            <label style={labelStyle}>
              Drink tot (jaar)
              <input
                style={inputStyle}
                type="number"
                inputMode="numeric"
                placeholder={`${thisYear() + 3}`}
                value={wine.drink_to_year ?? ""}
                onChange={(e) =>
                  setWine({ ...wine, drink_to_year: e.target.value ? Number(e.target.value) : null })
                }
              />
            </label>

            <div style={{ fontSize: 12, color: "#666" }}>
              Tip: laat “tot” leeg als je geen eindjaar wil vastleggen.
            </div>
          </div>

          {/* Overige velden */}
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

          <div style={{ fontWeight: 900 }}>Aantal: {wine.quantity}</div>

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

          <button onClick={save} disabled={saving || uploading} style={saveBtn} type="button">
            {saving ? "Opslaan..." : "Opslaan"}
          </button>

          <button onClick={deleteWine} disabled={uploading} style={deleteBtn} type="button">
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

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontWeight: 800,
  color: "#333",
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
