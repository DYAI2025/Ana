# ANAK-2: Instagram-Insights im Brain — offene PO-Entscheidung

Status: OFFEN. Dieses Dokument erweitert keine Freigabe. Gemessen am 2026-11-03 lokal mit `insight.real.test.ts`, nur synthetische Daten (`syn*`), kein Produktions-Write.

## Befund

Ja: Das Markdown enthält Post-IDs und Post-Einzelkennzahlen.

| Feld im Block | Beispiel (synthetisch) | Herkunft |
|---|---|---|
| Post-ID mit Saves, Shares, Reichweite | `instagram:media/syn004 saves=88 count shares=52 count reach=2100 accounts` | Meta, gemessen |
| Post-ID mit Rate | `instagram:media/syn013 rate=2.38 %` | berechnet |
| Post-ID ohne Rate | `instagram:media/syn025` | gemessen, Wert fehlt |
| Median, n, Abdeckung, `observed_at` | `2.31 % (Thema, n=9)` | berechnet |
| Thema, Format | `beach`, `reel` (auch in Notiz-ID und Titel) | Thema vom Modell gelesen |
| Hypothese, ab Vorsprung 1,25 | `SUBSTACK-HYPOTHESE (CANDIDATE, unbelegt): Ein längerer Text zu „beach“ könnte auf Interesse stoßen …` | Regeltext aus der Ableitung, kein Modelltext |

Grenzen je Block: höchstens 6 Posts je Liste und 2000 Zeichen. Pro Lauf höchstens 12 Notizen, je Berliner Tag ein Block pro Notiz. Im Messlauf trug der Block 7 Posts mit Werten und 6 mit Rate.

Nicht enthalten: Captions (im Test gegen alle Vault-Dateien geprüft), Permalinks, Bild-URLs, Handle, Kommentare, Personen. Der Tages-Digest enthält 0 Post-IDs, nennt aber bis zu 3 neue Posts einzeln mit Format, Kategorien und Raten.

## Klassifizierung

- **Deklariert:** `src-instagram-insights` trägt `access: internal`, `data_class: G1`. Das setzt der Writer selbst; niemand hat es geprüft.
- **Zahlen und Post-IDs:** passen zu G1 („operational project information“, `governance/DATA_GOVERNANCE.md`), sind dort aber nicht genannt.
- **Thema und Hypothese:** ungeklärt. `DATA_GOVERNANCE.md` definiert G3 als Ableitungen über Bedürfnisse und Muster auf Personenebene. `docs/research/2026-10-13-meta-instagram-api-approval.md:650` führt „KI-Ableitungen (Themencluster, Publikumsbedürfnisse)“ als G3. Die Blöcke beschreiben Posts, nicht Personen, und schließen Aussagen über Bedürfnisse aus. Die Hypothese nennt aber mögliches Interesse.

## Widerspruch zur Freigabe

`apps/dashboard/src/server/world/shared.ts:50` hält die Freigabe vom 2026-11-03 als „aggregated numbers only, never CONFIRMED“ fest. Die Insights gehen darüber hinaus.

Prod hat laut Preflight vom 2026-11-03 `ANA_BRAIN_MCP_URL` und `ANA_BRAIN_WRITE_KEY` gesetzt. Ein Deploy dieses Codes startet die Schreibvorgänge ohne weitere Konfiguration. Die Blöcke sind append-only und stehen in der Vault-Git-Historie; sie lassen sich danach nicht still zurücknehmen.

## Zu entscheiden, vor jedem Release

1. Dürfen Post-IDs mit Einzelkennzahlen in den Brain?
   - Ja: Freigabe erweitern, G1 bestätigen.
   - Nein: Block auf Aggregate kürzen. Dann entfallen die prüfbaren Belege und Gegenbelege je Post.
2. Welche Klasse haben Themen-Lesung und Substack-Hypothese?
   - G1: so lassen.
   - G3: `data_class` ändern. Der Kontextabruf gibt die Notizen dann nicht mehr aus.
   - Alternative: die Hypothese-Zeile weglassen.
3. Zweck, Aufbewahrung, Korrektur- und Löschweg nach `DATA_GOVERNANCE.md` festhalten. Für diese Blöcke ist das bisher nicht dokumentiert.
