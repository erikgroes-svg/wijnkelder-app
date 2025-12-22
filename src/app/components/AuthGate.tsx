"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) setStatus(error.message);
  }

  if (loading) return <div>Bezig met laden…</div>;

  if (!session) {
    return (
      <div style={{ padding: 24, maxWidth: 420 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Wijnkelder</h1>

        <form onSubmit={signIn} style={{ marginTop: 16 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            style={{ padding: 12, width: "100%", marginBottom: 10 }}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Wachtwoord"
            type="password"
            style={{ padding: 12, width: "100%", marginBottom: 12 }}
          />
          <button type="submit" style={{ padding: 12, width: "100%" }}>
            Inloggen
          </button>
        </form>

        {status && <p style={{ marginTop: 12 }}>{status}</p>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: 12 }}>
        <button onClick={() => supabase.auth.signOut()} style={{ fontSize: 14 }}>
          Uitloggen
        </button>
      </div>
      {children}
    </div>
  );
}
