# Vollständige Website-Analyse: Helferbär GmbH

- Website: -
- Audit-ID: pxk-helferbaer-2026-11-11
- Erhebungsdatum: 11.11.2026
- Quellbericht SHA-256: `e6d9aed69df22e661cc539b89aee79bff12f1426e22d5e3f91bf06360a05bd9b`

## Executive Summary

Solide Basis mit klarem Angebot. Größte Hebel: lesbare Anfrage-Buttons, antippbare Telefonnummern, einheitliche Standortangaben.

## Score und Kategorien

- Gesamtscore: 76
- Darstellungsstatus: FULL_SCORE
- Abdeckung: 87 %

| Kategorie | Score | Abdeckung | Status | Metriken |
|---|---:|---:|---|---:|
| Auffindbarkeit & SEO | 93 | 75 | STRONG | 10 |
| Performance & Technik | 64 | 80 | SOLID | 9 |
| Nutzerführung & Conversion | 78 | 95 | SOLID | 8 |
| Barrierefreiheit | 54 | 100 | NEEDS_ACTION | 6 |
| Vertrauen, Datenschutz & Inhalt | 78 | 90 | SOLID | 8 |
| KI-Verständlichkeit | 78 | 100 | SOLID | 7 |

## Vollständige Metriken

<a id="metric-find-01"></a>
### `FIND-01` - Öffentliche Erreichbarkeit

