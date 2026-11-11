# Pixelkiez Website-Diagnose – helferbär.de (Helferbär GmbH)

Audit-ID `pxk-helferbaer-2026-11-11` · Stand 11.11.2026 (Europe/Berlin) · Modus `measured_public` · read-only

## Ergebnis

- **Pixelkiez Score 76/100** (`FULL_SCORE`, interne Abdeckung 87 %, 43/48 Metriken bewertet, Konfidenz HIGH)
- Bereiche: Auffindbarkeit 93 · Technik 64 · Nutzerführung 78 · Barrierefreiheit 54 · Vertrauen 78 · KI-Lesbarkeit 78
- Branche (First-Party-belegt): `lokale_dienstleistung/anfrage` → `APPROVED_INDUSTRY_PROFILE`
- Empfohlene Route: **Wartung** (kein Relaunch)

### Vier Hebel (Kunden-PDF)
1. Telefonnummern sind auf Start- und Kontaktseite mobil nicht antippbar (0 `tel:`-Links) – F-002
2. Standortangaben widersprechen sich (Dresden vs. Hamburg; `/dresden` hat Titel „Alltagshilfe Hamburg“; defekter Mailto-Link) – F-003
3. Haupt-Buttons: Kontrast 2,03:1 statt ≥ 4,5:1 (WCAG 2.2 SC 1.4.3) – F-001
4. Kennzahlen und Google-Bewertungen fehlen im statischen HTML (nur per JavaScript) – F-007

Weitere interne Befunde: mobile Labormessung LCP 5,9 s / Score 53 (F-004), 8 Alt-/Entwurfsseiten in der Sitemap (F-005), zwei Cookie-Hinweise (einer englisch) (F-006), Prüfhinweise Consent-Signale (F-010) und Aufsichtsangabe im Impressum (F-013, `POSSIBLE_LEGAL_REVIEW`, nicht verpflichtend sichtbar).

## Gates

| Gate | Status |
|---|---|
| Runtime / Brand-Fonts | READY / EXACT, Einbettung VERIFIED |
| Core-Admission | 43/48 admitted (`BLOCKED_FULL_48_ACTIVE` = nicht alle 48 live messbar) |
| Visual-QA / Semantic-QA | PASS (agent_vision, alle 9 Seiten, Entwurf 2) |
| Customer-Presentation-Quality | PASS, 14 Hard Gates |
| Deliverable-Bundle | `CUSTOMER_RELEASE_READY` |
| ElevenLabs-CSV v1.3 | `EL_UPLOAD_READY`; `production_prerequisite_gate=BLOCKED`; `live_call_production_status=NOT_ASSESSED` |

## Nicht gemessen (UNAVAILABLE, kein Website-Mangel)

- FIND-04/05 Suchsichtbarkeit: Suchwerkzeug nur US-Index, für DE-Markt nicht repräsentativ; lokalisierte Abfrage durch Laufzeit-Policy blockiert
- PERF-01 Felddaten: keine CrUX/PSI-API (HTTP 429 ohne Schlüssel)
- UX-08 Formular-Fehlerzustände: Formular bewusst nicht abgeschickt
- TRUST-08 Analytics-Bereitschaft: kein Inhaber-Zugang

## Struktur

- `deliverables/` – Kunden-PDF/HTML, interne Reports (`analysis_report.json/.md`), Modell, Visuals, QA-Manifeste, Manifest
- `pipeline/` – Collector-Bundle, Agent-Evidenz, Basis-/gescorter Report, Impressum-Sidecar, Skripte der Agent-Erhebung
- `evidence/` – Screenshots und `evidence-raw.tar.gz` (Rendering-, Lighthouse-, HTTP-Rohdaten)
- `pixelkiez_elevenlabs_batch.csv` + Validierungs-Sidecar

Keine E-Mail, kein Anruf, kein CRM-Writeback, kein Formularversand erfolgt.
