import { BRAND } from "./brand";
import { formatValue, KIT_LOCALE } from "./format";
import { SETTLED_DAYS, type KitAudience, type KitModel, type KitReel, type KitSection, type KitTile, type KitTypicalReel } from "./model";
import { CountUp, Cover, Reveal } from "./motion";
import styles from "./kit.module.css";

/**
 * The media kit page (ANA-53) in Ana Savu's brand: the original banner on top (its stripes carried to the edges), the
 * guideline's olive number tiles with gold numbers, cream ground, olive lines, no shadows; sections that rise in
 * gently and numbers that count up once when they come into view.
 * A server component: the model stays on the server; only the small client parts in motion.tsx get props.
 */

const LOCALE = KIT_LOCALE;
const share = (s: number) => formatValue(s, "share");

function Tile({ tile, big = false }: { tile: KitTile; big?: boolean }) {
  return (
    <div className={big ? styles.heroTile : styles.tile} data-testid={big ? `kit-hero-${tile.id}` : `kit-tile-${tile.id}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- original brand file, already 2× (no optimisation) */}
      {big ? <img className={styles.heroIcon} src={BRAND.icons.instagram} width={22} height={22} alt="" /> : null}
      <b className={styles.value}>
        <CountUp value={tile.value} kind={tile.kind} />
      </b>
      <span className={styles.tileLabel}>{tile.label}</span>
      {big ? (
        tile.short ? <small className={styles.tileNote}>{tile.short}</small> : null
      ) : (
        <small className={styles.tileNote}>Instagram · {tile.note}</small>
      )}
    </div>
  );
}

function Heading({ n, overline, title, id }: { n: number; overline: string; title: string; id: string }) {
  return (
    <header className={styles.sectionHead}>
      <span className={styles.overline}>
        {String(n).padStart(2, "0")} · {overline}
      </span>
      <h2 id={id} className={styles.h2}>
        {title}
      </h2>
    </header>
  );
}

function WorldMap({ audience }: { audience: KitAudience }) {
  const map = audience.map;
  if (!map) return null;
  const top = audience.countries.slice(0, 3).map((c) => c.name).join(", ");
  // largest last, so the small markers stay visible on top of nothing
  const markers = [...map.markers].sort((a, b) => b.r - a.r);
  const pulsing = new Set([...map.markers].sort((a, b) => b.r - a.r).slice(0, 4).map((m) => m.code));
  return (
    <figure className={styles.map} data-testid="kit-map">
      <svg viewBox={`0 0 ${map.land.width} ${map.land.height}`} role="img" aria-label={`World map of the audience. Largest: ${top}.`}>
        <path d={map.land.path} className={styles.land} />
        {markers.map((m) => (
          <g key={m.code} className={m.focus ? styles.markerFocus : styles.marker} data-code={m.code} data-focus={m.focus ? "true" : undefined}>
            {pulsing.has(m.code) ? <circle cx={m.x} cy={m.y} r={m.r} className={styles.ring} /> : null}
            <circle cx={m.x} cy={m.y} r={m.r} />
          </g>
        ))}
      </svg>
    </figure>
  );
}

/** `scale` is the share drawn at full width: shared by lists that are compared (the two country groups) */
function Bars({ rows, testid, scale }: { rows: Array<{ key: string; label: string; share: number; focus?: boolean }>; testid: string; scale?: number }) {
  const max = Math.max(scale ?? 0, ...rows.map((r) => r.share), 0.0001);
  return (
    <ul className={styles.bars} data-testid={testid}>
      {rows.map((r) => (
        <li key={r.key} data-focus={r.focus ? "true" : undefined}>
          <span className={styles.barLabel}>{r.label}</span>
          <span className={styles.barTrack} aria-hidden="true">
            <span className={styles.barFill} data-width={Math.round((r.share / max) * 1000) / 10} style={{ width: `${(r.share / max) * 100}%` }} />
          </span>
          <span className={styles.barValue}>{share(r.share)}</span>
        </li>
      ))}
    </ul>
  );
}

function AudienceSection({ audience, n }: { audience: KitAudience; n: number }) {
  const focus = audience.countries.filter((c) => c.focus);
  const rest = audience.countries.filter((c) => !c.focus);
  const row = (c: KitAudience["countries"][number]) => ({ key: c.code, label: c.name, share: c.share, focus: c.focus });
  // one scale for both groups: a bar's length compares with every other country, not only its own group
  const scale = Math.max(0, ...audience.countries.map((c) => c.share));
  return (
    <Reveal className={styles.section} aria-labelledby="kit-audience" data-testid="kit-audience">
      <Heading n={n} overline="Audience" title="Who watches" id="kit-audience" />
      <WorldMap audience={audience} />
      {audience.focus ? (
        <p className={styles.focusLine} data-testid="kit-focus">
          <b className={styles.focusValue}>
            <CountUp value={audience.focus.share} kind="share" />
          </b>
          <span>
            of the {audience.basis === "followers" ? "followers" : "engaged accounts"} Instagram lists by country are in {audience.focus.label}
          </span>
        </p>
      ) : null}
      <div className={styles.audienceGrid}>
        {audience.countries.length ? (
          <div>
            <h3 className={styles.h3}>Countries</h3>
            <p className={styles.basis}>{audience.basis_label}</p>
            {focus.length ? (
              <>
                <p className={styles.group}>Your markets</p>
                <Bars rows={focus.map(row)} testid="kit-countries-focus" scale={scale} />
                {rest.length ? <p className={styles.group}>Elsewhere</p> : null}
              </>
            ) : null}
            {rest.length ? <Bars rows={rest.map(row)} testid="kit-countries" scale={scale} /> : null}
          </div>
        ) : null}
        {audience.age.length ? (
          <div>
            <h3 className={styles.h3}>Age</h3>
            <p className={styles.basis}>{audience.who_label}</p>
            <Bars rows={audience.age.map((a) => ({ key: a.key, label: a.key, share: a.share }))} testid="kit-age" />
          </div>
        ) : null}
        {audience.gender.length ? (
          <div>
            <h3 className={styles.h3}>Gender</h3>
            <p className={styles.basis}>{audience.who_label}</p>
            <div className={styles.split} data-testid="kit-gender">
              {audience.gender.map((g) => (
                <span key={g.key} className={styles.splitPart} data-key={g.key} style={{ flexGrow: Math.max(g.share, 0.02) }} title={`${g.label} ${share(g.share)}`} />
              ))}
            </div>
            <ul className={styles.splitLegend}>
              {audience.gender.map((g) => (
                <li key={g.key} data-key={g.key}>
                  <b>{share(g.share)}</b> {g.label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Reveal>
  );
}

const month = new Intl.DateTimeFormat(LOCALE, { month: "short", year: "numeric", timeZone: "UTC" });

function ReelCard({ reel }: { reel: KitReel }) {
  const body = (
    <>
      <Cover src={reel.cover} className={styles.reelCover} />
      <span className={styles.reelShade} aria-hidden="true" />
      {reel.label ? (
        <span className={styles.reelLabel} data-testid="kit-reel-label">
          {reel.label}
        </span>
      ) : null}
      <span className={styles.reelMeta}>
        {reel.link ? <span className={styles.srOnly}>Reel on Instagram:</span> : null}
        {reel.views !== null ? (
          <span>
            <b>{formatValue(reel.views, "count")}</b> views
          </span>
        ) : reel.reach !== null ? (
          <span>
            <b>{formatValue(reel.reach, "count")}</b> reached
          </span>
        ) : null}
        {reel.watch_s !== null ? (
          <span>
            <b>{formatValue(reel.watch_s, "seconds")}</b> avg. watch
          </span>
        ) : null}
        {reel.published_at ? <small>{month.format(new Date(reel.published_at))}</small> : null}
      </span>
    </>
  );
  return reel.link ? (
    <a className={styles.reel} href={reel.link} target="_blank" rel="noreferrer noopener" data-testid="kit-reel">
      {body}
    </a>
  ) : (
    <div className={styles.reel} data-testid="kit-reel">
      {body}
    </div>
  );
}

function Section({ section, n, fresh }: { section: KitSection; n: number; fresh: boolean }) {
  switch (section.id) {
    case "numbers":
      return (
        <Reveal className={styles.section} aria-labelledby="kit-numbers" data-testid="kit-numbers">
          <Heading n={n} overline="Performance" title={fresh ? "Live numbers" : "Numbers"} id="kit-numbers" />
          <div className={styles.tiles}>
            {section.tiles.map((t) => (
              <Tile key={t.id} tile={t} />
            ))}
          </div>
        </Reveal>
      );
    case "audience":
      return <AudienceSection audience={section.audience} n={n} />;
    case "reels":
      return (
        <Reveal className={styles.section} aria-labelledby="kit-reels" data-testid="kit-reels">
          <Heading n={n} overline="Content" title={section.reels.length ? "Top Reels" : "Reels"} id="kit-reels" />
          {section.typical ? <Typical typical={section.typical} /> : null}
          {section.reels.length ? (
            <>
              {section.typical ? <p className={styles.group}>Best performing</p> : null}
              <div className={styles.reels}>
                {section.reels.map((r) => (
                  <ReelCard key={r.id} reel={r} />
                ))}
              </div>
            </>
          ) : null}
        </Reveal>
      );
    case "proof":
      return (
        <Reveal className={styles.section} aria-labelledby="kit-proof" data-testid="kit-proof">
          <Heading n={n} overline="Proof" title="Selected work" id="kit-proof" />
          <div className={styles.cases}>
            {section.cases.map((c, i) => (
              <article key={`${c.brand}-${i}`} className={styles.case}>
                <p className={styles.caseBrand}>{c.brand}</p>
                {c.title ? <h3 className={styles.h3}>{c.title}</h3> : null}
                {c.summary ? <p className={styles.caseText}>{c.summary}</p> : null}
                {c.role || c.deliverables.length ? (
                  <dl className={styles.caseFacts}>
                    {c.role ? (
                      <div>
                        <dt>Role</dt>
                        <dd>{c.role}</dd>
                      </div>
                    ) : null}
                    {c.deliverables.length ? (
                      <div>
                        <dt>Deliverables</dt>
                        <dd>{c.deliverables.join(" · ")}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
                {c.results.length ? (
                  <dl className={styles.caseResults}>
                    {c.results.map((r) => (
                      <div key={r.label}>
                        <dt>{r.label}</dt>
                        <dd>{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className={styles.caseNoResults} data-testid="kit-case-no-results">
                    Collaboration · no published results
                  </p>
                )}
                {c.period || c.source ? <p className={styles.caseSource}>{[c.results.length ? "Measured" : null, c.period, c.source ? `source: ${c.source}` : null].filter(Boolean).join(" · ")}</p> : null}
                {c.link ? (
                  <a className={styles.textLink} href={c.link} target="_blank" rel="noreferrer noopener">
                    See the work
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        </Reveal>
      );
    case "packages":
      return (
        <Reveal className={styles.section} aria-labelledby="kit-packages" data-testid="kit-packages">
          <Heading n={n} overline="Collaborations" title="Packages" id="kit-packages" />
          {section.packages.length ? (
            <div className={styles.packages} data-testid="kit-package-list">
              {section.packages.map((p, i) => (
                <article key={`${p.name}-${i}`} className={styles.package}>
                  <h3 className={styles.h3}>{p.name}</h3>
                  <p className={styles.price}>{p.price}</p>
                  {p.includes.length ? (
                    <ul className={styles.includes}>
                      {p.includes.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  ) : null}
                  {p.note ? <p className={styles.packageNote}>{p.note}</p> : null}
                </article>
              ))}
            </div>
          ) : null}
          {section.addons.length ? (
            <div className={styles.addons} data-testid="kit-addons">
              <h3 className={styles.h3}>Add-ons</h3>
              <ul>
                {section.addons.map((a, i) => (
                  <li key={`${a.name}-${i}`}>
                    <span className={styles.addonName}>{a.name}</span>
                    {a.price ? <span className={styles.addonPrice}>{a.price}</span> : null}
                    {a.note ? <small>{a.note}</small> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Reveal>
      );
  }
}

function PreviewBar({ model }: { model: KitModel }) {
  return (
    <aside className={styles.preview} data-testid="kit-preview" aria-label="Internal preview">
      <span className={styles.previewTag}>Internal preview · only behind the dashboard login</span>
      <nav className={styles.presets} aria-label="Brand presets">
        {model.presets.map((p) => (
          <a key={p.id} href={p.id === "default" ? "/kit" : `/kit?for=${encodeURIComponent(p.id)}`} aria-current={p.id === model.preset.id ? "page" : undefined} data-testid={`kit-preset-${p.id}`}>
            {p.label}
          </a>
        ))}
      </nav>
      {model.case_ids.length ? (
        <span className={styles.previewIds} data-testid="kit-case-ids">
          Case ids: {model.case_ids.join(", ")}
        </span>
      ) : null}
      {model.hidden.length || model.config_error ? (
        <details className={styles.hidden}>
          <summary>Not shown ({model.hidden.length + (model.config_error ? 1 : 0)})</summary>
          <ul data-testid="kit-hidden">
            {model.config_error ? <li>media-kit.json could not be read: its content is ignored</li> : null}
            {model.hidden.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </aside>
  );
}

const asOf = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

/** running partnerships first ("Currently working with"), then "Also worked with" (no claim that those ended); one "Worked with" list when none runs */
function Partners({ partners, more }: { partners: KitModel["partners"]; more: boolean }) {
  const current = partners.filter((p) => p.current);
  const past = partners.filter((p) => !p.current);
  // "and more" closes the last list shown: the past one, or the current one when there is no past one
  const list = (items: KitModel["partners"], testid: string, last: boolean) => (
    <ul data-testid={testid}>
      {items.map((p, i) => (
        <li key={`${p.name}-${i}`}>
          <span className={styles.partnerName}>{p.name}</span>
          {p.kind ? <small>{p.kind}</small> : null}
        </li>
      ))}
      {more && last ? (
        <li className={styles.partnersMore} data-testid="kit-partners-more">
          and more
        </li>
      ) : null}
    </ul>
  );
  return (
    <div className={styles.partners} data-testid="kit-partners">
      {current.length ? (
        <>
          <p className={styles.group}>Currently working with</p>
          {list(current, "kit-partners-current", !past.length)}
        </>
      ) : null}
      {past.length ? (
        <>
          <p className={`${styles.group} ${current.length ? styles.groupNext : ""}`}>{current.length ? "Also worked with" : "Worked with"}</p>
          {list(past, "kit-partners-past", true)}
        </>
      ) : null}
    </div>
  );
}

const day = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** the baseline a brand can expect, before the best Reels: medians, with how many Reels and from when */
function Typical({ typical }: { typical: KitTypicalReel }) {
  return (
    <div className={styles.typical} data-testid="kit-typical">
      <p className={styles.group}>Typical Reel</p>
      <div className={styles.typicalValues}>
        <span data-testid="kit-typical-views">
          <b className={styles.value}>
            <CountUp value={typical.views} kind="count" />
          </b>
          <span className={styles.tileLabel}>views</span>
        </span>
        <span data-testid="kit-typical-reach">
          <b className={styles.value}>
            <CountUp value={typical.reach} kind="count" />
          </b>
          <span className={styles.tileLabel}>accounts reached</span>
        </span>
      </div>
      <small className={styles.tileNote}>
        Instagram · median per Reel over {typical.n} {typical.feed_only ? "feed " : ""}Reels published {day.format(new Date(typical.from))} – {day.format(new Date(typical.to))}, lifetime values of Reels at least {SETTLED_DAYS} days old
      </small>
    </div>
  );
}

/**
 * The heading: the original banner (the guideline: never re-set the logo), at most 600 px wide so the 1200 px file
 * stays sharp; the name is in the heading's text for screen readers and search. It links to Ana's site only when
 * media-kit.json names one.
 */
function Banner({ name, website }: { name: string; website: string | null }) {
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- original brand file, already 2× (no optimisation) */}
      <img src={BRAND.banner.src} width={600} height={180} alt="" />
      <span className={styles.srOnly}>{name}</span>
    </>
  );
  return (
    <h1 className={styles.band} data-testid="kit-banner">
      {website ? (
        <a className={styles.bandLink} href={website} target="_blank" rel="noreferrer noopener">
          {inner}
        </a>
      ) : (
        <span className={styles.bandLink}>{inner}</span>
      )}
    </h1>
  );
}

export function MediaKit({ model, preview = false }: { model: KitModel; preview?: boolean }) {
  return (
    <div className={styles.page} data-testid="kit" data-preset={model.preset.id}>
      {preview ? <PreviewBar model={model} /> : null}
      <Banner name={model.name} website={model.website} />
      <header className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.overline}>{BRAND.sender}</p>
          <p className={styles.kitTitle}>Media kit</p>
          {model.preset.id !== "default" ? <p className={`${styles.overline} ${styles.presetLine}`}>For {model.preset.label}</p> : null}
          {model.handle ? (
            <a className={styles.handle} href={`https://www.instagram.com/${encodeURIComponent(model.handle)}/`} target="_blank" rel="noreferrer noopener">
              @{model.handle}
            </a>
          ) : null}
          {model.tagline ? (
            <p className={styles.tagline} data-testid="kit-tagline">
              {model.tagline}
            </p>
          ) : null}
          {model.hero.tiles.length || model.hero.signal ? (
            <div className={styles.heroTiles} data-testid="kit-hero-tiles">
              {model.hero.tiles.map((t) => (
                <Tile key={t.id} tile={t} big />
              ))}
              {model.hero.signal ? (
                <div className={styles.heroTile} data-testid="kit-hero-signal">
                  {/* eslint-disable-next-line @next/next/no-img-element -- original brand file, already 2× (no optimisation) */}
                  <img className={styles.heroIcon} src={BRAND.icons.instagram} width={22} height={22} alt="" />
                  <b className={`${styles.value} ${styles.signalValue}`}>
                    <CountUp value={model.hero.signal.share} kind="share" />
                  </b>
                  <span className={styles.tileLabel}>In {model.hero.signal.label}</span>
                  <small className={styles.tileNote}>{model.hero.signal.basis.replace(" · ", ", ")}, by country</small>
                </div>
              ) : null}
            </div>
          ) : null}
          {model.partners.length ? <Partners partners={model.partners} more={model.partners_more} /> : null}
          {model.contact ? (
            // one way to write, one button (Ben's wish): the hero link leads down to it
            <a className={styles.heroCta} href="#kit-cta" data-testid="kit-hero-cta">
              {model.contact.label} <span aria-hidden="true">↓</span>
            </a>
          ) : null}
        </div>
        <div className={styles.mosaic} data-count={model.hero.covers.length} aria-hidden="true">
          {model.hero.covers.length ? model.hero.covers.map((c, i) => <Cover key={c.id} src={c.src} className={styles[`m${i}`]} />) : (
            <span className={styles.mosaicEmpty}>
              {/* eslint-disable-next-line @next/next/no-img-element -- original brand file, already 2× (no optimisation) */}
              <img src={BRAND.logo.src} width={176} height={176} alt="" />
            </span>
          )}
        </div>
      </header>
      <main id="main" className={styles.main} tabIndex={-1}>
        {model.sections.map((s, i) => (
          <Section key={s.id} section={s} n={i + 1} fresh={model.fresh} />
        ))}
        {model.contact ? (
          <Reveal className={`${styles.section} ${styles.cta}`} data-testid="kit-cta" id="kit-cta">
            <p className={styles.overline}>Get in touch</p>
            <a className={styles.button} href={model.contact.href}>
              {model.contact.label}
            </a>
          </Reveal>
        ) : null}
      </main>
      <footer className={styles.footer}>
        <div className={styles.signature} data-testid="kit-signature">
          {/* eslint-disable-next-line @next/next/no-img-element -- original brand file, already 2× (no optimisation) */}
          <img src={BRAND.logo.src} width={64} height={64} alt="" />
          <div>
            <p className={styles.sender}>{BRAND.sender}</p>
            <p className={styles.senderLine}>{BRAND.senderLine}</p>
            {model.contact || model.website ? (
              <p>
                {/* the address as text: one way to write, one button (the only mailto link is the button) */}
                {model.contact ? <span data-testid="kit-signature-email">{model.contact.email}</span> : null}
                {model.contact && model.website ? " · " : null}
                {model.website ? (
                  <a href={model.website} target="_blank" rel="noreferrer noopener">
                    {model.website.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
        {model.as_of ? (
          <p data-testid="kit-as-of">
            {model.fresh ? "Numbers live from Instagram" : "Numbers from Instagram"}, measured {asOf.format(new Date(model.as_of))}
            {model.fresh ? "" : " (the latest available reading)"}.
          </p>
        ) : null}
        <p>Audience shares are of the countries, ages and genders Instagram reports. 28-day figures are Instagram&apos;s account totals.</p>
      </footer>
      <div className={styles.stripes} aria-hidden="true" />
    </div>
  );
}
