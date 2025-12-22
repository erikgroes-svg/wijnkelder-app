"use client";

import React, { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Deze component gebruikt useSearchParams() en MOET daarom binnen <Suspense> staan.
 * We houden hem bewust klein en geïsoleerd.
 */
function SearchParamsReader({
  children,
}: {
  children: (params: { editId: string | null }) => React.ReactNode;
}) {
  const sp = useSearchParams();
  const editId = sp.get("id"); // bv. /add?id=123 om een bestaande fles te bewerken
  return <>{children({ editId })}</>;
}

type BottleFormState = {
  name: string;
  producer: string;
  country: string;
  region: string;
  vintage: string;
  grapes: string;
  quantity: string;
  location: string; // vrije tekst (vak/rek, etc.)
  notes: string;
};

const initialState: BottleFormState = {
  name: "",
  producer: "",
  country: "",
  region: "",
  vintage: "",
  grapes: "",
  quantity: "1",
  location: "",
  notes: "",
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 38,
          padding: "0 10px",
          border: "1px solid #ddd",
          borderRadius: 10,
          outline: "none",
        }}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        style={{
          padding: 10,
          border: "1px solid #ddd",
          borderRadius: 10,
          outline: "none",
          resize: "vertical",
        }}
      />
    </label>
  );
}

export default function AddClient() {
  const [form, setForm] = useState<BottleFormState>(initialState);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const isValid = useMemo(() => {
    // Minimale validatie: naam + aantal
    const qty = Number(form.quantity);
    return form.name.trim().length > 0 && Number.isFinite(qty) && qty > 0;
  }, [form.name, form.quantity]);

  function set<K extends keyof BottleFormState>(key: K, value: BottleFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(editId: string | null) {
    if (!isValid) {
      setStatus({ kind: "error", message: "Vul minstens ‘Wijnnaam’ in en een geldig aantal." });
      return;
    }

    setStatus({ kind: "saving" });

    try {
      // TODO: hier komt later je Supabase insert/update
      // Voor nu simuleren we een save zodat je pagina werkt en de build slaagt.
      await new Promise((r) => setTimeout(r, 400));

      if (editId) {
        setStatus({ kind: "saved", message: `Opgeslagen (bewerken: id=${editId}).` });
      } else {
        setStatus({ kind: "saved", message: "Opgeslagen (nieuwe toevoeging)." });
      }

      // Optioneel: reset enkel bij "nieuw"
      if (!editId) {
        setForm(initialState);
      }
    } catch (e: any) {
      setStatus({ kind: "error", message: e?.message ?? "Onbekende fout bij opslaan." });
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 820 }}>
      <header style={{ display: "grid", gap: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Toevoegen</h1>
        <div style={{ color: "#555", fontSize: 13 }}>
          Tip: gebruik <code>/add?id=...</code> om later “bewerken” te ondersteunen.
        </div>
      </header>

      <section
        style={{
          marginTop: 16,
          border: "1px solid #eee",
          borderRadius: 14,
          padding: 16,
        }}
      >
        {/* Dit is de cruciale fix: useSearchParams() zit enkel binnen Suspense */}
        <Suspense fallback={<div style={{ padding: 8 }}>Laden…</div>}>
          <SearchParamsReader>
            {({ editId }) => (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: 13, color: "#333" }}>
                    Modus:{" "}
                    <strong>{editId ? `Bewerken (id=${editId})` : "Nieuw"}</strong>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setForm(initialState);
                      setStatus({ kind: "idle" });
                    }}
                    style={{
                      height: 34,
                      padding: "0 12px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    Reset
                  </button>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onSubmit(editId);
                  }}
                  style={{ display: "grid", gap: 14 }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <Field
                      label="Wijnnaam"
                      value={form.name}
                      onChange={(v) => set("name", v)}
                      placeholder="Bijv. Chablis 1er Cru"
                    />
                    <Field
                      label="Producent"
                      value={form.producer}
                      onChange={(v) => set("producer", v)}
                      placeholder="Bijv. Domaine X"
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <Field
                      label="Land"
                      value={form.country}
                      onChange={(v) => set("country", v)}
                      placeholder="Bijv. Frankrijk"
                    />
                    <Field
                      label="Regio"
                      value={form.region}
                      onChange={(v) => set("region", v)}
                      placeholder="Bijv. Bourgogne"
                    />
                    <Field
                      label="Jaargang"
                      value={form.vintage}
                      onChange={(v) => set("vintage", v)}
                      placeholder="Bijv. 2020"
                      type="number"
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr",
                      gap: 12,
                    }}
                  >
                    <Field
                      label="Druiven"
                      value={form.grapes}
                      onChange={(v) => set("grapes", v)}
                      placeholder="Bijv. Chardonnay"
                    />
                    <Field
                      label="Aantal flessen"
                      value={form.quantity}
                      onChange={(v) => set("quantity", v)}
                      placeholder="1"
                      type="number"
                    />
                  </div>

                  <Field
                    label="Locatie in kelder"
                    value={form.location}
                    onChange={(v) => set("location", v)}
                    placeholder="Bijv. Vak A3 / rek 2"
                  />

                  <TextArea
                    label="Notities"
                    value={form.notes}
                    onChange={(v) => set("notes", v)}
                    placeholder="Proefnotities, aankoopinfo, food pairing, …"
                  />

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      type="submit"
                      disabled={status.kind === "saving"}
                      style={{
                        height: 40,
                        padding: "0 14px",
                        borderRadius: 10,
                        border: "1px solid #111",
                        background: status.kind === "saving" ? "#eee" : "#111",
                        color: status.kind === "saving" ? "#111" : "white",
                        cursor: status.kind === "saving" ? "not-allowed" : "pointer",
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    >
                      {status.kind === "saving"
                        ? "Opslaan…"
                        : editId
                        ? "Wijzigingen opslaan"
                        : "Toevoegen"}
                    </button>

                    {!isValid && (
                      <div style={{ fontSize: 13, color: "#a00" }}>
                        Vereist: wijnnaam en geldig aantal.
                      </div>
                    )}
                  </div>

                  {status.kind === "saved" && (
                    <div style={{ fontSize: 13, color: "#0a6" }}>{status.message}</div>
                  )}
                  {status.kind === "error" && (
                    <div style={{ fontSize: 13, color: "#a00" }}>{status.message}</div>
                  )}
                </form>
              </>
            )}
          </SearchParamsReader>
        </Suspense>
      </section>
    </main>
  );
}
