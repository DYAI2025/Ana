/**
 * The wording of the brief's facts (brief.ts) in each dashboard language. The numbers are put in by brief.ts and are the
 * same in every language (dot as decimal mark, "%" with a space), so the number check (numbersBacked) works alike for
 * all three; only the words around them change. Fact ids (F1, F2, …) are the same in every language for the same data.
 */
import type { Locale } from "@/lib/locale";
import type { TagField } from "./postTags";

export interface FactWords {
  /** unit of a difference between two percentages */
  pts: string;
  field: Record<TagField, string>;
  ana: Record<string, string>;
  split: (days: 7 | 30, source: string, t1: string, t2: string, t3: string) => string;
  t1VsMonth: (week: string, month: string, delta: string) => string;
  top1: (list: string) => string;
  cpm: string;
  /** one moving country: "TH (Tier 2) +15.0 Pkt" */
  move: (country: string, tier: number, delta: string) => string;
  rising: (list: string) => string;
  falling: (list: string) => string;
  whoWeek: string;
  whoMonth: string;
  ages: (list: string) => string;
  gender: (f: string, m: string) => string;
  history: (first: string, a: string, last: string, b: string, span: number) => string;
  allPosts: (er: string, n: number, ssr: string) => string;
  bestWorst: (field: string, best: string, bestPct: string, bestN: number, worst: string, worstPct: string, worstN: number) => string;
  ssrBest: (field: string, value: string, pct: string, n: number) => string;
  fresh: (n: number, er: string, vs: string | null, cats: string | null) => string;
  brand: (er: string, n: number, otherEr: string, otherN: number) => string;
  reach: (reach: string, followers: string) => string;
  hypName: (id: "H1" | "H4") => string;
  hypSignal: (name: string, mapped: number, index: string, up: number, down: number) => string;
  hypThin: (name: string, mapped: number) => string;
  hypLabel: (id: "H1" | "H4") => string;
  lean: (label: string, nH1: number, nH4: number) => string;
  noLean: (nH1: number, nH4: number) => string;
  limitHistory: (days: number, since: string, tagged: number, total: number) => string;
  limitMeta: string;
  limitSubstack: string;
}

