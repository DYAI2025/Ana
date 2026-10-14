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
  return ['bad-short-token','bad-long-token','bad-identity','wrong-account','invalid-refresh','invalid-key-size'].includes(e?.message) ? e.message : (e?.name || 'error');
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
  u.searchParams.set('force_reauth', 'true');
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
    // Token row and invitation consumption commit together: the invite is spent only on success.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO instagram_tokens (account_id,username,token_iv,token_ciphertext,granted_permissions,issued_at,expires_at,updated_at,connection_status)
       VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET username=excluded.username,token_iv=excluded.token_iv,token_ciphertext=excluded.token_ciphertext,granted_permissions=excluded.granted_permissions,issued_at=excluded.issued_at,expires_at=excluded.expires_at,updated_at=excluded.updated_at,connection_status='CONNECTED',last_refresh_error=NULL`)
        .bind(account.user_id,account.username,token.iv,token.ciphertext,JSON.stringify(exchanged.permissions),t,t+exchanged.expiresIn,t,'CONNECTED'),
      env.DB.prepare('UPDATE oauth_invites SET used_at=? WHERE invite_hash=? AND used_at IS NULL').bind(t,attempt.invite_hash),
      env.DB.prepare('UPDATE oauth_attempts SET consumed_at=? WHERE invite_hash=? AND consumed_at IS NULL').bind(t,attempt.invite_hash)
    ]);
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
export const testing={randomUrlSafe,digest,constantTimeEquals,seal,openSealed,metaOAuthURL,configured,refresh,unwrapSingle,parsePermissions,MAX_ATTEMPTS_PER_INVITE};
