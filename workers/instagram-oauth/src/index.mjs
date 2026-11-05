/**
 * ANA Instagram OAuth gateway (Cloudflare Worker).
 * Restricted single-account read-only integration, never a generic social-login app.
 * No Meta secret, access token, or OAuth code is returned to a browser or logged.
 */
const SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights'];
const AUTH_HOST = 'https://www.instagram.com';
const TOKEN_HOST = 'https://api.instagram.com';
const GRAPH_HOST = 'https://graph.instagram.com';
const GRAPH_VERSION = 'v26.0';
const CALLBACK_PATH = '/instagram/callback';
// __Secure- prefix: browsers refuse the cookie unless it is Secure and set over HTTPS.
const SESSION_COOKIE = '__Secure-ana_ig_oauth';
const MAX_INVITE_SECONDS = 1800;
const ATTEMPT_TTL_SECONDS = 600;
// An invitation stays usable until a token is stored, but only for a few attempts
// (cancel at Instagram, wrong account logged in, closed tab, ...).
const MAX_ATTEMPTS_PER_INVITE = 3;
// Meta long-lived tokens last ~60 days; anything far shorter would expire between daily cron runs.
const MIN_TOKEN_SECONDS = 7 * 86400;
const MIN_KEY_LENGTH = 32;
const MEDIA_FIELDS = 'id,media_type,permalink,timestamp,thumbnail_url';
// Social snapshot (internal read contract for the dashboard BFF).
const SNAPSHOT_BASE_FIELDS = MEDIA_FIELDS + ',media_product_type';
const SNAPSHOT_OPTIONAL_FIELDS = 'caption,like_count,comments_count';
// media_url: the picture of IMAGE posts and carousel containers (Meta: thumbnail_url exists only for VIDEO). It has its
// own fallback step, so a refusal never costs caption and counters. For VIDEO it is the video file: never passed on.
const SNAPSHOT_PICTURE_FIELD = 'media_url';
// Same maturity rule as the dashboard (apps/dashboard/src/features/social/insights.ts MATURE_AGE_DAYS).
const SNAPSHOT_MATURE_DAYS = 7;
const SNAPSHOT_DEFAULT_MAX = 30;
const SNAPSHOT_MAX = 50;
const SNAPSHOT_PAGE_SIZE = 25;
// Stays below Cloudflare's 50 sub-requests per invocation on the free plan; shortfall is reported, never hidden.
const SNAPSHOT_SUBREQUEST_BUDGET = 45;
const SNAPSHOT_INSIGHT_CONCURRENCY = 5;
// Media history (internal read contract): older posts for the office topic count, without insights. 200 posts are 8
// pages of 25; the budget leaves room for the identity read and the field fallback steps.
const HISTORY_DEFAULT_MAX = 100;
const HISTORY_MAX = 200;
const HISTORY_SUBREQUEST_BUDGET = 14;
// Insights of given posts (the older ones the snapshot does not reach): up to 40 per call, one Meta call per post
// normally, within the snapshot's budget of 45.
const INSIGHTS_MAX_IDS = 40;
const INSIGHTS_SUBREQUEST_BUDGET = 45;
const MEDIA_INSIGHT_METRICS = ['reach','views','saved','shares','likes','comments','total_interactions'];
const ACCOUNT_METRICS = ['reach','views','accounts_engaged','total_interactions'];
const ACCOUNT_WINDOW_DAYS = 28;

class MetaError extends Error {
  constructor(kind, code = null) { super(kind); this.metaCode = code; }
}

