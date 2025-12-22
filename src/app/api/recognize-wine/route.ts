import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Match = {
  producer: string;
  name: string;
  vintage: number | null;
  confidence: number; // 0..100
  why: string[];
  imageUrl?: string | null;
  source?: {
    provider: "wikipedia";
    title: string;
    url: string;
    snippet?: string;
    lang: "en" | "fr";
  };
};

function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9à-öø-ÿ\s\-']/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripHtml(s: string) {
  return (s || "")
    .replace(/<\/?span[^>]*>/g, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .trim();
}

function findVintage(text: string): number | null {
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

function looksLikeDisambiguation(title: string, snippet: string) {
  const t = norm(title);
  const s = norm(snippet);
  return (
    t.includes("(disambiguation)") ||
    s.includes("may refer to") ||
    s.includes("peut faire référence à") ||
    s.includes("peut se référer à")
  );
}

function wineSignalsScore(text: string): number {
  const s = norm(text);

  const signals = [
    // EN
    "wine",
    "winery",
    "vineyard",
    "vineyards",
    "grape",
    "grapes",
    "appellation",
    "aoc",
    "aop",
    "doc",
    "docg",
    "chateau",
    "château",
    "domaine",
    "cru",
    "cuvee",
    "cuvée",
    "champagne",
    "sparkling",
    "red wine",
    "white wine",
    "rosé",
    "rose",

    // druiven / regio’s (vaak op wiki-snippets)
    "cabernet",
    "merlot",
    "pinot",
    "syrah",
    "shiraz",
    "tempranillo",
    "nebbiolo",
    "sangiovese",
    "sauvignon",
    "riesling",
    "bourgogne",
    "bordeaux",
    "rioja",
    "chianti",
    "barolo",
    "burgundy",
    "tuscany",
    "piemonte",
    "mendoza",
    "marlborough",

    // FR
    "vin",
    "vignoble",
    "viticole",
    "viticulture",
    "cépage",
    "appellation d origine",
    "appellation d'origine",
    "mis en bouteille",
  ];

  let score = 0;
  for (const w of signals) if (s.includes(w)) score += 2;

  // extra signalen
  if (s.includes("producer")) score += 2;
  if (s.includes("estate")) score += 1;

  return score;
}

function splitProducerNameFromTitle(title: string, producerGuess: string, nameGuess: string) {
  const t = (title || "").trim();
  const pg = producerGuess?.trim() || "";
  const ng = nameGuess?.trim() || "";

  const tNorm = norm(t);
  const pgNorm = norm(pg);

  if (pg && pgNorm && tNorm.includes(pgNorm)) {
    const rest = t.replace(new RegExp(pg, "i"), "").replace(/^\s*[-–:]\s*/, "").trim();
    return {
      producer: pg,
      name: rest || (ng || t),
    };
  }

  const sep = t.includes(" – ") ? " – " : t.includes(" - ") ? " - " : "";
  if (sep) {
    const [a, b] = t.split(sep).map((x) => x.trim());
    if (pg && norm(a).includes(pgNorm)) return { producer: a, name: b || ng || t };
    if (pg && norm(b).includes(pgNorm)) return { producer: b, name: a || ng || t };
    return { producer: a || pg, name: b || ng || t };
  }

  return {
    producer: pg || "",
    name: ng || t,
  };
}

function buildWineQuery(producerGuess: string, nameGuess: string, vintageGuess: string, lang: "en" | "fr") {
  const core = [producerGuess, nameGuess, vintageGuess].filter(Boolean).join(" ").trim();

  const ctxEN = ["wine", "winery", "vineyard", "appellation", "AOC", "DOC", "Domaine", "Château"];
  const ctxFR = ["vin", "domaine", "château", "vignoble", "appellation", "AOC", "AOP", "cépage"];

  const ctx = lang === "fr" ? ctxFR : ctxEN;

  // Maak het minder strikt dan voordien (geen quotes rond alles)
  // We zetten core + 2 contextwoorden (niet te veel, anders wordt het te smal)
  const q = [core, ctx[0], ctx[1]].filter(Boolean).join(" ").trim();
  return q;
}

async function wikipediaSearch(query: string, lang: "en" | "fr") {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?` +
    new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: query,
      format: "json",
      utf8: "1",
      srlimit: "12",
      srnamespace: "0",
      origin: "*",
    }).toString();

  const resp = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": "wijnkelder-app/1.0" },
    cache: "no-store",
  });

  if (!resp.ok) return [] as any[];
  const json = await resp.json();
  return json?.query?.search ?? [];
}

async function restSummaryThumbnail(title: string, lang: "en" | "fr"): Promise<string | null> {
  // Wikipedia REST: /page/summary/{title}
  // Geeft vaak "thumbnail" of "originalimage"
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title.replace(/ /g, "_")
  )}`;

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "wijnkelder-app/1.0" },
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return (
      json?.thumbnail?.source ||
      json?.originalimage?.source ||
      null
    );
  } catch {
    return null;
  }
}