const de: FactWords = {
  pts: "Pkt",
  field: { theme: "Thema", ana: "Ana im Bild", shot: "Bildart", hook: "Aufmacher", mood: "Stimmung", cta: "Aufforderung", format: "Format" },
  ana: { face: "Gesicht sichtbar", figure: "nur Figur / von weitem", none: "nicht im Bild" },
  split: (days, source, t1, t2, t3) => `Engagement der letzten ${days} Tage nach Werbemarkt (Annahme: ${source}): Tier 1 ${t1}, Tier 2 ${t2}, Tier 3 ${t3}.`,
  t1VsMonth: (week, month, delta) => `Tier-1-Anteil 7 Tage ${week} gegenüber 30 Tage ${month} (${delta}).`,
  top1: (list) => `Größte Tier-1-Länder (7 Tage): ${list}.`,
  cpm: "Größenordnung laut veröffentlichten Meta-CPM-Schätzungen 2026 (adamigo.ai): USA etwa 23 $, UK und Deutschland etwa 10 $, Indien etwa 2,60 $ pro 1000 Impressionen.",
  move: (c, tier, delta) => `${c} (Tier ${tier}) ${delta}`,
  rising: (list) => `Steigend (7 gegen 30 Tage): ${list}.`,
  falling: (list) => `Fallend (7 gegen 30 Tage): ${list}.`,
  whoWeek: "Wer in den letzten 7 Tagen reagiert hat",
  whoMonth: "Wer in den letzten 30 Tagen reagiert hat",
  ages: (list) => `Altersgruppen ${list}`,
  gender: (f, m) => `weiblich ${f}, männlich ${m}`,
  history: (first, a, last, b, span) => `Tier-1-Anteil im 7-Tage-Fenster am ${first}: ${a}, am ${last}: ${b} (${span} Tage auseinander).`,
  allPosts: (er, n, ssr) => `Alle Posts mit Insights: Interaktionsrate im Median ${er} (n ${n}), Save+Share-Rate im Median ${ssr}.`,
  bestWorst: (field, best, bp, bn, worst, wp, wn) => `${field}: höchste Interaktionsrate „${best}“ ${bp} (n ${bn}), niedrigste „${worst}“ ${wp} (n ${wn}).`,
  ssrBest: (field, value, pct, n) => `${field} nach Save+Share-Rate (behalten und weitergeben, Substack-Hinweis): am höchsten „${value}“ ${pct} (n ${n}).`,
  fresh: (n, er, vs, cats) => `Posts der letzten 7 Tage (n ${n}): der stärkste hat ${er} Interaktionsrate${vs ? ` (${vs}× Median)` : ""}${cats ? `, Kategorien ${cats}` : ""}.`,
  brand: (er, n, oer, on) => `Posts mit sichtbarer Marke: Interaktionsrate im Median ${er} (n ${n}); ohne Marke: ${oer} (n ${on}).`,
  reach: (reach, followers) => `Reichweite 28 Tage: ${reach}; Follower: ${followers}.`,
  hypName: (id) =>
    id === "H1"
      ? "Substack-Idee „Chancen-Newsletter“ (H1 Opportunity Drop: ausgewählte Jobs und Chancen für Creator-, UGC-, Remote- und Reisearbeit)"
      : "Substack-Idee „Vorlagen & Arbeitsdateien“ (H4 Working File: praktische Vorlagen und Dateien aus Anas Arbeit)",
  hypSignal: (name, mapped, index, up, down) =>
    `${name}: ${mapped} zugeordnete Posts; sie werden im Median ${index}× so oft gespeichert und geteilt wie übliche Posts desselben Formats (1.00× = üblich); ${up} darüber, ${down} darunter.`,
  hypThin: (name, mapped) => `${name}: ${mapped} zugeordnete Posts, zu wenige für ein Signal.`,
  hypLabel: (id) => (id === "H1" ? "„Chancen-Newsletter“ (H1)" : "„Vorlagen & Arbeitsdateien“ (H4)"),
  lean: (label, nH1, nH4) => `Zwischen den Substack-Ideen liegt ${label} vorn (verglichen ohne Überschneidung: ${nH1} Posts zu H1, ${nH4} Posts zu H4). Keine Entscheidung.`,
  noLean: (nH1, nH4) => `Zwischen den Substack-Ideen „Chancen-Newsletter“ (H1) und „Vorlagen & Arbeitsdateien“ (H4) gibt es noch keine Tendenz (${nH1} gegen ${nH4} Posts).`,
  limitHistory: (days, since, tagged, total) => `Gespeicherte Tagesstände der Zielgruppe: ${days} (seit ${since}). Post-Kategorien gelesen für ${tagged} von ${total} Posts.`,
  limitMeta:
    "Meta liefert Länder, Alter und Geschlecht nur für das ganze Konto (bis 48 h verzögert, erst ab 100 Interaktionen), nicht pro Post: ein Zusammenhang zwischen einer Post-Art und einer Zielgruppe lässt sich nur über viele Wochen als Korrelation zeigen.",
  limitSubstack: "Substack, Link-Klicks und Verkäufe sind nicht verbunden: Nachfrage lässt sich hier nicht messen, nur Vorzeichen auf Instagram.",
};

