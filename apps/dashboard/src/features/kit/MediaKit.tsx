import { formatValue, KIT_LOCALE } from "./format";
import type { KitAudience, KitModel, KitReel, KitSection, KitTile } from "./model";
import { CountUp, Cover, Reveal } from "./motion";
import styles from "./kit.module.css";

/**
 * The media kit page (ANA-53). Bright and calm: Ana's covers large, serif headings, clean large numbers, sand and sea
 * blue as the only accents, sections that rise in gently and numbers that count up once when they come into view.
 * A server component: the model stays on the server; only the small client parts in motion.tsx get props.
 */

const LOCALE = KIT_LOCALE;
const share = (s: number) => formatValue(s, "share");

function Tile({ tile, big = false }: { tile: KitTile; big?: boolean }) {
  return (
    <div className={big ? styles.heroTile : styles.tile} data-testid={big ? `kit-hero-${tile.id}` : `kit-tile-${tile.id}`}>
      <b className={styles.value}>
        <CountUp value={tile.value} kind={tile.kind} />
      </b>
      <span className={styles.tileLabel}>{tile.label}</span>
      {big ? tile.short ? <small className={styles.tileNote}>{tile.short}</small> : null : <small className={styles.tileNote}>{tile.note}</small>}
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

function Section({ section, n }: { section: KitSection; n: number }) {
  switch (section.id) {
    case "numbers":
      return (
        <Reveal className={styles.section} aria-labelledby="kit-numbers" data-testid="kit-numbers">
          <Heading n={n} overline="Performance" title="Live numbers" id="kit-numbers" />
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
          <Heading n={n} overline="Content" title="Top Reels" id="kit-reels" />
          <div className={styles.reels}>
            {section.reels.map((r) => (
              <ReelCard key={r.id} reel={r} />
            ))}
          </div>
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
                {c.results.length ? (
                  <dl className={styles.caseResults}>
                    {c.results.map((r) => (
                      <div key={r.label}>
                        <dt>{r.label}</dt>
                        <dd>{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
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

export function MediaKit({ model, preview = false }: { model: KitModel; preview?: boolean }) {
  return (
    <div className={styles.page} data-testid="kit" data-preset={model.preset.id}>
      {preview ? <PreviewBar model={model} /> : null}
      <header className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.overline}>Media kit{model.preset.id !== "default" ? ` · ${model.preset.label}` : ""}</p>
          <h1 className={styles.h1}>{model.name}</h1>
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
          {model.hero.tiles.length ? (
            <div className={styles.heroTiles} data-testid="kit-hero-tiles">
              {model.hero.tiles.map((t) => (
                <Tile key={t.id} tile={t} big />
              ))}
            </div>
          ) : null}
        </div>
        <div className={styles.mosaic} data-count={model.hero.covers.length} aria-hidden="true">
          {model.hero.covers.length ? model.hero.covers.map((c, i) => <Cover key={c.id} src={c.src} className={styles[`m${i}`]} />) : <span className={styles.mosaicEmpty} />}
        </div>
      </header>
      <main id="main" className={styles.main} tabIndex={-1}>
        {model.sections.map((s, i) => (
          <Section key={s.id} section={s} n={i + 1} />
        ))}
        {model.contact ? (
          <Reveal className={`${styles.section} ${styles.cta}`} data-testid="kit-cta">
            <p className={styles.overline}>Get in touch</p>
            <a className={styles.button} href={model.contact.href}>
              {model.contact.label}
            </a>
          </Reveal>
        ) : null}
      </main>
      <footer className={styles.footer}>
        {model.as_of ? (
          <p data-testid="kit-as-of">
            Numbers live from Instagram, measured {asOf.format(new Date(model.as_of))}
            {model.stale ? " (the latest available reading)" : ""}.
          </p>
        ) : null}
        <p>Audience shares are of the countries, ages and genders Instagram reports. 28-day figures are Instagram&apos;s account totals.</p>
      </footer>
    </div>
  );
}
