# Meta Instagram App-Freigabe & ANA Live-Content-Intelligence

**Recherchestand:** 2026-10-13 (alle Quellen an diesem Tag abgerufen)
**Zielkonto:** Instagram-Profil `anasavu` (Professional-Status: `UNKNOWN`, siehe §2)
**Klassifizierung:** G1 (internes Projektwissen). Keine Tokens, keine G2/G3-Daten in dieser Datei.

> **Ehrlichkeitshinweis zur Methodik:** In dieser Session stand **kein** Meta-Developer-Zugang, keine App-ID,
> kein App-Secret und kein Access-Token zur Verfügung. **Es wurde kein einziger echter API-Call ausgeführt.**
> Alle Aussagen sind Dokumentenbelege (`SOURCE_VERIFIED`) oder ausdrücklich offen (`UNKNOWN`, `NOT_TESTED`,
> `BLOCKED`). Kein End-to-End-Test wird als bestanden behauptet.

---

## 1. Executive Decision

**Ja — Anas Konto kann sofort unter Standard Access angebunden werden. App Review und Business Verification
sind dafür nicht erforderlich.**

Beleg (Instagram Platform Overview, „Access levels"):

> „Standard Access is the default access level for all apps … If your app only serves your Instagram
> professional account or an account you manage, **Standard Access is all your app needs**."

Und derselbe Text, entscheidend für den Piloten:

> „**If your app serves only your Instagram professional accounts, or accounts you manage, you do not need to
> implement a login flow.** However, you will need to configure the business login settings in the App
> Dashboard to obtain an Instagram app ID and an Instagram app secret, as well as obtain long-lived access
> tokens to use in your API calls."

App-Review-Dokument, gleicher Tenor:

> „**If your app will only be used by app users who have a role on the app itself, App Review is not
> required.**"

### Die Entscheidung in einem Satz

Der ANA-Pilot ist **kein** SaaS-Projekt, solange genau ein Konto angebunden ist und die Person, deren Konto
gelesen wird, **eine Rolle auf der App** hat (Admin, Developer oder Instagram Tester). Dann:

| Frage | Antwort |
|---|---|
| App Review nötig? | **Nein** |
| Business Verification nötig? | **Nein** |
| OAuth-Login-Flow implementieren? | **Nein** (Token wird im Dashboard generiert) |
| App in Live-Modus? | Nicht für den Datenabruf nötig; aber Achtung bei Webhooks (§6) |
| Facebook Page nötig? | **Nein** — nicht bei „Instagram API with Instagram Login" |
| Kontotyp | Business **oder** Creator — beide zulässig |

### Die drei Dinge, die sofort anders werden, sobald ein zweiter, fremder Creator dazukommt

1. **Advanced Access** wird Pflicht (App Review **und** Business Verification).
2. **Webhooks** sind ohnehin erst mit Advanced Access + Live-App verfügbar (§6) — der Pilot lebt also von
   Polling, nicht von Push.
3. Die **„Private apps"-Ausnahme** erlaubt bei nicht testbarer App nur `instagram_basic` und
   `instagram_manage_comments` — **nicht** die Insights-Permission. Eine rein interne App kann sich also
   Insights nicht per „private app"-Review beschaffen.

---

## 2. Zwei-Szenarien-Matrix

### Legende der Prüftags

`SOURCE_VERIFIED` = Aussage aus Primärdokument gelesen · `NOT_TESTED` = nicht praktisch geprüft ·
`BLOCKED` = in dieser Session nicht prüfbar (kein Meta-Zugang) · `UNKNOWN` = kein Beleg gefunden ·
`CONDITIONAL` = gilt nur unter genannter Bedingung.

### Szenario A — „ANA-Pilot" (ein Konto, Ana hat App-Rolle)

| Dimension | Wert | Tag |
|---|---|---|
| Access Level | Standard Access | SOURCE_VERIFIED |
| App Review | Nicht erforderlich | SOURCE_VERIFIED |
| Business Verification | Nicht erforderlich | SOURCE_VERIFIED |
| App-Rolle für Ana | Admin, Developer **oder** Instagram Tester | SOURCE_VERIFIED |
| Login-Flow implementieren | Nicht nötig; Dashboard-Token genügt | SOURCE_VERIFIED |
| Token-Laufzeit | 60 Tage (long-lived), refreshbar | SOURCE_VERIFIED |
| Lesezugriff Posts | `GET /<IG_USER_ID>/media` mit `instagram_business_basic` | SOURCE_VERIFIED |
| Media-Insights | `GET /<IG_MEDIA_ID>/insights` mit `instagram_business_basic` + `instagram_business_manage_insights` | SOURCE_VERIFIED |
| Account-Insights | `GET /<IG_USER_ID>/insights`, dito Permissions | SOURCE_VERIFIED |
| Kommentare lesen | `instagram_business_manage_comments` (+ `instagram_business_basic`) | SOURCE_VERIFIED |
| Webhooks | **De-facto nicht verfügbar** (Advanced Access + Live gefordert) | SOURCE_VERIFIED |
| Facebook Page | Nicht erforderlich | SOURCE_VERIFIED |
| Kontotyp | Business oder Creator | SOURCE_VERIFIED |
| Ana ist Professional Account | **UNKNOWN** — muss vor Schritt 1 geprüft werden | UNKNOWN |

### Szenario B — „Multi-Creator-SaaS" (beliebige fremde Creator)

| Dimension | Wert | Tag |
|---|---|---|
| Access Level | Advanced Access | SOURCE_VERIFIED |
| App Review | Erforderlich, **pro Permission** | SOURCE_VERIFIED |
| Business Verification | Erforderlich („required for all apps making requests for Advanced Access") | SOURCE_VERIFIED |
| App-Modus | Live | SOURCE_VERIFIED (Webhook-Kontext) |
| Login-Flow | Pflicht (Business Login for Instagram, OAuth Authorization Code) | SOURCE_VERIFIED |
| Data Use Checkup | Jährlich möglich („may also be required to complete an annual Data Use Checkup") | SOURCE_VERIFIED |
| Data Handling Questions | Möglich („may need to complete data handling questions") | SOURCE_VERIFIED |
| Reviewer-Testbarkeit | Zwingend — sonst Gesamtablehnung | SOURCE_VERIFIED |
| Webhooks | Verfügbar (Advanced Access, Live, Business Verification „for production access") | SOURCE_VERIFIED |

### Die acht Szenarien aus Forschungsfrage A

| # | Szenario | Access | App-Rolle | Business Verification | App Review | Modus | Datenabruf möglich? | Beleg |
|---|---|---|---|---|---|---|---|---|
| 1 | App gehört Ana selbst | Standard | Ana = Admin | Nein | Nein | Development reicht | Ja (Token via Dashboard) | Overview „Access levels"; App Review Doc |
| 2 | Ana ist Tester/andere Rolle | Standard | Instagram Tester / Developer / Admin | Nein | Nein | Development reicht | Ja | Access Levels: „Permissions with Standard Access can only be requested from app users who have a **role** on the requesting app" |
| 3 | Betreiber verwaltet Anas Konto | Standard | Betreiber hat Rolle; Ana erteilt ggf. OAuth-Consent | Nein | Nein | Development reicht | Ja — „accounts you own **or manage**" | Overview „Access levels" |
| 4 | Interne Nutzung, genau ein Konto | Standard | wie oben | Nein | Nein | Development reicht | Ja | Overview: „If your app serves only your Instagram professional accounts, or accounts you manage, you do not need to implement a login flow" |
| 5 | Produktive Nutzung unter Standard Access | Standard | Alle Nutzer brauchen App-Rolle | Nein | Nein | Live möglich, aber Rollen bleiben beschränkend | Ja, aber **nur** für Personen mit Rolle | Access Levels Doc |
| 6 | Beliebige externe Creator | **Advanced** | keine Rolle nötig | **Ja** | **Ja** | Live | Ja nach Freigabe | Overview „Advanced Access" |
| 7 | Ausschließlich lesende App | Standard (ein Konto) / Advanced (fremde Konten) | wie oben | nur bei Advanced | nur bei Advanced | wie oben | Ja — Lesezugriff ist nicht privilegiert | IG Media / IG User / Insights Requirements-Tabellen |
| 8 | Zusätzlich Kommentare / Insights / Webhooks | Kommentare+Insights: wie #7. **Webhooks: zwingend Advanced** | wie oben | Webhooks: ja | Webhooks: ja | Webhooks: Live | Kommentare/Insights ja; Webhooks nur nach Freigabe | Webhooks Setup: „Access level: Advanced Access", „Your app must be **Live**" |

### Unterscheidung, die oft verwechselt wird

| Begriff | Bedeutung | Konsequenz |
|---|---|---|
| **Kontoinhaberschaft** | Wem gehört das Instagram-Konto | Entscheidet über „own" in „own or manage" |
| **Managementrechte** | Wer darf das Konto geschäftlich verwalten | Reicht für Standard Access („or manage") |
| **App-Rolle** | Admin / Developer / Instagram Tester **auf der Meta-App** | Der eigentliche Gatekeeper für Standard Access |
| **OAuth-Einwilligung** | Explizite Consent-Erteilung im Autorisierungsfenster | Nur nötig, wenn ein Login-Flow implementiert wird |

**Praktische Konsequenz:** Für den ANA-Piloten ist die **App-Rolle** der entscheidende Hebel — nicht die
Inhaberschaft. Ana muss als Instagram Tester (oder Admin/Developer) auf der App stehen, damit ihr Konto unter
Standard Access verbunden werden kann.

---

## 3. Meta-App-Registrierungscheckliste (exakte Klickreihenfolge)

> **Dashboard-Varianten-Warnung:** Meta rollt das App Dashboard in Varianten aus. Der Use-Case-Name und die
> Menüpfade können abweichen. Die hier genannte Reihenfolge folgt der offiziellen Seite „Create an App —
> Instagram Platform". Wo die aktuelle UI abweicht, ist das im Feld „Abweichung" vermerkt. **UNKNOWN** bleibt,
> was Meta genau am 13.10.2026 für euren Workspace ausrollt — das ist erst nach dem Einloggen sichtbar.

### Phase 0 — Vorbedingungen (vor der App-Erstellung klären)

| # | Prüfung | Status |
|---|---|---|
| 0.1 | Ist `anasavu` ein Professional Account (Business oder Creator)? | **UNKNOWN** — in der Instagram-App prüfen: Einstellungen → Kontotyp |
| 0.2 | Existiert ein Meta-Developer-Konto? | **UNKNOWN** |
| 0.3 | Existiert ein Meta Business Portfolio? | **UNKNOWN** — für Standard Access **nicht** Pflicht, aber App-Erstellung fragt nach Zuordnung |
| 0.4 | Wer soll App-Admin sein (Ben? Ana? beide?) | Entscheidung ausstehend |
| 0.5 | HTTPS-Domain für Redirect URI vorhanden? | Für Dashboard-Token **nicht** nötig; für echten Login-Flow ja |

### Phase 1 — Developer-Registrierung und App

| # | Schritt | Ort |
|---|---|---|
| 1.1 | Als Meta-Developer registrieren | developers.facebook.com → Register |
| 1.2 | App erstellen, **App-Typ „Business"** wählen | App Dashboard → Create App |
| 1.3 | Use Case hinzufügen: **„Manage messaging & content on Instagram"** | Dashboard → Add use cases |
| 1.4 | Use Case customizen: linke Navigation → **„API setup with Instagram Login"** | Use-Case-Seite |
| 1.5 | Notieren: **Instagram App ID** und **Instagram App Secret** (≠ Facebook App ID/Secret!) | wird auf derselben Seite angezeigt |

**Kritisch:** Für Business Login for Instagram gilt die **Instagram App ID** aus dem Instagram-Produkt, nicht
die Meta-App-ID oben im Dashboard. Beleg: Overview → „App IDs": *„Apps that use Business Login for Instagram
will use the Instagram app ID displayed on the Instagram > API setup with Instagram login section of the
dashboard."*

### Phase 2 — Permissions

| # | Schritt |
|---|---|
| 2.1 | „Add all required permissions" klicken |
| 2.2 | **Achtung:** Default fügt `instagram_business_basic` **und** `instagram_business_manage_messages` hinzu |
| 2.3 | `instagram_business_manage_messages` **wieder entfernen** (ANA ist read-only, kein Messaging) |
| 2.4 | `instagram_business_manage_insights` hinzufügen (für Media- und Account-Insights) |
| 2.5 | Optional später: `instagram_business_manage_comments` |

> **Warum Schritt 2.3 wichtig ist:** Offizielle Permissions Reference: *„Only select permissions that your app
> needs to function as intended. **Selecting unneeded permissions is a common reason for rejection during app
> review.**"* Ein nicht benötigter Messaging-Scope zieht später eine eigene Screencast-Pflicht nach sich.

### Phase 3 — Token für Anas Konto

| # | Schritt |
|---|---|
| 3.1 | Ana als **Instagram Tester** einladen: App Dashboard → App roles → Roles → **Instagram testers** → Add Instagram Testers → Username eintragen |
| 3.2 | Ana akzeptiert die Einladung in Instagram: Profil → Einstellungen → **Apps and websites → Tester invites** → Accept |
| 3.3 | Zurück zu „API setup with Instagram login" → Abschnitt **„Generate access tokens"** → **Add account** |
| 3.4 | **Continue** → Instagram-Login im Popup → **Allow** |
| 3.5 | **Save**, dann **Got it** |
| 3.6 | **Generate token** neben dem Konto klicken → Token **sofort** kopieren (wird einmalig angezeigt) |

Ergebnis: ein **long-lived Instagram User Access Token, 60 Tage gültig**, unter Standard Access.

### Phase 4 — Business Login Settings (auch ohne Login-Flow ausfüllen)

Pfad: **App Dashboard > Instagram > API setup with Instagram login > Set up Instagram business login**

| # | Feld | Pflicht für Pilot? |
|---|---|---|
| 4.1 | Redirect URL (mind. eine, https, exakte Übereinstimmung inkl. Trailing Slash beachten) | Nur für späteren Login-Flow; Meta verlangt die Konfiguration für die ID/Secret-Ausgabe → anlegen |
| 4.2 | **Deauthorization callback URL** | Empfohlen (`RECOMMENDED`) |
| 4.3 | **Data deletion request URL** | Empfohlen, für Review später Pflicht (`CONDITIONAL`) |
| 4.4 | Weitere Redirect URIs | Optional |

### Phase 5 — Erster Smoke-Test (Voraussetzungen)

Voraussetzungen, damit der erste echte Call gelingt:

1. Konto ist Professional Account. `UNKNOWN` bis geprüft.
2. Konto ist als Instagram Tester akzeptiert **oder** hat Admin/Developer-Rolle.
3. Token wurde **nach** dem Hinzufügen der Permissions generiert (sonst fehlen Scopes im Token).
4. Host `https://graph.instagram.com`, API-Version z. B. `v26.0` (aktuellste laut IG-Media-Referenz).
5. Token serverseitig verwenden — Long-Lived-Exchange „**must be made in server-side code**".

Minimaler erster Call (nur zur Verifikation, kein Ersatz für echten Test):

```
GET https://graph.instagram.com/v26.0/me?fields=id,username,media_count&access_token=<TOKEN>
```

### Dashboard-Abweichungen, die bereits belegt sind

| Abweichung | Beleg |
|---|---|
| Button **„Sync app name"** neu auf der Instagram-App-Settings-Seite (setzt Namen aus der Facebook-App + Suffix ` - IG`) | Changelog 28.09.2026 |
| Autorisierungsfehler `400 Session Invalid` liefert jetzt detailliertere Gründe (u. a. checkpointed / unconfirmed) | Changelog 28.09.2026 |
| **Keine Basic Display API mehr** — Anleitungen dazu sind veraltet und unbrauchbar | Sekundärbelege konsistent; offiziell: Instagram API with Instagram Login ist der Nachfolger |

### Bekannte operative Stolpersteine (Sekundärquelle, Vertrauensniveau: mittel)

- Fehler **„Insufficient developer role"** bzw. **„Unable to add a user with a role on the app's owning
  business"**: tritt auf, wenn das Instagram-Konto zum selben Meta Business gehört, dem die App gehört — dann
  kann es nicht als Tester hinzugefügt werden. **Gegenmaßnahme:** App einem anderen Business zuordnen, oder App
  Live schalten. → `CONDITIONAL`, praktisch zu verifizieren.
- Token wird **einmalig** angezeigt → sofort sicher ablegen.

---

## 4. Permission-Matrix

### 4.1 Die fünf angefragten Scopes — einzeln

#### `instagram_business_basic` — `SOURCE_VERIFIED`

| Aspekt | Wert |
|---|---|
| Exakter Name | `instagram_business_basic` |
| Login-Weg | Business Login for Instagram (`graph.instagram.com`) |
| Dependencies | **None** |
| Offizielle Beschreibung | „allows your app to read an Instagram Business account profile's info and media" |
| Erlaubte Nutzung | „Get basic metadata of an Instagram Business account profile" |
| Freigeschaltete Ressourcen | IG User (id, username, name, biography, followers_count, follows_count, media_count, website, profile_picture_url, has_profile_pic), IG Media (id, permalink, shortcode, media_type, media_url, thumbnail_url, timestamp, comments_count, like_count, media_audio_type, owner, username, alt_text, is_comment_enabled, is_shared_to_feed), Edges: `media`, `stories`, `children`, `comments`, `insights` |
| Lesen/Schreiben trennbar? | Ja — dieser Scope ist rein lesend; Schreiben liegt in eigenen Scopes |
| Standard-Access-Eignung | Ja |
| Review bei fremden Konten | Erforderlich |
| Reviewer-Nachweis (offiziell) | „Demonstrate the complete Instagram login process … Demonstrate getting basic metadata, such as the username and ID, of an Instagram Business account profile on your app platform" |
| Kontotypbeschränkung | Professional Account (Business oder Creator) |

#### `instagram_business_manage_insights` — `SOURCE_VERIFIED` (mit Dokumentationslücke)

| Aspekt | Wert |
|---|---|
| Exakter Name | `instagram_business_manage_insights` |
| Login-Weg | Instagram Login; gefordert von der offiziellen Insights-Seite |
| Dependencies | Von der Insights-Seite nicht genannt (`UNKNOWN`) |
| Freigeschaltete Ressourcen | `GET /<IG_MEDIA_ID>/insights`, `GET /<IG_USER_ID>/insights` |
| Lesen/Schreiben trennbar? | Rein lesend |
| Standard-Access-Eignung | Ja |
| **Dokumentationslücke** | Der Scope ist in der offiziellen **Permissions Reference (Stand 12.10.2026) nicht als eigener Eintrag enthalten** — dort stehen `instagram_business_basic`, `_content_publish`, `_manage_comments`, `_manage_messages`, aber **kein** `_manage_insights`. Damit fehlt der offizielle Textbaustein „What to include in App Review submission". |
| Reviewer-Nachweis | **UNKNOWN** aus Primärquelle. Nächster Analogbeleg: `instagram_manage_insights` (Facebook-Login-Variante) verlangt Nachweis für Account-Metadaten, Post-Insights und Story-Insights. |
| Praxisbeleg | Drittanbieter-Integrationen listen den Scope als produktiv einsetzbar; Apps berichten über erteilten Advanced Access dafür. → `CONDITIONAL`, im Pilot selbst zu verifizieren |

> **Folge für ANA:** Insights sind im Pilot **nicht blockiert** (Standard Access genügt), aber im späteren
> Review fehlt der offizielle Nachweistext. Empfehlung: eigene, konkrete Use-Case-Beschreibung schreiben und
> am Analogon `instagram_manage_insights` orientieren.

#### `instagram_business_manage_comments` — `SOURCE_VERIFIED` (mit Dokumentationsfehler)

| Aspekt | Wert |
|---|---|
| Exakter Name | `instagram_business_manage_comments` |
| Dependencies | `instagram_business_basic` |
| Freigeschaltete Ressourcen | `GET/POST/DELETE` auf `/<IG_MEDIA_ID>/comments`, `/<IG_COMMENT_ID>`, Mentions |
| Lesen/Schreiben trennbar? | **Nein** — ein einziger Scope deckt Lesen, Antworten, Verstecken, Löschen ab. Ein reiner Lese-Scope existiert nicht. |
| Standard-Access-Eignung | Ja |
| Reviewer-Nachweis (offiziell) | „Demonstrate creating a new comment, updating an existing comment and deleting a comment; Show how this appears both in your app and the native Instagram app" |
| **Dokumentationsfehler** | Die offizielle Beschreibung dieses Scopes ist ein Copy/Paste-Fehler: sie wiederholt wörtlich den Text von `instagram_business_content_publish`. → Als Konflikt markiert, nicht als Fakt übernehmen. |
| Konsequenz für ANA | **Für den Pilot nicht aufnehmen.** Der Scope ist nicht lesend/schreibend trennbar, und er zieht im Review den Nachweis von Schreibaktionen nach sich, die ANA nicht hat. |

#### `instagram_business_content_publish` — `NOT_REQUIRED` für ANA

Dependencies: `instagram_business_basic`. Reiner Schreib-Scope (Container erstellen → uploaden → publishen).
ANA publiziert nicht → **nicht anfordern**. Begründungspflicht: jeder zusätzliche Scope braucht einen
sachlichen Grund; hier gibt es keinen.

#### `instagram_business_manage_messages` — `NOT_REQUIRED` für ANA

Dependencies: `instagram_business_basic`. DM-Zugriff. ANA liest keine DMs → **nicht anfordern**. Wird vom
Dashboard **standardmäßig mitinstalliert** (siehe §3, Schritt 2.2/2.3) → aktiv entfernen.

### 4.2 Facebook-Login-Pfad (getrennt betrachtet)

Nur relevant, falls der Instagram-Login-Pfad an der Caption-Frage scheitert (siehe §4.4) oder Funktionen wie
Hashtag-Search, Product Tagging, Partnership Ads, `media_product_type` oder `story_insights` gebraucht werden.

| Facebook-Login-Permission | Dependencies | Zweck für ANA |
|---|---|---|
| `instagram_basic` | — | Profil + Media lesen |
| `instagram_manage_insights` | `instagram_basic`, `pages_read_engagement`, `pages_show_list` | Media- und Account-Insights |
| `instagram_manage_comments` | `instagram_basic`, `pages_read_engagement`, `pages_show_list` | Kommentare |
| `pages_show_list` | — | Pflicht-Dependency |
| `pages_read_engagement` | `pages_show_list` | Pflicht-Dependency |
| `business_management` | — | vom Dashboard bei Content-Management mitinstalliert |
| `ads_management` / `ads_read` | — | **Nur** wenn der App-Nutzer per Business Manager eine Rolle auf der verknüpften Page hat |

**Zusätzliche harte Bedingungen des FB-Login-Pfads:**

- Facebook Page ist **zwingend** und muss mit dem Instagram-Konto verknüpft sein.
- Der App-Nutzer muss auf der Page die passenden **Tasks** haben. Offizielle Zuordnung:

| Task in der UI | Task in der API | Grantable Permission |
|---|---|---|
| Content | `PROFILE_PLUS_CREATE_CONTENT` | `instagram_basic`, `instagram_content_publish` |
| Full control | `PROFILE_PLUS_FULL_CONTROL` | `instagram_basic`, `instagram_content_publish` |
| Insights | `PROFILE_PLUS_ANALYZE` | `instagram_basic`, `instagram_manage_insights` |
| Messages | `PROFILE_PLUS_MESSAGING` | `instagram_basic`, `instagram_manage_messages` |
| Community Activity | `PROFILE_PLUS_MODERATE` | `instagram_basic`, `instagram_manage_comments` |
| Ads | `PROFILE_PLUS_ADVERTISE` | `instagram_basic` |

→ Für den ANA-Read-only-Fall ist der **Instagram-Login-Pfad klar der kleinere Fußabdruck**: keine Page, keine
Page-Tasks, keine Ads-Scopes.

### 4.3 Kleinste ausreichende Scope-Menge für das ANA Read-only MVP

```
instagram_business_basic
instagram_business_manage_insights
```

**Zwei Scopes. Keine weiteren.**

| Scope | Begründung |
|---|---|
| `instagram_business_basic` | Ohne diesen Scope kein Zugriff auf IG User und IG Media. Grundvoraussetzung, keine Dependencies. |
| `instagram_business_manage_insights` | Ohne diesen Scope keine Media-Insights (`GET /<IG_MEDIA_ID>/insights`) und keine Account-Insights (`GET /<IG_USER_ID>/insights`) — beides Kern des ANA-Zwecks. |

**Bewusst nicht aufgenommen:**

| Scope | Ablehnungsgrund |
|---|---|
| `instagram_business_content_publish` | ANA publiziert nicht. |
| `instagram_business_manage_messages` | ANA liest keine DMs. Dashboard-Default → aktiv entfernen. |
| `instagram_business_manage_comments` | Nicht lesend/schreibend trennbar; zieht Schreibnachweis im Review nach sich. Erst in einer späteren, begründeten Ausbaustufe. |

### 4.4 ⚠️ Offener Konflikt, der vor Implementierung geklärt werden muss

Die offizielle **IG-Media-Referenz (Stand 12.08.2026)** trägt beim Feld `caption` den Zusatz:

> „**Available for Instagram API with Facebook Login only.**"

Das steht im Widerspruch zur verbreiteten Annahme, Captions seien über `graph.instagram.com` lesbar, und es
betrifft den **Kernzweck** von ANA (semantische Analyse der Bildunterschriften). Die Referenz selbst ist in
diesem Punkt mehrdeutig formuliert (der Satz könnte sich auch nur auf die `@`-Symbol-Ausnahme beziehen).

**Einordnung:** `SOURCE_VERIFIED` (der Satz steht so im Dokument) + `NOT_TESTED` (nicht praktisch geprüft).

**Entscheidungsregel:** Der erste Smoke-Test (§12, AC-3) prüft exakt das.

- Liefert `GET /<IG_USER_ID>/media?fields=id,caption,timestamp` unter Instagram Login die Caption →
  Instagram-Login-Pfad bleibt, kein Handlungsbedarf.
- Liefert er sie nicht → **Fallback auf Facebook-Login-Pfad** (§4.2). Das kostet: Facebook Page anlegen/
  verknüpfen, Page-Task „Insights" bzw. „Full control" für Ana, drei zusätzliche Scopes.

---

## 5. App-Review-Gates

### Strikte Klassifikation

| Anforderung | ANA-Pilot (ein Konto) | Multi-Creator | Beleg |
|---|---|---|---|
| Meta-App anlegen (Typ Business, Instagram-Produkt) | **MANDATORY** | **MANDATORY** | Create-an-App-Doc |
| Instagram App ID + Secret konfigurieren | **MANDATORY** | **MANDATORY** | Overview „App IDs" |
| App-Rolle für Ana (Tester/Admin/Developer) | **MANDATORY** | entfällt (Fremdkonten) | Access Levels Doc |
| Professional Account (Business/Creator) | **MANDATORY** | **MANDATORY** | Overview „App users" |
| OAuth-Login-Flow implementieren | **NOT_REQUIRED** | **MANDATORY** | Overview: „you do not need to implement a login flow" |
| App Review | **NOT_REQUIRED** | **MANDATORY**, pro Permission | App Review Doc |
| Business Verification | **NOT_REQUIRED** | **MANDATORY** | Permissions Reference; Access Levels |
| Screencast | **NOT_REQUIRED** | **MANDATORY**, pro Permission | Permissions Reference, „Screencast Requirements" |
| Reviewer-Testzugang | **NOT_REQUIRED** | **MANDATORY** | App Review Doc: „If we are unable to access your app to test it, your entire submission will be rejected" |
| Datenschutzerklärung (Privacy Policy URL) | **RECOMMENDED** | **MANDATORY** (Review-Voraussetzung) | Review-Prozess; `CONDITIONAL` |
| Data Deletion Request URL | **RECOMMENDED** | **MANDATORY** | Create-an-App-Doc (Feld im Dashboard) |
| Deauthorization Callback URL | **RECOMMENDED** | **RECOMMENDED** | Create-an-App-Doc |
| Data Handling Questions | **UNKNOWN** | **CONDITIONAL** („may need to complete") | Permissions Reference |
| Data Use Checkup | **UNKNOWN** | **CONDITIONAL** („may also be required … annual") | Permissions Reference |
| Access Verification | **UNKNOWN** | **CONDITIONAL** (von Praktikern als eigener, von App Review getrennter Schritt berichtet) | Sekundärbeleg, mittel |
| Tech-Provider-Prüfung | **NOT_REQUIRED** | **UNKNOWN** — kein Beleg dafür gefunden, dass sie für diesen Anwendungsfall greift | — |
| App in Live-Modus | **NOT_REQUIRED** für Datenabruf | **MANDATORY** für Webhooks | Webhooks Setup |
| Facebook-Page-Verknüpfung | **NOT_REQUIRED** | **NOT_REQUIRED** (nur bei FB-Login-Pfad) | Overview-Vergleichstabelle |
| Unternehmensverifizierung (Handelsregister etc.) | **NOT_REQUIRED** | Teil der Business Verification | — |

### Die „Private apps"-Ausnahme — präzise gelesen

Overview → „Private apps":

> „If reviewers are unable to test your app because it is behind a private intranet, has no user interface, or
> has not implemented Facebook Login for Business, you can request approval **only for the following
> permissions**: `instagram_basic`, `instagram_manage_comments`."

**Drei Konsequenzen, die oft übersehen werden:**

1. Die Ausnahme nennt die **Facebook-Login**-Permission-Namen, nicht die `instagram_business_*`-Familie.
2. Sie enthält **keine** Insights-Permission. Eine nicht testbare interne App kann Insights also **nicht**
   über den Private-App-Weg bekommen.
3. Sie greift erst, wenn überhaupt ein Review ansteht — im ANA-Piloten steht keins an.

### Was Meta bei einer echten Freigabe prüft (Multi-Creator-Fall)

1. **Jede Permission einzeln.** „Advanced Access … must be approved on an individual permission and feature
   basis through the App Review process."
2. **Tatsächliche Nutzung.** „we will test your app to verify that it **actually uses** the permissions and
   features you are requesting."
3. **Zugänglichkeit.** Kein Zugang → „your **entire** submission will be rejected".
4. **Funktionsnachweis pro Permission.** „If we are able to test your app but cannot test functionality that
   requires a specific permission … you will **not** be approved for that permission."
5. **Keine unnötigen Scopes.** „Selecting unneeded permissions is a common reason for rejection."

---

## 6. Live-Feed-Architektur

### 6.1 Die Kernfrage: Gibt es einen offiziellen Webhook für neue Posts?

**Nein. `SOURCE_VERIFIED`.**

Die offizielle Webhook-Feldmatrix (Stand 23.09.2026) listet exakt diese Felder — und **kein einziges**
bezieht sich auf neu veröffentlichte Medien:

`comments` · `live_comments` · `mentions` · `message_echoes` · `message_reactions` · `messages` ·
`messaging_handover` · `messaging_optins` · `messaging_policy_enforcement` · `messaging_postbacks` ·
`messaging_referral` · `messaging_seen` · `response_feedback` · `standby` · `story_insights`

Es existiert **kein** Feld `media`, `feed`, `posts` oder `new_media` für Instagram.

### 6.2 Webhooks sind für den ANA-Piloten doppelt versperrt

Selbst wenn ein passendes Feld existierte — die Setup-Seite (Stand 16.09.2026) verlangt:

| Bedingung | Instagram Login |
|---|---|
| App-Modus | „Your app must be **Live** to receive notifications for app users" |
| Access Level | **Advanced Access** |
| Business Verification | „Required for production access" |
| Endpoint | HTTPS mit gültigem TLS/SSL-Zertifikat; **Self-signed wird nicht unterstützt** |
| Weitere Limits | Medienkonto muss **public** sein; Felder nicht pro Konto wählbar; kein historischer Webhook-Speicher |

→ **Entscheidung: Der ANA-Pilot nutzt ausschließlich Polling.** Webhooks werden als spätere Erweiterung
geführt, nicht als Architekturannahme.

### 6.3 Dokumentationskonformer inkrementeller Polling-Mechanismus

**Verfügbarkeitsbasis (alles `SOURCE_VERIFIED`):**

| Fähigkeit | Endpoint |
|---|---|
| Alle eigenen Posts | `GET /<IG_USER_ID>/media` (Edge `media` am IG User) |
| Stories | `GET /<IG_USER_ID>/stories` |
| Live-Media | `GET /<IG_USER_ID>/live_media` (nur während der Übertragung lesbar) |
| Einzelnes Medium | `GET /<IG_MEDIA_ID>` |
| Carousel-Kinder | `GET /<IG_MEDIA_ID>/children` (Edge `children`, Public) |
| Media-Insights | `GET /<IG_MEDIA_ID>/insights?metric=engagement,impressions,reach` |
| Account-Insights | `GET /<IG_USER_ID>/insights?metric=impressions,reach,profile_views&period=day` |
| Kommentare | Edge `comments` am IG Media |
| Profil | `GET /<IG_USER_ID>?fields=id,username,media_count,followers_count,…` oder `/me` |

**Verfügbare IG-Media-Felder unter Instagram Login** (Auswahl, per `fields=`-Expansion):

`id` · `permalink` · `shortcode` · `timestamp` (ISO 8601, UTC) · `media_type` (`IMAGE` \| `VIDEO` \|
`CAROUSEL_ALBUM`) · `media_url` (optional, siehe §7) · `thumbnail_url` (nur `VIDEO`) · `comments_count` ·
`like_count` · `media_audio_type` (`MUSIC` \| `ORIGINAL_SOUND`, nur Video) · `owner` · `username` ·
`alt_text` · `is_comment_enabled` · `is_shared_to_feed` · `is_ai_generated` ·
`copyright_check_information.status`

**Nicht unter Instagram Login verfügbar** (nur Facebook Login): `media_product_type`, `caption` (⚠ siehe
§4.4), `reposts_count`, `saved_count`, `shares_count`, `total_like_count`, `total_comments_count`,
`total_views_count`, `view_count` (dieses nur via Business Discovery), `boost_ads_list`,
`boost_eligibility_info`, Edge `collaborators`, Edge `collaborative_media`.

#### Polling-Design

| Aspekt | Vorgabe |
|---|---|
| **Intervall** | Konfigurierbar. Startwert **6 Stunden** für `media`; **24 Stunden** für Account-Insights; **15 Minuten** nur während eines aktiv erwarteten Publish-Fensters. Begründung: Media-Insights sind teils `lifetime`-Metriken, Account-User-Metrics werden nur **90 Tage** gespeichert → tägliche Sicherung genügt und ist nötig. |
| **Neuerkennung** | `GET /<IG_USER_ID>/media?fields=id,timestamp&limit=25` → nur Seiten folgen, bis `timestamp` älter ist als der letzte bekannte Wasserstand. Da keine Sortiergarantie dokumentiert ist (`UNKNOWN`), konservativ: erste Seite immer vollständig vergleichen. |
| **Pagination** | Cursor-basiert über das von Meta zurückgegebene `paging`-Objekt (`next`-URL folgen). Keine Offset-Annahmen. Abbruch bei: kein `next`, Wasserstand unterschritten, oder hartes Seitenlimit (Default 20 Seiten). |
| **Idempotenz** | Persistenter Schlüssel `(ig_user_id, ig_media_id)`. Upsert, niemals Insert. Zweite Abfrage erzeugt **kein** Duplikat (AC-4). |
| **Delta-Erkennung** | Dreistufig: (1) neue `media_id` → `NEW`; (2) bekannte ID, geänderter Feld-Hash → `CHANGED`; (3) bekannte ID fehlt in vollständigem Durchlauf → `MISSING` (gelöscht, archiviert oder API-Lücke). |
| **Wiederholungen/Backoff** | Exponentiell: 1 s → 2 s → 4 s → 8 s → 16 s, max. 5 Versuche, Jitter ±20 %. Bei 4xx **kein** Retry (außer 429), bei 5xx und Netzwerkfehlern Retry. |
| **Token-Refresh** | Long-lived Token: 60 Tage. Refresh **nur** wenn (a) Token ≥ 24 h alt, (b) noch gültig, (c) `instagram_business_basic` erteilt. Geplanter Refresh bei **Tag 45**. Abgelehnter Refresh → sofort Status `REAUTH_REQUIRED` und sichtbarer Wiederverbindungsweg (AC-8). **Abgelaufene Tokens sind nicht heilbar** — nur erneuter Login. |
| **Rate Limits** | **UNKNOWN** — die exakten Instagram-Schwellen sind in dieser Recherche nicht aus Primärquellen belegt. Umsetzung: konservativ (≤ 1 Request/Sekunde, sequenziell), und die von Meta gelieferten Rate-Limit-Antwortheader protokollieren und als Messbasis verwenden. Keine garantierten Zahlen behaupten. |
| **Error Handling** | Jeder Fehler landet in `api_error_log` mit: Zeitstempel, Endpoint, HTTP-Status, Meta-Fehlercode/-Subcode, Request-Korrelations-ID, Token-Fingerabdruck (**nicht** der Token selbst). |
| **Backfill nach Ausfall** | Wasserstand pro Konto und pro Ressourcenart. Nach Ausfall: einmaliger Vollscan bis `media_count` erreicht oder Seitenlimit. Fehlende Insights-Fenster werden über `since`/`until` nachgezogen, solange sie innerhalb der 90-Tage-Frist liegen. |
| **Monitoring** | Metriken pro Lauf: Dauer, Seitenanzahl, neue/geänderte/fehlende Medien, Fehleranzahl nach Code, Token-Alter in Tagen, Zeit seit letztem erfolgreichem Lauf. Alarm: kein erfolgreicher Lauf > 2× Intervall, Token-Alter > 50 Tage, `REAUTH_REQUIRED`. |
| **Zeitstempel/Provenienz** | Jede Zeile trägt `fetched_at` (UTC), `source_endpoint`, `api_version`, `sync_run_id`. API-Zeitstempel sind UTC mit Null-Offset, ISO-8601. |
| **Echtzeit** | **Wird nicht behauptet.** Aktualität = Polling-Intervall + Laufdauer. Kein Webhook → keine Push-Garantie. |

#### Wichtige Insights-Beschränkungen (`SOURCE_VERIFIED`)

- Accounts mit **weniger als 100 Followern** erhalten einige Metriken nicht.
- **User Metrics werden nur 90 Tage gespeichert.**
- Insights nur für **ein** Konto pro Abfrage.
- **Keine** Insights für Facebook Pages.
- Fehlende/unverfügbare Daten kommen als **leeres Dataset**, nicht als `0` → „fehlend" und „null" müssen im
  Datenmodell unterscheidbar bleiben (AC-6).
- Live-Video-Media nur während der Übertragung lesbar.
- Nur Medien von Professional Accounts — keine persönlichen Konten.
- `story_insights`-Webhook **nur** unter Facebook Login.

---

## 7. Video-Verfügbarkeitsanalyse (`media_url`)

### 7.1 Die Plattformänderung vom 30. Juli 2026 — wörtlich

Changelog-Eintrag **„Download and copyright protections on `media_url`"**, 30.07.2026:

`media_url` wird weggelassen, wenn **eine** dieser Bedingungen zutrifft:

1. **Urheberrechtlich geschütztes oder lizenziertes Audio** im Video — einschließlich Audio aus der
   Instagram-Audio-Bibliothek — oder Flag wegen Urheberrechtsverletzung.
   **Gilt für alle Videomedien: Reels, Video-Posts und Video-Stories. Gilt auch dann, wenn der App-Nutzer das
   Medium selbst besitzt.**
2. **Der Reel-Eigentümer hat Downloads deaktiviert** (kontoweit oder pro Reel: „Allow people to download your
   reels"). **Gilt nur für Reels** und **nur** auf Endpoints, die Medien *anderer* Nutzer lesen.
   **Explizit ausgenommen:** „Reading your own media through `GET /<IG_USER_ID>/media` or `GET /<IG_MEDIA_ID>`
   is not affected by this condition."

Weitere belegte Fakten:

- Alle anderen Felder (`id`, `permalink`, `caption`, `timestamp`) werden normal zurückgegeben.
- **Bildmedien und Carousel-Container sind nicht betroffen** — wohl aber die Video-Kinder eines Carousels.
- Requests liefern weiterhin **`200`**.
- Offizielle Handlungsanweisung: *„Treat `media_url` as an optional field in your app and fall back to
  `permalink` or `thumbnail_url` when it is absent."*
- Gilt für **beide** Hosts: `graph.facebook.com` **und** `graph.instagram.com`.
- **Vererbung:** verschachtelte Medien per Feld-Expansion erben die Bedingungen des Ursprungs-Requests.
  `GET /<IG_MEDIA_ID>/children` unterliegt nur dem Copyright-Check; `business_discovery{media{children}}`
  zusätzlich der Download-Einstellung.

**Endpunkt-Matrix aus dem Changelog:**

| Nur Copyright-Check | Copyright-Check **+** Download-Einstellung |
|---|---|
| `GET /<IG_MEDIA_ID>` | `GET /<IG_USER_ID>?fields=business_discovery{media}` |
| `GET /<IG_MEDIA_ID>/children` | `GET /<IG_USER_ID>/tags` |
| `GET /<IG_USER_ID>/media` | `GET /<IG_USER_ID>/mentioned_media` |
| `GET /<IG_USER_ID>/stories` | `GET /<IG_USER_ID>/mentioned_comment` |
| `GET /<IG_USER_ID>/live_media` | `GET /<IG_HASHTAG_ID>/top_media` |
| `GET /<IG_USER_ID>/collaboration_invites` | `GET /<IG_HASHTAG_ID>/recent_media` |
| | `GET /<IG_USER_ID>/collaborative_media` |

### 7.2 Nach Inhaltstyp — für ANA relevant

| Inhaltstyp | `media_url` vorhanden? | Thumbnail | Nur Permalink? | Audio zugänglich? | Tag |
|---|---|---|---|---|---|
| **Bild-Feed-Post** | Ja, immer | — | Nein | — | SOURCE_VERIFIED |
| **Carousel-Container** | Ja, immer | — | Nein | — | SOURCE_VERIFIED |
| **Carousel-Bild-Kind** | Ja, immer | — | Nein | — | SOURCE_VERIFIED |
| **Carousel-Video-Kind** | **Fehlt bei lizenziertem Audio** | `thumbnail_url` (VIDEO) | Ja, Fallback | Nur bei `media_audio_type = ORIGINAL_SOUND` zuverlässig | SOURCE_VERIFIED |
| **Feed-Video / Reel** | **Fehlt bei lizenziertem Audio oder Copyright-Flag**, auch beim eigenen Medium | `thumbnail_url` | Ja, Fallback | dito | SOURCE_VERIFIED |
| **Story-Video** | **Fehlt bei lizenziertem Audio** | `thumbnail_url` | Ja, Fallback | dito | SOURCE_VERIFIED |
| **Reel mit deaktivierten Downloads** | Beim **eigenen** Medium über `/media` oder `/<ID>`: **nicht** betroffen. Bei Fremdlese-Endpoints: fehlt | `thumbnail_url` | nur bei Fremdlese | — | SOURCE_VERIFIED |
| **Collab-Post** | Beim Lesen über `collaborative_media` gilt die Download-Einstellung des **Reel-Eigentümers** — kann auch den Co-Autor treffen | `thumbnail_url` | möglicherweise | — | SOURCE_VERIFIED |

**Frühwarnsignal (`SOURCE_VERIFIED`, Changelog 01.06.2026):** das Feld `media_audio_type` liefert `MUSIC`
(lizenzierte Musik aus Metas Katalog) oder `ORIGINAL_SOUND`. Damit lässt sich **vor** dem Download-Versuch
prognostizieren, ob `media_url` wahrscheinlich fehlt.

**Zusätzliches Diagnosefeld:** `copyright_check_information.status` mit `completed` / `error` /
`in_progress` / `not_started` sowie `matches_found` und Detailobjekten (`author`, `content_title`,
`matched_segments` mit `segment_type` `AUDIO`/`VIDEO`, `owner_copyright_policy` mit Aktionen `BLOCK`/`MUTE`).

### 7.3 Resilienter Fallback — verbindliche Reihenfolge

```
1. Metadaten immer importieren
   id, permalink, shortcode, timestamp, media_type, comments_count, like_count,
   media_audio_type, is_ai_generated, caption*  (* Verfügbarkeit siehe §4.4)

2. media_url prüfen
   vorhanden  → media_availability = AVAILABLE
   fehlt      → media_availability = MISSING_LICENSED_AUDIO
                media_url_reason   = ableiten aus media_audio_type und
                                     copyright_check_information.status
                → KEIN Fehler, KEIN Abbruch des Imports (AC-7)

3. Eigenes Original zuordnen
   Match-Schlüssel in absteigender Priorität:
     a) manueller Link  (Ana ordnet Archivdatei dem Post zu)  ← verlässlichster Weg
     b) permalink
     c) timestamp ± Toleranzfenster  +  media_type  +  Dauer
   Treffer → original_asset_id setzen, media_availability = LOCAL_ARCHIVE
   Kein Treffer → media_availability = MISSING_NO_ARCHIVE_MATCH

4. Nur tatsächlich Vorhandenes verarbeiten
   Transkription und Szenenanalyse laufen NUR für AVAILABLE oder LOCAL_ARCHIVE.
   Für alles andere: Platzhalter „Transkript nicht verfügbar — Quelle fehlt".

5. Nichts erfinden
   Fehlende Inhalte werden NIE durch KI-Generierung ersetzt.
   Jedes Feld trägt availability_status ∈
     { AVAILABLE, MISSING_LICENSED_AUDIO, MISSING_NO_ARCHIVE_MATCH, NOT_APPLICABLE }
```

**Praktische Empfehlung an Ana:** Für Reels, die transkribiert werden sollen, künftig **Original-Audio**
verwenden oder die Originaldatei parallel im Archiv ablegen. `media_audio_type = ORIGINAL_SOUND` ist der
einzige Fall, in dem die API zuverlässig die Videodatei liefert.

---

## 8. Security- und Privacy-Konzept

### 8.1 Drei getrennte Regelwerke — nicht vermischen

| Ebene | Quelle | Was sie regelt |
|---|---|---|
| **Meta-Plattformregeln** | Platform Terms, Developer Policies, Permissions Reference | Was die App mit API-Daten tun darf; Löschpflicht bei Widerruf |
| **Datenschutzrecht (DSGVO/EU)** | gilt unabhängig von Meta | Rechtsgrundlage, Betroffenenrechte, AVV, Verarbeitungsverzeichnis, TOMs |
| **Vertragliche Pflichten** | Vereinbarung zwischen Ana und Projekt | Zweckbindung, Speicherfristen, Zugriffsrechte, Korrektur- und Löschwege |

**Zentrale Klarstellung:** Anas Zustimmung zur Verbindung **ihres eigenen** Kontos ist **keine**
Rechtsgrundlage für die Verarbeitung der personenbezogenen Daten **Dritter** — insbesondere der Personen, die
kommentieren. Diese Daten stammen von Personen, die nie in eine Verarbeitung durch ANA eingewilligt haben.
Anas Consent deckt den Zugriff, nicht die Weiterverarbeitung fremder personenbezogener Daten.

### 8.2 Meta-Seite: belegte Pflichten

| Pflicht | Beleg |
|---|---|
| Datenlöschung auf Anfrage, „promptly" | Platform Terms §3(d)(i) |
| **Data Deletion Request Callback**: signierter POST mit app-scoped User ID; Antwort muss JSON mit `url` **und** Bestätigungscode enthalten | Create-an-App-Doc (Feld im Dashboard) + Platform Terms |
| **Deauthorization Callback URL** im Dashboard hinterlegbar | Create-an-App-Doc |
| Permission verfällt bei 90 Tagen Nichtnutzung → Nutzer muss neu erteilen | Permissions Reference: „If your app does not use a permission for 90 days … your app user must regrant your app that permission" |
| Analytics-/Marketing-Nutzung nur aggregiert, de-identifiziert oder anonymisiert, sofern nicht re-identifizierbar | Permissions Reference |
| App Secret niemals clientseitig; Long-Lived-Exchange serverseitig | Business Login Doc |

### 8.3 Personenbezogene Daten in ANA — Klassifikation nach bestehender Governance

| Datenart | Klasse (gemäß `governance/DATA_GOVERNANCE.md`) | Konsequenz |
|---|---|---|
| Anas Profil-Metadaten (username, followers_count, media_count) | öffentlich, aber personenbezogen | G1, Zweckbindung dokumentieren |
| Anas Captions | G1/G2 je nach Inhalt | Speicherung ok, keine Veröffentlichung ohne Freigabe |
| **Kommentare Dritter inkl. Username** | **G2** | **Nicht in Git.** Nur in geschütztem Store. Klare Rechtsgrundlage erforderlich. |
| Instagram-scoped User IDs von Kommentierenden | **G2** | dito |
| KI-Ableitungen (Themencluster, Publikumsbedürfnisse) | **G3** | Nur in geschütztem Store, mit Status `candidate` und Falsifikationsbedingung |
| Access Tokens | Secret | Nur Secret-Manager / `.env`, **nie** in Git (`.gitignore` deckt `.env*` bereits ab) |

**Repo-Regel bestätigt:** `.gitignore` enthält `.env`, `.env.*`, `private/`, `evidence/raw/`, `transcripts/`,
`recordings/`, `exports/private/`. README verbietet ausdrücklich Commits von Tokens, Transkripten und
personenbezogenen Daten.

### 8.4 Externe KI-Anbieter, Embeddings und Themencluster

Meta verbietet die Verarbeitung nicht pauschal, setzt aber Grenzen (Permissions Reference): aggregiert,
de-identifiziert oder anonymisiert, und nicht re-identifizierbar. Zusätzlich gelten DSGVO-Vorgaben.

**ANA-Regelwerk für den Piloten:**

| Verarbeitung | Erlaubt? | Bedingung |
|---|---|---|
| Embeddings aus **Anas eigenen** Captions | Ja | Ana ist Betroffene und Auftraggeberin; Zweckbindung dokumentiert |
| Embeddings aus **Kommentaren Dritter** | **Nein im Pilot** | Keine Rechtsgrundlage. Erst nach eigener Entscheidung + AVV mit dem KI-Anbieter |
| Aggregierte Themencluster ohne Personenbezug | Ja | Aggregation so, dass keine Einzelperson rekonstruierbar ist |
| Personenbezogene Ableitungen („Publikumsbedürfnis von Person X") | **Nein** | G3, nicht ohne explizite Grundlage |
| Weitergabe an Auftragsverarbeiter | Ja, mit AVV | Art. 28 DSGVO; Auftragsverarbeiterverzeichnis führen |
| KI-Anbieter außerhalb EU | Nur mit Garantien | SCC / Angemessenheitsbeschluss; im Verarbeitungsverzeichnis dokumentieren |

### 8.5 Minimalstandard Datenschutz

#### Pilot (ein Konto, nur Ana + Projektteam)

1. **Verarbeitungsverzeichnis-Eintrag**: Quelle (Instagram API), Zweck (Content-Analyse für Substack),
   Zugriff (Projektteam), Aufbewahrung, Korrekturweg, Löschweg, Beobachtung vs. Inferenz.
2. **Kein Kommentarimport** in Phase 1. Damit entfällt die schwierigste Rechtsfrage vollständig.
3. **Kurze Datenschutzerklärung** auf einer öffentlich erreichbaren HTTPS-Seite — auch wenn kein Review
   ansteht. Kostet wenig, wird später Pflicht.
4. **Data Deletion Request URL** von Anfang an implementieren (kleiner Endpoint, signierten Request prüfen,
   Daten löschen, JSON mit `url` + `confirmation_code` zurückgeben).
5. **Aufbewahrungsfrist** festlegen. Vorschlag: Roh-Mediendaten 24 Monate, Insights 12 Monate
   (begründet durch die 90-Tage-Speicherfrist der User Metrics), KI-Ableitungen bis zum Widerruf.
6. **Widerrufsweg** in einem Klick: Verbindung trennen → Token verwerfen → Daten löschen → Bestätigung.
7. **Token-Sicherheit**: nur serverseitig, nur im Secret-Store, Fingerabdruck statt Klartext in Logs,
   Rotation bei Verdacht.

#### Erweiterter Standard (externe Creator)

Zusätzlich zum Piloten:

8. **AVV** mit jedem KI-Anbieter und jedem Hoster.
9. **Betroffenenrechte-Prozess** für Kommentierende: Auskunft, Berichtigung, Löschung, Widerspruch — mit
   erreichbarer Kontaktstelle.
10. **Rechtmäßigkeitsprüfung pro Datenart**, schriftlich, vor dem ersten Import.
11. **Data Use Checkup** terminieren (jährlich, `CONDITIONAL`).
12. **Data Handling Questions** ausfüllen, sobald Meta sie anfordert.
13. **Löschkaskade**: Meta-Löschanfrage → eigener Store → Backups → abgeleitete Embeddings.
14. **Privacy by Design**: Kommentare nur als Hash + Aggregat, Klartext nur kurzlebig im Verarbeitungsschritt.

### 8.6 Sichere Tokenablage

| Anforderung | Umsetzung |
|---|---|
| Niemals im Client-Bundle | Token nur in serverseitigem Code; Bundle-Scan wie in ANA-5 R2G definiert |
| Niemals in Logs | Nur SHA-256-Fingerabdruck (erste 8 Hex-Zeichen) protokollieren |
| Niemals in Git | `.env` ist bereits in `.gitignore`; zusätzlich Secret-Scan im CI |
| Getrennte Umgebungen | Pilot- und Produktions-Secrets getrennt |
| Rotation | Bei Verdacht sofort; regulär durch 60-Tage-Refresh |

---

## 9. MVP-Implementierungsbrief

### 9.1 Architekturentscheidung

**Google Sheets genügt nicht.** Begründung: ein Long-Lived-Token (60 Tage, serverseitig zu behandeln),
Cursor-Pagination, idempotente Upserts, Fehlerlog und ein Löschanfrage-Endpoint sind Zustands- und
Serveraufgaben. Ein Blatt als **Ansicht** ist sinnvoll, als **Speicher** nicht.

**Empfohlene Minimalarchitektur: ein kleiner Worker + eine lokale/verwaltete Datenbank.** Keine Web-App,
keine Graphdatenbank, keine komplexe Infrastruktur.

```
┌─────────────────────────────────────────────────────────────┐
│ Worker (ein Prozess, geplant ausgelöst)                     │
│                                                             │
│  1. Token laden          → Secret-Store / .env              │
│  2. Token-Check          → Alter, Gültigkeit, ggf. Refresh  │
│  3. Profil lesen         → GET /me?fields=id,username,…     │
│  4. Media synchronisieren→ GET /<id>/media (paginiert)      │
│  5. Kinder auflösen      → GET /<media_id>/children         │
│  6. Insights synchron.   → GET /<media_id>/insights         │
│                           GET /<user_id>/insights           │
│  7. [Optional] Kommentare→ Edge comments                    │
│  8. Upsert + Delta       → raw_media, media_snapshot        │
│  9. Fehler loggen        → api_error_log                    │
│ 10. Export schreiben     → JSON + CSV                       │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ Speicher (SQLite für den Pilot ausreichend)                 │
│                                                             │
│  ig_connection      Kontoidentifikation, Token-Fingerabdruck│
│  raw_media          unveränderte API-Antwort (JSON)         │
│  media_snapshot     aktuelle, normalisierte Sicht           │
│  media_insights     Metriken mit fetched_at                 │
│  account_insights   Tagesmetriken                           │
│  comments           optional, getrennt, G2                  │
│  sync_run           Lauf-Protokoll, Wasserstand             │
│  api_error_log      Fehler mit Meta-Code                    │
│  deletion_request   Löschvorgänge nachvollziehbar           │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ Trennschicht: KI-Ableitungen (getrennt gespeichert)         │
│  semantic_cluster   Themencluster, Status candidate         │
│  → trägt immer source_media_ids, Modell, Prompt-Version,    │
│    erstellt_am, reviewer, falsification_condition           │
│  → niemals mit Rohdaten in einer Tabelle                    │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Bewertete Alternativen

| Option | Bewertung |
|---|---|
| Nur Google Sheets | **Abgelehnt.** Kein sicherer Token-Ort, keine idempotenten Upserts, kein Lösch-Endpoint. |
| Lokaler Worker + SQLite | **Empfohlen.** Kleinster Fußabdruck, erfüllt alle Anforderungen. |
| Gehosteter Worker + verwaltete DB | **Empfohlen, sobald** ein öffentlich erreichbarer Endpoint für Data-Deletion-Requests oder später Webhooks nötig wird. |
| Große Web-App | **Nicht nötig.** |
| Graphdatenbank | **Nicht nötig.** Die Daten sind flach und mittelbezogen. |

### 9.3 Datenmodell — Kern

```sql
CREATE TABLE ig_connection (
  ig_user_id          TEXT PRIMARY KEY,
  username            TEXT NOT NULL,
  account_type        TEXT,              -- BUSINESS | CREATOR | UNKNOWN
  token_fingerprint   TEXT NOT NULL,     -- SHA-256, nicht der Token
  token_expires_at    TEXT,              -- ISO 8601 UTC
  token_refreshed_at  TEXT,
  granted_permissions TEXT,              -- exakte Scope-Liste
  connection_status   TEXT NOT NULL,     -- CONNECTED | REAUTH_REQUIRED | REVOKED
  connected_at        TEXT NOT NULL,
  revoked_at          TEXT
);

CREATE TABLE raw_media (
  ig_user_id     TEXT NOT NULL,
  ig_media_id    TEXT NOT NULL,
  parent_id      TEXT,                   -- bei Carousel-Kindern
  payload_json   TEXT NOT NULL,          -- unveränderte API-Antwort
  fetched_at     TEXT NOT NULL,
  api_version    TEXT NOT NULL,
  source_endpoint TEXT NOT NULL,
  sync_run_id    TEXT NOT NULL,
  PRIMARY KEY (ig_user_id, ig_media_id)  -- Idempotenz-Garantie
);

CREATE TABLE media_snapshot (
  ig_user_id           TEXT NOT NULL,
  ig_media_id          TEXT NOT NULL,
  permalink            TEXT,
  shortcode            TEXT,
  timestamp            TEXT,
  media_type           TEXT,
  media_url            TEXT,
  media_availability   TEXT NOT NULL,   -- AVAILABLE | MISSING_LICENSED_AUDIO
                                        -- | MISSING_NO_ARCHIVE_MATCH | NOT_APPLICABLE
  media_url_reason     TEXT,
  thumbnail_url        TEXT,
  caption              TEXT,
  caption_available    INTEGER NOT NULL DEFAULT 0,
  media_audio_type     TEXT,
  is_ai_generated      INTEGER,
  comments_count       INTEGER,
  like_count           INTEGER,
  original_asset_id    TEXT,            -- Match ins eigene Archiv
  delta_state          TEXT NOT NULL,   -- NEW | CHANGED | UNCHANGED | MISSING
  first_seen_at        TEXT NOT NULL,
  last_seen_at         TEXT NOT NULL,
  PRIMARY KEY (ig_user_id, ig_media_id)
);

CREATE TABLE media_insights (
  ig_user_id  TEXT NOT NULL,
  ig_media_id TEXT NOT NULL,
  metric      TEXT NOT NULL,
  period      TEXT NOT NULL,
  value       REAL,                     -- NULL = fehlend, nicht 0
  is_missing  INTEGER NOT NULL,         -- 1 = API lieferte leeres Dataset
  end_time    TEXT,
  fetched_at  TEXT NOT NULL,
  sync_run_id TEXT NOT NULL,
  PRIMARY KEY (ig_user_id, ig_media_id, metric, period, COALESCE(end_time,''))
);

CREATE TABLE api_error_log (
  id                 INTEGER PRIMARY KEY,
  occurred_at        TEXT NOT NULL,
  endpoint           TEXT NOT NULL,
  http_status        INTEGER,
  meta_error_code    INTEGER,
  meta_error_subcode INTEGER,
  meta_message       TEXT,
  correlation_id     TEXT NOT NULL,
  token_fingerprint  TEXT NOT NULL,     -- niemals der Token
  retry_count        INTEGER NOT NULL,
  terminal           INTEGER NOT NULL
);

CREATE TABLE deletion_request (
  id                 TEXT PRIMARY KEY,   -- Meta confirmation code
  ig_user_id         TEXT,
  received_at        TEXT NOT NULL,
  status_url         TEXT NOT NULL,
  status             TEXT NOT NULL,      -- RECEIVED | PROCESSING | COMPLETED | FAILED
  completed_at       TEXT,
  rows_deleted_json  TEXT
);
```

### 9.4 API-Vertragsentwurf

**Regel:** Nur Endpunkte und Felder, die durch offizielle Dokumentation bestätigt sind.

#### A. Von Meta bezogen (read-only, alle per `GET`, Host `https://graph.instagram.com`, Version `v26.0`)

| Zweck | Aufruf | Felder |
|---|---|---|
| Kontoidentifikation | `/me?fields=id,username,name,media_count,followers_count,follows_count,biography,website,profile_picture_url` | alle belegt (IG User) |
| Medienliste | `/<IG_USER_ID>/media?fields=id,permalink,shortcode,timestamp,media_type,media_url,thumbnail_url,caption,comments_count,like_count,media_audio_type,is_ai_generated,owner,username,alt_text&limit=25` | ⚠ `caption`-Verfügbarkeit §4.4 |
| Einzelmedium | `/<IG_MEDIA_ID>?fields=…` | dito |
| Carousel-Kinder | `/<IG_MEDIA_ID>/children?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp` | Edge `children`, Public |
| Copyright-Status | `/<IG_MEDIA_ID>?fields=copyright_check_information{status,matches_found}` | belegt |
| Media-Insights | `/<IG_MEDIA_ID>/insights?metric=engagement,impressions,reach` | Beleg: Insights-Doc, Beispiel nutzt exakt diese drei |
| Account-Insights | `/<IG_USER_ID>/insights?metric=impressions,reach,profile_views&period=day` | Beleg: Insights-Doc |
| Kommentare (optional) | `/<IG_MEDIA_ID>/comments?fields=id,text,timestamp,like_count,from{id,username}` | Edge `comments` |
| Stories | `/<IG_USER_ID>/stories` | Edge `stories` |
| Token-Refresh | `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=<TOKEN>` | Business Login Doc |

#### B. Von ANA bereitgestellt

| Endpunkt | Methode | Zweck | Pflicht |
|---|---|---|---|
| `/api/instagram/connect` | POST | Verbindung auslösen / Dashboard-Token hinterlegen | Ja |
| `/api/instagram/connection` | GET | Berechtigungsstatus, Token-Alter, `connection_status` | Ja |
| `/api/instagram/sync` | POST | Synchronisationslauf auslösen | Ja |
| `/api/media` | GET | Importierte Medien, paginiert | Ja |
| `/api/media/:id` | GET | Einzelmedium inkl. `media_availability` | Ja |
| `/api/media/:id/insights` | GET | Metriken inkl. `is_missing` | Ja |
| `/api/export/media.json` | GET | JSON-Export | Ja |
| `/api/export/media.csv` | GET | CSV-Export | Ja |
| `/api/revoke` | POST | Verbindung widerrufen, Token verwerfen | Ja |
| `/api/deletion-request` | POST | **Meta Data Deletion Callback** — signierten Request prüfen, löschen, `{ url, confirmation_code }` zurückgeben | Ja |
| `/api/deletion-request/:code` | GET | Statusseite für die löschende Person | Ja |
| `/dashboard` | GET | Einfache Ansicht importierter Posts | Ja |

**Nicht im Vertrag:** alles, was `media_product_type`, `reposts_count`, `saved_count`, `shares_count`,
`total_*`, Hashtag-Suche oder Business Discovery betrifft — unter Instagram Login nicht verfügbar.

---

## 10. Reviewer-Nachweispaket (nur für den Multi-Creator-Fall)

> **Wichtig:** Für den ANA-Piloten ist dieses Paket **nicht** einzureichen. Es wird vorbereitet, damit die
> spätere Erweiterung ohne Grundsatzrecherche möglich ist. **Keine Freigabe wird hier behauptet.**

### A. Permission-Rationales

#### `instagram_business_basic`

| Feld | Textbaustein |
|---|---|
| Konkrete Nutzerfunktion | „Creator verbinden ihr eigenes Instagram-Professional-Konto, um ihre veröffentlichten Beiträge in einer zentralen Übersicht zu sehen." |
| Warum nötig | „Ohne diese Permission kann die App weder die Konto-ID noch den Benutzernamen noch die Medienliste des verbundenen Kontos lesen. Sie ist die Grundvoraussetzung für jeden weiteren Zugriff." |
| Was gelesen wird | Konto-ID, Benutzername, Profilname, Medienanzahl, Follower-Zahl, Profil-URL; pro Medium ID, Permalink, Shortcode, Zeitstempel, Medientyp, Medien-URL, Thumbnail, Kommentar- und Like-Zahl. |
| Was **nicht** gelesen oder verändert wird | Keine Direktnachrichten. Keine Konten Dritter. Kein Hashtag-Search. Keine Business Discovery. Es wird nichts veröffentlicht, bearbeitet, gelöscht, geliked oder kommentiert. Die App ist rein lesend. |
| Anzeige im UI | „Verbundenes Konto"-Karte mit Benutzername und Profilbild; Beitragsliste mit Thumbnail, Zeitstempel, Medientyp und Interaktionszahlen. |
| Gespeicherte Daten | Die genannten Profil- und Medienfelder, jeweils mit Abrufzeitstempel und Quell-Endpoint. Keine Rohdaten Dritter. |

#### `instagram_business_manage_insights`

| Feld | Textbaustein |
|---|---|
| Konkrete Nutzerfunktion | „Creator sehen pro Beitrag und pro Konto Reichweite, Impressionen und Engagement, um zu erkennen, welche Themen ihr Publikum erreichen." |
| Warum nötig | „Die Media- und Account-Insights-Endpoints erfordern diese Permission. Ohne sie zeigt die App nur Zähler, aber keine Reichweiten- und Leistungsdaten." |
| Was gelesen wird | `GET /<IG_MEDIA_ID>/insights` mit `engagement`, `impressions`, `reach`. `GET /<IG_USER_ID>/insights` mit `impressions`, `reach`, `profile_views` und `period=day`. |
| Was **nicht** gelesen oder verändert wird | Keine Insights fremder Konten. Keine Story-Insights. Keine Ad-Daten. Keine Demografien. Es wird nichts geschrieben. |
| Anzeige im UI | Kennzahlenbereich pro Beitrag; Tagesverlaufsdiagramm auf Kontoebene. Fehlende Werte werden ausdrücklich als „nicht verfügbar" angezeigt, nicht als Null. |
| Gespeicherte Daten | Metrikname, Zeitraum, Wert, `end_time`, Abrufzeitstempel, Kennzeichnung „fehlend". |

#### `instagram_business_manage_comments` — **nur falls Kommentarimport wirklich gebraucht wird**

| Feld | Textbaustein |
|---|---|
| Konkrete Nutzerfunktion | „Creator lesen die Kommentare unter ihren Beiträgen, um wiederkehrende Publikumsfragen zu erkennen." |
| Warum nötig | „Der lesende Zugriff auf den `comments`-Edge ist nur über diese Permission möglich; ein rein lesender Comment-Scope existiert nicht." |
| **Ehrliche Einschränkung** | „Die Permission umfasst auch Schreibrechte (Antworten, Verstecken, Löschen). Die App nutzt ausschließlich Leseoperationen und ruft keine POST-/DELETE-Endpoints auf. Der Reviewer kann dies am Screencast und am Netzwerkverkehr nachvollziehen." |
| Was gelesen wird | Kommentar-ID, Text, Zeitstempel, Like-Zahl, Instagram-scoped ID und Benutzername der kommentierenden Person. |
| Was **nicht** gelesen oder verändert wird | Keine Direktnachrichten. Es wird kein Kommentar erstellt, beantwortet, versteckt, gelöscht oder geliked. |
| Anzeige im UI | Kommentarliste unter dem Beitrag, mit Hinweis auf die Speicherfrist und den Löschweg. |
| Gespeicherte Daten | Kommentartext und -metadaten, getrennt von Mediendaten, mit definierter Aufbewahrungsfrist und Löschkaskade. |

> **Empfehlung:** Diesen Scope **nicht** in der ersten Review-Runde einreichen. Er ist nicht
> lesend/schreibend trennbar und erhöht das Ablehnungsrisiko. Erst nachreichen, wenn der Nutzen belegt ist.

### B. Reviewer-Demo-Skript (reproduzierbar)

**Vorbereitung:** Testkonto ist Professional Account, öffentlich, mit mindestens drei veröffentlichten
Beiträgen unterschiedlichen Typs (ein Bild, ein Reel mit Original-Audio, ein Carousel). App ist Live.
Testzugang liegt dem Reviewer vor.

| # | Schritt | Was der Reviewer sehen muss |
|---|---|---|
| 1 | App im Browser öffnen | Startbildschirm mit „Instagram-Konto verbinden" |
| 2 | Auf „Mit Instagram verbinden" klicken | Weiterleitung zur Instagram-Autorisierungsseite |
| 3 | Mit dem Testkonto anmelden | Autorisierungsfenster mit den Permission-Namen |
| 4 | Berechtigungen **sichtbar** erteilen | Beide Permission-Namen einzeln abhakbar; „Weiter" klicken |
| 5 | Rückkehr in die App | Erfolgsseite „Konto verbunden" |
| 6 | Authentifiziertes Konto anzeigen | Benutzername, Profilbild, Medienanzahl — live aus der API |
| 7 | Eigene Posts abrufen | „Beiträge synchronisieren" → Beitragsliste erscheint mit echten Thumbnails, Zeitstempeln, Medientypen |
| 8 | Beitrag öffnen | Detailansicht: Permalink, Medientyp, Kommentar- und Like-Zahl |
| 9 | Echte Insights abrufen | „Kennzahlen laden" → `engagement`, `impressions`, `reach` für den Beitrag; Tageswerte auf Kontoebene |
| 10 | Fehlende Werte zeigen | Mindestens ein Beitrag mit ausdrücklich als „nicht verfügbar" markierter Metrik |
| 11 | *(Optional)* Kommentaransicht öffnen | Kommentarliste; Hinweis, dass die App nicht antwortet |
| 12 | Verbindung widerrufen | „Verbindung trennen" → Bestätigung, Token wird verworfen, Status `REVOKED` |
| 13 | Löschweg zeigen | „Daten löschen" → Löschvorgang läuft, Bestätigungscode und Status-URL werden angezeigt |
| 14 | Nachweis der Löschung | Liste ist leer; Datenbankabfrage zeigt 0 Zeilen für dieses Konto |

**Screencast-Anforderung:** Ein durchgehender Mitschnitt ohne Schnitte, der die Schritte 1–13 zeigt. Meta
verlangt pro Permission den Nachweis der tatsächlichen Nutzung — ein Zusammenschnitt aus Screenshots genügt
erfahrungsgemäß nicht.

### C. Reviewer-Setup

| Punkt | Vorgabe |
|---|---|
| Test-URL | Öffentlich erreichbare HTTPS-URL, ohne VPN, ohne Intranet. Gilt: „If we are unable to access your app to test it, your entire submission will be rejected." |
| Testrollen | Ein separates Instagram-Professional-Konto als Tester; **nicht** das Produktionskonto |
| Gültige Testdaten | ≥ 3 veröffentlichte Beiträge, mindestens ein Bild, ein Reel mit `ORIGINAL_SOUND`, ein Carousel. Konto **öffentlich**. |
| Bereitstellungsanforderungen | TLS-Zertifikat gültig; keine Self-Signed-Zertifikate; Endpoint antwortet ohne Auth, wo Meta ihn aufruft (Data-Deletion-Callback) |
| Unterstützte Sprache | Englisch empfohlen; falls nur Deutsch, Übersetzung oder Untertitel im Screencast beilegen |
| Screencast | Durchgehende Aufnahme, pro Permission, mit sichtbarem Login und sichtbarer Datennutzung im UI |
| Testanleitung | Schriftlich, nummeriert, mit Testzugangsdaten und erwarteten Ergebnissen je Schritt |
| Häufige Ablehnungsgründe | ① App für Reviewer nicht erreichbar ② Permission beantragt, aber nicht sichtbar genutzt ③ unnötige Permissions ④ Screencast zeigt nur UI, nicht den Datenfluss ⑤ Data-Deletion-URL nicht erreichbar oder falsches Antwortformat (muss JSON mit `url` **und** Bestätigungscode sein) ⑥ Datenschutz-URL fehlt |
| Gegenmaßnahmen | Zugänglichkeit vorab aus fremdem Netz testen · jede Permission an einer konkreten UI-Funktion zeigen · nicht benötigte Scopes vor der Einreichung entfernen · Aufnahme mit sichtbarem Netzwerkpanel · Callback-Endpoint mit echtem signierten Request testen · alle URLs vor Einreichung auf Erreichbarkeit prüfen |

---

## 11. Testmatrix

**Kein Test wurde in dieser Session ausgeführt.** Es stand kein Meta-Developer-Zugang, keine App und kein
Token zur Verfügung. Jede Zeile mit `NOT_TESTED`/`BLOCKED` ist eine offene Verpflichtung, kein Ergebnis.

| # | Szenario | Erwartetes Ergebnis | Status | Blocker |
|---|---|---|---|---|
| 1 | Ana kann sich mit ihrem Konto autorisieren | Token wird erzeugt, Konto erscheint im Dashboard | **BLOCKED** | Kein Meta-Zugang. Vorbedingung: Professional-Status `UNKNOWN` |
| 2 | App liest Account-ID und Benutzernamen | `GET /me?fields=id,username` liefert beide Felder | **NOT_TESTED** | Token fehlt. Felder: `SOURCE_VERIFIED` |
| 3 | Ein echter Post erscheint mit korrekter ID und Caption | Medienliste enthält den Post; **Caption-Feld ist der offene Konflikt aus §4.4** | **NOT_TESTED** | **Höchste Priorität** — entscheidet über Login-Pfad |
| 4 | Zweite Abfrage erzeugt kein Duplikat | Zeilenzahl unverändert, `delta_state = UNCHANGED` | **NOT_TESTED** | Umsetzung über Primärschlüssel `(ig_user_id, ig_media_id)` |
| 5 | Verfügbare Insights lassen sich demselben Post zuordnen | `media_insights`-Zeilen tragen dieselbe `ig_media_id` | **NOT_TESTED** | Endpoint: `SOURCE_VERIFIED` |
| 6 | Fehlende Insights werden als fehlend dokumentiert | `is_missing = 1`, `value = NULL`, **nicht** `0` | **NOT_TESTED** | Beleg: „the API will return an empty data set instead of `0`" |
| 7 | Video ohne `media_url` zerstört den Import nicht | Lauf endet erfolgreich, `media_availability = MISSING_LICENSED_AUDIO`, HTTP 200 | **NOT_TESTED** | Beleg: „Requests still return a `200` response" |
| 8 | Abgelaufene Autorisierung führt zu nachvollziehbarer Wiederverbindung | Status `REAUTH_REQUIRED`, sichtbarer Hinweis, erneuter Login möglich | **NOT_TESTED** | Beleg: abgelaufene Tokens sind nicht refreshbar |
| 9 | Import stoppt bei fehlender Berechtigung | Fehler wird protokolliert, **keine** Umgehung, Lauf endet mit `BLOCKED` | **NOT_TESTED** | — |
| 10 | Löschanfrage lässt sich technisch nachvollziehen | `deletion_request`-Zeile, Status `COMPLETED`, Bestätigungscode, 0 verbleibende Zeilen | **NOT_TESTED** | Callback noch nicht gebaut |
| 11 | Neues Posting wird innerhalb des gemessenen Intervalls erkannt | Erkennung ≤ Intervall + Laufdauer | **NOT_TESTED** | Kein Webhook → nur Polling. Intervall ist **konfigurierbare Vorgabe**, keine Plattformgarantie |
| 12 | System erzeugt validen JSON-/CSV-Export | Dateien parsen ohne Fehler, Feldnamen stimmen mit `media_snapshot` überein | **NOT_TESTED** | — |

### Zusätzlich empfohlene Prüfungen

| # | Szenario | Erwartung |
|---|---|---|
| 13 | `media_audio_type = MUSIC` → `media_url` fehlt | Konsistente Prognose vor dem Download-Versuch |
| 14 | `media_audio_type = ORIGINAL_SOUND` → `media_url` vorhanden | Positivfall |
| 15 | Carousel mit gemischten Kindern | Bild-Kinder verfügbar, Video-Kinder ggf. nicht |
| 16 | Token-Refresh vor Tag 60 | Neues 60-Tage-Token, `token_refreshed_at` aktualisiert |
| 17 | Token-Refresh **nach** Ablauf | Fehler, Status `REAUTH_REQUIRED` |
| 18 | 90 Tage ohne Permission-Nutzung | Permission muss neu erteilt werden — als Wartungsfall einplanen |
| 19 | Gelöschter Beitrag | `delta_state = MISSING` nach vollständigem Durchlauf |
| 20 | Archivierter Beitrag | Verhalten dokumentieren — Meta-Doku schweigt dazu → `UNKNOWN` |

---

## 12. Kompakter nächster Slice

**Ziel:** Der erste echte Ana-Post kommt per Instagram API in den eigenen Speicher.

### Reihenfolge

| # | Aufgabe | Aufwand | Abhängigkeit |
|---|---|---|---|
| 1 | Prüfen: Ist `anasavu` ein Professional Account? Wenn nicht, umstellen. | 5 min | — |
| 2 | Meta-Developer-Konto anlegen bzw. nachweisen | 15 min | — |
| 3 | App erstellen (Typ **Business**), Use Case „Manage messaging & content on Instagram" | 15 min | 2 |
| 4 | **Instagram App ID + Secret** notieren, sicher ablegen | 5 min | 3 |
| 5 | Permissions setzen: `instagram_business_basic` + `instagram_business_manage_insights`; **`instagram_business_manage_messages` entfernen** | 10 min | 3 |
| 6 | Ana als **Instagram Tester** einladen; Ana akzeptiert in Instagram → Apps and websites → Tester invites | 10 min | 3 |
| 7 | **Generate token** → sofort in `.env` (nicht in Git) | 5 min | 5, 6 |
| 8 | **AC-2/AC-3-Smoke-Test:** `GET /me?fields=id,username,media_count` und `GET /<id>/media?fields=id,permalink,timestamp,media_type,caption&limit=5` | 15 min | 7 |
| 9 | **§4.4-Entscheidung treffen:** Kommt die Caption? → Login-Pfad bestätigen oder auf Facebook Login wechseln | 10 min | 8 |
| 10 | Worker-Gerüst: Token laden, Profil lesen, Medien paginieren, idempotent upserten | 1 Tag | 8 |
| 11 | Insights synchronisieren, `is_missing` korrekt setzen | 0,5 Tag | 10 |
| 12 | `media_availability`-Logik inkl. `media_audio_type`-Auswertung | 0,5 Tag | 10 |
| 13 | JSON/CSV-Export + einfaches Dashboard | 0,5 Tag | 10 |
| 14 | Widerrufen + Löschen (inkl. Data-Deletion-Callback) | 0,5 Tag | 10 |

**Gesamt: etwa 3–4 Arbeitstage bis zum ersten echten, autorisierten Read-only-Import.**

### Explizit **nicht** im nächsten Slice

- Webhooks (brauchen Advanced Access + Live + Business Verification)
- Kommentarimport (Rechtsfrage offen, Scope nicht trennbar)
- Transkription (erst wenn `media_availability` stabil läuft)
- Multi-Creator-Onboarding
- App Review, Business Verification
- Facebook-Login-Pfad (nur als Fallback, falls Schritt 9 scheitert)

### Was nachweislich **nicht** gebraucht wird

Business Verification · App Review · Unternehmensverifizierung · Facebook-Page-Verknüpfung ·
implementierter OAuth-Flow · Tech-Provider-Status · Live-Modus für den Datenabruf.

---

## 13. Quellenregister

### Primärquellen (alle am 2026-10-13 abgerufen)

| # | Quelle | URL | Dokumentstand | Vertrauen |
|---|---|---|---|---|
| P1 | Instagram Platform Overview (Access levels, App Review, Private apps, App users, Features and permissions, Base URLs, Business verification, Pages/Tasks, Scoped User IDs, /me) | `https://developers.facebook.com/documentation/instagram-platform/overview` | im Text nicht datiert | **hoch** |
| P2 | Business Login for Instagram | `https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login` | **13.03.2026** | **hoch** |
| P3 | Instagram Platform Insights | `https://developers.facebook.com/documentation/instagram-platform/insights` | 21.01.2025 | **hoch** (älter, aber unverändert verlinkt) |
| P4 | IG Media Reference | `https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media` | **12.08.2026** | **hoch** |
| P5 | IG User Reference | `https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user` | **22.04.2026** | **hoch** |
| P6 | IG User Media Reference | `https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media` | **28.09.2026** | **hoch** |
| P7 | Instagram Webhooks (Setup) | `https://developers.facebook.com/documentation/instagram-platform/webhooks/setup` | **16.09.2026** | **hoch** |
| P8 | Instagram Webhook Fields and Permissions | `https://developers.facebook.com/documentation/instagram-platform/webhooks/fields` | **23.09.2026** | **hoch** |
| P9 | Instagram Platform Changelog | `https://developers.facebook.com/documentation/instagram-platform/changelog` | **05.10.2026** (70 Einträge) | **hoch** |
| P10 | Permissions Reference for Meta Technologies APIs | `https://developers.facebook.com/documentation/development/permissions` | **12.10.2026** | **hoch** |
| P11 | Access Levels | `https://developers.facebook.com/docs/graph-api/overview/access-levels` | n. a. (Regeländerung 01.02.2023 genannt) | **hoch** |
| P12 | App Review Process | `https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review` | n. a. | **hoch** |
| P13 | Instagram Platform API Reference Index | `https://developers.facebook.com/documentation/instagram-platform/reference` | 21.01.2025 | **hoch** |
| P14 | Create an App — Instagram Platform | `https://developers.facebook.com/docs/instagram-platform/create-an-instagram-app/` | n. a. | **mittel-hoch** — die `.md`-Variante lieferte nur eine Rumpfseite; die Schrittliste stammt aus dem Seitenindex |

### Sekundärquellen (nur ergänzend)

| # | Quelle | Nutzen | Vertrauen |
|---|---|---|---|
| S1 | postzen.dev, „How to Get an Instagram API Access Token (2026)", 28.09.2026 | Bestätigung Dashboard-Token-Flow, Refresh-Regeln | mittel |
| S2 | upload-post.com, „Instagram API in 2026", 28.09.2026 | Bestätigung Scope-Umbenennung Jan 2025 | mittel |
| S3 | keryx.phpboyscout.uk | Stolperstein „Insufficient developer role" / Business-Zugehörigkeit | mittel |
| S4 | restfb/restfb Issue #1525 (29.01.2025) | Erstmeldung `instagram_business_manage_insights` | mittel |
| S5 | Stack Overflow #79229499 | Praxis: ungewollter `instagram_business_manage_messages`-Default; Access Verification als eigener Schritt | mittel |
| S6 | ppc.land, 17.11.2024 | Platform Terms §3(d)(i), Löschcallback-Ablauf | mittel |
| S7 | landing.app-club.org, 2026 | Callback vs. Instructions URL, Ablehnungsgründe | mittel |
| S8 | gist jameschapman2c, 02.04.2026 | Quervergleich; **enthält veraltete Aussagen** (Basic-Display-Sunset „September 2025" vs. 04.12.2024) | niedrig |

### Markierte Konflikte und veraltete Anleitungen

| # | Konflikt / veraltete Quelle | Auflösung |
|---|---|---|
| C1 | **`caption` „Available for Instagram API with Facebook Login only"** (P4) vs. verbreitete Annahme, Captions seien via Instagram Login lesbar | **Offen.** Muss durch AC-3 praktisch entschieden werden. Fallback: Facebook-Login-Pfad. |
| C2 | **`instagram_business_manage_insights` fehlt in der Permissions Reference** (P10), wird aber von der Insights-Seite (P3) verlangt und ist praktisch im Einsatz | Scope existiert und funktioniert. Offizieller Review-Nachweistext fehlt → eigenen Text schreiben (Analogon: `instagram_manage_insights`). |
| C3 | **Beschreibungstext von `instagram_business_manage_comments`** (P10) wiederholt wörtlich den Text von `instagram_business_content_publish` | Dokumentationsfehler. Nicht als Fakt übernehmen; Bedeutung aus Webhook-Matrix (P8) und Kommentar-Referenz ableiten. |
| C4 | **Instagram Basic Display API** — seit **04.12.2024** abgeschaltet; jede Anleitung dazu ist unbrauchbar | Nur Instagram API with Instagram Login oder with Facebook Login verwenden. S8 nennt ein falsches Datum. |
| C5 | Alte Scope-Namen `business_basic`, `business_content_publish`, `business_manage_comments`, `business_manage_messages` | Seit **27.01.2025** deprecated; `instagram_business_*` verwenden (P2). |
| C6 | Access Level für Webhooks: P7 nennt für Instagram Login pauschal „Advanced Access"; P1 nennt „Private apps"-Ausnahme nur für `instagram_basic` und `instagram_manage_comments` | Kein Widerspruch, aber: Insights sind über den Private-App-Weg **nicht** erreichbar. |
| C7 | API-Version: P4 nennt `v26.0` als aktuellste, P6 nennt in Beispielen `v25.0` | `v26.0` verwenden und bei Versionierung bewusst pinnen. |
| C8 | `create-an-instagram-app.md` liefert nur eine Rumpfseite | Inhalt über die HTML-Seite bzw. den Seitenindex bezogen (P14). |

### Nicht aus Primärquellen belegt → `UNKNOWN`

- Exakte Rate-Limit-Schwellen für die Instagram API with Instagram Login
- Ob Data Handling Questions für diesen Anwendungsfall ausgelöst werden
- Ob der jährliche Data Use Checkup für diesen Anwendungsfall ausgelöst wird
- Ob Access Verification im Multi-Creator-Fall zwingend ist
- Verhalten bei **archivierten** Beiträgen
- Vollständige Metrikliste der Media-Insights unter Instagram Login (das offizielle Beispiel nennt `engagement`,
  `impressions`, `reach`; die vollständige Liste steht in der nicht abgerufenen Insights-Endpoint-Referenz)
- Welche Dashboard-Variante Meta für den konkreten Workspace ausrollt

---

## 14. Maschinenlesbares JSON

Siehe `docs/research/2026-10-13-meta-instagram-api-approval.json` (maschinenlesbare Fassung von Requirements,
Scopes, Gates, Tests, offenen Fakten und Freigabestatus).