const en: FactWords = {
  pts: "pts",
  field: { theme: "Topic", ana: "Ana in the picture", shot: "Kind of shot", hook: "Opening", mood: "Mood", cta: "Call to action", format: "Format" },
  ana: { face: "face visible", figure: "only her figure / from afar", none: "not in the picture" },
  split: (days, source, t1, t2, t3) => `Engagement of the last ${days} days by ad market (assumption: ${source}): Tier 1 ${t1}, Tier 2 ${t2}, Tier 3 ${t3}.`,
  t1VsMonth: (week, month, delta) => `Tier-1 share 7 days ${week} against 30 days ${month} (${delta}).`,
  top1: (list) => `Largest tier-1 countries (7 days): ${list}.`,
  cpm: "Order of magnitude from published Meta CPM estimates 2026 (adamigo.ai): USA about $23, UK and Germany about $10, India about $2.60 per 1000 impressions.",
  move: (c, tier, delta) => `${c} (Tier ${tier}) ${delta}`,
  rising: (list) => `Rising (7 against 30 days): ${list}.`,
  falling: (list) => `Falling (7 against 30 days): ${list}.`,
  whoWeek: "Who reacted in the last 7 days",
  whoMonth: "Who reacted in the last 30 days",
  ages: (list) => `age groups ${list}`,
  gender: (f, m) => `female ${f}, male ${m}`,
  history: (first, a, last, b, span) => `Tier-1 share in the 7-day window on ${first}: ${a}, on ${last}: ${b} (${span} days apart).`,
  allPosts: (er, n, ssr) => `All posts with insights: median interaction rate ${er} (n ${n}), median save+share rate ${ssr}.`,
  bestWorst: (field, best, bp, bn, worst, wp, wn) => `${field}: highest interaction rate "${best}" ${bp} (n ${bn}), lowest "${worst}" ${wp} (n ${wn}).`,
  ssrBest: (field, value, pct, n) => `${field} by save+share rate (kept and passed on, a Substack hint): highest "${value}" ${pct} (n ${n}).`,
  fresh: (n, er, vs, cats) => `Posts of the last 7 days (n ${n}): the strongest has ${er} interaction rate${vs ? ` (${vs}× median)` : ""}${cats ? `, categories ${cats}` : ""}.`,
  brand: (er, n, oer, on) => `Posts with a visible brand: median interaction rate ${er} (n ${n}); without a brand: ${oer} (n ${on}).`,
  reach: (reach, followers) => `Reach 28 days: ${reach}; followers: ${followers}.`,
  hypName: (id) =>
    id === "H1"
      ? 'Substack idea "Opportunity newsletter" (H1 Opportunity Drop: hand-picked jobs and opportunities for creator, UGC, remote and travel work)'
      : 'Substack idea "Templates & working files" (H4 Working File: practical templates and files from Ana\'s work)',
  hypSignal: (name, mapped, index, up, down) =>
    `${name}: ${mapped} assigned posts; in the median they are saved and shared ${index}× as often as usual posts of the same format (1.00× = usual); ${up} above, ${down} below.`,
  hypThin: (name, mapped) => `${name}: ${mapped} assigned posts, too few for a signal.`,
  hypLabel: (id) => (id === "H1" ? '"Opportunity newsletter" (H1)' : '"Templates & working files" (H4)'),
  lean: (label, nH1, nH4) => `Between the Substack ideas, ${label} is ahead (compared without overlap: ${nH1} posts for H1, ${nH4} posts for H4). No decision.`,
  noLean: (nH1, nH4) => `Between the Substack ideas "Opportunity newsletter" (H1) and "Templates & working files" (H4) there is no tendency yet (${nH1} against ${nH4} posts).`,
  limitHistory: (days, since, tagged, total) => `Stored daily snapshots of the audience: ${days} (since ${since}). Post categories read for ${tagged} of ${total} posts.`,
  limitMeta:
    "Meta gives countries, age and gender only for the whole account (up to 48 h late, only from 100 interactions on), not per post: a link between a kind of post and an audience can only show up as a correlation over many weeks.",
  limitSubstack: "Substack, link clicks and sales are not connected: demand cannot be measured here, only early signs on Instagram.",
};