- Kategorie: findability_seo
- Anwendbar: true
- Messklasse: measured
- Evidenzklasse: E4
- Status: strong
- Wert: {"collector_version": "1.0.0", "final_url": "https://www.xn--helferbr-6za.de/", "http_status": 200, "https_final": true, "redirect_chain": [], "redirect_hops": 0, "requested_url": "https://www.xn--helferbr-6za.de/", "status_rule": "4xx/5xx=blocking; final URL not HTTPS=mixed; >2 redirect hops=minor_gaps; else strong"}
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 25.0
- Gewichteter Beitrag: 10.0
- Konfidenz: 5
- Methode/Quelle: Fetch canonical public URL and record status/final URL. Pixelkiez evidence collector 1.0.0: 4xx/5xx=blocking; final URL not HTTPS=mixed; >2 redirect hops=minor_gaps; else strong
- Schwellenherkunft: -
- Evidenzreferenzen: E-2001
- Technische Einordnung: Der dokumentierte Wert für Öffentliche Erreichbarkeit ist {'requested_url': 'https://www.xn--helferbr-6za.de/', 'final_url': 'https://www.xn--helferbr-6za.de/', 'http_status': 200, 'redirect_hops': 0, 'redirect_chain': [], 'https_final': True, 'status_rule': '4xx/5xx=blocking; final URL not HTTPS=mixed; >2 redirect hops=minor_gaps; else strong', 'collector_version': '1.0.0'}; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Werden potenzielle Kunden auf das Unternehmen aufmerksam?
- Wirkungskanal: FINDABILITY
- Business-Bedeutung: Öffentliche Erreichbarkeit ist mit {'requested_url': 'https://www.xn--helferbr-6za.de/', 'final_url': 'https://www.xn--helferbr-6za.de/', 'http_status': 200, 'redirect_hops': 0, 'redirect_chain': [], 'https_final': True, 'status_rule': '4xx/5xx=blocking; final URL not HTTPS=mixed; >2 redirect hops=minor_gaps; else strong', 'collector_version': '1.0.0'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Reachability does not prove indexation or search demand. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-012

<a id="metric-find-02"></a>
### `FIND-02` - robots.txt & Sitemap

- Kategorie: findability_seo
- Anwendbar: true
- Messklasse: measured
- Evidenzklasse: E4
- Status: strong
- Wert: {"collector_version": "1.0.0", "disallow_all_for_user_agent_star": false, "robots_status": 200, "sitemap_url_count": 64, "sitemaps": [{"error": null, "loc_count": 64, "status": 200, "url": "https://www.xn--helferbr-6za.de/sitemap.xml"}], "status_rule": "Disallow:/ for *=blocking; robots 200 and sitemap with URLs=strong; one of both=minor_gaps; none=weak"}
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 25.0
- Gewichteter Beitrag: 10.0
- Konfidenz: 5
- Methode/Quelle: Fetch robots.txt and sitemap locations when public. Pixelkiez evidence collector 1.0.0: Disallow:/ for *=blocking; robots 200 and sitemap with URLs=strong; one of both=minor_gaps; none=weak
- Schwellenherkunft: -
- Evidenzreferenzen: E-2002
- Technische Einordnung: Der dokumentierte Wert für robots.txt & Sitemap ist {'robots_status': 200, 'disallow_all_for_user_agent_star': False, 'sitemaps': [{'url': 'https://www.xn--helferbr-6za.de/sitemap.xml', 'status': 200, 'error': None, 'loc_count': 64}], 'sitemap_url_count': 64, 'status_rule': 'Disallow:/ for *=blocking; robots 200 and sitemap with URLs=strong; one of both=minor_gaps; none=weak', 'collector_version': '1.0.0'}; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Werden potenzielle Kunden auf das Unternehmen aufmerksam?
- Wirkungskanal: FINDABILITY
- Business-Bedeutung: robots.txt & Sitemap ist mit {'robots_status': 200, 'disallow_all_for_user_agent_star': False, 'sitemaps': [{'url': 'https://www.xn--helferbr-6za.de/sitemap.xml', 'status': 200, 'error': None, 'loc_count': 64}], 'sitemap_url_count': 64, 'status_rule': 'Disallow:/ for *=blocking; robots 200 and sitemap with URLs=strong; one of both=minor_gaps; none=weak', 'collector_version': '1.0.0'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Presence does not prove complete crawl coverage or indexation. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-012

<a id="metric-find-03"></a>
### `FIND-03` - Indexierbarkeit & Canonicals

- Kategorie: findability_seo
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: strong
- Wert: {"collector_version": "1.0.0", "pages": [{"canonical": "https://www.xn--helferbr-6za.de/", "canonical_same_host": true, "canonical_self": true, "kind": "home", "noindex": false, "url": "https://www.xn--helferbr-6za.de/"}, {"canonical": "https://www.xn--helferbr-6za.de/impressum", "canonical_same_host": true, "canonical_self": true, "kind": "impressum", "noindex": false, "url": "https://www.xn--helferbr-6za.de/impressum"}, {"canonical": "https://www.xn--helferbr-6za.de/privacyb505f5ef", "canonical_same_host": true, "canonical_self": true, "kind": "datenschutz", "noindex": false, "url": "https://www.xn--helferbr-6za.de/privacyb505f5ef"}, {"canonical": "https://www.xn--helferbr-6za.de/kontakt", "canonical_same_host": true, "canonical_self": true, "kind": "kontakt", "noindex": false, "url": "https://www.xn--helferbr-6za.de/kontakt"}, {"canonical": "https://www.xn--helferbr-6za.de/unsere-dienstleistungen", "canonical_same_host": true, "canonical_self": true, "kind": "leistungen", "noindex": false, "url": "https://www.xn--helferbr-6za.de/unsere-dienstleistungen"}, {"canonical": "https://www.xn--helferbr-6za.de/ueber-uns", "canonical_same_host": true, "canonical_self": true, "kind": "ueber", "noindex": false, "url": "https://www.xn--helferbr-6za.de/ueber-uns"}], "pages_with_canonical": 6, "sampled_pages": 6, "status_rule": "homepage noindex=blocking; content page noindex or foreign canonical=mixed; canonical on all sampled pages=strong; else minor_gaps"}
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 25.0
- Gewichteter Beitrag: 10.0
- Konfidenz: 4
- Methode/Quelle: Inspect index directives, canonical tags and redirect behavior on sampled templates. Pixelkiez evidence collector 1.0.0: homepage noindex=blocking; content page noindex or foreign canonical=mixed; canonical on all sampled pages=strong; else minor_gaps
- Schwellenherkunft: -
- Evidenzreferenzen: E-2003
- Technische Einordnung: Der dokumentierte Wert für Indexierbarkeit & Canonicals ist {'pages': [{'url': 'https://www.xn--helferbr-6za.de/', 'kind': 'home', 'noindex': False, 'canonical': 'https://www.xn--helferbr-6za.de/', 'canonical_same_host': True, 'canonical_self': True}, {'url': 'https://www.xn--helferbr-6za.de/impressum', 'kind': 'impressum', 'noindex': False, 'canonical': 'https://www.xn--helferbr-6za.de/impressum', 'canonical_same_host': True, 'canonical_self': True}, {'url': 'https://www.xn--helferbr-6za.de/privacyb505f5ef', 'kind': 'datenschutz', 'noindex': False, 'canonical': 'https://www.xn--helferbr-6za.de/privacyb505f5ef', 'canonical_same_host': True, 'canonical_self': True}, {'url': 'https://www.xn--helferbr-6za.de/kontakt', 'kind': 'kontakt', 'noindex': False, 'canonical': 'https://www.xn--helferbr-6za.de/kontakt', 'canonical_same_host': True, 'canonical_self': True}, {'url': 'https://www.xn--helferbr-6za.de/unsere-dienstleistungen', 'kind': 'leistungen', 'noindex': False, 'canonical': 'https://www.xn--helferbr-6za.de/unsere-dienstleistungen', 'canonical_same_host': True, 'canonical_self': True}, {'url': 'https://www.xn--helferbr-6za.de/ueber-uns', 'kind': 'ueber', 'noindex': False, 'canonical': 'https://www.xn--helferbr-6za.de/ueber-uns', 'canonical_same_host': True, 'canonical_self': True}], 'pages_with_canonical': 6, 'sampled_pages': 6, 'status_rule': 'homepage noindex=blocking; content page noindex or foreign canonical=mixed; canonical on all sampled pages=strong; else minor_gaps', 'collector_version': '1.0.0'}; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Werden potenzielle Kunden auf das Unternehmen aufmerksam?
- Wirkungskanal: FINDABILITY
- Business-Bedeutung: Indexierbarkeit & Canonicals ist mit {'pages': [{'url': 'https://www.xn--helferbr-6za.de/', 'kind': 'home', 'noindex': False, 'canonical': 'https://www.xn--helferbr-6za.de/', 'canonical_same_host': True, 'canonical_self': True}, {'url': 'https://www.xn--helferbr-6za.de/impressum', 'kind': 'impressum', 'noindex': False, 'canonical': 'https://www.xn--helferbr-6za.de/impressum', 'canonical_same_host': True, 'canonical_self': True}, {'url': 'https://www.xn--helferbr-6za.de/privacyb505f5ef', 'kind': 'datenschutz', 'noindex': False, 'canonical': 'https://www.xn--helferbr-6za.de/privacyb505f5ef', 'canonical_same_host': True, 'canonical_self': True}, {'url': 'https://www.xn--helferbr-6za.de/kontakt', 'kind': 'kontakt', 'noindex': False, 'canonical': 'https://www.xn--helferbr-6za.de/kontakt', 'canonical_same_host': True, 'canonical_self': True}, {'url': 'https://www.xn--helferbr-6za.de/unsere-dienstleistungen', 'kind': 'leistungen', 'noindex': False, 'canonical': 'https://www.xn--helferbr-6za.de/unsere-dienstleistungen', 'canonical_same_host': True, 'canonical_self': True}, {'url': 'https://www.xn--helferbr-6za.de/ueber-uns', 'kind': 'ueber', 'noindex': False, 'canonical': 'https://www.xn--helferbr-6za.de/ueber-uns', 'canonical_same_host': True, 'canonical_self': True}], 'pages_with_canonical': 6, 'sampled_pages': 6, 'status_rule': 'homepage noindex=blocking; content page noindex or foreign canonical=mixed; canonical on all sampled pages=strong; else minor_gaps', 'collector_version': '1.0.0'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Sampled directives do not prove full-domain index state. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-find-04"></a>
### `FIND-04` - Brand-Sichtbarkeit

- Kategorie: findability_seo
- Anwendbar: true
- Messklasse: not_assessed
- Evidenzklasse: E8
- Status: not_assessed
- Wert: -
- Score: -
- Score zugelassen: false
- Metrikgewicht: 10.0
- Kategoriegewicht: 25.0
- Gewichteter Beitrag: -
- Konfidenz: 1
- Methode/Quelle: Agent-Versuch, siehe note
- Schwellenherkunft: -
- Evidenzreferenzen: -
- Technische Einordnung: Brand-Sichtbarkeit wurde nicht belastbar erhoben. Der Bericht behandelt die Lücke als offene Evidenz und nicht als Wert null.
- Unternehmerische Frage: Werden potenzielle Kunden auf das Unternehmen aufmerksam?
- Wirkungskanal: FINDABILITY
- Business-Bedeutung: Für Brand-Sichtbarkeit liegt keine belastbare Aussage vor; daraus wird keine geschäftliche Wirkung behauptet.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: nicht gemessen; keine Aussage über die Website
- Maßnahmenstatus: NOT_ASSESSED
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-find-05"></a>
### `FIND-05` - Non-Brand-Sichtbarkeit

- Kategorie: findability_seo
- Anwendbar: true
- Messklasse: not_assessed
- Evidenzklasse: E8
- Status: not_assessed
- Wert: -
- Score: -
- Score zugelassen: false
- Metrikgewicht: 15.0
- Kategoriegewicht: 25.0
- Gewichteter Beitrag: -
- Konfidenz: 1
- Methode/Quelle: Agent-Versuch, siehe note
- Schwellenherkunft: -
- Evidenzreferenzen: -
- Technische Einordnung: Non-Brand-Sichtbarkeit wurde nicht belastbar erhoben. Der Bericht behandelt die Lücke als offene Evidenz und nicht als Wert null.
- Unternehmerische Frage: Werden potenzielle Kunden auf das Unternehmen aufmerksam?
- Wirkungskanal: FINDABILITY
- Business-Bedeutung: Für Non-Brand-Sichtbarkeit liegt keine belastbare Aussage vor; daraus wird keine geschäftliche Wirkung behauptet.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: nicht gemessen; keine Aussage über die Website
- Maßnahmenstatus: NOT_ASSESSED
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-find-06"></a>
### `FIND-06` - Titles, Metas & Überschriften

- Kategorie: findability_seo
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: minor_gaps
- Wert: {"check_pass_share": 0.833, "collector_version": "1.0.0", "pages": [{"description_len": 136, "description_ok": true, "h1_count": 3, "h1_ok": false, "title_len": 49, "title_ok": true, "title_unique": true, "url": "https://www.xn--helferbr-6za.de/"}, {"description_len": 148, "description_ok": true, "h1_count": 1, "h1_ok": true, "title_len": 52, "title_ok": true, "title_unique": false, "url": "https://www.xn--helferbr-6za.de/impressum"}, {"description_len": 148, "description_ok": true, "h1_count": 1, "h1_ok": true, "title_len": 52, "title_ok": true, "title_unique": false, "url": "https://www.xn--helferbr-6za.de/privacyb505f5ef"}, {"description_len": 173, "description_ok": false, "h1_count": 1, "h1_ok": true, "title_len": 54, "title_ok": true, "title_unique": true, "url": "https://www.xn--helferbr-6za.de/kontakt"}, {"description_len": 156, "description_ok": true, "h1_count": 1, "h1_ok": true, "title_len": 42, "title_ok": true, "title_unique": true, "url": "https://www.xn--helferbr-6za.de/unsere-dienstleistungen"}, {"description_len": 107, "description_ok": true, "h1_count": 1, "h1_ok": true, "title_len": 41, "title_ok": true, "title_unique": true, "url": "https://www.xn--helferbr-6za.de/ueber-uns"}], "status_rule": "per page: title 15-65 chars, unique title, meta description 70-165 chars, exactly one h1; pass share >=0.9 strong, >=0.75 minor_gaps, >=0.5 mixed, >=0.25 weak"} share
- Score: 75
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 25.0
- Gewichteter Beitrag: 7.5
- Konfidenz: 4
- Methode/Quelle: Inspect sampled titles, descriptions, H1/H2 structure and intent alignment. Pixelkiez evidence collector 1.0.0: per page: title 15-65 chars, unique title, meta description 70-165 chars, exactly one h1; pass share >=0.9 strong, >=0.75 minor_gaps, >=0.5 mixed, >=0.25 weak
- Schwellenherkunft: -
- Evidenzreferenzen: E-2004
- Technische Einordnung: Der dokumentierte Wert für Titles, Metas & Überschriften ist {'check_pass_share': 0.833, 'pages': [{'url': 'https://www.xn--helferbr-6za.de/', 'title_len': 49, 'title_ok': True, 'title_unique': True, 'description_len': 136, 'description_ok': True, 'h1_count': 3, 'h1_ok': False}, {'url': 'https://www.xn--helferbr-6za.de/impressum', 'title_len': 52, 'title_ok': True, 'title_unique': False, 'description_len': 148, 'description_ok': True, 'h1_count': 1, 'h1_ok': True}, {'url': 'https://www.xn--helferbr-6za.de/privacyb505f5ef', 'title_len': 52, 'title_ok': True, 'title_unique': False, 'description_len': 148, 'description_ok': True, 'h1_count': 1, 'h1_ok': True}, {'url': 'https://www.xn--helferbr-6za.de/kontakt', 'title_len': 54, 'title_ok': True, 'title_unique': True, 'description_len': 173, 'description_ok': False, 'h1_count': 1, 'h1_ok': True}, {'url': 'https://www.xn--helferbr-6za.de/unsere-dienstleistungen', 'title_len': 42, 'title_ok': True, 'title_unique': True, 'description_len': 156, 'description_ok': True, 'h1_count': 1, 'h1_ok': True}, {'url': 'https://www.xn--helferbr-6za.de/ueber-uns', 'title_len': 41, 'title_ok': True, 'title_unique': True, 'description_len': 107, 'description_ok': True, 'h1_count': 1, 'h1_ok': True}], 'status_rule': 'per page: title 15-65 chars, unique title, meta description 70-165 chars, exactly one h1; pass share >=0.9 strong, >=0.75 minor_gaps, >=0.5 mixed, >=0.25 weak', 'collector_version': '1.0.0'} share; im Pixelkiez Bewertungsmodell entspricht das 75/100 und wird als solide Ausprägung mit möglichem Verbesserungsbedarf eingeordnet.
- Unternehmerische Frage: Werden potenzielle Kunden auf das Unternehmen aufmerksam?
- Wirkungskanal: FINDABILITY
- Business-Bedeutung: Titles, Metas & Überschriften ist mit {'check_pass_share': 0.833, 'pages': [{'url': 'https://www.xn--helferbr-6za.de/', 'title_len': 49, 'title_ok': True, 'title_unique': True, 'description_len': 136, 'description_ok': True, 'h1_count': 3, 'h1_ok': False}, {'url': 'https://www.xn--helferbr-6za.de/impressum', 'title_len': 52, 'title_ok': True, 'title_unique': False, 'description_len': 148, 'description_ok': True, 'h1_count': 1, 'h1_ok': True}, {'url': 'https://www.xn--helferbr-6za.de/privacyb505f5ef', 'title_len': 52, 'title_ok': True, 'title_unique': False, 'description_len': 148, 'description_ok': True, 'h1_count': 1, 'h1_ok': True}, {'url': 'https://www.xn--helferbr-6za.de/kontakt', 'title_len': 54, 'title_ok': True, 'title_unique': True, 'description_len': 173, 'description_ok': False, 'h1_count': 1, 'h1_ok': True}, {'url': 'https://www.xn--helferbr-6za.de/unsere-dienstleistungen', 'title_len': 42, 'title_ok': True, 'title_unique': True, 'description_len': 156, 'description_ok': True, 'h1_count': 1, 'h1_ok': True}, {'url': 'https://www.xn--helferbr-6za.de/ueber-uns', 'title_len': 41, 'title_ok': True, 'title_unique': True, 'description_len': 107, 'description_ok': True, 'h1_count': 1, 'h1_ok': True}], 'status_rule': 'per page: title 15-65 chars, unique title, meta description 70-165 chars, exactly one h1; pass share >=0.9 strong, >=0.75 minor_gaps, >=0.5 mixed, >=0.25 weak', 'collector_version': '1.0.0'} share dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Sample quality does not prove rankings. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-find-07"></a>
### `FIND-07` - Strukturierte Daten

- Kategorie: findability_seo
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: strong
- Wert: {"business_entity_present": true, "collector_version": "1.0.0", "invalid_jsonld_blocks": 0, "jsonld_types": ["MedicalBusiness", "WebSite"], "microdata_types": [], "status_rule": "valid JSON-LD with business entity type=strong; business entity via microdata or with invalid blocks=minor_gaps/mixed; only non-business types=mixed; none=weak"}
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 25.0
- Gewichteter Beitrag: 10.0
- Konfidenz: 4
- Methode/Quelle: Inspect public structured data for syntax, entity fit and visible-content consistency. Pixelkiez evidence collector 1.0.0: valid JSON-LD with business entity type=strong; business entity via microdata or with invalid blocks=minor_gaps/mixed; only non-business types=mixed; none=weak
- Schwellenherkunft: -
- Evidenzreferenzen: E-2005
- Technische Einordnung: Der dokumentierte Wert für Strukturierte Daten ist {'jsonld_types': ['MedicalBusiness', 'WebSite'], 'invalid_jsonld_blocks': 0, 'microdata_types': [], 'business_entity_present': True, 'status_rule': 'valid JSON-LD with business entity type=strong; business entity via microdata or with invalid blocks=minor_gaps/mixed; only non-business types=mixed; none=weak', 'collector_version': '1.0.0'}; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Werden potenzielle Kunden auf das Unternehmen aufmerksam?
- Wirkungskanal: FINDABILITY
- Business-Bedeutung: Strukturierte Daten ist mit {'jsonld_types': ['MedicalBusiness', 'WebSite'], 'invalid_jsonld_blocks': 0, 'microdata_types': [], 'business_entity_present': True, 'status_rule': 'valid JSON-LD with business entity type=strong; business entity via microdata or with invalid blocks=minor_gaps/mixed; only non-business types=mixed; none=weak', 'collector_version': '1.0.0'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Markup presence does not guarantee rich results. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-012

<a id="metric-find-08"></a>
### `FIND-08` - Interne Verlinkung & Informationsarchitektur

- Kategorie: findability_seo
- Anwendbar: true
- Messklasse: measured
- Evidenzklasse: E4
- Status: strong
- Wert: {"collector_version": "1.0.0", "homepage_internal_links": 20, "key_pages_linked_from_homepage": {"datenschutz": true, "impressum": true, "kontakt": true, "leistungen": true}, "nav_landmark": true, "status_rule": "six checks: contact/imprint/privacy/service page linked from homepage, nav landmark, >=8 internal links; all=strong, >=0.8 minor_gaps, >=0.6 mixed, >=0.3 weak"} share
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 25.0
- Gewichteter Beitrag: 15.0
- Konfidenz: 4
- Methode/Quelle: Inspect navigation depth, contextual links, descriptive anchors, breadcrumbs and orphan-risk patterns in bounded sample. Pixelkiez evidence collector 1.0.0: six checks: contact/imprint/privacy/service page linked from homepage, nav landmark, >=8 internal links; all=strong, >=0.8 minor_gaps, >=0.6 mixed, >=0.3 weak
- Schwellenherkunft: -
- Evidenzreferenzen: E-2006
- Technische Einordnung: Der dokumentierte Wert für Interne Verlinkung & Informationsarchitektur ist {'homepage_internal_links': 20, 'key_pages_linked_from_homepage': {'kontakt': True, 'impressum': True, 'datenschutz': True, 'leistungen': True}, 'nav_landmark': True, 'status_rule': 'six checks: contact/imprint/privacy/service page linked from homepage, nav landmark, >=8 internal links; all=strong, >=0.8 minor_gaps, >=0.6 mixed, >=0.3 weak', 'collector_version': '1.0.0'} share; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Werden potenzielle Kunden auf das Unternehmen aufmerksam?
- Wirkungskanal: FINDABILITY
- Business-Bedeutung: Interne Verlinkung & Informationsarchitektur ist mit {'homepage_internal_links': 20, 'key_pages_linked_from_homepage': {'kontakt': True, 'impressum': True, 'datenschutz': True, 'leistungen': True}, 'nav_landmark': True, 'status_rule': 'six checks: contact/imprint/privacy/service page linked from homepage, nav landmark, >=8 internal links; all=strong, >=0.8 minor_gaps, >=0.6 mixed, >=0.3 weak', 'collector_version': '1.0.0'} share dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Bounded crawl does not prove complete link graph. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-find-09"></a>
### `FIND-09` - Bild-SEO

- Kategorie: findability_seo
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: mixed
- Wert: {"collector_version": "1.0.0", "descriptive_alt_share": 0.677, "explicit_dimensions_share": 0.452, "images_sampled": 62, "status_rule": "mean of descriptive-alt share and width/height share over sampled <img>; >=0.9 strong, >=0.75 minor_gaps, >=0.5 mixed, >=0.25 weak"} share
- Score: 50
- Score zugelassen: true
- Metrikgewicht: 5.0
- Kategoriegewicht: 25.0
- Gewichteter Beitrag: 2.5
- Konfidenz: 4
- Methode/Quelle: Inspect sampled image alt text, context, filenames and responsive image delivery. Pixelkiez evidence collector 1.0.0: mean of descriptive-alt share and width/height share over sampled <img>; >=0.9 strong, >=0.75 minor_gaps, >=0.5 mixed, >=0.25 weak
- Schwellenherkunft: -
- Evidenzreferenzen: E-2007
- Technische Einordnung: Der dokumentierte Wert für Bild-SEO ist {'images_sampled': 62, 'descriptive_alt_share': 0.677, 'explicit_dimensions_share': 0.452, 'status_rule': 'mean of descriptive-alt share and width/height share over sampled <img>; >=0.9 strong, >=0.75 minor_gaps, >=0.5 mixed, >=0.25 weak', 'collector_version': '1.0.0'} share; im Pixelkiez Bewertungsmodell entspricht das 50/100 und wird als erkennbare Schwäche eingeordnet.
- Unternehmerische Frage: Werden potenzielle Kunden auf das Unternehmen aufmerksam?
- Wirkungskanal: FINDABILITY
- Business-Bedeutung: Bild-SEO ist mit {'images_sampled': 62, 'descriptive_alt_share': 0.677, 'explicit_dimensions_share': 0.452, 'status_rule': 'mean of descriptive-alt share and width/height share over sampled <img>; >=0.9 strong, >=0.75 minor_gaps, >=0.5 mixed, >=0.25 weak', 'collector_version': '1.0.0'} share dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Sample does not prove image-search performance. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-find-10"></a>
### `FIND-10` - Lokale / mehrsprachige Signale

- Kategorie: findability_seo
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: strong
- Wert: {"checks": {"hreflang_if_multilingual": true, "html_lang": true, "phone_visible_or_structured": true, "postal_address_visible_or_structured": true}, "collector_version": "1.0.0", "hreflang_alternates": [], "html_lang": "de", "status_rule": "html lang, postal address, phone, consistent hreflang when alternates exist; all=strong, >=0.75 minor_gaps, >=0.5 mixed, >=0.25 weak"} share
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 5.0
- Kategoriegewicht: 25.0
- Gewichteter Beitrag: 5.0
- Konfidenz: 4
- Methode/Quelle: Inspect applicable local entity and language-alternate signals. Pixelkiez evidence collector 1.0.0: html lang, postal address, phone, consistent hreflang when alternates exist; all=strong, >=0.75 minor_gaps, >=0.5 mixed, >=0.25 weak
- Schwellenherkunft: -
- Evidenzreferenzen: E-2008
- Technische Einordnung: Der dokumentierte Wert für Lokale / mehrsprachige Signale ist {'checks': {'html_lang': True, 'postal_address_visible_or_structured': True, 'phone_visible_or_structured': True, 'hreflang_if_multilingual': True}, 'html_lang': 'de', 'hreflang_alternates': [], 'status_rule': 'html lang, postal address, phone, consistent hreflang when alternates exist; all=strong, >=0.75 minor_gaps, >=0.5 mixed, >=0.25 weak', 'collector_version': '1.0.0'} share; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Werden potenzielle Kunden auf das Unternehmen aufmerksam?
- Wirkungskanal: FINDABILITY
- Business-Bedeutung: Lokale / mehrsprachige Signale ist mit {'checks': {'html_lang': True, 'postal_address_visible_or_structured': True, 'phone_visible_or_structured': True, 'hreflang_if_multilingual': True}, 'html_lang': 'de', 'hreflang_alternates': [], 'status_rule': 'html lang, postal address, phone, consistent hreflang when alternates exist; all=strong, >=0.75 minor_gaps, >=0.5 mixed, >=0.25 weak', 'collector_version': '1.0.0'} share dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Signals do not prove local rankings or international targeting success. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-perf-01"></a>
### `PERF-01` - Core Web Vitals Felddaten

- Kategorie: performance_technology
- Anwendbar: true
- Messklasse: not_assessed
- Evidenzklasse: E8
- Status: not_assessed
- Wert: -
- Score: -
- Score zugelassen: false
- Metrikgewicht: 20.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: -
- Konfidenz: 1
- Methode/Quelle: Agent-Versuch, siehe note
- Schwellenherkunft: -
- Evidenzreferenzen: -
- Technische Einordnung: Core Web Vitals Felddaten wurde nicht belastbar erhoben. Der Bericht behandelt die Lücke als offene Evidenz und nicht als Wert null.
- Unternehmerische Frage: Welche geschäftliche Wirkung hat dieser Befund?
- Wirkungskanal: RISK_REDUCTION
- Business-Bedeutung: Für Core Web Vitals Felddaten liegt keine belastbare Aussage vor; daraus wird keine geschäftliche Wirkung behauptet.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: nicht gemessen; keine Aussage über die Website
- Maßnahmenstatus: NOT_ASSESSED
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-perf-02"></a>
### `PERF-02` - Mobile Labormessung

- Kategorie: performance_technology
- Anwendbar: true
- Messklasse: measured
- Evidenzklasse: E2
- Status: mixed
- Wert: {"cls_median": 0.007, "fcp_ms_median": 3993.397, "form_factor": "mobile", "lcp_ms_median": 5893.562, "lcp_ms_runs": [5710.642, 5910.457, 5893.562], "performance_score_median": 53, "performance_score_runs": [53, 53, 53], "runs": 3, "speed_index_ms_median": 5281.787, "tbt_ms_median": 534, "throttling": "simulate", "tool": "Lighthouse 12.8.2", "total_byte_weight_median": 1849375, "url": "https://www.xn--helferbr-6za.de/"}
- Score: 50
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: 7.5
- Konfidenz: 4
- Methode/Quelle: Lighthouse CLI mobil, 3 Läufe, Median
- Schwellenherkunft: web.dev/articles/vitals (LCP ≤ 2,5 s, CLS ≤ 0,1 „good“; zuletzt aktualisiert 2024-10-31) und developer.chrome.com/docs/lighthouse/performance/performance-scoring (0–49 poor, 50–89 needs improvement, 90–100 good), abgerufen 2026-11-11; Pixelkiez-Abbildung: ≥90 strong, 75–89 minor_gaps, 50–74 mixed, <50 weak
- Evidenzreferenzen: E-5006
- Technische Einordnung: Der dokumentierte Wert für Mobile Labormessung ist {'tool': 'Lighthouse 12.8.2', 'form_factor': 'mobile', 'throttling': 'simulate', 'runs': 3, 'performance_score_median': 53, 'performance_score_runs': [53, 53, 53], 'lcp_ms_median': 5893.562, 'lcp_ms_runs': [5710.642, 5910.457, 5893.562], 'fcp_ms_median': 3993.397, 'tbt_ms_median': 534, 'cls_median': 0.007, 'speed_index_ms_median': 5281.787, 'total_byte_weight_median': 1849375, 'url': 'https://www.xn--helferbr-6za.de/'}; im Pixelkiez Bewertungsmodell entspricht das 50/100 und wird als erkennbare Schwäche eingeordnet.
- Unternehmerische Frage: Welche geschäftliche Wirkung hat dieser Befund?
- Wirkungskanal: RISK_REDUCTION
- Business-Bedeutung: Mobile Labormessung ist mit {'tool': 'Lighthouse 12.8.2', 'form_factor': 'mobile', 'throttling': 'simulate', 'runs': 3, 'performance_score_median': 53, 'performance_score_runs': [53, 53, 53], 'lcp_ms_median': 5893.562, 'lcp_ms_runs': [5710.642, 5910.457, 5893.562], 'fcp_ms_median': 3993.397, 'tbt_ms_median': 534, 'cls_median': 0.007, 'speed_index_ms_median': 5281.787, 'total_byte_weight_median': 1849375, 'url': 'https://www.xn--helferbr-6za.de/'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Labormessung aus Rechenzentrum; keine realen Nutzerdaten
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-004

<a id="metric-perf-03"></a>
### `PERF-03` - Desktop Labormessung

- Kategorie: performance_technology
- Anwendbar: true
- Messklasse: measured
- Evidenzklasse: E2
- Status: minor_gaps
- Wert: {"cls_median": 0.025, "cls_runs": [0.286, 0.024, 0.025], "fcp_ms_median": 1239.01, "form_factor": "desktop", "lcp_ms_median": 1587.074, "lcp_ms_runs": [1587.074, 1640.393, 1498.129], "performance_score_median": 89, "performance_score_runs": [75, 89, 89], "runs": 3, "speed_index_ms_median": 1641.42, "tbt_ms_median": 3.5, "tool": "Lighthouse 12.8.2", "total_byte_weight_median": 2743641, "url": "https://www.xn--helferbr-6za.de/"}
- Score: 75
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: 7.5
- Konfidenz: 4
- Methode/Quelle: Lighthouse CLI desktop, 3 Läufe, Median
- Schwellenherkunft: web.dev/articles/vitals (LCP ≤ 2,5 s, CLS ≤ 0,1 „good“; zuletzt aktualisiert 2024-10-31) und developer.chrome.com/docs/lighthouse/performance/performance-scoring (0–49 poor, 50–89 needs improvement, 90–100 good), abgerufen 2026-11-11; Pixelkiez-Abbildung: ≥90 strong, 75–89 minor_gaps, 50–74 mixed, <50 weak
- Evidenzreferenzen: E-5007
- Technische Einordnung: Der dokumentierte Wert für Desktop Labormessung ist {'tool': 'Lighthouse 12.8.2', 'form_factor': 'desktop', 'runs': 3, 'performance_score_median': 89, 'performance_score_runs': [75, 89, 89], 'lcp_ms_median': 1587.074, 'lcp_ms_runs': [1587.074, 1640.393, 1498.129], 'fcp_ms_median': 1239.01, 'tbt_ms_median': 3.5, 'cls_median': 0.025, 'cls_runs': [0.286, 0.024, 0.025], 'speed_index_ms_median': 1641.42, 'total_byte_weight_median': 2743641, 'url': 'https://www.xn--helferbr-6za.de/'}; im Pixelkiez Bewertungsmodell entspricht das 75/100 und wird als solide Ausprägung mit möglichem Verbesserungsbedarf eingeordnet.
- Unternehmerische Frage: Welche geschäftliche Wirkung hat dieser Befund?
- Wirkungskanal: RISK_REDUCTION
- Business-Bedeutung: Desktop Labormessung ist mit {'tool': 'Lighthouse 12.8.2', 'form_factor': 'desktop', 'runs': 3, 'performance_score_median': 89, 'performance_score_runs': [75, 89, 89], 'lcp_ms_median': 1587.074, 'lcp_ms_runs': [1587.074, 1640.393, 1498.129], 'fcp_ms_median': 1239.01, 'tbt_ms_median': 3.5, 'cls_median': 0.025, 'cls_runs': [0.286, 0.024, 0.025], 'speed_index_ms_median': 1641.42, 'total_byte_weight_median': 2743641, 'url': 'https://www.xn--helferbr-6za.de/'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Labormessung; ein Lauf mit CLS 0,286 (Ausreißer)
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-perf-04"></a>
### `PERF-04` - Asset-Gewicht & Ressourcenlast

- Kategorie: performance_technology
- Anwendbar: true
- Messklasse: measured
- Evidenzklasse: E4
- Status: weak
- Wert: {"assets_discovered_in_html": 25, "assets_fetched": 25, "by_type": {"css": {"bytes": 101397, "count": 6}, "img": {"bytes": 8415624, "count": 13}, "js": {"bytes": 910045, "count": 6}}, "collector_version": "1.0.0", "homepage_transfer_bytes_static": 9463133, "html_bytes": 36067, "status_rule": "static homepage transfer (HTML + referenced CSS/JS/IMG, max 45 assets, no JS execution): <=1.5 MB strong, <=3 MB minor_gaps, <=5 MB mixed, else weak"} bytes
- Score: 25
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: 2.5
- Konfidenz: 4
- Methode/Quelle: Measure sampled transfer/resource weight and identify dominant resource classes. Pixelkiez evidence collector 1.0.0: static homepage transfer (HTML + referenced CSS/JS/IMG, max 45 assets, no JS execution): <=1.5 MB strong, <=3 MB minor_gaps, <=5 MB mixed, else weak
- Schwellenherkunft: -
- Evidenzreferenzen: E-2009
- Technische Einordnung: Der dokumentierte Wert für Asset-Gewicht & Ressourcenlast ist {'homepage_transfer_bytes_static': 9463133, 'html_bytes': 36067, 'by_type': {'css': {'count': 6, 'bytes': 101397}, 'js': {'count': 6, 'bytes': 910045}, 'img': {'count': 13, 'bytes': 8415624}}, 'assets_discovered_in_html': 25, 'assets_fetched': 25, 'status_rule': 'static homepage transfer (HTML + referenced CSS/JS/IMG, max 45 assets, no JS execution): <=1.5 MB strong, <=3 MB minor_gaps, <=5 MB mixed, else weak', 'collector_version': '1.0.0'} bytes; im Pixelkiez Bewertungsmodell entspricht das 25/100 und wird als deutliche Schwäche eingeordnet.
- Unternehmerische Frage: Welche geschäftliche Wirkung hat dieser Befund?
- Wirkungskanal: RISK_REDUCTION
- Business-Bedeutung: Asset-Gewicht & Ressourcenlast ist mit {'homepage_transfer_bytes_static': 9463133, 'html_bytes': 36067, 'by_type': {'css': {'count': 6, 'bytes': 101397}, 'js': {'count': 6, 'bytes': 910045}, 'img': {'count': 13, 'bytes': 8415624}}, 'assets_discovered_in_html': 25, 'assets_fetched': 25, 'status_rule': 'static homepage transfer (HTML + referenced CSS/JS/IMG, max 45 assets, no JS execution): <=1.5 MB strong, <=3 MB minor_gaps, <=5 MB mixed, else weak', 'collector_version': '1.0.0'} bytes dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Asset weight alone does not prove user-perceived speed. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-perf-05"></a>
### `PERF-05` - Bild- & Media-Pipeline

- Kategorie: performance_technology
- Anwendbar: true
- Messklasse: measured
- Evidenzklasse: E4
- Status: weak
- Wert: {"collector_version": "1.0.0", "images_sampled": 62, "lazy_loaded_images": 0, "modern_format_images": 0, "pipeline_share": 0.0, "responsive_srcset_images": 0, "status_rule": "mean of modern-format share (WebP/AVIF), srcset share and lazy-loading share (first two images exempt); >=0.8 strong, >=0.6 minor_gaps, >=0.4 mixed, >=0.2 weak"} share
- Score: 25
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: 2.5
- Konfidenz: 4
- Methode/Quelle: Inspect formats, responsive images, lazy loading and media delivery on sampled templates. Pixelkiez evidence collector 1.0.0: mean of modern-format share (WebP/AVIF), srcset share and lazy-loading share (first two images exempt); >=0.8 strong, >=0.6 minor_gaps, >=0.4 mixed, >=0.2 weak
- Schwellenherkunft: -
- Evidenzreferenzen: E-2010
- Technische Einordnung: Der dokumentierte Wert für Bild- & Media-Pipeline ist {'images_sampled': 62, 'modern_format_images': 0, 'responsive_srcset_images': 0, 'lazy_loaded_images': 0, 'pipeline_share': 0.0, 'status_rule': 'mean of modern-format share (WebP/AVIF), srcset share and lazy-loading share (first two images exempt); >=0.8 strong, >=0.6 minor_gaps, >=0.4 mixed, >=0.2 weak', 'collector_version': '1.0.0'} share; im Pixelkiez Bewertungsmodell entspricht das 25/100 und wird als deutliche Schwäche eingeordnet.
- Unternehmerische Frage: Welche geschäftliche Wirkung hat dieser Befund?
- Wirkungskanal: RISK_REDUCTION
- Business-Bedeutung: Bild- & Media-Pipeline ist mit {'images_sampled': 62, 'modern_format_images': 0, 'responsive_srcset_images': 0, 'lazy_loaded_images': 0, 'pipeline_share': 0.0, 'status_rule': 'mean of modern-format share (WebP/AVIF), srcset share and lazy-loading share (first two images exempt); >=0.8 strong, >=0.6 minor_gaps, >=0.4 mixed, >=0.2 weak', 'collector_version': '1.0.0'} share dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Observed media pipeline does not prove field performance. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-004

<a id="metric-perf-06"></a>
### `PERF-06` - Caching & Kompression

- Kategorie: performance_technology
- Anwendbar: true
- Messklasse: measured
- Evidenzklasse: E4
- Status: strong
- Wert: {"collector_version": "1.0.0", "html_cache_control": "no-cache, must-revalidate", "html_compressed": true, "same_host_static_assets": 1, "static_asset_long_cache_share": 1.0, "status_rule": "compression share over HTML+same-host CSS/JS and share of same-host static assets with max-age>=7d or immutable: >=0.9&>=0.8 strong, >=0.7&>=0.5 minor_gaps, >=0.5|>=0.3 mixed, else weak", "text_asset_compression_share": 1.0} share
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: 10.0
- Konfidenz: 4
- Methode/Quelle: Inspect public caching/compression headers or reproducible response behavior. Pixelkiez evidence collector 1.0.0: compression share over HTML+same-host CSS/JS and share of same-host static assets with max-age>=7d or immutable: >=0.9&>=0.8 strong, >=0.7&>=0.5 minor_gaps, >=0.5|>=0.3 mixed, else weak
- Schwellenherkunft: -
- Evidenzreferenzen: E-2011
- Technische Einordnung: Der dokumentierte Wert für Caching & Kompression ist {'html_compressed': True, 'text_asset_compression_share': 1.0, 'static_asset_long_cache_share': 1.0, 'same_host_static_assets': 1, 'html_cache_control': 'no-cache, must-revalidate', 'status_rule': 'compression share over HTML+same-host CSS/JS and share of same-host static assets with max-age>=7d or immutable: >=0.9&>=0.8 strong, >=0.7&>=0.5 minor_gaps, >=0.5|>=0.3 mixed, else weak', 'collector_version': '1.0.0'} share; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Welche geschäftliche Wirkung hat dieser Befund?
- Wirkungskanal: RISK_REDUCTION
- Business-Bedeutung: Caching & Kompression ist mit {'html_compressed': True, 'text_asset_compression_share': 1.0, 'static_asset_long_cache_share': 1.0, 'same_host_static_assets': 1, 'html_cache_control': 'no-cache, must-revalidate', 'status_rule': 'compression share over HTML+same-host CSS/JS and share of same-host static assets with max-age>=7d or immutable: >=0.9&>=0.8 strong, >=0.7&>=0.5 minor_gaps, >=0.5|>=0.3 mixed, else weak', 'collector_version': '1.0.0'} share dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Headers alone do not prove end-to-end caching effectiveness. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-perf-07"></a>
### `PERF-07` - Render-blockierende Ressourcen

- Kategorie: performance_technology
- Anwendbar: true
- Messklasse: measured
- Evidenzklasse: E4
- Status: minor_gaps
- Wert: {"blocking_script_examples": ["https://app.termly.io/resource-blocker/ec3677b9-9cf2-4773-9f75-9bfb72e7fdd8"], "collector_version": "1.0.0", "head_stylesheets": 6, "render_blocking_scripts_in_head": 1, "status_rule": "synchronous <script src> in <head> without async/defer/module and head stylesheets: 0 & <=3 strong, <=2 & <=6 minor_gaps, <=5 mixed, else weak"} count
- Score: 75
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: 7.5
- Konfidenz: 4
- Methode/Quelle: Inspect sampled blocking CSS/JS/resource dependencies with available lab or page tooling. Pixelkiez evidence collector 1.0.0: synchronous <script src> in <head> without async/defer/module and head stylesheets: 0 & <=3 strong, <=2 & <=6 minor_gaps, <=5 mixed, else weak
- Schwellenherkunft: -
- Evidenzreferenzen: E-2012
- Technische Einordnung: Der dokumentierte Wert für Render-blockierende Ressourcen ist {'render_blocking_scripts_in_head': 1, 'blocking_script_examples': ['https://app.termly.io/resource-blocker/ec3677b9-9cf2-4773-9f75-9bfb72e7fdd8'], 'head_stylesheets': 6, 'status_rule': 'synchronous <script src> in <head> without async/defer/module and head stylesheets: 0 & <=3 strong, <=2 & <=6 minor_gaps, <=5 mixed, else weak', 'collector_version': '1.0.0'} count; im Pixelkiez Bewertungsmodell entspricht das 75/100 und wird als solide Ausprägung mit möglichem Verbesserungsbedarf eingeordnet.
- Unternehmerische Frage: Welche geschäftliche Wirkung hat dieser Befund?
- Wirkungskanal: RISK_REDUCTION
- Business-Bedeutung: Render-blockierende Ressourcen ist mit {'render_blocking_scripts_in_head': 1, 'blocking_script_examples': ['https://app.termly.io/resource-blocker/ec3677b9-9cf2-4773-9f75-9bfb72e7fdd8'], 'head_stylesheets': 6, 'status_rule': 'synchronous <script src> in <head> without async/defer/module and head stylesheets: 0 & <=3 strong, <=2 & <=6 minor_gaps, <=5 mixed, else weak', 'collector_version': '1.0.0'} count dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Static inspection does not prove exact blocking time. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-004

<a id="metric-perf-08"></a>
### `PERF-08` - Responsive Auslieferung

- Kategorie: performance_technology
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: minor_gaps
- Wert: {"observation": "Kein horizontales Überlaufen auf 10 Seiten bei 390 px und 1440 px; Hosting liefert eigene Mobilvariante. Mobile H1 der Startseite bricht mitten im Wort („Entlastung|sdienst“), zwei Cookie-Hinweise überdecken den unteren Teil des ersten Bildschirms.", "pages_without_overflow": "10/10 je Viewport"}
- Score: 75
- Score zugelassen: true
- Metrikgewicht: 5.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: 3.75
- Konfidenz: 4
- Methode/Quelle: Gerendertes Layout in zwei Viewports, Screenshots
- Schwellenherkunft: -
- Evidenzreferenzen: E-5001, E-5002
- Technische Einordnung: Der dokumentierte Wert für Responsive Auslieferung ist {'observation': 'Kein horizontales Überlaufen auf 10 Seiten bei 390 px und 1440 px; Hosting liefert eigene Mobilvariante. Mobile H1 der Startseite bricht mitten im Wort („Entlastung|sdienst“), zwei Cookie-Hinweise überdecken den unteren Teil des ersten Bildschirms.', 'pages_without_overflow': '10/10 je Viewport'}; im Pixelkiez Bewertungsmodell entspricht das 75/100 und wird als solide Ausprägung mit möglichem Verbesserungsbedarf eingeordnet.
- Unternehmerische Frage: Welche geschäftliche Wirkung hat dieser Befund?
- Wirkungskanal: RISK_REDUCTION
- Business-Bedeutung: Responsive Auslieferung ist mit {'observation': 'Kein horizontales Überlaufen auf 10 Seiten bei 390 px und 1440 px; Hosting liefert eigene Mobilvariante. Mobile H1 der Startseite bricht mitten im Wort („Entlastung|sdienst“), zwei Cookie-Hinweise überdecken den unteren Teil des ersten Bildschirms.', 'pages_without_overflow': '10/10 je Viewport'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Viewport-Stichprobe, keine echten Geräte
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-006, REC-F-008

<a id="metric-perf-09"></a>
### `PERF-09` - Öffentlicher Technologie-Snapshot

- Kategorie: performance_technology
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: strong
- Wert: {"collector_version": "1.0.0", "detected_stack": ["Divi", "jQuery"], "generator": null, "jquery_version": null, "server": "nginx", "status_rule": "publicly visible jQuery < 3.5=mixed; software versions exposed via generator/server/x-powered-by=minor_gaps; else strong", "version_exposing_headers": {}}
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: 10.0
- Konfidenz: 3
- Methode/Quelle: Record observable delivery/CMS/framework hints without asserting private architecture. Pixelkiez evidence collector 1.0.0: publicly visible jQuery < 3.5=mixed; software versions exposed via generator/server/x-powered-by=minor_gaps; else strong
- Schwellenherkunft: -
- Evidenzreferenzen: E-2013
- Technische Einordnung: Der dokumentierte Wert für Öffentlicher Technologie-Snapshot ist {'generator': None, 'detected_stack': ['Divi', 'jQuery'], 'jquery_version': None, 'version_exposing_headers': {}, 'server': 'nginx', 'status_rule': 'publicly visible jQuery < 3.5=mixed; software versions exposed via generator/server/x-powered-by=minor_gaps; else strong', 'collector_version': '1.0.0'}; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Welche geschäftliche Wirkung hat dieser Befund?
- Wirkungskanal: RISK_REDUCTION
- Business-Bedeutung: Öffentlicher Technologie-Snapshot ist mit {'generator': None, 'detected_stack': ['Divi', 'jQuery'], 'jquery_version': None, 'version_exposing_headers': {}, 'server': 'nginx', 'status_rule': 'publicly visible jQuery < 3.5=mixed; software versions exposed via generator/server/x-powered-by=minor_gaps; else strong', 'collector_version': '1.0.0'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Public hints do not prove repository, backend or deployment quality. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-ux-01"></a>
### `UX-01` - Klarheit im ersten Sichtbereich

- Kategorie: ux_conversion
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E6
- Status: minor_gaps
- Wert: {"observation": "Desktop: erster Bildschirm nennt Angebot (Entlastungsdienst für Senioren), Leistungen, Abrechnung über Pflegekasse und sechs Städte. Mobil: Überschrift bricht mitten im Wort, Leistung/Städte erst nach Scrollen.", "quote": "Entlastungsdienst für Senioren · Abrechenbar über Ihre Pflegekasse"}
- Score: 75
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: 11.25
- Konfidenz: 4
- Methode/Quelle: Erster Sichtbereich Startseite, mobil und Desktop
- Schwellenherkunft: -
- Evidenzreferenzen: E-5001, E-5002
- Technische Einordnung: Der dokumentierte Wert für Klarheit im ersten Sichtbereich ist {'observation': 'Desktop: erster Bildschirm nennt Angebot (Entlastungsdienst für Senioren), Leistungen, Abrechnung über Pflegekasse und sechs Städte. Mobil: Überschrift bricht mitten im Wort, Leistung/Städte erst nach Scrollen.', 'quote': 'Entlastungsdienst für Senioren · Abrechenbar über Ihre Pflegekasse'}; im Pixelkiez Bewertungsmodell entspricht das 75/100 und wird als solide Ausprägung mit möglichem Verbesserungsbedarf eingeordnet.
- Unternehmerische Frage: Wird aus Interesse einfach eine Anfrage?
- Wirkungskanal: CONTACT_FRICTION
- Business-Bedeutung: Klarheit im ersten Sichtbereich ist mit {'observation': 'Desktop: erster Bildschirm nennt Angebot (Entlastungsdienst für Senioren), Leistungen, Abrechnung über Pflegekasse und sechs Städte. Mobil: Überschrift bricht mitten im Wort, Leistung/Städte erst nach Scrollen.', 'quote': 'Entlastungsdienst für Senioren · Abrechenbar über Ihre Pflegekasse'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Heuristik, kein Nutzertest
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-006

<a id="metric-ux-02"></a>
### `UX-02` - Klarheit des nächsten Schritts

- Kategorie: ux_conversion
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E6
- Status: mixed
- Wert: {"observation": "Desktop: zwei klare Anfrage-Buttons. Mobil: kein Anfrage-Button und keine Telefonnummer im ersten Sichtbereich; Telefonnummern auf Start- und Kontaktseite sind nicht antippbar (0 tel:-Links).", "tel_links_berlin": 1, "tel_links_home": 0, "tel_links_kontakt": 0}
- Score: 50
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: 7.5
- Konfidenz: 4
- Methode/Quelle: Prüfung Hauptaktion und Kontaktwege mobil/desktop
- Schwellenherkunft: -
- Evidenzreferenzen: E-5001, E-5002
- Technische Einordnung: Der dokumentierte Wert für Klarheit des nächsten Schritts ist {'observation': 'Desktop: zwei klare Anfrage-Buttons. Mobil: kein Anfrage-Button und keine Telefonnummer im ersten Sichtbereich; Telefonnummern auf Start- und Kontaktseite sind nicht antippbar (0 tel:-Links).', 'tel_links_home': 0, 'tel_links_kontakt': 0, 'tel_links_berlin': 1}; im Pixelkiez Bewertungsmodell entspricht das 50/100 und wird als erkennbare Schwäche eingeordnet.
- Unternehmerische Frage: Wird aus Interesse einfach eine Anfrage?
- Wirkungskanal: CONTACT_FRICTION
- Business-Bedeutung: Klarheit des nächsten Schritts ist mit {'observation': 'Desktop: zwei klare Anfrage-Buttons. Mobil: kein Anfrage-Button und keine Telefonnummer im ersten Sichtbereich; Telefonnummern auf Start- und Kontaktseite sind nicht antippbar (0 tel:-Links).', 'tel_links_home': 0, 'tel_links_kontakt': 0, 'tel_links_berlin': 1} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: CTA-Klarheit misst keine Anfragen
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-002

<a id="metric-ux-03"></a>
### `UX-03` - Navigation & Orientierung

- Kategorie: ux_conversion
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E6
- Status: strong
- Wert: {"observation": "Klare Navigation: Über uns, Leistungen (4 Unterseiten), Ratgeber, Jetzt Helferbär werden, Kontakt; mobil zusätzlich alle Standortseiten."}
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: 15.0
- Konfidenz: 4
- Methode/Quelle: Navigationslabels und Pfade der Stichprobe
- Schwellenherkunft: -
- Evidenzreferenzen: E-5001, E-5002
- Technische Einordnung: Der dokumentierte Wert für Navigation & Orientierung ist {'observation': 'Klare Navigation: Über uns, Leistungen (4 Unterseiten), Ratgeber, Jetzt Helferbär werden, Kontakt; mobil zusätzlich alle Standortseiten.'}; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Wird aus Interesse einfach eine Anfrage?
- Wirkungskanal: CONTACT_FRICTION
- Business-Bedeutung: Navigation & Orientierung ist mit {'observation': 'Klare Navigation: Über uns, Leistungen (4 Unterseiten), Ratgeber, Jetzt Helferbär werden, Kontakt; mobil zusätzlich alle Standortseiten.'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Stichprobe, kein Aufgabentest
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-011

<a id="metric-ux-04"></a>
### `UX-04` - Mobile Lesbarkeit & Hierarchie

- Kategorie: ux_conversion
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E6
- Status: minor_gaps
- Wert: {"observation": "Mobil gut lesbare Schriftgrößen, aber H1 bricht mitten im Wort, schwebender Button „Zum Kontaktformular“ überdeckt auf /kontakt Text, 15–28 Klickflächen pro Seite unter 24 px.", "small_targets_per_page_mobile": "15–28"}
- Score: 75
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: 11.25
- Konfidenz: 3
- Methode/Quelle: iPhone-13-Emulation und 390-px-Viewport
- Schwellenherkunft: -
- Evidenzreferenzen: E-5001, E-5002
- Technische Einordnung: Der dokumentierte Wert für Mobile Lesbarkeit & Hierarchie ist {'observation': 'Mobil gut lesbare Schriftgrößen, aber H1 bricht mitten im Wort, schwebender Button „Zum Kontaktformular“ überdeckt auf /kontakt Text, 15–28 Klickflächen pro Seite unter 24 px.', 'small_targets_per_page_mobile': '15–28'}; im Pixelkiez Bewertungsmodell entspricht das 75/100 und wird als solide Ausprägung mit möglichem Verbesserungsbedarf eingeordnet.
- Unternehmerische Frage: Wird aus Interesse einfach eine Anfrage?
- Wirkungskanal: CONTACT_FRICTION
- Business-Bedeutung: Mobile Lesbarkeit & Hierarchie ist mit {'observation': 'Mobil gut lesbare Schriftgrößen, aber H1 bricht mitten im Wort, schwebender Button „Zum Kontaktformular“ überdeckt auf /kontakt Text, 15–28 Klickflächen pro Seite unter 24 px.', 'small_targets_per_page_mobile': '15–28'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Viewport-Review, kein Gerätetest
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-002, REC-F-008

<a id="metric-ux-05"></a>
### `UX-05` - Kontakt- & Formularreibung

- Kategorie: ux_conversion
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E6
- Status: minor_gaps
- Wert: {"fields": 8, "observation": "Kontaktformular mit 8 Feldern (Vorname, Nachname, E-Mail, Rückrufnummer, Anliegen, Standort, Nachricht, Checkbox „Opt-In“); keine Pflichtfeld-Kennzeichnung, alle Felder beschriftet; Formular nicht abgeschickt."}
- Score: 75
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: 11.25
- Konfidenz: 4
- Methode/Quelle: Formularoberfläche /kontakt ohne Absenden
- Schwellenherkunft: -
- Evidenzreferenzen: E-5001
- Technische Einordnung: Der dokumentierte Wert für Kontakt- & Formularreibung ist {'observation': 'Kontaktformular mit 8 Feldern (Vorname, Nachname, E-Mail, Rückrufnummer, Anliegen, Standort, Nachricht, Checkbox „Opt-In“); keine Pflichtfeld-Kennzeichnung, alle Felder beschriftet; Formular nicht abgeschickt.', 'fields': 8}; im Pixelkiez Bewertungsmodell entspricht das 75/100 und wird als solide Ausprägung mit möglichem Verbesserungsbedarf eingeordnet.
- Unternehmerische Frage: Wird aus Interesse einfach eine Anfrage?
- Wirkungskanal: CONTACT_FRICTION
- Business-Bedeutung: Kontakt- & Formularreibung ist mit {'observation': 'Kontaktformular mit 8 Feldern (Vorname, Nachname, E-Mail, Rückrufnummer, Anliegen, Standort, Nachricht, Checkbox „Opt-In“); keine Pflichtfeld-Kennzeichnung, alle Felder beschriftet; Formular nicht abgeschickt.', 'fields': 8} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: misst keine Abschlussrate
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-ux-06"></a>
### `UX-06` - Vertrauenssignale im Entscheidungsweg

- Kategorie: ux_conversion
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E6
- Status: strong
- Wert: {"observation": "Nahe den Anfrage-Buttons: Google-Bewertungen 4,9 (31), Kennzahlen (seit 2019, 6 Standorte, 274 Helfer, 917 Klienten), Presse-Logos mit Artikel-Links, 3-Schritte-Ablauf, Förderlogos."}
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: 10.0
- Konfidenz: 4
- Methode/Quelle: Gerenderte Startseite nach Scrollen
- Schwellenherkunft: -
- Evidenzreferenzen: E-5008
- Technische Einordnung: Der dokumentierte Wert für Vertrauenssignale im Entscheidungsweg ist {'observation': 'Nahe den Anfrage-Buttons: Google-Bewertungen 4,9 (31), Kennzahlen (seit 2019, 6 Standorte, 274 Helfer, 917 Klienten), Presse-Logos mit Artikel-Links, 3-Schritte-Ablauf, Förderlogos.'}; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Wird aus Interesse einfach eine Anfrage?
- Wirkungskanal: CONTACT_FRICTION
- Business-Bedeutung: Vertrauenssignale im Entscheidungsweg ist mit {'observation': 'Nahe den Anfrage-Buttons: Google-Bewertungen 4,9 (31), Kennzahlen (seit 2019, 6 Standorte, 274 Helfer, 917 Klienten), Presse-Logos mit Artikel-Links, 3-Schritte-Ablauf, Förderlogos.'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Belege nicht unabhängig verifiziert
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-011

<a id="metric-ux-07"></a>
### `UX-07` - Inhaltshierarchie

- Kategorie: ux_conversion
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E6
- Status: minor_gaps
- Wert: {"observation": "Startseite gut gegliedert in Abschnitte, aber drei H1-Überschriften und Ebenensprünge; FAQ und Leistungsseiten gut scanbar."}
- Score: 75
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: 7.5
- Konfidenz: 3
- Methode/Quelle: Hierarchie auf Start-, Leistungs-, FAQ-Seite
- Schwellenherkunft: -
- Evidenzreferenzen: E-5001
- Technische Einordnung: Der dokumentierte Wert für Inhaltshierarchie ist {'observation': 'Startseite gut gegliedert in Abschnitte, aber drei H1-Überschriften und Ebenensprünge; FAQ und Leistungsseiten gut scanbar.'}; im Pixelkiez Bewertungsmodell entspricht das 75/100 und wird als solide Ausprägung mit möglichem Verbesserungsbedarf eingeordnet.
- Unternehmerische Frage: Wird aus Interesse einfach eine Anfrage?
- Wirkungskanal: CONTACT_FRICTION
- Business-Bedeutung: Inhaltshierarchie ist mit {'observation': 'Startseite gut gegliedert in Abschnitte, aber drei H1-Überschriften und Ebenensprünge; FAQ und Leistungsseiten gut scanbar.'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Heuristik
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-ux-08"></a>
### `UX-08` - Feedback- & Fehlerzustände

- Kategorie: ux_conversion
- Anwendbar: true
- Messklasse: not_assessed
- Evidenzklasse: E8
- Status: not_assessed
- Wert: -
- Score: -
- Score zugelassen: false
- Metrikgewicht: 5.0
- Kategoriegewicht: 20.0
- Gewichteter Beitrag: -
- Konfidenz: 1
- Methode/Quelle: Agent-Versuch, siehe note
- Schwellenherkunft: -
- Evidenzreferenzen: -
- Technische Einordnung: Feedback- & Fehlerzustände wurde nicht belastbar erhoben. Der Bericht behandelt die Lücke als offene Evidenz und nicht als Wert null.
- Unternehmerische Frage: Wird aus Interesse einfach eine Anfrage?
- Wirkungskanal: CONTACT_FRICTION
- Business-Bedeutung: Für Feedback- & Fehlerzustände liegt keine belastbare Aussage vor; daraus wird keine geschäftliche Wirkung behauptet.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: nicht gemessen; keine Aussage über die Website
- Maßnahmenstatus: NOT_ASSESSED
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-a11y-01"></a>
### `A11Y-01` - Tastatur & sichtbarer Fokus

- Kategorie: accessibility
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: minor_gaps
- Wert: {"home_with_indicator": 23, "kontakt_with_indicator": 29, "observation": "Tab-Reihenfolge logisch; Startseite 23 von 30 Tab-Stopps mit sichtbarem Fokusstil, 7 Stopps (Karussell-Container) ohne Fokusanzeige; Kontakt 29 von 30.", "stops_per_page": 30}
- Score: 75
- Score zugelassen: true
- Metrikgewicht: 20.0
- Kategoriegewicht: 10.0
- Gewichteter Beitrag: 15.0
- Konfidenz: 3
- Methode/Quelle: Automatisierte Tab-Stichprobe mit Fokus-Stilprüfung
- Schwellenherkunft: -
- Evidenzreferenzen: E-5003
- Technische Einordnung: Der dokumentierte Wert für Tastatur & sichtbarer Fokus ist {'observation': 'Tab-Reihenfolge logisch; Startseite 23 von 30 Tab-Stopps mit sichtbarem Fokusstil, 7 Stopps (Karussell-Container) ohne Fokusanzeige; Kontakt 29 von 30.', 'home_with_indicator': 23, 'kontakt_with_indicator': 29, 'stops_per_page': 30}; im Pixelkiez Bewertungsmodell entspricht das 75/100 und wird als solide Ausprägung mit möglichem Verbesserungsbedarf eingeordnet.
- Unternehmerische Frage: Funktioniert die Website technisch ohne unnötige Reibung?
- Wirkungskanal: RISK_REDUCTION
- Business-Bedeutung: Tastatur & sichtbarer Fokus ist mit {'observation': 'Tab-Reihenfolge logisch; Startseite 23 von 30 Tab-Stopps mit sichtbarem Fokusstil, 7 Stopps (Karussell-Container) ohne Fokusanzeige; Kontakt 29 von 30.', 'home_with_indicator': 23, 'kontakt_with_indicator': 29, 'stops_per_page': 30} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: keine WCAG-Konformitätsaussage; kein Screenreader
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-009

<a id="metric-a11y-02"></a>
### `A11Y-02` - Semantische Struktur & Landmarks

- Kategorie: accessibility
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: weak
- Wert: {"collector_version": "1.0.0", "heading_level_skips": 2, "heading_levels": [1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 2, 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 4, 4, 4], "homepage_checks": {"header_or_footer": false, "html_lang": true, "main_landmark": true, "nav_landmark": true, "no_heading_level_skips": false, "single_h1": false}, "status_rule": "homepage: main, nav, header/footer landmark, html lang, one h1, no heading level skips; all=strong, >=0.8 minor_gaps, >=0.6 mixed, >=0.3 weak"} share
- Score: 25
- Score zugelassen: true
- Metrikgewicht: 20.0
- Kategoriegewicht: 10.0
- Gewichteter Beitrag: 5.0
- Konfidenz: 4
- Methode/Quelle: Inspect landmarks, headings, labels and semantic structure in sampled HTML. Pixelkiez evidence collector 1.0.0: homepage: main, nav, header/footer landmark, html lang, one h1, no heading level skips; all=strong, >=0.8 minor_gaps, >=0.6 mixed, >=0.3 weak
- Schwellenherkunft: -
- Evidenzreferenzen: E-2014
- Technische Einordnung: Der dokumentierte Wert für Semantische Struktur & Landmarks ist {'homepage_checks': {'main_landmark': True, 'nav_landmark': True, 'header_or_footer': False, 'html_lang': True, 'single_h1': False, 'no_heading_level_skips': False}, 'heading_levels': [1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 2, 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 4, 4, 4], 'heading_level_skips': 2, 'status_rule': 'homepage: main, nav, header/footer landmark, html lang, one h1, no heading level skips; all=strong, >=0.8 minor_gaps, >=0.6 mixed, >=0.3 weak', 'collector_version': '1.0.0'} share; im Pixelkiez Bewertungsmodell entspricht das 25/100 und wird als deutliche Schwäche eingeordnet.
- Unternehmerische Frage: Funktioniert die Website technisch ohne unnötige Reibung?
- Wirkungskanal: RISK_REDUCTION
- Business-Bedeutung: Semantische Struktur & Landmarks ist mit {'homepage_checks': {'main_landmark': True, 'nav_landmark': True, 'header_or_footer': False, 'html_lang': True, 'single_h1': False, 'no_heading_level_skips': False}, 'heading_levels': [1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 2, 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 4, 4, 4], 'heading_level_skips': 2, 'status_rule': 'homepage: main, nav, header/footer landmark, html lang, one h1, no heading level skips; all=strong, >=0.8 minor_gaps, >=0.6 mixed, >=0.3 weak', 'collector_version': '1.0.0'} share dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Sample does not establish WCAG conformance. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-a11y-03"></a>
### `A11Y-03` - Alternativtexte im Stichprobenumfang

- Kategorie: accessibility
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: mixed
- Wert: {"alt_attribute_share": 0.823, "collector_version": "1.0.0", "images_sampled": 62, "missing_alt_examples": ["https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/DSC04869-1920w.png?Expires=179701", "https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/DSC04851-35e5ddc8-1920w.png?Expir", "https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/DSC04880-1920w.jpg?Expires=179701", "https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/Alex-1920w.jpg?Expires=1797019594", "https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/yannik-1920w.png?Expires=17970195", "https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/patrizia_v2-b6cd5efc-1920w.png?Ex", "https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/DSC04828-1920w.jpg?Expires=179701", "https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/DSC04865-1920w.jpg?Expires=179701"], "status_rule": "share of sampled <img> with an alt attribute (empty alt counts as decorative); >=0.95 strong, >=0.85 minor_gaps, >=0.6 mixed, >=0.3 weak"} share
- Score: 50
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 10.0
- Gewichteter Beitrag: 7.5
- Konfidenz: 4
- Methode/Quelle: Inspect representative informative/decorative image alternatives. Pixelkiez evidence collector 1.0.0: share of sampled <img> with an alt attribute (empty alt counts as decorative); >=0.95 strong, >=0.85 minor_gaps, >=0.6 mixed, >=0.3 weak
- Schwellenherkunft: -
- Evidenzreferenzen: E-2015
- Technische Einordnung: Der dokumentierte Wert für Alternativtexte im Stichprobenumfang ist {'images_sampled': 62, 'alt_attribute_share': 0.823, 'missing_alt_examples': ['https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/DSC04869-1920w.png?Expires=179701', 'https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/DSC04851-35e5ddc8-1920w.png?Expir', 'https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/DSC04880-1920w.jpg?Expires=179701', 'https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/Alex-1920w.jpg?Expires=1797019594', 'https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/yannik-1920w.png?Expires=17970195', 'https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/patrizia_v2-b6cd5efc-1920w.png?Ex', 'https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/DSC04828-1920w.jpg?Expires=179701', 'https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/DSC04865-1920w.jpg?Expires=179701'], 'status_rule': 'share of sampled <img> with an alt attribute (empty alt counts as decorative); >=0.95 strong, >=0.85 minor_gaps, >=0.6 mixed, >=0.3 weak', 'collector_version': '1.0.0'} share; im Pixelkiez Bewertungsmodell entspricht das 50/100 und wird als erkennbare Schwäche eingeordnet.
- Unternehmerische Frage: Funktioniert die Website technisch ohne unnötige Reibung?
- Wirkungskanal: RISK_REDUCTION
- Business-Bedeutung: Alternativtexte im Stichprobenumfang ist mit {'images_sampled': 62, 'alt_attribute_share': 0.823, 'missing_alt_examples': ['https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/DSC04869-1920w.png?Expires=179701', 'https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/DSC04851-35e5ddc8-1920w.png?Expir', 'https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/DSC04880-1920w.jpg?Expires=179701', 'https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/Alex-1920w.jpg?Expires=1797019594', 'https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/yannik-1920w.png?Expires=17970195', 'https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/patrizia_v2-b6cd5efc-1920w.png?Ex', 'https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/DSC04828-1920w.jpg?Expires=179701', 'https://le-cdn.website-editor.net/s/b532111ae84b45109a2f2df5c635fb3b/dms3rep/multi/opt/DSC04865-1920w.jpg?Expires=179701'], 'status_rule': 'share of sampled <img> with an alt attribute (empty alt counts as decorative); >=0.95 strong, >=0.85 minor_gaps, >=0.6 mixed, >=0.3 weak', 'collector_version': '1.0.0'} share dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Sample does not establish complete alternative-text quality. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-a11y-04"></a>
### `A11Y-04` - Kontrast-Stichprobe

- Kategorie: accessibility
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: weak
- Wert: {"home_fail": 11, "home_total": 24, "kontakt_fail": 8, "kontakt_total": 21, "observation": "Haupt-Buttons weiße Schrift auf Orange (#E2AC66) = 2,03:1; Ziel nach WCAG 2.2 SC 1.4.3 mind. 4,5:1 (große Schrift 3:1). Startseite 11 von 24, Kontakt 8 von 21 geprüften Farbkombinationen unter Ziel.", "primary_cta_ratio": 2.03}
- Score: 25
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 10.0
- Gewichteter Beitrag: 3.75
- Konfidenz: 4
- Methode/Quelle: Berechnete Kontrastverhältnisse (WCAG-2-Formel); axe color-contrast bestätigend (siehe A11Y-06)
- Schwellenherkunft: W3C WCAG 2.2, SC 1.4.3 Contrast (Minimum), https://www.w3.org/TR/WCAG22/#contrast-minimum
- Evidenzreferenzen: E-5004
- Technische Einordnung: Der dokumentierte Wert für Kontrast-Stichprobe ist {'observation': 'Haupt-Buttons weiße Schrift auf Orange (#E2AC66) = 2,03:1; Ziel nach WCAG 2.2 SC 1.4.3 mind. 4,5:1 (große Schrift 3:1). Startseite 11 von 24, Kontakt 8 von 21 geprüften Farbkombinationen unter Ziel.', 'primary_cta_ratio': 2.03, 'home_fail': 11, 'home_total': 24, 'kontakt_fail': 8, 'kontakt_total': 21}; im Pixelkiez Bewertungsmodell entspricht das 25/100 und wird als deutliche Schwäche eingeordnet.
- Unternehmerische Frage: Funktioniert die Website technisch ohne unnötige Reibung?
- Wirkungskanal: RISK_REDUCTION
- Business-Bedeutung: Kontrast-Stichprobe ist mit {'observation': 'Haupt-Buttons weiße Schrift auf Orange (#E2AC66) = 2,03:1; Ziel nach WCAG 2.2 SC 1.4.3 mind. 4,5:1 (große Schrift 3:1). Startseite 11 von 24, Kontakt 8 von 21 geprüften Farbkombinationen unter Ziel.', 'primary_cta_ratio': 2.03, 'home_fail': 11, 'home_total': 24, 'kontakt_fail': 8, 'kontakt_total': 21} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Stichprobe 2 Seiten; keine Konformitätsaussage
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-001

<a id="metric-a11y-05"></a>
### `A11Y-05` - Formularbeschriftungen

- Kategorie: accessibility
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: strong
- Wert: {"accessible_name_share": 1.0, "collector_version": "1.0.0", "form_controls_sampled": 8, "placeholder_only_controls": 0, "status_rule": "share of visible form controls with label/aria-label/aria-labelledby/title (placeholder alone does not count); 1.0 strong, >=0.85 minor_gaps, >=0.6 mixed, >=0.3 weak"} share
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 10.0
- Gewichteter Beitrag: 15.0
- Konfidenz: 4
- Methode/Quelle: Inspect public form labels/names/instructions without submission. Pixelkiez evidence collector 1.0.0: share of visible form controls with label/aria-label/aria-labelledby/title (placeholder alone does not count); 1.0 strong, >=0.85 minor_gaps, >=0.6 mixed, >=0.3 weak
- Schwellenherkunft: -
- Evidenzreferenzen: E-2016
- Technische Einordnung: Der dokumentierte Wert für Formularbeschriftungen ist {'form_controls_sampled': 8, 'accessible_name_share': 1.0, 'placeholder_only_controls': 0, 'status_rule': 'share of visible form controls with label/aria-label/aria-labelledby/title (placeholder alone does not count); 1.0 strong, >=0.85 minor_gaps, >=0.6 mixed, >=0.3 weak', 'collector_version': '1.0.0'} share; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Funktioniert die Website technisch ohne unnötige Reibung?
- Wirkungskanal: RISK_REDUCTION
- Business-Bedeutung: Formularbeschriftungen ist mit {'form_controls_sampled': 8, 'accessible_name_share': 1.0, 'placeholder_only_controls': 0, 'status_rule': 'share of visible form controls with label/aria-label/aria-labelledby/title (placeholder alone does not count); 1.0 strong, >=0.85 minor_gaps, >=0.6 mixed, >=0.3 weak', 'collector_version': '1.0.0'} share dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Sample does not establish complete accessible form behavior. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-a11y-06"></a>
### `A11Y-06` - Automatisierter Accessibility-Snapshot

- Kategorie: accessibility
- Anwendbar: true
- Messklasse: measured
- Evidenzklasse: E5
- Status: mixed
- Wert: {"home": {"incomplete": 2, "passes": 28, "version": "4.14.0", "violations": [{"help": "Elements must meet minimum color contrast ratio thresholds", "id": "color-contrast", "impact": "serious", "nodes": 34}]}, "kontakt": {"incomplete": 1, "passes": 32, "version": "4.14.0", "violations": [{"help": "Elements must meet minimum color contrast ratio thresholds", "id": "color-contrast", "impact": "serious", "nodes": 41}, {"help": "Links must have discernible text", "id": "link-name", "impact": "serious", "nodes": 2}]}, "tags": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"], "tool": "axe-core 4.14.0"}
- Score: 50
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 10.0
- Gewichteter Beitrag: 7.5
- Konfidenz: 4
- Methode/Quelle: axe-core im gerenderten Browser
- Schwellenherkunft: -
- Evidenzreferenzen: E-5005
- Technische Einordnung: Der dokumentierte Wert für Automatisierter Accessibility-Snapshot ist {'tool': 'axe-core 4.14.0', 'tags': ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'], 'home': {'version': '4.14.0', 'violations': [{'id': 'color-contrast', 'impact': 'serious', 'nodes': 34, 'help': 'Elements must meet minimum color contrast ratio thresholds'}], 'passes': 28, 'incomplete': 2}, 'kontakt': {'version': '4.14.0', 'violations': [{'id': 'color-contrast', 'impact': 'serious', 'nodes': 41, 'help': 'Elements must meet minimum color contrast ratio thresholds'}, {'id': 'link-name', 'impact': 'serious', 'nodes': 2, 'help': 'Links must have discernible text'}], 'passes': 32, 'incomplete': 1}}; im Pixelkiez Bewertungsmodell entspricht das 50/100 und wird als erkennbare Schwäche eingeordnet.
- Unternehmerische Frage: Funktioniert die Website technisch ohne unnötige Reibung?
- Wirkungskanal: RISK_REDUCTION
- Business-Bedeutung: Automatisierter Accessibility-Snapshot ist mit {'tool': 'axe-core 4.14.0', 'tags': ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'], 'home': {'version': '4.14.0', 'violations': [{'id': 'color-contrast', 'impact': 'serious', 'nodes': 34, 'help': 'Elements must meet minimum color contrast ratio thresholds'}], 'passes': 28, 'incomplete': 2}, 'kontakt': {'version': '4.14.0', 'violations': [{'id': 'color-contrast', 'impact': 'serious', 'nodes': 41, 'help': 'Elements must meet minimum color contrast ratio thresholds'}, {'id': 'link-name', 'impact': 'serious', 'nodes': 2, 'help': 'Links must have discernible text'}], 'passes': 32, 'incomplete': 1}} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Automatisierung deckt nur Teil der Kriterien ab
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-001

<a id="metric-trust-01"></a>
### `TRUST-01` - Impressum & rechtliche Oberfläche

- Kategorie: trust_privacy_content
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: strong
- Wert: {"collector_version": "1.0.0", "imprint_url": "https://www.xn--helferbr-6za.de/impressum", "signals": {"address_visible": true, "contact_visible": true, "page_linked": true, "page_reachable": true, "provider_heading": true}, "status_rule": "presence check only: linked+reachable+provider heading+address+contact=strong; reachable with heading=minor_gaps; linked but unreachable=weak; no link found=blocking. Not a legal assessment."}
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 15.0
- Gewichteter Beitrag: 10.0
- Konfidenz: 4
- Methode/Quelle: Check visible imprint/legal surface presence and accessibility. Pixelkiez evidence collector 1.0.0: presence check only: linked+reachable+provider heading+address+contact=strong; reachable with heading=minor_gaps; linked but unreachable=weak; no link found=blocking. Not a legal assessment.
- Schwellenherkunft: -
- Evidenzreferenzen: E-2017
- Technische Einordnung: Der dokumentierte Wert für Impressum & rechtliche Oberfläche ist {'imprint_url': 'https://www.xn--helferbr-6za.de/impressum', 'signals': {'page_linked': True, 'page_reachable': True, 'provider_heading': True, 'address_visible': True, 'contact_visible': True}, 'status_rule': 'presence check only: linked+reachable+provider heading+address+contact=strong; reachable with heading=minor_gaps; linked but unreachable=weak; no link found=blocking. Not a legal assessment.', 'collector_version': '1.0.0'}; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Erzeugt die Website Vertrauen?
- Wirkungskanal: TRUST
- Business-Bedeutung: Impressum & rechtliche Oberfläche ist mit {'imprint_url': 'https://www.xn--helferbr-6za.de/impressum', 'signals': {'page_linked': True, 'page_reachable': True, 'provider_heading': True, 'address_visible': True, 'contact_visible': True}, 'status_rule': 'presence check only: linked+reachable+provider heading+address+contact=strong; reachable with heading=minor_gaps; linked but unreachable=weak; no link found=blocking. Not a legal assessment.', 'collector_version': '1.0.0'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Presence does not establish legal compliance. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-012

<a id="metric-trust-02"></a>
### `TRUST-02` - Datenschutz- & Consent-Oberfläche

- Kategorie: trust_privacy_content
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: strong
- Wert: {"collector_version": "1.0.0", "consent_tool_marker_in_static_html": true, "privacy_page_reachable": true, "privacy_url": "https://www.xn--helferbr-6za.de/privacyb505f5ef", "status_rule": "presence check only: privacy page reachable and (consent tool marker present or no tracker markers)=strong; reachable but trackers without consent marker=minor_gaps; linked but unreachable=weak; none=blocking. Consent behaviour and legality are not assessed.", "tracker_markers_in_static_html": ["googletagmanager.com", "gtag("]}
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 15.0
- Gewichteter Beitrag: 15.0
- Konfidenz: 3
- Methode/Quelle: Inspect visible privacy/consent surface and consistency with observed public behavior where possible. Pixelkiez evidence collector 1.0.0: presence check only: privacy page reachable and (consent tool marker present or no tracker markers)=strong; reachable but trackers without consent marker=minor_gaps; linked but unreachable=weak; none=blocking. Consent behaviour and legality are not assessed.
- Schwellenherkunft: -
- Evidenzreferenzen: E-2018
- Technische Einordnung: Der dokumentierte Wert für Datenschutz- & Consent-Oberfläche ist {'privacy_url': 'https://www.xn--helferbr-6za.de/privacyb505f5ef', 'privacy_page_reachable': True, 'tracker_markers_in_static_html': ['googletagmanager.com', 'gtag('], 'consent_tool_marker_in_static_html': True, 'status_rule': 'presence check only: privacy page reachable and (consent tool marker present or no tracker markers)=strong; reachable but trackers without consent marker=minor_gaps; linked but unreachable=weak; none=blocking. Consent behaviour and legality are not assessed.', 'collector_version': '1.0.0'}; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Erzeugt die Website Vertrauen?
- Wirkungskanal: TRUST
- Business-Bedeutung: Datenschutz- & Consent-Oberfläche ist mit {'privacy_url': 'https://www.xn--helferbr-6za.de/privacyb505f5ef', 'privacy_page_reachable': True, 'tracker_markers_in_static_html': ['googletagmanager.com', 'gtag('], 'consent_tool_marker_in_static_html': True, 'status_rule': 'presence check only: privacy page reachable and (consent tool marker present or no tracker markers)=strong; reachable but trackers without consent marker=minor_gaps; linked but unreachable=weak; none=blocking. Consent behaviour and legality are not assessed.', 'collector_version': '1.0.0'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Surface review is not legal advice or compliance proof. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-010

<a id="metric-trust-03"></a>
### `TRUST-03` - HTTPS & sichtbare Security-Header

- Kategorie: trust_privacy_content
- Anwendbar: true
- Messklasse: measured
- Evidenzklasse: E4
- Status: minor_gaps
- Wert: {"collector_version": "1.0.0", "headers_present": {"content-security-policy": true, "frame_protection": true, "permissions-policy": false, "referrer-policy": false, "strict-transport-security": true, "x-content-type-options": true}, "headers_present_count": 4, "http_redirects_to_https": true, "https_final": true, "status_rule": "no HTTPS=blocking; HTTP not redirected to HTTPS=weak; of HSTS, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame protection: >=5 strong, 4 minor_gaps, 2-3 mixed, <=1 weak"} count
- Score: 75
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 15.0
- Gewichteter Beitrag: 11.25
- Konfidenz: 5
- Methode/Quelle: Check HTTPS and selected public security headers without active exploitation. Pixelkiez evidence collector 1.0.0: no HTTPS=blocking; HTTP not redirected to HTTPS=weak; of HSTS, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame protection: >=5 strong, 4 minor_gaps, 2-3 mixed, <=1 weak
- Schwellenherkunft: -
- Evidenzreferenzen: E-2019
- Technische Einordnung: Der dokumentierte Wert für HTTPS & sichtbare Security-Header ist {'https_final': True, 'http_redirects_to_https': True, 'headers_present': {'strict-transport-security': True, 'content-security-policy': True, 'x-content-type-options': True, 'referrer-policy': False, 'permissions-policy': False, 'frame_protection': True}, 'headers_present_count': 4, 'status_rule': 'no HTTPS=blocking; HTTP not redirected to HTTPS=weak; of HSTS, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame protection: >=5 strong, 4 minor_gaps, 2-3 mixed, <=1 weak', 'collector_version': '1.0.0'} count; im Pixelkiez Bewertungsmodell entspricht das 75/100 und wird als solide Ausprägung mit möglichem Verbesserungsbedarf eingeordnet.
- Unternehmerische Frage: Erzeugt die Website Vertrauen?
- Wirkungskanal: TRUST
- Business-Bedeutung: HTTPS & sichtbare Security-Header ist mit {'https_final': True, 'http_redirects_to_https': True, 'headers_present': {'strict-transport-security': True, 'content-security-policy': True, 'x-content-type-options': True, 'referrer-policy': False, 'permissions-policy': False, 'frame_protection': True}, 'headers_present_count': 4, 'status_rule': 'no HTTPS=blocking; HTTP not redirected to HTTPS=weak; of HSTS, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame protection: >=5 strong, 4 minor_gaps, 2-3 mixed, <=1 weak', 'collector_version': '1.0.0'} count dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Header presence/absence does not prove security posture. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-012

<a id="metric-trust-04"></a>
### `TRUST-04` - Konsistente Unternehmens- & Leistungsdaten

- Kategorie: trust_privacy_content
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: mixed
- Wert: {"contradictions": ["Standortliste Startseite vs. Über uns", "Seitentitel /dresden = Hamburg", "defekter mailto-Link Startseite", "zwei Schreibweisen der Info-E-Mail"], "observation": "Standortangaben widersprechen sich: Startseite/FAQ/Alltagshilfe nennen Berlin, Potsdam, Dresden, Leipzig, Halle, Magdeburg; „Über uns“ nennt Hamburg statt Dresden und an anderer Stelle nur 4 Städte; /hamburg ist öffentlich, /dresden trägt den Seitentitel „Alltagshilfe Hamburg“. E-Mail-Link der Startseite ist defekt („mailto:il: berlin@…“), mobiler Header nutzt info@helferbär.de statt info@helferbaer.de."}
- Score: 50
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 15.0
- Gewichteter Beitrag: 5.0
- Konfidenz: 5
- Methode/Quelle: Abgleich Standort-, E-Mail- und Telefonangaben über 6 Seiten
- Schwellenherkunft: -
- Evidenzreferenzen: E-5009
- Technische Einordnung: Der dokumentierte Wert für Konsistente Unternehmens- & Leistungsdaten ist {'observation': 'Standortangaben widersprechen sich: Startseite/FAQ/Alltagshilfe nennen Berlin, Potsdam, Dresden, Leipzig, Halle, Magdeburg; „Über uns“ nennt Hamburg statt Dresden und an anderer Stelle nur 4 Städte; /hamburg ist öffentlich, /dresden trägt den Seitentitel „Alltagshilfe Hamburg“. E-Mail-Link der Startseite ist defekt („mailto:il: berlin@…“), mobiler Header nutzt info@helferbär.de statt info@helferbaer.de.', 'contradictions': ['Standortliste Startseite vs. Über uns', 'Seitentitel /dresden = Hamburg', 'defekter mailto-Link Startseite', 'zwei Schreibweisen der Info-E-Mail']}; im Pixelkiez Bewertungsmodell entspricht das 50/100 und wird als erkennbare Schwäche eingeordnet.
- Unternehmerische Frage: Erzeugt die Website Vertrauen?
- Wirkungskanal: TRUST
- Business-Bedeutung: Konsistente Unternehmens- & Leistungsdaten ist mit {'observation': 'Standortangaben widersprechen sich: Startseite/FAQ/Alltagshilfe nennen Berlin, Potsdam, Dresden, Leipzig, Halle, Magdeburg; „Über uns“ nennt Hamburg statt Dresden und an anderer Stelle nur 4 Städte; /hamburg ist öffentlich, /dresden trägt den Seitentitel „Alltagshilfe Hamburg“. E-Mail-Link der Startseite ist defekt („mailto:il: berlin@…“), mobiler Header nutzt info@helferbär.de statt info@helferbaer.de.', 'contradictions': ['Standortliste Startseite vs. Über uns', 'Seitentitel /dresden = Hamburg', 'defekter mailto-Link Startseite', 'zwei Schreibweisen der Info-E-Mail']} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Konsistenz beweist keine Richtigkeit
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-003

<a id="metric-trust-05"></a>
### `TRUST-05` - Aktualität sichtbarer Inhalte

- Kategorie: trust_privacy_content
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E6
- Status: mixed
- Wert: {"legacy_pages_public": 8, "observation": "Aktuelle Signale (Team-Eintrag März 2026, Entlastungsbetrag 131 €, Sitemap-Änderungen Nov 2026), aber 8 alte/Entwurfs-/Kopie-Seiten öffentlich in der Sitemap (z. B. /kontakt-alt, /berlin---neu-in-bearbeitung, /kopie-kopie-stellenanzeige…) und „Ab 2025 begleiten wir Sie“ auf /berlin."}
- Score: 50
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 15.0
- Gewichteter Beitrag: 7.5
- Konfidenz: 4
- Methode/Quelle: Sichtbare Daten und Sitemap-Seiten
- Schwellenherkunft: -
- Evidenzreferenzen: E-5008, E-5013
- Technische Einordnung: Der dokumentierte Wert für Aktualität sichtbarer Inhalte ist {'observation': 'Aktuelle Signale (Team-Eintrag März 2026, Entlastungsbetrag 131 €, Sitemap-Änderungen Nov 2026), aber 8 alte/Entwurfs-/Kopie-Seiten öffentlich in der Sitemap (z. B. /kontakt-alt, /berlin---neu-in-bearbeitung, /kopie-kopie-stellenanzeige…) und „Ab 2025 begleiten wir Sie“ auf /berlin.', 'legacy_pages_public': 8}; im Pixelkiez Bewertungsmodell entspricht das 50/100 und wird als erkennbare Schwäche eingeordnet.
- Unternehmerische Frage: Erzeugt die Website Vertrauen?
- Wirkungskanal: TRUST
- Business-Bedeutung: Aktualität sichtbarer Inhalte ist mit {'observation': 'Aktuelle Signale (Team-Eintrag März 2026, Entlastungsbetrag 131 €, Sitemap-Änderungen Nov 2026), aber 8 alte/Entwurfs-/Kopie-Seiten öffentlich in der Sitemap (z. B. /kontakt-alt, /berlin---neu-in-bearbeitung, /kopie-kopie-stellenanzeige…) und „Ab 2025 begleiten wir Sie“ auf /berlin.', 'legacy_pages_public': 8} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: sichtbare Aktualität ≠ betriebliche Aktualität
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-005

<a id="metric-trust-06"></a>
### `TRUST-06` - Referenzen, Belege & Proof Points

- Kategorie: trust_privacy_content
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E6
- Status: minor_gaps
- Wert: {"observation": "Team mit Namen und Rollen, Google-Bewertungen 4,9 (31), verlinkte Presseberichte, Förderlogos. Bewertungen und Kennzahlen erscheinen nur per JavaScript."}
- Score: 75
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 15.0
- Gewichteter Beitrag: 11.25
- Konfidenz: 4
- Methode/Quelle: Belege auf Start- und Über-uns-Seite
- Schwellenherkunft: -
- Evidenzreferenzen: E-5008, E-5012
- Technische Einordnung: Der dokumentierte Wert für Referenzen, Belege & Proof Points ist {'observation': 'Team mit Namen und Rollen, Google-Bewertungen 4,9 (31), verlinkte Presseberichte, Förderlogos. Bewertungen und Kennzahlen erscheinen nur per JavaScript.'}; im Pixelkiez Bewertungsmodell entspricht das 75/100 und wird als solide Ausprägung mit möglichem Verbesserungsbedarf eingeordnet.
- Unternehmerische Frage: Erzeugt die Website Vertrauen?
- Wirkungskanal: TRUST
- Business-Bedeutung: Referenzen, Belege & Proof Points ist mit {'observation': 'Team mit Namen und Rollen, Google-Bewertungen 4,9 (31), verlinkte Presseberichte, Förderlogos. Bewertungen und Kennzahlen erscheinen nur per JavaScript.'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Belege nicht unabhängig geprüft
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-trust-07"></a>
### `TRUST-07` - Kontakttransparenz

- Kategorie: trust_privacy_content
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: strong
- Wert: {"checks": {"contact_page_reachable": true, "email": true, "phone": true, "postal_address": true}, "collector_version": "1.0.0", "status_rule": "contact page, phone, email, postal address on sampled pages; 4/4 strong, 3 minor_gaps, 2 mixed, 1 weak, 0 blocking"} share
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 15.0
- Gewichteter Beitrag: 10.0
- Konfidenz: 4
- Methode/Quelle: Inspect public contact identity, channels and location transparency. Pixelkiez evidence collector 1.0.0: contact page, phone, email, postal address on sampled pages; 4/4 strong, 3 minor_gaps, 2 mixed, 1 weak, 0 blocking
- Schwellenherkunft: -
- Evidenzreferenzen: E-2020
- Technische Einordnung: Der dokumentierte Wert für Kontakttransparenz ist {'checks': {'contact_page_reachable': True, 'phone': True, 'email': True, 'postal_address': True}, 'status_rule': 'contact page, phone, email, postal address on sampled pages; 4/4 strong, 3 minor_gaps, 2 mixed, 1 weak, 0 blocking', 'collector_version': '1.0.0'} share; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Erzeugt die Website Vertrauen?
- Wirkungskanal: TRUST
- Business-Bedeutung: Kontakttransparenz ist mit {'checks': {'contact_page_reachable': True, 'phone': True, 'email': True, 'postal_address': True}, 'status_rule': 'contact page, phone, email, postal address on sampled pages; 4/4 strong, 3 minor_gaps, 2 mixed, 1 weak, 0 blocking', 'collector_version': '1.0.0'} share dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Transparency does not prove responsiveness or service quality. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-trust-08"></a>
### `TRUST-08` - Mess- & Analytics-Bereitschaft

- Kategorie: trust_privacy_content
- Anwendbar: true
- Messklasse: not_assessed
- Evidenzklasse: E8
- Status: not_assessed
- Wert: -
- Score: -
- Score zugelassen: false
- Metrikgewicht: 10.0
- Kategoriegewicht: 15.0
- Gewichteter Beitrag: -
- Konfidenz: 1
- Methode/Quelle: Agent-Versuch, siehe note
- Schwellenherkunft: -
- Evidenzreferenzen: -
- Technische Einordnung: Mess- & Analytics-Bereitschaft wurde nicht belastbar erhoben. Der Bericht behandelt die Lücke als offene Evidenz und nicht als Wert null.
- Unternehmerische Frage: Erzeugt die Website Vertrauen?
- Wirkungskanal: TRUST
- Business-Bedeutung: Für Mess- & Analytics-Bereitschaft liegt keine belastbare Aussage vor; daraus wird keine geschäftliche Wirkung behauptet.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: nicht gemessen; keine Aussage über die Website
- Maßnahmenstatus: NOT_ASSESSED
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-ai-01"></a>
### `AI-01` - Entitätsklarheit

- Kategorie: ai_readiness
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E6
- Status: minor_gaps
- Wert: {"observation": "Marke „Helferbär“ durchgängig, Rechtsträger Helferbär GmbH im Impressum, JSON-LD mit Name/Adresse/Telefon; JSON-LD-Typ MedicalBusiness passt nicht zur nicht-medizinischen Alltagshilfe."}
- Score: 75
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 10.0
- Gewichteter Beitrag: 11.25
- Konfidenz: 4
- Methode/Quelle: Sichtbarer Text + strukturierte Daten
- Schwellenherkunft: -
- Evidenzreferenzen: E-5008, E-5012
- Technische Einordnung: Der dokumentierte Wert für Entitätsklarheit ist {'observation': 'Marke „Helferbär“ durchgängig, Rechtsträger Helferbär GmbH im Impressum, JSON-LD mit Name/Adresse/Telefon; JSON-LD-Typ MedicalBusiness passt nicht zur nicht-medizinischen Alltagshilfe.'}; im Pixelkiez Bewertungsmodell entspricht das 75/100 und wird als solide Ausprägung mit möglichem Verbesserungsbedarf eingeordnet.
- Unternehmerische Frage: Können KI-Systeme das Unternehmen eindeutig verstehen?
- Wirkungskanal: AI_DISCOVERABILITY
- Business-Bedeutung: Entitätsklarheit ist mit {'observation': 'Marke „Helferbär“ durchgängig, Rechtsträger Helferbär GmbH im Impressum, JSON-LD mit Name/Adresse/Telefon; JSON-LD-Typ MedicalBusiness passt nicht zur nicht-medizinischen Alltagshilfe.'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Extrahierbarkeit beweist keine KI-Zitate
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-007

<a id="metric-ai-02"></a>
### `AI-02` - Leistung, Zielgruppe & Standort explizit

- Kategorie: ai_readiness
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E6
- Status: minor_gaps
- Wert: {"observation": "Leistung, Zielgruppe (Senioren, Pflegegrad ab 1, Angehörige), Finanzierung (§ 45b SGB XI, 131 €) und Städte explizit; Städteliste aber seitenweise widersprüchlich."}
- Score: 75
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 10.0
- Gewichteter Beitrag: 11.25
- Konfidenz: 4
- Methode/Quelle: Lesen Leistungs-, FAQ-, Standortseiten
- Schwellenherkunft: -
- Evidenzreferenzen: E-5008, E-5009
- Technische Einordnung: Der dokumentierte Wert für Leistung, Zielgruppe & Standort explizit ist {'observation': 'Leistung, Zielgruppe (Senioren, Pflegegrad ab 1, Angehörige), Finanzierung (§ 45b SGB XI, 131 €) und Städte explizit; Städteliste aber seitenweise widersprüchlich.'}; im Pixelkiez Bewertungsmodell entspricht das 75/100 und wird als solide Ausprägung mit möglichem Verbesserungsbedarf eingeordnet.
- Unternehmerische Frage: Können KI-Systeme das Unternehmen eindeutig verstehen?
- Wirkungskanal: AI_DISCOVERABILITY
- Business-Bedeutung: Leistung, Zielgruppe & Standort explizit ist mit {'observation': 'Leistung, Zielgruppe (Senioren, Pflegegrad ab 1, Angehörige), Finanzierung (§ 45b SGB XI, 131 €) und Städte explizit; Städteliste aber seitenweise widersprüchlich.'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Klarheit beweist keine KI-Sichtbarkeit
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-003

<a id="metric-ai-03"></a>
### `AI-03` - Antwortbarkeit & FAQ-Struktur

- Kategorie: ai_readiness
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E6
- Status: strong
- Wert: {"observation": "FAQ-Seite mit 4 Themenblöcken in Frage-Antwort-Form, FAQ-Block auf Alltagshilfe-Seite, Ratgeber mit Stundenrechner."}
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 10.0
- Gewichteter Beitrag: 15.0
- Konfidenz: 4
- Methode/Quelle: Lesen FAQ/Alltagshilfe/Ratgeber
- Schwellenherkunft: -
- Evidenzreferenzen: E-5008
- Technische Einordnung: Der dokumentierte Wert für Antwortbarkeit & FAQ-Struktur ist {'observation': 'FAQ-Seite mit 4 Themenblöcken in Frage-Antwort-Form, FAQ-Block auf Alltagshilfe-Seite, Ratgeber mit Stundenrechner.'}; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Können KI-Systeme das Unternehmen eindeutig verstehen?
- Wirkungskanal: AI_DISCOVERABILITY
- Business-Bedeutung: Antwortbarkeit & FAQ-Struktur ist mit {'observation': 'FAQ-Seite mit 4 Themenblöcken in Frage-Antwort-Form, FAQ-Block auf Alltagshilfe-Seite, Ratgeber mit Stundenrechner.'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: beweist keine Chatbot-Aufnahme
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-011

<a id="metric-ai-04"></a>
### `AI-04` - Strukturierte Zusammenfassungen & Schema

- Kategorie: ai_readiness
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E4
- Status: strong
- Wert: {"business_entity_fields_checked": ["name", "url", "telephone", "address", "openingHoursSpecification|openingHours", "sameAs", "description"], "business_entity_fields_present": ["name", "url", "telephone", "address", "openingHoursSpecification|openingHours", "sameAs"], "collector_version": "1.0.0", "completeness_share": 0.857, "entity_types": ["MedicalBusiness"], "status_rule": "completeness of the strongest business JSON-LD entity over name,url,telephone,address,opening hours,sameAs,description; >=0.85 strong, >=0.7 minor_gaps, >=0.5 mixed, >=0.2 weak; no entity=weak"} share
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 10.0
- Gewichteter Beitrag: 15.0
- Konfidenz: 4
- Methode/Quelle: Inspect summaries, schema and machine-readable organization of key facts. Pixelkiez evidence collector 1.0.0: completeness of the strongest business JSON-LD entity over name,url,telephone,address,opening hours,sameAs,description; >=0.85 strong, >=0.7 minor_gaps, >=0.5 mixed, >=0.2 weak; no entity=weak
- Schwellenherkunft: -
- Evidenzreferenzen: E-2021
- Technische Einordnung: Der dokumentierte Wert für Strukturierte Zusammenfassungen & Schema ist {'business_entity_fields_present': ['name', 'url', 'telephone', 'address', 'openingHoursSpecification|openingHours', 'sameAs'], 'business_entity_fields_checked': ['name', 'url', 'telephone', 'address', 'openingHoursSpecification|openingHours', 'sameAs', 'description'], 'completeness_share': 0.857, 'entity_types': ['MedicalBusiness'], 'status_rule': 'completeness of the strongest business JSON-LD entity over name,url,telephone,address,opening hours,sameAs,description; >=0.85 strong, >=0.7 minor_gaps, >=0.5 mixed, >=0.2 weak; no entity=weak', 'collector_version': '1.0.0'} share; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Können KI-Systeme das Unternehmen eindeutig verstehen?
- Wirkungskanal: AI_DISCOVERABILITY
- Business-Bedeutung: Strukturierte Zusammenfassungen & Schema ist mit {'business_entity_fields_present': ['name', 'url', 'telephone', 'address', 'openingHoursSpecification|openingHours', 'sameAs'], 'business_entity_fields_checked': ['name', 'url', 'telephone', 'address', 'openingHoursSpecification|openingHours', 'sameAs', 'description'], 'completeness_share': 0.857, 'entity_types': ['MedicalBusiness'], 'status_rule': 'completeness of the strongest business JSON-LD entity over name,url,telephone,address,opening hours,sameAs,description; >=0.85 strong, >=0.7 minor_gaps, >=0.5 mixed, >=0.2 weak; no entity=weak', 'collector_version': '1.0.0'} share dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Structure does not guarantee AI or search presentation. Sampled public pages only; static HTML without JavaScript execution.
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

<a id="metric-ai-05"></a>
### `AI-05` - Zuordnung von Claims zu Belegen

- Kategorie: ai_readiness
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E6
- Status: mixed
- Wert: {"observation": "Aussage „Unsere Zahlen sprechen für sich“ und Kundenstimmen: Werte und Bewertungen fehlen im statischen HTML (nur per JavaScript); „Der einzige Entlastungsdienst, den Sie brauchen“ ohne Beleg."}
- Score: 50
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 10.0
- Gewichteter Beitrag: 7.5
- Konfidenz: 4
- Methode/Quelle: Statisches HTML vs. gerenderte Seite
- Schwellenherkunft: -
- Evidenzreferenzen: E-5008, E-5012
- Technische Einordnung: Der dokumentierte Wert für Zuordnung von Claims zu Belegen ist {'observation': 'Aussage „Unsere Zahlen sprechen für sich“ und Kundenstimmen: Werte und Bewertungen fehlen im statischen HTML (nur per JavaScript); „Der einzige Entlastungsdienst, den Sie brauchen“ ohne Beleg.'}; im Pixelkiez Bewertungsmodell entspricht das 50/100 und wird als erkennbare Schwäche eingeordnet.
- Unternehmerische Frage: Können KI-Systeme das Unternehmen eindeutig verstehen?
- Wirkungskanal: AI_DISCOVERABILITY
- Business-Bedeutung: Zuordnung von Claims zu Belegen ist mit {'observation': 'Aussage „Unsere Zahlen sprechen für sich“ und Kundenstimmen: Werte und Bewertungen fehlen im statischen HTML (nur per JavaScript); „Der einzige Entlastungsdienst, den Sie brauchen“ ohne Beleg.'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: beweist keine Wahrheit der Aussagen
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-007

<a id="metric-ai-06"></a>
### `AI-06` - Faktenkonsistenz über Seiten hinweg

- Kategorie: ai_readiness
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E6
- Status: mixed
- Wert: {"observation": "Kernfakten (Städte, E-Mail-Adresse, Seitentitel /dresden) über Seiten hinweg widersprüchlich; Telefonnummern konsistent."}
- Score: 50
- Score zugelassen: true
- Metrikgewicht: 15.0
- Kategoriegewicht: 10.0
- Gewichteter Beitrag: 7.5
- Konfidenz: 4
- Methode/Quelle: Abgleich Kernfakten über Stichprobenseiten
- Schwellenherkunft: -
- Evidenzreferenzen: E-5009
- Technische Einordnung: Der dokumentierte Wert für Faktenkonsistenz über Seiten hinweg ist {'observation': 'Kernfakten (Städte, E-Mail-Adresse, Seitentitel /dresden) über Seiten hinweg widersprüchlich; Telefonnummern konsistent.'}; im Pixelkiez Bewertungsmodell entspricht das 50/100 und wird als erkennbare Schwäche eingeordnet.
- Unternehmerische Frage: Können KI-Systeme das Unternehmen eindeutig verstehen?
- Wirkungskanal: AI_DISCOVERABILITY
- Business-Bedeutung: Faktenkonsistenz über Seiten hinweg ist mit {'observation': 'Kernfakten (Städte, E-Mail-Adresse, Seitentitel /dresden) über Seiten hinweg widersprüchlich; Telefonnummern konsistent.'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Stichprobe
- Maßnahmenstatus: LINKED_ACTION
- Verknüpfte Empfehlungen: REC-F-003

<a id="metric-ai-07"></a>
### `AI-07` - Thematische Tiefe

- Kategorie: ai_readiness
- Anwendbar: true
- Messklasse: observed
- Evidenzklasse: E6
- Status: strong
- Wert: {"observation": "Themen rund um Entlastungsbetrag, Pflegegrad, Abrechnung, Verhinderungspflege, Reisebegleitung, Einzelfallhilfe abgedeckt (FAQ, Ratgeber, Blog, Stadtseiten)."}
- Score: 100
- Score zugelassen: true
- Metrikgewicht: 10.0
- Kategoriegewicht: 10.0
- Gewichteter Beitrag: 10.0
- Konfidenz: 3
- Methode/Quelle: Lesen der Stichprobe
- Schwellenherkunft: -
- Evidenzreferenzen: E-5008
- Technische Einordnung: Der dokumentierte Wert für Thematische Tiefe ist {'observation': 'Themen rund um Entlastungsbetrag, Pflegegrad, Abrechnung, Verhinderungspflege, Reisebegleitung, Einzelfallhilfe abgedeckt (FAQ, Ratgeber, Blog, Stadtseiten).'}; im Pixelkiez Bewertungsmodell entspricht das 100/100 und wird als starke Ausprägung eingeordnet.
- Unternehmerische Frage: Können KI-Systeme das Unternehmen eindeutig verstehen?
- Wirkungskanal: AI_DISCOVERABILITY
- Business-Bedeutung: Thematische Tiefe ist mit {'observation': 'Themen rund um Entlastungsbetrag, Pflegegrad, Abrechnung, Verhinderungspflege, Reisebegleitung, Einzelfallhilfe abgedeckt (FAQ, Ratgeber, Blog, Stadtseiten).'} dokumentiert. Die geschäftliche Einordnung erfolgt nur über belegte Findings.
- Visual Decision: {"eligible": true, "reason": "deterministic data-shape routing", "visual_type": "SHORT_TEXT"}
- Beweist nicht: Tiefe beweist keine Autorität
- Maßnahmenstatus: NO_ACTION
- Verknüpfte Empfehlungen: NO_ACTION

## Befunde

### F-001: Die Haupt-Buttons sind für schwächere Augen schwer lesbar (Kontrast 2,03:1)

- Kategorie: accessibility
- Schwere: high
- Beobachtung: Weiße Schrift auf Orange (#E2AC66) bei „Jetzt Alltagshilfe anfragen“, „Kostenfrei anfragen“ und „Mehr Erfahren“ erreicht 2,03:1; WCAG 2.2 SC 1.4.3 nennt 4,5:1 (große Schrift 3:1). Startseite 11/24, Kontakt 8/21 geprüfte Farbkombinationen unter Ziel; axe-core meldet color-contrast an 34 bzw. 41 Elementen.
- Kundenwirkung: Senioren mit nachlassender Sehkraft können „Jetzt Alltagshilfe anfragen“ schlechter erkennen – genau dort, wo sie anfragen.
- Maßnahme: Farbwerte der Haupt-Buttons und orangen Textlinks auf mindestens 4,5:1 anheben.
- Verantwortlich: Design / Website-Pflege
- Horizont: now
- Abnahmetest: Kontrast weißer bzw. dunkler Button-Text gegen Button-Hintergrund ≥ 4,5:1; axe color-contrast auf / und /kontakt ohne Treffer bei Buttons.

### F-002: Mobil fehlt der direkte Anruf: Telefonnummern sind nicht antippbar

- Kategorie: ux_conversion
- Schwere: high
- Beobachtung: Auf Startseite und Kontaktseite sind 0 Telefonnummern als tel:-Link hinterlegt (nur /berlin hat einen). Im mobilen Kopfbereich gibt es nur Menü und E-Mail-Symbol; im ersten Sichtbereich weder Anruf- noch Anfrage-Button. Geschäftszeiten Mo–Fr 9–17 Uhr werden prominent genannt.
- Kundenwirkung: Angehörige und Senioren, die lieber anrufen, müssen Nummern abtippen – das kann den Anruf erschweren.
- Maßnahme: tel:-Links für alle Standortnummern; mobiler Anruf-Button im Kopfbereich.
- Verantwortlich: Website-Pflege
- Horizont: now
- Abnahmetest: Auf / und /kontakt ist jede Telefonnummer ein tel:-Link; bei 390 px ist ein Anruf- oder Anfrage-Button ohne Scrollen sichtbar.

### F-003: Standorte und Kontaktdaten widersprechen sich zwischen den Seiten

- Kategorie: trust_privacy_content
- Schwere: high
- Beobachtung: Startseite, FAQ und Alltagshilfe nennen Berlin, Potsdam, Dresden, Leipzig, Halle, Magdeburg. „Über uns“ nennt Hamburg statt Dresden und an anderer Stelle nur 4 Städte; /hamburg ist öffentlich; /dresden trägt den Seitentitel „Alltagshilfe Hamburg“. Der E-Mail-Link der Startseite ist defekt („mailto:il: berlin@…“); mobil verlinkt der Kopf auf info@helferbär.de, das Impressum nennt info@helferbaer.de.
- Kundenwirkung: Interessenten in Dresden oder Hamburg können nicht sicher erkennen, ob Helferbär bei ihnen hilft.
- Maßnahme: Standortliste, Seitentitel /dresden, Footer-Logo-Text, defekten mailto-Link und E-Mail-Schreibweise vereinheitlichen.
- Verantwortlich: Inhalte / Website-Pflege
- Horizont: 0_30_days
- Abnahmetest: Alle Stichprobenseiten nennen dieselbe Standortliste; /dresden-Titel nennt Dresden; kein mailto mit 'il:'; eine einheitliche Info-Adresse.

### F-004: Mobil erscheint der Hauptinhalt der Startseite im Labortest erst nach 5,9 s

- Kategorie: performance_technology
- Schwere: medium
- Beobachtung: Lighthouse 12.8.2 mobil (3 Läufe, Median): Performance 53/100, LCP 5,9 s (Ziel ≤ 2,5 s laut web.dev), Total Blocking Time 534 ms. Desktop: 89/100, LCP 1,6 s. 0 % der Bilder in WebP/AVIF, kein srcset, kein Lazy Loading; Cookie-Skript blockiert das Rendern im Head.
- Kundenwirkung: Wer mobil mit schwacher Verbindung sucht, wartet spürbar, bevor Angebot und Anfrage-Button sichtbar werden.
- Maßnahme: Bildformate/-größen optimieren, Lazy Loading unterhalb des ersten Bildschirms, Render-Blocker im Head reduzieren.
- Verantwortlich: Website-Pflege / Hosting
- Horizont: 31_90_days
- Abnahmetest: Lighthouse mobil (3 Läufe, Median) LCP ≤ 2,5 s oder Performance ≥ 75.

### F-005: Acht alte Entwurfs- und Kopie-Seiten sind öffentlich und stehen in der Sitemap

- Kategorie: trust_privacy_content
- Schwere: medium
- Beobachtung: In sitemap.xml stehen u. a. /startseite, /kontakt-alt, /unser-team-alt, /leistungen---pflegeberatung--alt, /berlin---neu-in-bearbeitung, /kopie-kopie-stellenanzeige-pflegefachkraft-hamburg, /unsere-dienste, /standorte – alle Status 200, ohne noindex, Canonical auf sich selbst.
- Kundenwirkung: Suchende können auf veraltete Kontakt- oder Teamseiten gelangen und dort andere Angaben finden.
- Maßnahme: Alt-/Entwurfsseiten entfernen oder 301 weiterleiten; Sitemap bereinigen.
- Verantwortlich: Website-Pflege
- Horizont: 0_30_days
- Abnahmetest: Keine URL mit -alt, neu-in-bearbeitung oder kopie in sitemap.xml; die 8 URLs liefern 301 oder 404/410.

### F-006: Zwei Cookie-Hinweise gleichzeitig, einer davon auf Englisch

- Kategorie: ux_conversion
- Schwere: medium
- Beobachtung: Beim ersten Aufruf erscheinen ein englischsprachiger Termly-Consent-Banner und zusätzlich ein deutscher Cookie-Hinweis des Baukastens. Mobil überdecken beide den unteren Teil des ersten Bildschirms.
- Kundenwirkung: Ältere Besucher sehen zuerst englischen Text statt des Angebots; das kann gleich zu Beginn verunsichern.
- Maßnahme: Termly-Banner auf Deutsch umstellen, Baukasten-Cookie-Hinweis deaktivieren; Consent-Konfiguration fachlich prüfen lassen.
- Verantwortlich: Website-Pflege / Datenschutz
- Horizont: 0_30_days
- Abnahmetest: Beim Erstaufruf erscheint genau ein deutschsprachiger Hinweis.

### F-007: Kennzahlen und Bewertungen stehen nicht im lesbaren Seitentext

- Kategorie: ai_readiness
- Schwere: medium
- Beobachtung: Im statischen HTML der Startseite fehlen die Kennzahlen (seit 2019, 6 Standorte, 274 Helfer, 917 Klienten) und die Google-Bewertungen (4,9 aus 31); beide erscheinen nur per JavaScript. JSON-LD-Typ ist MedicalBusiness, obwohl die Seite nicht-medizinische Alltagshilfe beschreibt.
- Kundenwirkung: Dienste, die Seiten ohne Skripte lesen, sehen die stärksten Belege (4,9 Sterne, 917 Klienten) nicht.
- Maßnahme: Zahlen statisch ausgeben (Animation optional darüber); Bewertungszusammenfassung als Text; JSON-LD-Typ prüfen.
- Verantwortlich: Inhalte / Website-Pflege
- Horizont: 31_90_days
- Abnahmetest: curl der Startseite enthält '917' und '4,9'.

### F-008: Die Hauptüberschrift bricht auf dem Handy mitten im Wort

- Kategorie: ux_conversion
- Schwere: low
- Beobachtung: Bei iPhone-Darstellung bricht die H1 „Entlastungsdienst“ als „Entlastung | sdienst“ ohne Trennstrich.
- Kundenwirkung: Der erste Eindruck wirkt unfertig, und das Angebot ist schwerer auf einen Blick zu erfassen.
- Maßnahme: Mobile Schriftgröße der H1 reduzieren oder weiche Trennung einfügen.
- Verantwortlich: Website-Pflege
- Horizont: 0_30_days
- Abnahmetest: Bei 390 px bricht kein Wort der H1 ohne Trennstrich.

### F-009: Einige Karussell-Elemente zeigen beim Tabben keinen Fokus

- Kategorie: accessibility
- Schwere: low
- Beobachtung: Startseite: 23 von 30 Tab-Stopps mit sichtbarer Fokusanzeige; 7 DIV-Stopps (Karussell) ohne outline/box-shadow.
- Kundenwirkung: Menschen, die ohne Maus surfen, verlieren dort kurz die Orientierung.
- Maßnahme: focus-visible-Stil für Karussell-Container.
- Verantwortlich: Website-Pflege
- Horizont: 31_90_days
- Abnahmetest: 30 von 30 Tab-Stopps mit sichtbarer Fokusanzeige.

### F-010: Prüfhinweis: Mess-Signale vor der Cookie-Entscheidung

- Kategorie: trust_privacy_content
- Schwere: low
- Beobachtung: Ohne Interaktion mit dem Banner wurden Anfragen an google-analytics.com/g/collect (Consent-Status gcs=G100) und pagead2.googlesyndication.com/ccm/collect sowie Cookies _sp_id/_sp_ses und dm_* beobachtet. Keine rechtliche Bewertung.
- Kundenwirkung: Ob das zur gewählten Einwilligungslösung passt, sollte fachlich geprüft werden.
- Maßnahme: Consent-Mode-/Tag-Konfiguration fachlich prüfen.
- Verantwortlich: Datenschutz
- Horizont: 31_90_days
- Abnahmetest: Dokumentierte fachliche Prüfung.

### F-011: Stärke: Angebot, Finanzierung und Ablauf sind klar erklärt

- Kategorie: ux_conversion
- Schwere: positive
- Beobachtung: Desktop-Startseite nennt Angebot, Abrechnung über die Pflegekasse und Städte im ersten Sichtbereich; FAQ mit 4 Themenblöcken; 3-Schritte-Ablauf; Google-Bewertungen 4,9 (31); verlinkte Presseberichte.
- Kundenwirkung: Interessenten finden Antworten auf ihre wichtigsten Fragen, bevor sie anfragen.
- Maßnahme: Beibehalten.
- Verantwortlich: Inhalte
- Horizont: monitor
- Abnahmetest: Beträge und FAQ jährlich geprüft.

### F-012: Stärke: solide technische Basis

- Kategorie: findability_seo
- Schwere: positive
- Beobachtung: HTTPS mit Weiterleitung, robots.txt und Sitemap (64 URLs), Canonicals, strukturierte Unternehmensdaten (JSON-LD), Impressum und Datenschutz verlinkt, Kompression und Caching aktiv.
- Kundenwirkung: Die Website hat eine solide technische Grundlage; ein Neubau ist dafür nicht nötig.
- Maßnahme: Beibehalten.
- Verantwortlich: Website-Pflege
- Horizont: monitor
- Abnahmetest: Collector-Wiederholung ohne Verschlechterung.

### F-013: Rechtlicher Prüfhinweis

- Kategorie: trust_privacy_content
- Schwere: medium
- Beobachtung: Bei den Anbieterangaben besteht ein konkreter Prüfhinweis zu berufs- oder aufsichtsrechtliche Angaben.
- Kundenwirkung: Je nach Sitz und Geschäftsmodell können zentrale Anbieterpflichten und die Vertragspartnertransparenz betroffen sein.
- Maßnahme: Anbieterangaben anhand der einschlägigen Rechtslage prüfen und erforderliche Angaben nachvollziehbar ergänzen lassen.
- Verantwortlich: Rechtsberatung + ggf. Steuerberatung
- Horizont: 0_30_days
- Abnahmetest: Erneute Anbieterkennzeichnungs-Prüfung ohne denselben belegten oder prüfbedürftigen Hinweis.

## Priorisierte Maßnahmen

### REC-F-001

- Befund: F-001
- Schwere: high
- Maßnahme: Farbwerte der Haupt-Buttons und orangen Textlinks auf mindestens 4,5:1 anheben.
- Verantwortlich: Design / Website-Pflege
- Horizont: now
- Abnahmetest: Kontrast weißer bzw. dunkler Button-Text gegen Button-Hintergrund ≥ 4,5:1; axe color-contrast auf / und /kontakt ohne Treffer bei Buttons.

### REC-F-002

- Befund: F-002
- Schwere: high
- Maßnahme: tel:-Links für alle Standortnummern; mobiler Anruf-Button im Kopfbereich.
- Verantwortlich: Website-Pflege
- Horizont: now
- Abnahmetest: Auf / und /kontakt ist jede Telefonnummer ein tel:-Link; bei 390 px ist ein Anruf- oder Anfrage-Button ohne Scrollen sichtbar.

### REC-F-003

- Befund: F-003
- Schwere: high
- Maßnahme: Standortliste, Seitentitel /dresden, Footer-Logo-Text, defekten mailto-Link und E-Mail-Schreibweise vereinheitlichen.
- Verantwortlich: Inhalte / Website-Pflege
- Horizont: 0_30_days
- Abnahmetest: Alle Stichprobenseiten nennen dieselbe Standortliste; /dresden-Titel nennt Dresden; kein mailto mit 'il:'; eine einheitliche Info-Adresse.

### REC-F-004

- Befund: F-004
- Schwere: medium
- Maßnahme: Bildformate/-größen optimieren, Lazy Loading unterhalb des ersten Bildschirms, Render-Blocker im Head reduzieren.
- Verantwortlich: Website-Pflege / Hosting
- Horizont: 31_90_days
- Abnahmetest: Lighthouse mobil (3 Läufe, Median) LCP ≤ 2,5 s oder Performance ≥ 75.

### REC-F-005

- Befund: F-005
- Schwere: medium
- Maßnahme: Alt-/Entwurfsseiten entfernen oder 301 weiterleiten; Sitemap bereinigen.
- Verantwortlich: Website-Pflege
- Horizont: 0_30_days
- Abnahmetest: Keine URL mit -alt, neu-in-bearbeitung oder kopie in sitemap.xml; die 8 URLs liefern 301 oder 404/410.

### REC-F-006

- Befund: F-006
- Schwere: medium
- Maßnahme: Termly-Banner auf Deutsch umstellen, Baukasten-Cookie-Hinweis deaktivieren; Consent-Konfiguration fachlich prüfen lassen.
- Verantwortlich: Website-Pflege / Datenschutz
- Horizont: 0_30_days
- Abnahmetest: Beim Erstaufruf erscheint genau ein deutschsprachiger Hinweis.

### REC-F-007

- Befund: F-007
- Schwere: medium
- Maßnahme: Zahlen statisch ausgeben (Animation optional darüber); Bewertungszusammenfassung als Text; JSON-LD-Typ prüfen.
- Verantwortlich: Inhalte / Website-Pflege
- Horizont: 31_90_days
- Abnahmetest: curl der Startseite enthält '917' und '4,9'.

### REC-F-008

- Befund: F-008
- Schwere: low
- Maßnahme: Mobile Schriftgröße der H1 reduzieren oder weiche Trennung einfügen.
- Verantwortlich: Website-Pflege
- Horizont: 0_30_days
- Abnahmetest: Bei 390 px bricht kein Wort der H1 ohne Trennstrich.

### REC-F-009

- Befund: F-009
- Schwere: low
- Maßnahme: focus-visible-Stil für Karussell-Container.
- Verantwortlich: Website-Pflege
- Horizont: 31_90_days
- Abnahmetest: 30 von 30 Tab-Stopps mit sichtbarer Fokusanzeige.

### REC-F-010

- Befund: F-010
- Schwere: low
- Maßnahme: Consent-Mode-/Tag-Konfiguration fachlich prüfen.
- Verantwortlich: Datenschutz
- Horizont: 31_90_days
- Abnahmetest: Dokumentierte fachliche Prüfung.

### REC-F-011

- Befund: F-011
- Schwere: positive
- Maßnahme: Beibehalten.
- Verantwortlich: Inhalte
- Horizont: monitor
- Abnahmetest: Beträge und FAQ jährlich geprüft.

### REC-F-012

- Befund: F-012
- Schwere: positive
- Maßnahme: Beibehalten.
- Verantwortlich: Website-Pflege
- Horizont: monitor
- Abnahmetest: Collector-Wiederholung ohne Verschlechterung.

### REC-F-013

- Befund: F-013
- Schwere: medium
- Maßnahme: Anbieterangaben anhand der einschlägigen Rechtslage prüfen und erforderliche Angaben nachvollziehbar ergänzen lassen.
- Verantwortlich: Rechtsberatung + ggf. Steuerberatung
- Horizont: 0_30_days
- Abnahmetest: Erneute Anbieterkennzeichnungs-Prüfung ohne denselben belegten oder prüfbedürftigen Hinweis.

## Messdaten-Enrichment

- Keine externe Messdaten-Anreicherung beigefügt.

## Vibe-Check #03 (nicht scorewirksam)

- Keine Vibe-Check-03-Diagnostik angefügt.

## Quellen und Methoden

### S-001: Helferbär Startseite

- Typ: primary
- Ort: https://www.xn--helferbr-6za.de/
- Zweck: First-Party-Evidenz Angebot, Zielgruppe, Standorte

### S-002: Helferbär – Leistungen Alltagshilfe

- Typ: primary
- Ort: https://www.xn--helferbr-6za.de/leistungen-alltagshilfe
- Zweck: Branchennachweis: lokale Dienstleistung (Alltagshilfe) mit Anfrage-Modell

### S-003: Helferbär Impressum

- Typ: primary
- Ort: https://www.xn--helferbr-6za.de/impressum
- Zweck: Anbieteridentität, Rechtsform, Register

### S-004: web.dev – Web Vitals (zuletzt aktualisiert 2024-10-31)

- Typ: primary
- Ort: https://web.dev/articles/vitals
- Zweck: LCP/CLS-Schwellen, abgerufen 2026-11-11

### S-005: Lighthouse performance scoring

- Typ: primary
- Ort: https://developer.chrome.com/docs/lighthouse/performance/performance-scoring
- Zweck: Score-Bänder, abgerufen 2026-11-11

### S-006: W3C WCAG 2.2 SC 1.4.3 Contrast (Minimum)

- Typ: primary
- Ort: https://www.w3.org/TR/WCAG22/#contrast-minimum
- Zweck: Kontrast-Zielwerte 4,5:1 / 3:1

### S-007: Websuche-Stichprobe (US-only Suchwerkzeug), 8 Abfragen

- Typ: uncertain
- Ort: Claude WebSearch, 2026-11-11
- Zweck: nicht gewertet: für DE-Markt nicht repräsentativ

### S-008: Drittanbieter-Verzeichnisse (pflege-helfer24.de, pflegesuche.de)

- Typ: secondary
- Ort: https://pflege-helfer24.de/pflegedienste/helferbar
- Zweck: Kontext: externe Einträge mit abweichenden Adressen/Standorten (nicht gewertet)

### SRC-LEGAL-IMP: Pixelkiez Impressum Compliance Sidecar

- Typ: derived
- Ort: impressum-compliance.json
- Zweck: Non-core legal customer-risk projection

## Abdeckung, Grenzen und offene Evidenz

### Abdeckung

```json
{
  "capabilities": [
    {
      "id": "public_http_fetch",
      "note": "derived from active core execution bundle",
      "status": "available"
    },
    {
      "id": "public_page_render",
      "note": "derived from active core execution bundle; browser_rendering_source_declared=true; browser_execution_independently_verified=false; scoreable_source_families=BROWSER_RENDERING,RULE_BASED_QUALITATIVE_OBSERVATION",
      "status": "available"
    },
    {
      "id": "html_inspection",
      "note": "derived from active core execution bundle",
      "status": "available"
    },
    {
      "id": "crawl_sample",
      "note": "derived from active core execution bundle",
      "status": "available"
    },
    {
      "id": "search_sample",
      "note": "derived from active core execution bundle",
      "status": "unavailable"
    },
    {
      "id": "structured_data_inspection",
      "note": "derived from active core execution bundle",
      "status": "available"
    },
    {
      "id": "performance_field",
      "note": "derived from active core execution bundle",
      "status": "unavailable"
    },
    {
      "id": "performance_lab",
      "note": "derived from active core execution bundle",
      "status": "available"
    },
    {
      "id": "asset_inspection",
      "note": "derived from active core execution bundle",
      "status": "available"
    },
    {
      "id": "header_inspection",
      "note": "derived from active core execution bundle",
      "status": "available"
    },
    {
      "id": "accessibility_manual_sample",
      "note": "derived from active core execution bundle",
      "status": "available"
    },
    {
      "id": "accessibility_automation",
      "note": "derived from active core execution bundle",
      "status": "available"
    },
    {
      "id": "content_inspection",
      "note": "derived from active core execution bundle",
      "status": "available"
    },
    {
      "id": "private_measurement_export",
      "note": "derived from active core execution bundle",
      "status": "unavailable"
    }
  ],
  "not_tested": [
    "Core-Web-Vitals-Felddaten (CrUX)",
    "repräsentative deutsche Suchstichprobe (Marke, site:, Non-Brand)",
    "Search Console / Analytics",
    "Formular-Fehlerzustände (kein Absenden)",
    "Screenreader- und vollständige WCAG-Prüfung",
    "Blog-Artikel im Einzelnen",
    "Login-Bereich app.helferbaer.de"
  ],
  "sampled_pages": [
    {
      "accessed_at": "2026-11-11T21:20:00+01:00",
      "page_type": "Startseite",
      "url": "https://www.xn--helferbr-6za.de/"
    },
    {
      "accessed_at": "2026-11-11T21:20:00+01:00",
      "page_type": "Leistungsübersicht",
      "url": "https://www.xn--helferbr-6za.de/unsere-dienstleistungen"
    },
    {
      "accessed_at": "2026-11-11T21:20:00+01:00",
      "page_type": "Leistung Alltagshilfe",
      "url": "https://www.xn--helferbr-6za.de/leistungen-alltagshilfe"
    },
    {
      "accessed_at": "2026-11-11T21:20:00+01:00",
      "page_type": "Standortseite Berlin",
      "url": "https://www.xn--helferbr-6za.de/berlin"
    },
    {
      "accessed_at": "2026-11-11T21:20:00+01:00",
      "page_type": "Kontakt",
      "url": "https://www.xn--helferbr-6za.de/kontakt"
    },
    {
      "accessed_at": "2026-11-11T21:20:00+01:00",
      "page_type": "Über uns",
      "url": "https://www.xn--helferbr-6za.de/ueber-uns"
    },
    {
      "accessed_at": "2026-11-11T21:20:00+01:00",
      "page_type": "FAQ",
      "url": "https://www.xn--helferbr-6za.de/faq"
    },
    {
      "accessed_at": "2026-11-11T21:20:00+01:00",
      "page_type": "Ratgeber",
      "url": "https://www.xn--helferbr-6za.de/ratgeber"
    },
    {
      "accessed_at": "2026-11-11T21:20:00+01:00",
      "page_type": "Pflegeberatung",
      "url": "https://www.xn--helferbr-6za.de/pflegeberatung"
    },
    {
      "accessed_at": "2026-11-11T21:20:00+01:00",
      "page_type": "Impressum",
      "url": "https://www.xn--helferbr-6za.de/impressum"
    },
    {
      "accessed_at": "2026-11-11T21:20:00+01:00",
      "page_type": "Datenschutz",
      "url": "https://www.xn--helferbr-6za.de/privacyb505f5ef"
    },
    {
      "accessed_at": "2026-11-11T21:20:00+01:00",
      "page_type": "Standortseite Hamburg",
      "url": "https://www.xn--helferbr-6za.de/hamburg"
    },
    {
      "accessed_at": "2026-11-11T21:20:00+01:00",
      "page_type": "Standortseite Dresden",
      "url": "https://www.xn--helferbr-6za.de/dresden"
    }
  ],
  "tools_available": [
    "Live-HTTP/HTML-Collector",
    "Playwright/Chromium-Rendering mobil/desktop",
    "Lighthouse 12.8.2 (Labor)",
    "axe-core 4.14.0",
    "Websuche (US-only)"
  ],
  "tools_unavailable": [
    "CrUX/PageSpeed-API (kein Schlüssel, HTTP 429)",
    "Search Console",
    "Analytics",
    "lokalisierte DE-SERP-Abfrage"
  ]
}
```

### Grenzen

- Stichprobe von 13 öffentlichen Seiten; keine Aussage über die gesamte Website.
- Labordaten (Lighthouse aus Rechenzentrum) sind keine Felddaten realer Besucher.
- Kontrast-/Tastatur-/axe-Prüfungen sind Stichproben, keine WCAG-Konformitätsprüfung.
- Datenschutz-Beobachtungen sind Oberflächenbefunde, kein Rechtsgutachten.
- Keine Aussage zu Anfragezahlen, Umsatz oder Rankings.
- Legal findings are evidence-bounded review signals, not legal certification or penalty prediction.

### MISSING

- CrUX-Felddaten
- Repräsentative DE-Suchstichprobe
- Search Console / Analytics des Inhabers

### SOURCE_NEEDED

- Ob die Anerkennung als Angebot zur Unterstützung im Alltag eine Aufsichtsangabe im Impressum erfordert (§ 5 Abs. 1 Nr. 3 DDG) – fachliche Prüfung.