function nowSeconds() { return Math.floor(Date.now() / 1000); }
function randomUrlSafe(byteCount = 32) {
  const b = crypto.getRandomValues(new Uint8Array(byteCount));
  return base64url(b);
}
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function unbase64url(encoded) {
  const x = encoded.trim().replace(/-/g, '+').replace(/_/g, '/');
  const chars = atob(x.padEnd(Math.ceil(x.length / 4) * 4, '='));
  return Uint8Array.from(chars, c => c.charCodeAt(0));
}
async function digest(s) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}
async function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let v = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) v |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return v === 0;
}
function securityHeaders(contentType = 'application/json; charset=utf-8') {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'no-store, private',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {status, headers: securityHeaders()});
}
function html(body, status = 200, extraHeaders = {}) {
  return new Response(`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ANA Instagram Connection</title><body style="font:16px system-ui,sans-serif;max-width:560px;margin:10vh auto;padding:1rem;line-height:1.5">${body}</body></html>`, {
    status, headers: { ...securityHeaders('text/html; charset=utf-8'), ...extraHeaders }
  });
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// Structured operator log: event name and error class only — never URLs, codes, tokens or secrets.
function logEvent(event, fields = {}) { console.log(JSON.stringify({event, ...fields})); }
function errorClass(e) {
  if (e instanceof MetaError) return e.metaCode !== null ? `meta-${e.metaCode}` : e.message;
  return ['bad-short-token','bad-long-token','bad-identity','wrong-account','invalid-refresh','invalid-key-size','subrequest-budget','meta-throttled'].includes(e?.message) ? e.message : (e?.name || 'error');
}
function validOpaque(s) { return typeof s === 'string' && /^[A-Za-z0-9_-]{32,100}$/.test(s); }
function cookieValue(request, name) {
  const raw = request.headers.get('Cookie') || '';
  const v = raw.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  return v ? v.slice(name.length + 1) : '';
}
function setSessionCookie(value) {
  return `${SESSION_COOKIE}=${value}; Path=${CALLBACK_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=${ATTEMPT_TTL_SECONDS}`;
}
function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=${CALLBACK_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
function validAesKey(value) {
  try { return unbase64url(value).byteLength === 32; } catch { return false; }
}
function configured(env) {
  const required = ['DB','PUBLIC_ORIGIN','INSTAGRAM_APP_ID','INSTAGRAM_APP_SECRET','EXPECTED_IG_USER_ID','EXPECTED_IG_USERNAME','AES_GCM_KEY_BASE64','ADMIN_API_KEY','INTERNAL_READ_KEY'];
  if (!required.every(k => env[k])) return false;
  if (String(env.ADMIN_API_KEY).length < MIN_KEY_LENGTH || String(env.INTERNAL_READ_KEY).length < MIN_KEY_LENGTH) return false;
  // The two bearer keys guard different trust zones (operator vs. server-to-server); they must differ.
  if (env.ADMIN_API_KEY === env.INTERNAL_READ_KEY) return false;
  if (!validAesKey(String(env.AES_GCM_KEY_BASE64))) return false;
  try {
    const u = new URL(env.PUBLIC_ORIGIN);
    return u.protocol === 'https:' && u.origin === env.PUBLIC_ORIGIN
      && /^\d+$/.test(String(env.EXPECTED_IG_USER_ID))
      && /^[A-Za-z0-9._]{1,30}$/.test(String(env.EXPECTED_IG_USERNAME));
  } catch { return false; }
}
async function authorizeAdmin(request, env, key = 'ADMIN_API_KEY') {
  const raw = request.headers.get('Authorization') || '';
  if (!raw.startsWith('Bearer ')) return false;
  return constantTimeEquals(raw.slice(7), env[key]);
}
function originMatches(request, env) {
  return request.headers.get('Origin') === env.PUBLIC_ORIGIN;
}
async function encryptionKey(env) {
  const bytes = unbase64url(String(env.AES_GCM_KEY_BASE64));
  if (bytes.byteLength !== 32) throw Error('invalid-key-size');
  return crypto.subtle.importKey('raw', bytes, {name:'AES-GCM'}, false, ['encrypt','decrypt']);
}
// Additional authenticated data binds a ciphertext to its account row; a swapped row fails to decrypt.
function tokenAAD(accountId) { return new TextEncoder().encode(`ana-ig-token|${accountId}|v1`); }
async function seal(token, env, accountId) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(env);
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:tokenAAD(accountId)}, key, new TextEncoder().encode(token));
  return {iv: base64url(iv), ciphertext: base64url(new Uint8Array(cipher))};
}
async function openSealed(row, env) {
  const key = await encryptionKey(env);
  const decrypted = await crypto.subtle.decrypt({name:'AES-GCM', iv:unbase64url(row.token_iv), additionalData:tokenAAD(row.account_id)}, key, unbase64url(row.token_ciphertext));
  return new TextDecoder().decode(decrypted);
}
async function getMetaJson(url, opts = {}) {
  const response = await fetch(url, {...opts, signal: AbortSignal.timeout(10000)});
  let data;
  try {data = await response.json();} catch {throw new MetaError('meta-non-json');}
  if (!response.ok || data?.error) throw new MetaError('meta-rejected', Number.isInteger(data?.error?.code) ? data.error.code : null);
  return data;
}
// Meta documents some responses wrapped as {data:[{...}]}; accept both shapes, never more than one entry.
function unwrapSingle(data) {
  return Array.isArray(data?.data) && data.data.length === 1 && !data.access_token && !data.user_id ? data.data[0] : data;
}
function parsePermissions(p) {
  if (Array.isArray(p)) return p.map(String);
  if (typeof p === 'string') return p.split(',').map(x => x.trim()).filter(Boolean);
  return [];
}
function metaOAuthURL(env, state) {
  const u = new URL('/oauth/authorize', AUTH_HOST);
  u.searchParams.set('client_id', env.INSTAGRAM_APP_ID);
  u.searchParams.set('redirect_uri', env.PUBLIC_ORIGIN + CALLBACK_PATH);
  u.searchParams.set('scope', SCOPES.join(','));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('state', state);
  // No force_reauth: forcing a fresh login made Instagram run its SMS/backup-code security check on every
  // attempt. A reused instagram.com session is safe because the callback pins user_id + username.
  return u.href;
}
async function exchangeCode(code, env) {
  const form = new URLSearchParams({
    client_id:env.INSTAGRAM_APP_ID,
    client_secret:env.INSTAGRAM_APP_SECRET,
    grant_type:'authorization_code',
    redirect_uri:env.PUBLIC_ORIGIN + CALLBACK_PATH,
    code:code.replace(/#_$/, '')
  });
  const data = await getMetaJson(TOKEN_HOST + '/oauth/access_token', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:form.toString()
  });
  const candidate = unwrapSingle(data);
  if (typeof candidate?.access_token !== 'string' || !candidate.access_token) throw Error('bad-short-token');
  // Meta's documented exchange endpoint takes client_secret as a query parameter (server-to-server only).
  const longURL = new URL('/access_token', GRAPH_HOST);
  longURL.searchParams.set('grant_type','ig_exchange_token');
  longURL.searchParams.set('client_secret',env.INSTAGRAM_APP_SECRET);
  longURL.searchParams.set('access_token',candidate.access_token);
  const long = await getMetaJson(longURL.href);
  if (typeof long.access_token !== 'string' || !Number.isFinite(Number(long.expires_in)) || Number(long.expires_in) < MIN_TOKEN_SECONDS) throw Error('bad-long-token');
  return {token:long.access_token, expiresIn:Number(long.expires_in), permissions:parsePermissions(candidate.permissions)};
}
// Documented transport for graph.instagram.com is the access_token query parameter.
async function metaFetch(path, token, params = {}) {
  const url = new URL('/' + GRAPH_VERSION + path, GRAPH_HOST);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, String(v)));
  url.searchParams.set('access_token', token);
  return getMetaJson(url.href);
}
// /me `id` is the app-scoped ID; `user_id` is the Instagram professional account ID (17841...).
// Identity is only accepted as a JSON *string*: numbers above 2^53 lose precision.
async function fetchIdentity(token, extraFields = []) {
  const me = unwrapSingle(await metaFetch('/me', token, {fields:['user_id','username',...extraFields].join(',')}));
  if (typeof me?.user_id !== 'string' || !/^\d+$/.test(me.user_id) || typeof me.username !== 'string') throw Error('bad-identity');
  return me;
}
function isExpectedAccount(me, env) {
  return me.user_id === String(env.EXPECTED_IG_USER_ID) && me.username.toLowerCase() === String(env.EXPECTED_IG_USERNAME).toLowerCase();
}
// `caption` availability under Instagram Login is disputed in Meta's reference; never let it fail the whole read.
async function fetchMedia(token, limit) {
  try {
    const data = await metaFetch('/me/media', token, {fields:MEDIA_FIELDS + ',caption', limit});
    return {data, caption:'ACCEPTED'};
  } catch (e) {
    if (!(e instanceof MetaError)) throw e;
    const data = await metaFetch('/me/media', token, {fields:MEDIA_FIELDS, limit});
    return {data, caption:'REJECTED_BY_META', caption_error:errorClass(e)};
  }
}
async function createInvite(env) {
  const invite = randomUrlSafe();
  const inviteHash = await digest(invite);
  const expires = nowSeconds() + MAX_INVITE_SECONDS;
  await env.DB.prepare('INSERT INTO oauth_invites (invite_hash, expires_at) VALUES (?,?)').bind(inviteHash,expires).run();
  logEvent('invite-created', {expires_at:expires});
  return json({url:env.PUBLIC_ORIGIN+'/instagram/start?invite='+encodeURIComponent(invite), expires_at:expires, max_attempts:MAX_ATTEMPTS_PER_INVITE});
}
const LINK_EXPIRED = '<h1>Link abgelaufen</h1><p>Bitte bei Ben einen neuen Link anfordern.</p>';
async function startPage(req, env, url) {
  const invite = url.searchParams.get('invite');
  if (!validOpaque(invite)) return html('<h1>Link ungültig</h1><p>Bitte bei Ben einen neuen Link anfordern.</p>',400);
  const row = await env.DB.prepare('SELECT expires_at,used_at,attempt_count FROM oauth_invites WHERE invite_hash=?').bind(await digest(invite)).first();
  if (!row || row.used_at !== null || row.expires_at <= nowSeconds() || row.attempt_count >= MAX_ATTEMPTS_PER_INVITE) return html(LINK_EXPIRED,410);
  // same-origin (not no-referrer): with no-referrer, browsers send `Origin: null` on the form POST,
  // which the Origin check below would reject.
  return html(`<h1>Instagram mit ANA verbinden</h1><p>Du wirst zu Instagram weitergeleitet. Erlaube den Zugriff nur, wenn du ANA LUMEN mit deinem Konto verbinden möchtest.</p><p>Die Anwendung fragt ausschließlich Profil-/Medienzugriff und Insights an (nur lesen).</p><p>Bitte im Browser öffnen, nicht in der Instagram-App.</p><form action="/instagram/start" method="post"><input type="hidden" name="invite" value="${escapeHTML(invite)}"><button type="submit" style="padding:.75rem 1rem">Weiter</button></form>`,200,{'Referrer-Policy':'same-origin'});
}
async function startLogin(req,env) {
  if (!originMatches(req,env)) return json({error:'invalid-origin'},403);
  const input = await req.text();
  if (input.length > 2048) return json({error:'invalid-request'},400);
  const invite = new URLSearchParams(input).get('invite');
  if (!validOpaque(invite)) return json({error:'invalid-invitation'},400);
  const inviteHash = await digest(invite);
  const t = nowSeconds();
  const counted = await env.DB.prepare('UPDATE oauth_invites SET attempt_count=attempt_count+1 WHERE invite_hash=? AND used_at IS NULL AND expires_at>? AND attempt_count<?').bind(inviteHash,t,MAX_ATTEMPTS_PER_INVITE).run();
  if (counted.meta?.changes !== 1) return html(LINK_EXPIRED,410);
  const state = randomUrlSafe();
  const browserNonce = randomUrlSafe();
  await env.DB.prepare('INSERT INTO oauth_attempts (state_hash,cookie_hash,invite_hash,expires_at) VALUES (?,?,?,?)').bind(await digest(state),await digest(browserNonce),inviteHash,t+ATTEMPT_TTL_SECONDS).run();
  // A plain link instead of a 303: CSP form-action applies to redirects of a form submission,
  // so redirecting the POST to instagram.com would be blocked by `form-action 'self'`.
  return html(`<h1>Weiter zu Instagram</h1><p>Melde dich dort mit dem freigegebenen Instagram-Konto an und prüfe die angefragten Berechtigungen.</p><p><a href="${escapeHTML(metaOAuthURL(env,state))}" rel="noreferrer" style="display:inline-block;padding:.75rem 1rem;border:1px solid;border-radius:.4rem">Mit Instagram verbinden</a></p>`,200,{'Set-Cookie':setSessionCookie(browserNonce)});
}
// Returns the attempt row only when state and the browser-bound cookie both match an open attempt.
async function matchAttempt(req,url,env) {
  const state=url.searchParams.get('state');
  const nonce=cookieValue(req,SESSION_COOKIE);
  if (!validOpaque(state) || !validOpaque(nonce)) return null;
  const stateHash=await digest(state);
  // Joined with the invitation: once any attempt has stored a token, the invite's other open attempts are dead.
  const row=await env.DB.prepare('SELECT a.cookie_hash, a.invite_hash, a.expires_at, a.consumed_at, i.used_at AS invite_used_at FROM oauth_attempts a JOIN oauth_invites i ON i.invite_hash=a.invite_hash WHERE a.state_hash=?').bind(stateHash).first();
  if (!row || row.consumed_at !== null || row.invite_used_at !== null || row.expires_at <= nowSeconds() || !(await constantTimeEquals(row.cookie_hash,await digest(nonce)))) return null;
  return {...row, stateHash};
}
async function consumeAttempt(env, stateHash) {
  const t=nowSeconds();
  const used=await env.DB.prepare('UPDATE oauth_attempts SET consumed_at=? WHERE state_hash=? AND consumed_at IS NULL AND expires_at>?').bind(t,stateHash,t).run();
  return used.meta?.changes===1;
}
async function callback(req,env,url) {
  if (url.searchParams.has('error')) {
    // Only a matching browser may cancel its own attempt; a forged ?error= link changes nothing.
    const attempt=await matchAttempt(req,url,env);
    if (!attempt) return html('<h1>Freigabe abgebrochen</h1><p>Es wurden keine Zugangsdaten gespeichert.</p>',400);
    await consumeAttempt(env,attempt.stateHash);
    logEvent('oauth-denied');
    return html('<h1>Freigabe abgebrochen</h1><p>Es wurden keine Zugangsdaten gespeichert. Du kannst den Einladungslink erneut öffnen, solange er gültig ist.</p>',400,{'Set-Cookie':clearSessionCookie()});
  }
  const code=url.searchParams.get('code');
  // Unmatched callbacks never touch the cookie: a forged cross-site link must not disturb a real attempt.
  if (!code || code.length > 2000 || !validOpaque(url.searchParams.get('state')) || !validOpaque(cookieValue(req,SESSION_COOKIE))) return html('<h1>Freigabe ungültig</h1><p>Bitte bei Ben einen neuen Link anfordern.</p>',400);
  const attempt=await matchAttempt(req,url,env);
  if (!attempt) return html('<h1>Freigabe abgelaufen</h1><p>Bitte bei Ben einen neuen Link anfordern.</p>',410);
  if (!(await consumeAttempt(env,attempt.stateHash))) return html('<h1>Bereits verwendet</h1>',410,{'Set-Cookie':clearSessionCookie()});
  try {
    const exchanged=await exchangeCode(code,env);
    const account=await fetchIdentity(exchanged.token);
    if(!isExpectedAccount(account,env)) throw Error('wrong-account');
    const token=await seal(exchanged.token,env,account.user_id);
    const t=nowSeconds();
    // One transaction: the callback that claims the invitation is the only one that stores a token.
    // changes() reads the claim statement directly before it, so a concurrent callback that lost the claim writes nothing.
    const [claim]=await env.DB.batch([
      env.DB.prepare('UPDATE oauth_invites SET used_at=? WHERE invite_hash=? AND used_at IS NULL').bind(t,attempt.invite_hash),
      env.DB.prepare(`INSERT INTO instagram_tokens (account_id,username,token_iv,token_ciphertext,granted_permissions,issued_at,expires_at,updated_at,connection_status)
       SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1 ON CONFLICT(account_id) DO UPDATE SET username=excluded.username,token_iv=excluded.token_iv,token_ciphertext=excluded.token_ciphertext,granted_permissions=excluded.granted_permissions,issued_at=excluded.issued_at,expires_at=excluded.expires_at,updated_at=excluded.updated_at,connection_status='CONNECTED',last_refresh_error=NULL`)
        .bind(account.user_id,account.username,token.iv,token.ciphertext,JSON.stringify(exchanged.permissions),t,t+exchanged.expiresIn,t,'CONNECTED'),
      env.DB.prepare('UPDATE oauth_attempts SET consumed_at=? WHERE invite_hash=? AND consumed_at IS NULL').bind(t,attempt.invite_hash)
    ]);
    if (claim?.meta?.changes !== 1) {
      logEvent('oauth-claim-lost');
      return html('<h1>Bereits verwendet</h1>',410,{'Set-Cookie':clearSessionCookie()});
    }
    logEvent('oauth-connected', {expires_at:t+exchanged.expiresIn, permissions:exchanged.permissions});
    return html('<h1>Instagram erfolgreich verbunden</h1><p>Du kannst dieses Fenster schließen. Es wurden keine Zugangsdaten an den Browser übergeben.</p>',200,{'Set-Cookie':clearSessionCookie()});
  } catch (e) {
    // Don't log the code, URL, secret, or token. The failed attempt stays consumed; the invite may be retried.
    const reason=errorClass(e);
    logEvent('oauth-failed', {reason});
    return html(`<h1>Verbindung nicht abgeschlossen</h1><p>${reason==='wrong-account'?'Es wurde nicht das freigegebene Instagram-Konto verwendet. Bitte bei Instagram abmelden und den Einladungslink erneut öffnen.':'Bitte den Einladungslink erneut öffnen oder bei Ben einen neuen anfordern.'}</p>`,422,{'Set-Cookie':clearSessionCookie()});
  }
}
async function findToken(env) {
  return env.DB.prepare('SELECT * FROM instagram_tokens WHERE account_id=?').bind(String(env.EXPECTED_IG_USER_ID)).first();
}
async function readStatus(env) {
  const record=await findToken(env);
  if (!record) return json({connected:false,status:'NOT_AUTHORIZED'});
  const expired = record.expires_at <= nowSeconds();
  return json({connected:record.connection_status==='CONNECTED' && !expired,status:expired?'REAUTH_REQUIRED':record.connection_status,username:record.username,expires_at:record.expires_at,issued_at:record.issued_at,permissions_reported:JSON.parse(record.granted_permissions||'[]'),last_refresh_attempt_at:record.last_refresh_attempt_at,last_refresh_error:record.last_refresh_error});
}
async function usableToken(env) {
  const row=await findToken(env);
  if(!row || row.expires_at<=nowSeconds() || row.connection_status!=='CONNECTED') return null;
  return openSealed(row,env);
}
async function mediaProbe(env) {
  const t=await usableToken(env);
  if(!t) return json({connected:false,status:'REAUTH_REQUIRED'},409);
  try {
    const account=await fetchIdentity(t,['media_count']);
    if(!isExpectedAccount(account,env))return json({error:'account-mismatch'},409);
    const media=await fetchMedia(t,3);
    const samples=Array.isArray(media.data.data)?media.data.data:[];
    return json({connected:true,username:account.username,media_count:account.media_count??null,sample_received:samples.length,caption_field:media.caption,caption_error:media.caption_error??null,caption_value_observed:samples.some(x=>Object.hasOwn(x,'caption')),insights:'NOT_TESTED — use GET /admin/insights-probe'});
  }catch(e){return json({error:'instagram-probe-failed',reason:errorClass(e)},502)}
}
// One documented account-level metric; a PASS here is the evidence required before claiming insights access.
async function insightsProbe(env) {
  const t=await usableToken(env);
  if(!t) return json({connected:false,status:'REAUTH_REQUIRED'},409);
  try {
    const account=await fetchIdentity(t);
    if(!isExpectedAccount(account,env))return json({error:'account-mismatch'},409);
    const data=await metaFetch(`/${account.user_id}/insights`,t,{metric:'reach',period:'day',metric_type:'total_value'});
    const metrics=Array.isArray(data.data)?data.data:[];
    if(!metrics.length) return json({insights:'FAILED',reason:'empty-response'},502);
    return json({insights:'PASS',metrics:metrics.map(m=>({name:m.name,period:m.period,total_value:m.total_value?.value??null}))});
  }catch(e){return json({insights:'FAILED',reason:errorClass(e)},502)}
}
async function readMedia(req,env,url) {
  if(!(await authorizeAdmin(req,env,'INTERNAL_READ_KEY')))return json({error:'unauthorized'},401);
  const limitRaw=url.searchParams.get('limit')||'10';
  if(!/^\d{1,2}$/.test(limitRaw) || +limitRaw<1 || +limitRaw>25)return json({error:'invalid-limit'},400);
  const token=await usableToken(env);
  if(!token)return json({error:'reauth-required'},409);
  try{
    const media=await fetchMedia(token,limitRaw);
    return json({fetched_at:new Date().toISOString(),account_id:String(env.EXPECTED_IG_USER_ID),caption_field:media.caption,data:media.data.data||[],paging_present:!!media.data.paging});
  }catch(e){return json({error:'instagram-media-fetch-failed',reason:errorClass(e)},502)}
}
// ---- social snapshot ----
// Meta codes after which further calls in this snapshot only waste quota or a dead token: rate limits and token errors.
const HALT_CODES = new Set([4, 17, 32, 613, 190]);
// Every Meta call goes through one budget so a snapshot can never exceed the Worker's sub-request limit.
function metaBudget(token, limit) {
  const b = {limit, used:0, halted:null, remaining:() => (b.halted ? 0 : limit - b.used)};
  b.fetch = async (path, params) => {
    if (b.halted) throw Error('meta-throttled');
    if (b.used >= limit) throw Error('subrequest-budget');
    b.used++;
    try { return await metaFetch(path, token, params); }
    catch (e) { if (e instanceof MetaError && HALT_CODES.has(e.metaCode)) b.halted = errorClass(e); throw e; }
  };
  return b;
}
async function snapshotIdentity(b) {
  try {
    const me = unwrapSingle(await b.fetch('/me', {fields:'user_id,username,followers_count,media_count'}));
    if (typeof me?.user_id !== 'string' || !/^\d+$/.test(me.user_id) || typeof me.username !== 'string') throw Error('bad-identity');
    return {me, extras:true};
  } catch (e) {
    if (!(e instanceof MetaError) || e.metaCode !== 100) throw e;
    const me = unwrapSingle(await b.fetch('/me', {fields:'user_id,username'}));
    if (typeof me?.user_id !== 'string' || !/^\d+$/.test(me.user_id) || typeof me.username !== 'string') throw Error('bad-identity');
    return {me, extras:false};
  }
}
const countOrNull = v => Number.isFinite(v) && v >= 0 ? v : null;
// the picture of a photo post or carousel; a carousel that opens with a video can carry a video file URL: refused
function pictureUrl(m) {
  if (m.media_type === 'VIDEO' || typeof m.media_url !== 'string') return null;
  try { return /\.(mp4|mov|m4v|webm)$/i.test(new URL(m.media_url).pathname) ? null : m.media_url; } catch { return null; }
}
// Follows paging.cursors.after through metaFetch; Meta's paging.next URL carries the token and is never used or returned.
// media_product_type stays in the base set: without it Reels and feed videos could not be kept apart.
async function snapshotMedia(b, max) {
  // fallback steps on Meta error 100 (invalid field), first page only: all fields -> without media_url -> base fields
  const steps = [
    {fields:SNAPSHOT_BASE_FIELDS + ',' + SNAPSHOT_OPTIONAL_FIELDS + ',' + SNAPSHOT_PICTURE_FIELD, optional:'ACCEPTED', picture:'ACCEPTED'},
    {fields:SNAPSHOT_BASE_FIELDS + ',' + SNAPSHOT_OPTIONAL_FIELDS, optional:'ACCEPTED', picture:'REJECTED_BY_META'},
    {fields:SNAPSHOT_BASE_FIELDS, optional:'REJECTED_BY_META', picture:'REJECTED_BY_META'},
  ];
  let step = 0, after = null, pages = 0, hasMore = false, stopped = null;
  let {fields, optional, picture} = steps[0];
  const items = [];
  while (items.length < max) {
    const params = {fields, limit:Math.min(SNAPSHOT_PAGE_SIZE, max - items.length)};
    if (after) params.after = after;
    let page;
    try { page = await b.fetch('/me/media', params); }
    catch (e) {
      // the budget or a throttle ends the paging after the first page: keep what was read and say why it stopped
      if (pages > 0 && ['subrequest-budget','meta-throttled'].includes(e?.message)) { hasMore = true; stopped = e.message; break; }
      // only "invalid field or parameter" means Meta refused an optional field; anything else fails the read
      if (!(e instanceof MetaError) || e.metaCode !== 100 || pages > 0 || step >= steps.length - 1) throw e;
      ({fields, optional, picture} = steps[++step]);
      continue;
    }
    pages++;
    const data = Array.isArray(page?.data) ? page.data : [];
    items.push(...data.slice(0, max - items.length));
    const cursor = page?.paging?.cursors?.after;
    hasMore = Boolean(page?.paging?.next) && typeof cursor === 'string' && data.length > 0;
    if (!hasMore) break;
    after = cursor;
  }
  return {optional, picture, pages, hasMore, stopped, items:items.map(m => ({
    id:String(m.id), media_type:m.media_type ?? null, media_product_type:m.media_product_type ?? null,
    permalink:m.permalink ?? null, timestamp:m.timestamp ?? null, thumbnail_url:m.thumbnail_url ?? null,
    ...(optional === 'ACCEPTED' ? {caption:typeof m.caption === 'string' ? m.caption : null, like_count:countOrNull(m.like_count), comments_count:countOrNull(m.comments_count)} : {}),
    ...(picture === 'ACCEPTED' ? {image_url:pictureUrl(m)} : {})
  }))};
}
function insightValue(entry) {
  const v = entry?.total_value?.value ?? entry?.values?.[0]?.value;
  return Number.isFinite(v) ? v : null;
}
const metricState = (name, state, error_class) => ({name, value:null, state, period:null, ...(error_class ? {error_class} : {})});
const skipped = (b, metrics = MEDIA_INSIGHT_METRICS) => ({state:'not_fetched', reason:b.halted ? 'meta-throttled' : 'subrequest-budget', metrics:metrics.map(n => metricState(n, 'not_fetched'))});
const notSent = e => e?.message === 'subrequest-budget' || e?.message === 'meta-throttled';
// Reel-only and newer metrics (Meta IG Media insights): requested in the same call as the base metrics, by product type.
// Which of them Meta accepts is learned once per Worker call on the first post of that type, so a refused one costs a
// few calls once instead of the per-metric loop on every post.
// reposts is documented for feed posts and Reels but refused by Meta (error 100) for this account on every post
// (live snapshot of 2026-11-05, worker fa0dcd18): asking for it cost 6 calls of every snapshot, so it is not asked.
const EXTRA_METRICS = {REELS:['ig_reels_avg_watch_time','reels_skip_rate']};
const refusedMetric = name => metricState(name, 'unavailable', 'meta-100');
const insightReader = (b, id) => async metrics => {
  const data = await b.fetch(`/${id}/insights`, {metric:metrics.join(',')});
  return Array.isArray(data?.data) ? data.data : [];
};
function fromEntries(metrics, entries) {
  return metrics.map(name => {
    const e = entries.find(x => x?.name === name);
    const value = insightValue(e);
    return value === null ? metricState(name, 'unavailable', 'empty-response') : {name, value, state:'ok', period:e.period ?? null};
  });
}
// The base metrics of one post in one call; on Meta error 100 (a metric does not apply to this media) per metric.
async function baseInsights(b, id) {
  const read = insightReader(b, id);
  if (b.remaining() < 1) return skipped(b);
  try {
    return summarize(fromEntries(MEDIA_INSIGHT_METRICS, await read(MEDIA_INSIGHT_METRICS)), b);
  } catch (e) {
    if (notSent(e)) return skipped(b);
    if (!(e instanceof MetaError) || e.metaCode !== 100) return {state:'error', metrics:MEDIA_INSIGHT_METRICS.map(n => metricState(n, 'error', errorClass(e)))};
    return isolated(b, read);
  }
}
async function isolated(b, read) {
  const metrics = [];
  for (const name of MEDIA_INSIGHT_METRICS) {
    if (b.remaining() < 1) { metrics.push(metricState(name, 'not_fetched')); continue; }
    try { metrics.push(...fromEntries([name], await read([name]))); }
    catch (err) {
      if (notSent(err)) { metrics.push(metricState(name, 'not_fetched')); continue; }
      metrics.push(metricState(name, err instanceof MetaError && err.metaCode === 100 ? 'unavailable' : 'error', errorClass(err)));
      // reach applies to every insight-capable media: if even reach is refused, the post has no insights at all
      if (name === MEDIA_INSIGHT_METRICS[0] && err instanceof MetaError && err.metaCode === 100) {
        for (const rest of MEDIA_INSIGHT_METRICS.slice(1)) metrics.push(metricState(rest, 'unavailable', 'meta-100'));
        break;
      }
    }
  }
  return summarize(metrics, b);
}
// base + extras in one call; on Meta error 100 the base alone (its own fallback), the extras marked refused
async function withExtras(b, id, extras) {
  if (!extras.length) return baseInsights(b, id);
  const all = [...MEDIA_INSIGHT_METRICS, ...extras];
  if (b.remaining() < 1) return skipped(b, all);
  try {
    return summarize(fromEntries(all, await insightReader(b, id)(all)), b);
  } catch (e) {
    if (notSent(e)) return skipped(b, all);
    if (!(e instanceof MetaError) || e.metaCode !== 100) return {state:'error', metrics:all.map(n => metricState(n, 'error', errorClass(e)))};
    const base = await baseInsights(b, id);
    // a throttle or budget stop keeps its own reason (summarize would report the budget)
    if (base.state === 'not_fetched') return {...base, metrics:[...base.metrics, ...extras.map(n => metricState(n, 'not_fetched'))]};
    return summarize([...base.metrics, ...extras.map(refusedMetric)], b);
  }
}
// What Meta does with each extra, learned per snapshot and type from the posts read so far: accepted (answered),
// refused (Meta error 100 on the extra alone), given up (its probe failed for another reason PROBE_TRIES times). Extras
// in none of these are still open; while some are open, posts of that type are read one at a time so the knowledge
// grows from each before the next. Only a probe of one extra counts: a post that fails or has no insights says
// nothing about its extras.
const PROBE_TRIES = 2;
function extraKnowledge(b, type) {
  b.extraKnowledge ??= new Map();
  if (!b.extraKnowledge.has(type)) b.extraKnowledge.set(type, {accepted:new Set(), refused:new Set(), givenUp:new Set(), failures:new Map(), lock:null});
  return b.extraKnowledge.get(type);
}
const openExtras = (k, wanted) => wanted.filter(n => !k.accepted.has(n) && !k.refused.has(n) && !k.givenUp.has(n));
async function readWithExtras(b, id, wanted, k) {
  const accepted = wanted.filter(n => k.accepted.has(n));
  const open = openExtras(k, wanted);
  if (!open.length) return withExtras(b, id, accepted);
  const all = [...MEDIA_INSIGHT_METRICS, ...accepted, ...open];
  if (b.remaining() < 1) return skipped(b, all);
  try {
    const r = summarize(fromEntries(all, await insightReader(b, id)(all)), b);
    for (const n of open) k.accepted.add(n);
    return r;
  } catch (e) {
    if (notSent(e)) return skipped(b, all);
    const failed = () => ({state:'error', metrics:all.map(n => metricState(n, 'error', errorClass(e)))});
    // this post's own throttle or token error stops everything; anything else that is not Meta's answer is its error
    // (a halt caused by another post meanwhile shows up below as not_fetched with reason meta-throttled)
    if (!(e instanceof MetaError) || HALT_CODES.has(e.metaCode)) return failed();
    // Meta refused or failed the call with the open extras: the known part first, then each open extra alone, so only
    // the extra that fails counts (a persistent error on the extras must not cost every post its base metrics)
    const known = await withExtras(b, id, accepted);
    if (known.state === 'error' && e.metaCode !== 100) return failed();
    if (known.state !== 'ok' && known.state !== 'partial') return known;
    const read = insightReader(b, id);
    const probed = [];
    for (const name of open) {
      if (b.remaining() < 1) { probed.push(metricState(name, 'not_fetched')); continue; }
      try { probed.push(...fromEntries([name], await read([name]))); k.accepted.add(name); }
      catch (err) {
        if (notSent(err)) { probed.push(metricState(name, 'not_fetched')); continue; }
        if (err instanceof MetaError && err.metaCode === 100) { probed.push(refusedMetric(name)); k.refused.add(name); continue; }
        probed.push(metricState(name, 'error', errorClass(err)));
        const tries = (k.failures.get(name) ?? 0) + 1;
        k.failures.set(name, tries);
        if (tries >= PROBE_TRIES) k.givenUp.add(name);
      }
    }
    return summarize([...known.metrics, ...probed], b);
  }
}
async function mediaInsights(b, id, productType = null) {
  const wanted = Object.hasOwn(EXTRA_METRICS, productType ?? '') ? EXTRA_METRICS[productType] : [];
  if (!wanted.length) return baseInsights(b, id);
  const k = extraKnowledge(b, productType);
  let release = null;
  while (openExtras(k, wanted).length && k.lock) await k.lock;
  if (openExtras(k, wanted).length) k.lock = new Promise(r => { release = () => { k.lock = null; r(); }; });
  let r;
  try { r = await readWithExtras(b, id, wanted, k); }
  finally { release?.(); }
  // extras this post did not get back: cut with the post, refused with a post that has no insights, or as known
  const absent = n => r.state === 'not_fetched' ? metricState(n, 'not_fetched')
    : r.state === 'unavailable' || k.refused.has(n) ? refusedMetric(n)
    : k.givenUp.has(n) ? metricState(n, 'error', 'extra-not-learned')
    : metricState(n, r.state === 'error' ? 'error' : 'not_fetched', r.state === 'error' ? 'post-error' : undefined);
  const metrics = [...r.metrics.filter(m => MEDIA_INSIGHT_METRICS.includes(m.name)), ...wanted.map(n => r.metrics.find(m => m.name === n) ?? absent(n))];
  return r.state === 'not_fetched' ? {...r, metrics} : summarize(metrics, b);
}
// A budget shortfall is never an error: only a Meta error is.
function summarize(metrics, b = null) {
  const count = s => metrics.filter(m => m.state === s).length;
  if (count('ok') === metrics.length) return {state:'ok', metrics};
  if (count('ok') > 0) return {state:'partial', metrics};
  if (count('error') > 0) return {state:'error', metrics};
  if (count('not_fetched') > 0) return {state:'not_fetched', reason:b?.halted ? 'meta-throttled' : 'subrequest-budget', metrics};
  return {state:'unavailable', metrics};
}
async function accountMetrics(b, userId) {
  const until = nowSeconds(), since = until - ACCOUNT_WINDOW_DAYS * 86400;
  const out = [];
  for (const name of ACCOUNT_METRICS) {
    const base = {name, period:'day', metric_type:'total_value', window_days:ACCOUNT_WINDOW_DAYS, since, until};
    try {
      const data = await b.fetch(`/${userId}/insights`, {metric:name, period:'day', metric_type:'total_value', since, until});
      const value = insightValue((Array.isArray(data?.data) ? data.data : []).find(x => x?.name === name));
      out.push(value === null ? {...base, value:null, state:'unavailable', error_class:'empty-response'} : {...base, value, state:'ok'});
    } catch (e) {
      const cls = notSent(e) ? e.message : errorClass(e);
      out.push({...base, value:null, state:e instanceof MetaError && e.metaCode === 100 ? 'unavailable' : notSent(e) ? 'not_fetched' : 'error', error_class:cls});
    }
  }
  return out;
}
// Lifetime insights of young posts are still growing and never compared, so posts at least SNAPSHOT_MATURE_DAYS old
// get the call budget first (newest mature first), then the young ones.
function insightOrder(items, now = Date.now()) {
  const age = m => (now - Date.parse(m.timestamp ?? '')) / 86_400_000;
  const idx = items.map((m, i) => i);
  const mature = idx.filter(i => age(items[i]) >= SNAPSHOT_MATURE_DAYS);
  return [...mature, ...idx.filter(i => !mature.includes(i))];
}
async function readSocialSnapshot(req,env,url) {
  if(!(await authorizeAdmin(req,env,'INTERNAL_READ_KEY')))return json({error:'unauthorized'},401);
  const maxRaw=url.searchParams.get('max')||String(SNAPSHOT_DEFAULT_MAX);
  if(!/^\d{1,2}$/.test(maxRaw) || +maxRaw<1 || +maxRaw>SNAPSHOT_MAX)return json({error:'invalid-max'},400);
  const token=await usableToken(env);
  if(!token)return json({error:'reauth-required'},409);
  const b=metaBudget(token,SNAPSHOT_SUBREQUEST_BUDGET);
  let identity, media;
  try {
    identity=await snapshotIdentity(b);
    if(!isExpectedAccount(identity.me,env))return json({error:'account-mismatch'},409);
    media=await snapshotMedia(b,+maxRaw);
  } catch(e) { return json({error:'instagram-media-fetch-failed',reason:errorClass(e)},502); }
  const account_metrics=await accountMetrics(b,identity.me.user_id);
  // a few in parallel to bound wall time; a throttle or token error halts the rest
  const order=insightOrder(media.items);
  const insights=new Array(media.items.length);
  for (let i=0;i<order.length;i+=SNAPSHOT_INSIGHT_CONCURRENCY) {
    const chunk=order.slice(i,i+SNAPSHOT_INSIGHT_CONCURRENCY);
    const results=await Promise.all(chunk.map(k=>mediaInsights(b,media.items[k].id,media.items[k].media_product_type)));
    results.forEach((r,j)=>{insights[chunk[j]]=r;});
  }
  const followers=identity.extras?countOrNull(identity.me.followers_count):null;
  return json({
    snapshot_version:1, fetched_at:new Date().toISOString(), provider:'instagram', api_version:GRAPH_VERSION,
    account:{id:String(env.EXPECTED_IG_USER_ID), username:identity.me.username,
      followers_count:{value:followers, state:followers===null?'unavailable':'ok'},
      media_count:{value:identity.extras?countOrNull(identity.me.media_count):null, state:identity.extras&&countOrNull(identity.me.media_count)!==null?'ok':'unavailable'},
      metrics:account_metrics},
    media:{requested_max:+maxRaw, returned:media.items.length, pages_fetched:media.pages, has_more:media.hasMore, optional_fields_state:media.optional, picture_field_state:media.picture,
      items:media.items.map((m,i)=>({...m, insights:insights[i]}))},
    insights:{requested_metrics:MEDIA_INSIGHT_METRICS, extra_metrics:EXTRA_METRICS, priority:'mature-first', mature_days:SNAPSHOT_MATURE_DAYS, halted:b.halted,
      posts_with_insights:insights.filter(x=>x.state==='ok'||x.state==='partial').length, budget:{limit:b.limit, used:b.used}}
  });
}
// Ana's older posts (id, time, type, caption, cover/picture), newest first, no insights. Same account check and paging as
// the snapshot; Meta's paging URLs and the token never leave the Worker.
async function readMediaHistory(req,env,url) {
  if(!(await authorizeAdmin(req,env,'INTERNAL_READ_KEY')))return json({error:'unauthorized'},401);
  const maxRaw=url.searchParams.get('max')||String(HISTORY_DEFAULT_MAX);
  if(!/^\d{1,3}$/.test(maxRaw) || +maxRaw<1 || +maxRaw>HISTORY_MAX)return json({error:'invalid-max'},400);
  const token=await usableToken(env);
  if(!token)return json({error:'reauth-required'},409);
  const b=metaBudget(token,HISTORY_SUBREQUEST_BUDGET);
  let identity, media;
  try {
    identity=await snapshotIdentity(b);
    if(!isExpectedAccount(identity.me,env))return json({error:'account-mismatch'},409);
    media=await snapshotMedia(b,+maxRaw);
  } catch(e) { return json({error:'instagram-media-fetch-failed',reason:errorClass(e)},502); }
  return json({
    history_version:1, fetched_at:new Date().toISOString(), provider:'instagram', api_version:GRAPH_VERSION, account:{id:String(env.EXPECTED_IG_USER_ID)},
    media:{requested_max:+maxRaw, returned:media.items.length, pages_fetched:media.pages, has_more:media.hasMore, stopped:media.stopped, optional_fields_state:media.optional, picture_field_state:media.picture,
      items:media.items.map(m=>({id:m.id, media_type:m.media_type, media_product_type:m.media_product_type, timestamp:m.timestamp, thumbnail_url:m.thumbnail_url,
        ...('caption' in m ? {caption:m.caption} : {}), ...('image_url' in m ? {image_url:m.image_url} : {})}))},
    budget:{limit:b.limit, used:b.used}
  });
}
// Lifetime insights of the given posts (ids from /internal/media-history), same metrics, per-metric isolation, throttle
// halt and budget rule as the snapshot. The account is checked first; Meta answers only for media of the token's account.
async function readMediaInsights(req,env,url) {
  if(!(await authorizeAdmin(req,env,'INTERNAL_READ_KEY')))return json({error:'unauthorized'},401);
  const raw=url.searchParams.get('ids')||'';
  const ids=raw.split(',');
  if(raw.length>INSIGHTS_MAX_IDS*31 || ids.length<1 || ids.length>INSIGHTS_MAX_IDS || ids.some(id=>!/^\d{1,30}$/.test(id)) || new Set(ids).size!==ids.length)return json({error:'invalid-ids'},400);
  const token=await usableToken(env);
  if(!token)return json({error:'reauth-required'},409);
  const b=metaBudget(token,INSIGHTS_SUBREQUEST_BUDGET);
  try {
    const identity=await snapshotIdentity(b);
    if(!isExpectedAccount(identity.me,env))return json({error:'account-mismatch'},409);
  } catch(e) { return json({error:'instagram-media-fetch-failed',reason:errorClass(e)},502); }
  const insights=new Array(ids.length);
  for (let i=0;i<ids.length;i+=SNAPSHOT_INSIGHT_CONCURRENCY) {
    const chunk=ids.slice(i,i+SNAPSHOT_INSIGHT_CONCURRENCY);
    const results=await Promise.all(chunk.map(id=>mediaInsights(b,id)));
    results.forEach((r,j)=>{insights[i+j]=r;});
  }
  return json({
    insights_version:1, fetched_at:new Date().toISOString(), provider:'instagram', api_version:GRAPH_VERSION, account:{id:String(env.EXPECTED_IG_USER_ID)},
    requested_metrics:MEDIA_INSIGHT_METRICS, halted:b.halted, budget:{limit:b.limit, used:b.used},
    items:ids.map((id,i)=>({id, insights:insights[i]}))
  });
}
// ---- World pulse and audience (ANA World, additive internal read contracts) ----
// Pulse: one cheap read of the newest posts' public counters so the dashboard can show real like/comment deltas
// within a minute. Audience: Meta's aggregated demographics (top 45, up to 48 h delayed). Neither carries per-like or
// per-comment origin: Meta does not provide it.
const PULSE_DEFAULT_MAX = 12;
const PULSE_MAX = 25;
const PULSE_SUBREQUEST_BUDGET = 3;
// The first four reads keep their order and their this_month timeframe (dashboards before this change read the first
// match by name and breakdown). The rest are additive: the last 7 days for recency, age and gender, and one combined
// age,gender read whose key joins both values with '|' (e.g. '25-34|F'). Meta documents only this_week and this_month
// for these metrics since v20.0, at most the top 45 values, nothing under 100 engagements / followers.
const AUDIENCE_READS = [
  ['engaged_audience_demographics', 'country', 'this_month'], ['engaged_audience_demographics', 'city', 'this_month'],
  ['follower_demographics', 'country', 'this_month'], ['follower_demographics', 'city', 'this_month'],
  ['engaged_audience_demographics', 'country', 'this_week'], ['engaged_audience_demographics', 'city', 'this_week'],
  ['engaged_audience_demographics', 'age', 'this_week'], ['engaged_audience_demographics', 'gender', 'this_week'],
  ['engaged_audience_demographics', 'age', 'this_month'], ['engaged_audience_demographics', 'gender', 'this_month'],
  ['engaged_audience_demographics', 'age,gender', 'this_month'],
  ['follower_demographics', 'age', 'this_month'], ['follower_demographics', 'gender', 'this_month'],
];
// identity read(s) plus one read per entry above
// + 1 for follows_and_unfollows of the last 24 hours (Meta: day period, follow_type breakdown, up to 48 h delayed)
const AUDIENCE_SUBREQUEST_BUDGET = AUDIENCE_READS.length + 4;
const FOLLOWS_WINDOW_SECONDS = 86400;
// The caller has already checked INTERNAL_READ_KEY.
async function internalIdentity(env, budget) {
  const token=await usableToken(env);
  if(!token)return {response:json({error:'reauth-required'},409)};
  const b=metaBudget(token,budget);
  let identity;
  try { identity=await snapshotIdentity(b); }
  catch(e) { return {response:json({error:'instagram-identity-failed',reason:errorClass(e)},502)}; }
  if(!isExpectedAccount(identity.me,env))return {response:json({error:'account-mismatch'},409)};
  return {b, identity};
}
async function readSocialPulse(req,env,url) {
  if(!(await authorizeAdmin(req,env,'INTERNAL_READ_KEY')))return json({error:'unauthorized'},401);
  const maxRaw=url.searchParams.get('max')||String(PULSE_DEFAULT_MAX);
  if(!/^\d{1,2}$/.test(maxRaw) || +maxRaw<1 || +maxRaw>PULSE_MAX)return json({error:'invalid-max'},400);
  const ctx=await internalIdentity(env,PULSE_SUBREQUEST_BUDGET);
  if(ctx.response)return ctx.response;
  let page;
  try { page=await ctx.b.fetch('/me/media',{fields:'id,timestamp,media_product_type,like_count,comments_count',limit:+maxRaw}); }
  catch(e) { return json({error:'instagram-media-fetch-failed',reason:errorClass(e)},502); }
  const data=Array.isArray(page?.data)?page.data:[];
  const followers=ctx.identity.extras?countOrNull(ctx.identity.me.followers_count):null;
  const mediaCount=ctx.identity.extras?countOrNull(ctx.identity.me.media_count):null;
  return json({
    pulse_version:1, fetched_at:new Date().toISOString(), provider:'instagram', api_version:GRAPH_VERSION,
    account:{followers_count:followers, media_count:mediaCount},
    items:data.slice(0,+maxRaw).map(m=>({id:String(m.id), timestamp:m.timestamp ?? null, media_product_type:m.media_product_type ?? null,
      like_count:countOrNull(m.like_count), comments_count:countOrNull(m.comments_count)}))
  });
}
function demographicResults(entry, breakdown) {
  const breakdowns=entry?.total_value?.breakdowns;
  const results=Array.isArray(breakdowns)&&Array.isArray(breakdowns[0]?.results)?breakdowns[0].results:[];
  // the last n dimension values belong to the n requested breakdowns (a leading timeframe value is skipped)
  const n=breakdown.split(',').length;
  return results.map(r=>{
    const dims=Array.isArray(r?.dimension_values)?r.dimension_values:[];
    const key=dims.length>=n?dims.slice(-n).map(String).join('|'):null;
    return {key, value:countOrNull(r?.value)};
  }).filter(r=>r.key!==null && r.key.length>0 && r.key.length<=120 && r.value!==null);
}
async function readSocialAudience(req,env) {
  if(!(await authorizeAdmin(req,env,'INTERNAL_READ_KEY')))return json({error:'unauthorized'},401);
  const ctx=await internalIdentity(env,AUDIENCE_SUBREQUEST_BUDGET);
  if(ctx.response)return ctx.response;
  const userId=ctx.identity.me.user_id;
  const read=async ([name, breakdown, timeframe]) => {
    const base={name, breakdown, timeframe};
    try {
      const data=await ctx.b.fetch(`/${userId}/insights`,{metric:name, period:'lifetime', timeframe, metric_type:'total_value', breakdown});
      const entry=(Array.isArray(data?.data)?data.data:[]).find(x=>x?.name===name);
      const results=demographicResults(entry, breakdown);
      return results.length?{...base, state:'ok', results}:{...base, state:'unavailable', error_class:'empty-response', results:[]};
    } catch(e) {
      const cls=notSent(e)?e.message:errorClass(e);
      return {...base, state:e instanceof MetaError&&e.metaCode===100?'unavailable':notSent(e)?'not_fetched':'error', error_class:cls, results:[]};
    }
  };
  // The four original reads run one after another as before (a throttle stops the rest); the additive reads then run
  // in parallel, so the whole answer stays well inside the dashboard's request timeout even when Meta is slow.
  // follows and unfollows of the last 24 hours (FOLLOWER = followed, NON_FOLLOWER = unfollowed or left Instagram)
  const follows=async () => {
    const until=nowSeconds(), since=until-FOLLOWS_WINDOW_SECONDS;
    const base={name:'follows_and_unfollows', breakdown:'follow_type', period:'day', since, until};
    try {
      const data=await ctx.b.fetch(`/${userId}/insights`,{metric:'follows_and_unfollows', period:'day', metric_type:'total_value', breakdown:'follow_type', since, until});
      const entry=(Array.isArray(data?.data)?data.data:[]).find(x=>x?.name==='follows_and_unfollows');
      const results=demographicResults(entry, 'follow_type');
      return results.length?{...base, state:'ok', results}:{...base, state:'unavailable', error_class:'empty-response', results:[]};
    } catch(e) {
      const cls=notSent(e)?e.message:errorClass(e);
      return {...base, state:e instanceof MetaError&&e.metaCode===100?'unavailable':notSent(e)?'not_fetched':'error', error_class:cls, results:[]};
    }
  };
  const metrics=[];
  for (const r of AUDIENCE_READS.slice(0, 4)) metrics.push(await read(r));
  const [rest, followsResult]=await Promise.all([Promise.all(AUDIENCE_READS.slice(4).map(read)), follows()]);
  metrics.push(...rest);
  return json({audience_version:1, fetched_at:new Date().toISOString(), provider:'instagram', api_version:GRAPH_VERSION, metrics, follows:followsResult});
}
async function refresh(env,force=false) {
  const row=await findToken(env);
  if(!row)return {status:'NOT_AUTHORIZED'};
  const t=nowSeconds();
  // Guarded by ciphertext so a concurrent re-authorization is never overwritten.
  const mark=(status,error)=>env.DB.prepare('UPDATE instagram_tokens SET connection_status=?, last_refresh_attempt_at=?, last_refresh_error=?, updated_at=? WHERE account_id=? AND token_ciphertext=?')
    .bind(status,t,error,t,row.account_id,row.token_ciphertext).run();
  if(row.expires_at<=t){await mark('REAUTH_REQUIRED','expired');return {status:'REAUTH_REQUIRED'};}
  if(row.connection_status==='REAUTH_REQUIRED')return {status:'REAUTH_REQUIRED'};
  // Meta refuses refresh for tokens younger than 24 hours. Normally run around day 45.
  if(t-row.issued_at<86400 || (!force && row.expires_at-t>15*86400))return {status:'NOT_DUE'};
  try{
    const old=await openSealed(row,env);
    const u=new URL('/refresh_access_token',GRAPH_HOST);
    u.searchParams.set('grant_type','ig_refresh_token');
    u.searchParams.set('access_token',old);
    const fresh=await getMetaJson(u.href);
    if(typeof fresh.access_token!=='string'||!Number.isFinite(Number(fresh.expires_in))||Number(fresh.expires_in)<MIN_TOKEN_SECONDS)throw Error('invalid-refresh');
    const sealed=await seal(fresh.access_token,env,row.account_id);
    const q=await env.DB.prepare('UPDATE instagram_tokens SET token_iv=?, token_ciphertext=?, issued_at=?, expires_at=?, updated_at=?, connection_status=?, last_refresh_attempt_at=?, last_refresh_error=NULL WHERE account_id=? AND token_ciphertext=?')
      .bind(sealed.iv,sealed.ciphertext,t,t+Number(fresh.expires_in),t,'CONNECTED',t,row.account_id,row.token_ciphertext).run();
    const status=q.meta?.changes===1?'REFRESHED':'CONCURRENT_UPDATE';
    logEvent('token-refresh', {status});
    return {status};
  }catch(e){
    const reason=errorClass(e);
    // OAuthException 190 = token invalid/revoked: only Ana re-authorizing can fix that.
    const reauth=e instanceof MetaError && e.metaCode===190;
    await mark(reauth?'REAUTH_REQUIRED':row.connection_status,reason);
    logEvent('token-refresh', {status:reauth?'REAUTH_REQUIRED':'REFRESH_FAILED', reason});
    return {status:reauth?'REAUTH_REQUIRED':'REFRESH_FAILED',reason};
  }
}
async function route(req,env,url) {
  if(req.method==='POST' && url.pathname==='/admin/invitations'){
    if(!(await authorizeAdmin(req,env)))return json({error:'unauthorized'},401);
    return createInvite(env);
  }
  if(req.method==='GET' && url.pathname==='/admin/status'){
    if(!(await authorizeAdmin(req,env)))return json({error:'unauthorized'},401);
    return readStatus(env);
  }
  if(req.method==='POST' && url.pathname==='/admin/refresh'){
    if(!(await authorizeAdmin(req,env)))return json({error:'unauthorized'},401);
    return json(await refresh(env,true));
  }
  if(req.method==='GET' && url.pathname==='/admin/probe'){
    if(!(await authorizeAdmin(req,env)))return json({error:'unauthorized'},401);
    return mediaProbe(env);
  }
  if(req.method==='GET' && url.pathname==='/admin/insights-probe'){
    if(!(await authorizeAdmin(req,env)))return json({error:'unauthorized'},401);
    return insightsProbe(env);
  }
  if(req.method==='GET' && url.pathname==='/internal/media')return readMedia(req,env,url);
  if(req.method==='GET' && url.pathname==='/internal/social-snapshot')return readSocialSnapshot(req,env,url);
  if(req.method==='GET' && url.pathname==='/internal/media-history')return readMediaHistory(req,env,url);
  if(req.method==='GET' && url.pathname==='/internal/media-insights')return readMediaInsights(req,env,url);
  if(req.method==='GET' && url.pathname==='/internal/social-pulse')return readSocialPulse(req,env,url);
  if(req.method==='GET' && url.pathname==='/internal/social-audience')return readSocialAudience(req,env);
  if(req.method==='GET' && url.pathname==='/instagram/start')return startPage(req,env,url);
  if(req.method==='POST' && url.pathname==='/instagram/start')return startLogin(req,env);
  if(req.method==='GET' && url.pathname===CALLBACK_PATH)return callback(req,env,url);
  return json({error:'not-found'},404);
}
export default {
  async fetch(req,env) {
    const url=new URL(req.url);
    if(req.method==='GET' && url.pathname==='/healthz')return json({ok:true,service:'ana-instagram-oauth'});
    if(!configured(env))return json({error:'service-not-configured'},503);
    try {
      // `return await` so rejections from async handlers land in this catch.
      return await route(req,env,url);
    } catch (e) {
      // Never log request.url; callback URLs contain authorization codes.
      logEvent('unhandled-error', {path:url.pathname, reason:errorClass(e)});
      return json({error:'internal-error'},500);
    }
  },
  async scheduled(event,env,ctx) {
    if(!configured(env)){logEvent('cron-skipped', {reason:'service-not-configured'});return;}
    ctx.waitUntil((async () => {
      try { await refresh(env); } catch (e) { logEvent('cron-refresh-error', {reason:errorClass(e)}); }
      try {
        // Retain expired hashes briefly for diagnostics, then remove in FK-safe order.
        const cutoff = nowSeconds() - 86400;
        await env.DB.prepare('DELETE FROM oauth_attempts WHERE expires_at < ?').bind(cutoff).run();
        await env.DB.prepare('DELETE FROM oauth_invites WHERE expires_at < ? AND NOT EXISTS (SELECT 1 FROM oauth_attempts a WHERE a.invite_hash = oauth_invites.invite_hash)').bind(cutoff).run();
      } catch (e) { logEvent('cron-cleanup-error', {reason:errorClass(e)}); }
    })());
  }
};
export const testing={EXTRA_METRICS,randomUrlSafe,digest,constantTimeEquals,seal,openSealed,metaOAuthURL,configured,refresh,unwrapSingle,parsePermissions,MAX_ATTEMPTS_PER_INVITE};