async function wikipediaPageImages(titles: string[], lang: "en" | "fr"): Promise<Record<string, string>> {
  if (titles.length === 0) return {};

  const url =
    `https://${lang}.wikipedia.org/w/api.php?` +
    new URLSearchParams({
      action: "query",
      format: "json",
      prop: "pageimages",
      piprop: "thumbnail",
      pithumbsize: "320",
      titles: titles.join("|"),
      redirects: "1",
      origin: "*",
    }).toString();

  const resp = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": "wijnkelder-app/1.0" },
    cache: "no-store",
  });

  if (!resp.ok) return {};
  const json = await resp.json();
  const pages = json?.query?.pages ?? {};
  const out: Record<string, string> = {};

  for (const key of Object.keys(pages)) {
    const p = pages[key];
    const title = String(p?.title ?? "");
    const thumb = p?.thumbnail?.source;
    if (title && thumb) out[title] = String(thumb);
  }
  return out;
}

function scoreResult(
  title: string,
  snippet: string,
  producerGuess: string,
  nameGuess: string,
  vintageGuess: string
): { confidence: number; why: string[] } {
  const why: string[] = [];
  let s = 0;

  const hay = norm([title, snippet].filter(Boolean).join(" "));
  const pg = norm(producerGuess);
  const ng = norm(nameGuess);

  const wineSig = wineSignalsScore(title + " " + snippet);
  if (wineSig > 0) {
    const boost = Math.min(30, wineSig * 3);
    s += boost;
    why.push("Wijn-context gedetecteerd.");
  } else {
    s -= 10; // niet te hard straffen, we willen nog results tonen
    why.push("Weinig wijn-context (lager vertrouwen).");
  }

  if (pg && hay.includes(pg)) {
    s += 28;
    why.push(`Producent-token gevonden: "${producerGuess}"`);
  } else if (pg) {
    const toks = pg.split(" ").filter((t) => t.length >= 4);
    let hits = 0;
    for (const t of toks) if (hay.includes(t)) hits++;
    if (hits > 0) {
      s += Math.min(18, hits * 6);
      why.push(`Producent deels gevonden (${hits} token(s)).`);
    }
  }

  if (ng && hay.includes(ng)) {
    s += 22;
    why.push(`Naam-token gevonden: "${nameGuess}"`);
  } else if (ng) {
    const toks = ng.split(" ").filter((t) => t.length >= 4);
    let hits = 0;
    for (const t of toks) if (hay.includes(t)) hits++;
    if (hits > 0) {
      s += Math.min(14, hits * 5);
      why.push(`Naam deels gevonden (${hits} token(s)).`);
    }
  }

  const vFromGuess = findVintage(vintageGuess);
  const vInText = findVintage(hay);
  if (vFromGuess && vInText && vFromGuess === vInText) {
    s += 8;
    why.push(`Jaargang match: ${vFromGuess}`);
  } else if (vFromGuess) {
    s += 2;
    why.push(`Jaargang opgegeven: ${vFromGuess}`);
  }

  s = Math.max(0, Math.min(100, Math.round(s)));
  return { confidence: s, why };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const producerGuess = String(body?.producerGuess ?? "").trim();
    const nameGuess = String(body?.nameGuess ?? "").trim();
    const vintageGuess = String(body?.vintageGuess ?? "").trim();

    if (!producerGuess && !nameGuess) {
      return NextResponse.json(
        { ok: false, error: "Vul minstens producent of naam in om te zoeken." },
        { status: 400 }
      );
    }

    // Queries (EN + FR) met wijn-context maar niet té strikt
    const qEn = buildWineQuery(producerGuess, nameGuess, vintageGuess, "en");
    const qFr = buildWineQuery(producerGuess, nameGuess, vintageGuess, "fr");

    const [itemsEn, itemsFr] = await Promise.all([wikipediaSearch(qEn, "en"), wikipediaSearch(qFr, "fr")]);

    // Combineer en filter enkel disambiguation
    const combined: Array<{ title: string; snippet: string; lang: "en" | "fr" }> = [];

    for (const it of itemsEn || []) {
      const title = String(it?.title ?? "");
      const snippet = stripHtml(String(it?.snippet ?? ""));
      if (!title) continue;
      if (looksLikeDisambiguation(title, snippet)) continue;
      combined.push({ title, snippet, lang: "en" });
    }

    for (const it of itemsFr || []) {
      const title = String(it?.title ?? "");
      const snippet = stripHtml(String(it?.snippet ?? ""));
      if (!title) continue;
      if (looksLikeDisambiguation(title, snippet)) continue;
      combined.push({ title, snippet, lang: "fr" });
    }

    // Als er echt niets is, fallback
    if (combined.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          queryUsed: [producerGuess, nameGuess, vintageGuess].filter(Boolean).join(" ").trim(),
          matches: [
            {
              producer: producerGuess || "Onbekend",
              name: nameGuess || "Onbekend",
              vintage: findVintage(vintageGuess),
              confidence: 60,
              why: ["Geen resultaten gevonden. Gebruik jouw invoer."],
              imageUrl: null,
            },
          ],
        },
        { status: 200 }
      );
    }

    // Scoren en top N nemen vóór we thumbnails ophalen
    const scored = combined
      .map((it) => {
        const sc = scoreResult(it.title, it.snippet, producerGuess, nameGuess, vintageGuess);
        return { ...it, confidence: sc.confidence, why: sc.why };
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8); // neem iets meer zodat thumbnails nog kansen hebben

    // Thumbnails: eerst REST summary per item (beste kans), dan batch pageimages fallback
    const restThumbs: Record<string, string> = {};
    await Promise.all(
      scored.map(async (it) => {
        const t = await restSummaryThumbnail(it.title, it.lang);
        if (t) restThumbs[`${it.lang}:${it.title}`] = t;
      })
    );

    const enTitles = scored.filter((x) => x.lang === "en").map((x) => x.title);
    const frTitles = scored.filter((x) => x.lang === "fr").map((x) => x.title);

    const [enImgs, frImgs] = await Promise.all([
      wikipediaPageImages(enTitles, "en"),
      wikipediaPageImages(frTitles, "fr"),
    ]);

    const matches: Match[] = scored.map((it) => {
      const parts = splitProducerNameFromTitle(it.title, producerGuess, nameGuess);
      const v = findVintage(vintageGuess) ?? findVintage(it.snippet) ?? null;

      const pageUrl =
        it.lang === "fr"
          ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(it.title.replace(/ /g, "_"))}`
          : `https://en.wikipedia.org/wiki/${encodeURIComponent(it.title.replace(/ /g, "_"))}`;

      const restKey = `${it.lang}:${it.title}`;
      const img =
        restThumbs[restKey] ??
        (it.lang === "fr" ? frImgs[it.title] ?? null : enImgs[it.title] ?? null);

      return {
        producer: parts.producer || producerGuess || "",
        name: parts.name || nameGuess || it.title,
        vintage: v,
        confidence: it.confidence,
        why: it.why,
        imageUrl: img,
        source: {
          provider: "wikipedia",
          title: it.title,
          url: pageUrl,
          snippet: it.snippet.slice(0, 220),
          lang: it.lang,
        },
      };
    });

    // Top 5 teruggeven
    matches.sort((a, b) => b.confidence - a.confidence);

    return NextResponse.json(
      {
        ok: true,
        queryUsed: [producerGuess, nameGuess, vintageGuess].filter(Boolean).join(" ").trim(),
        matches: matches.slice(0, 5),
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 400 });
  }
}