const it: FactWords = {
  pts: "pti",
  field: { theme: "Tema", ana: "Ana nell'immagine", shot: "Tipo di inquadratura", hook: "Apertura", mood: "Atmosfera", cta: "Invito all'azione", format: "Formato" },
  ana: { face: "volto visibile", figure: "solo la figura / da lontano", none: "non nell'immagine" },
  split: (days, source, t1, t2, t3) => `Engagement degli ultimi ${days} giorni per mercato pubblicitario (ipotesi: ${source}): Tier 1 ${t1}, Tier 2 ${t2}, Tier 3 ${t3}.`,
  t1VsMonth: (week, month, delta) => `Quota Tier 1: 7 giorni ${week} contro 30 giorni ${month} (${delta}).`,
  top1: (list) => `Paesi Tier 1 più grandi (7 giorni): ${list}.`,
  cpm: "Ordine di grandezza secondo stime CPM di Meta pubblicate per il 2026 (adamigo.ai): USA circa 23 $, Regno Unito e Germania circa 10 $, India circa 2,60 $ per 1000 impressioni.",
  move: (c, tier, delta) => `${c} (Tier ${tier}) ${delta}`,
  rising: (list) => `In crescita (7 contro 30 giorni): ${list}.`,
  falling: (list) => `In calo (7 contro 30 giorni): ${list}.`,
  whoWeek: "Chi ha reagito negli ultimi 7 giorni",
  whoMonth: "Chi ha reagito negli ultimi 30 giorni",
  ages: (list) => `fasce d'età ${list}`,
  gender: (f, m) => `donne ${f}, uomini ${m}`,
  history: (first, a, last, b, span) => `Quota Tier 1 nella finestra di 7 giorni il ${first}: ${a}, il ${last}: ${b} (a ${span} giorni di distanza).`,
  allPosts: (er, n, ssr) => `Tutti i post con insights: tasso di interazione mediano ${er} (n ${n}), tasso mediano di salvataggi+condivisioni ${ssr}.`,
  bestWorst: (field, best, bp, bn, worst, wp, wn) => `${field}: tasso di interazione più alto «${best}» ${bp} (n ${bn}), più basso «${worst}» ${wp} (n ${wn}).`,
  ssrBest: (field, value, pct, n) => `${field} per tasso di salvataggi+condivisioni (tenuto e passato ad altri, indizio per Substack): più alto «${value}» ${pct} (n ${n}).`,
  fresh: (n, er, vs, cats) => `Post degli ultimi 7 giorni (n ${n}): il più forte ha un tasso di interazione di ${er}${vs ? ` (${vs}× la mediana)` : ""}${cats ? `, categorie ${cats}` : ""}.`,
  brand: (er, n, oer, on) => `Post con un marchio visibile: tasso di interazione mediano ${er} (n ${n}); senza marchio: ${oer} (n ${on}).`,
  reach: (reach, followers) => `Copertura 28 giorni: ${reach}; follower: ${followers}.`,
  hypName: (id) =>
    id === "H1"
      ? "Idea Substack «Newsletter delle opportunità» (H1 Opportunity Drop: lavori e opportunità selezionati per lavoro da creator, UGC, da remoto e in viaggio)"
      : "Idea Substack «Modelli e file di lavoro» (H4 Working File: modelli e file pratici dal lavoro di Ana)",
  hypSignal: (name, mapped, index, up, down) =>
    `${name}: ${mapped} post associati; in mediana vengono salvati e condivisi ${index}× rispetto ai post usuali dello stesso formato (1.00× = usuale); ${up} sopra, ${down} sotto.`,
  hypThin: (name, mapped) => `${name}: ${mapped} post associati, troppo pochi per un segnale.`,
  hypLabel: (id) => (id === "H1" ? "«Newsletter delle opportunità» (H1)" : "«Modelli e file di lavoro» (H4)"),
  lean: (label, nH1, nH4) => `Tra le idee Substack è avanti ${label} (confronto senza sovrapposizioni: ${nH1} post per H1, ${nH4} post per H4). Nessuna decisione.`,
  noLean: (nH1, nH4) => `Tra le idee Substack «Newsletter delle opportunità» (H1) e «Modelli e file di lavoro» (H4) non c'è ancora una tendenza (${nH1} contro ${nH4} post).`,
  limitHistory: (days, since, tagged, total) => `Istantanee giornaliere del pubblico salvate: ${days} (dal ${since}). Categorie lette per ${tagged} di ${total} post.`,
  limitMeta:
    "Meta fornisce paesi, età e genere solo per l'intero account (fino a 48 h di ritardo, solo da 100 interazioni in su), non per singolo post: un legame tra un tipo di post e un pubblico può emergere solo come correlazione su molte settimane.",
  limitSubstack: "Substack, clic sui link e vendite non sono collegati: qui la domanda non si può misurare, solo segnali anticipati su Instagram.",
};

export const FACT_WORDS: Readonly<Record<Locale, FactWords>> = { de, en, it };
