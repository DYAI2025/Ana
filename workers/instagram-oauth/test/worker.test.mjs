// All identifiers below are synthetic. Meta is mocked: these tests prove worker logic only,
// never a working Meta connection (see README "Tests / known limitations").
import assert from 'node:assert/strict';
import {test, beforeEach, afterEach, after} from 'node:test';
import worker, {testing} from '../src/index.mjs';
import {createD1, rows} from './d1-sqlite.mjs';

const origin = 'https://login.dyai.cloud';
const IG_USER_ID = '17841400000000001';   // professional account ID (> 2^53, string only)
const APP_SCOPED_ID = '27000000000000002'; // /me `id` — must NOT be used as identity
const APP_SECRET = 'synthetic-app-secret-not-real';
const ADMIN_KEY = 'synthetic-admin-key-0123456789abcdef';
const INTERNAL_KEY = 'synthetic-internal-key-0123456789abcdef';
const SHORT_TOKEN = 'SHORT_TOKEN_ONLY_FOR_TEST';
const LONG_TOKEN = 'LONG_TOKEN_NEVER_EXPOSE';
const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);

function mockEnv(overrides = {}) {
  return {
    DB: createD1(), PUBLIC_ORIGIN: origin,
    INSTAGRAM_APP_ID: '1000000000000001',
    INSTAGRAM_APP_SECRET: APP_SECRET,
    EXPECTED_IG_USER_ID: IG_USER_ID,
    EXPECTED_IG_USERNAME: 'anasavu',
    AES_GCM_KEY_BASE64: btoa(String.fromCharCode(...Uint8Array.from({length: 32}, (_, i) => i))),
    ADMIN_API_KEY: ADMIN_KEY,
    INTERNAL_READ_KEY: INTERNAL_KEY,
    ...overrides
  };
}
const adminReq = (path, method = 'GET', key = ADMIN_KEY) =>
  new Request(origin + path, {method, headers: {Authorization: `Bearer ${key}`}});

// ---- log capture: every console line of the whole suite is checked (after()) against every
// secret, code, state, invite and cookie nonce the suite ever produced ----
const logs = [];
const CONSOLE = ['log', 'error', 'warn', 'info', 'debug'];
const oldConsole = Object.fromEntries(CONSOLE.map(k => [k, console[k]]));
const oldFetch = globalThis.fetch;
const sensitive = new Set([APP_SECRET, ADMIN_KEY, INTERNAL_KEY, SHORT_TOKEN, LONG_TOKEN, 'ROTATED_TOKEN', 'OLD_TOKEN', 'test-code']);
const track = v => { if (v && v.length >= 8) sensitive.add(v); return v; };
let codeCounter = 0;
const uniqueCode = () => track(`synthetic-oauth-code-${++codeCounter}-${'q'.repeat(8)}`);
beforeEach(() => { for (const k of CONSOLE) console[k] = (...a) => logs.push(a.map(String).join(' ')); });
afterEach(() => { for (const k of CONSOLE) console[k] = oldConsole[k]; globalThis.fetch = oldFetch; });
after(() => {
  assert.ok(logs.length > 0, 'log capture is live');
  const all = logs.join('\n');
  for (const s of sensitive) assert.ok(!all.includes(s), 'log leak: ' + s.slice(0, 12) + '…');
  assert.ok(!all.includes('/instagram/callback?') && !all.includes('access_token='), 'no URLs in logs');
});

// ---- Meta mock: documented response shapes, records every outbound call ----
function installMeta(overrides = {}) {
  const calls = [];
  const routes = {
    exchange: () => Response.json({data: [{access_token: SHORT_TOKEN, user_id: APP_SCOPED_ID, permissions: 'instagram_business_basic,instagram_business_manage_insights'}]}),
    long: () => Response.json({access_token: LONG_TOKEN, token_type: 'bearer', expires_in: 5183944}),
    me: () => Response.json({user_id: IG_USER_ID, id: APP_SCOPED_ID, username: 'anasavu', media_count: 5}),
    media: () => Response.json({data: [{id: 'media1', caption: 'synthetic'}]}),
    insights: () => Response.json({data: [{name: 'reach', period: 'day', total_value: {value: 42}}]}),
    refresh: () => Response.json({access_token: 'ROTATED_TOKEN', token_type: 'bearer', expires_in: 5184000}),
    mediaInsights: u => Response.json({data: u.searchParams.get('metric').split(',').map((name, i) => ({name, period: 'lifetime', values: [{value: 10 + i}]}))}),
    ...overrides
  };
  globalThis.fetch = async (input, opts = {}) => {
    const u = new URL(String(input));
    calls.push({url: u, opts});
    const key =
      u.href.startsWith('https://api.instagram.com/oauth/access_token') ? 'exchange' :
      u.origin === 'https://graph.instagram.com' && u.pathname === '/access_token' ? 'long' :
      u.origin === 'https://graph.instagram.com' && u.pathname === '/refresh_access_token' ? 'refresh' :
      u.origin === 'https://graph.instagram.com' && u.pathname === '/v26.0/me' ? 'me' :
      u.origin === 'https://graph.instagram.com' && u.pathname === '/v26.0/me/media' ? 'media' :
      u.origin === 'https://graph.instagram.com' && u.pathname === `/v26.0/${IG_USER_ID}/insights` ? 'insights' :
      u.origin === 'https://graph.instagram.com' && /^\/v26\.0\/[A-Za-z0-9_]+\/insights$/.test(u.pathname) ? 'mediaInsights' : null;
    if (!key) throw Error('unexpected upstream ' + u.origin + u.pathname);
    return routes[key](u, opts);
  };
  return calls;
}
const metaError = (code, status = 400) => () => Response.json({error: {message: 'synthetic', type: 'OAuthException', code}}, {status});

// ---- flow helpers ----
async function createInvite(env) {
  const r = await worker.fetch(adminReq('/admin/invitations', 'POST'), env);
  assert.equal(r.status, 200);
  const body = await r.json();
  return {...body, invite: track(new URL(body.url).searchParams.get('invite'))};
}
function postStart(invite, headers = {Origin: origin}) {
  return new Request(origin + '/instagram/start', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded', ...headers}, body: new URLSearchParams({invite})});
}
async function startAttempt(env, invite) {
  const r = await worker.fetch(postStart(invite), env);
  assert.equal(r.status, 200);
  const page = await r.text();
  const href = page.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&');
  const oauthUrl = new URL(href);
  const cookie = r.headers.get('Set-Cookie').split(';')[0];
  track(cookie.split('=')[1]);
  return {oauthUrl, state: track(oauthUrl.searchParams.get('state')), setCookie: r.headers.get('Set-Cookie'), cookie};
}
async function prepareAttempt(env) {
  const inv = await createInvite(env);
  const landing = await worker.fetch(new Request(inv.url), env);
  assert.equal(landing.status, 200);
  return {...inv, ...(await startAttempt(env, inv.invite))};
}
const callbackReq = (qs, cookie) => {
  const p = new URLSearchParams(qs);
  track(p.get('code')); track(p.get('state'));
  return new Request(origin + '/instagram/callback?' + qs, {headers: cookie ? {Cookie: cookie} : {}});
};
async function connect(env) {
  const a = await prepareAttempt(env);
  installMeta();
  const r = await worker.fetch(callbackReq(`state=${a.state}&code=test-code%23_`, a.cookie), env);
  assert.equal(r.status, 200);
  return a;
}
async function seedToken(env, {issuedAgo = 46 * DAY, expiresIn = 14 * DAY, token = 'OLD_TOKEN', status = 'CONNECTED'} = {}) {
  const t = now();
  const sealed = await testing.seal(token, env, IG_USER_ID);
  await env.DB.prepare('INSERT INTO instagram_tokens (account_id,username,token_iv,token_ciphertext,granted_permissions,issued_at,expires_at,updated_at,connection_status) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(IG_USER_ID, 'anasavu', sealed.iv, sealed.ciphertext, '[]', t - issuedAgo, t + expiresIn, t - issuedAgo, status).run();
}
const tokenRow = env => rows(env.DB, 'instagram_tokens')[0];

// =================== configuration ===================
test('configured() fails closed on every missing or weak setting', () => {
  const env = mockEnv();
  assert.equal(testing.configured(env), true);
  for (const k of ['DB', 'PUBLIC_ORIGIN', 'INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET', 'EXPECTED_IG_USER_ID', 'EXPECTED_IG_USERNAME', 'AES_GCM_KEY_BASE64', 'ADMIN_API_KEY', 'INTERNAL_READ_KEY'])
    assert.equal(testing.configured({...env, [k]: undefined}), false, k);
  assert.equal(testing.configured({...env, PUBLIC_ORIGIN: 'http://login.dyai.cloud'}), false);
  assert.equal(testing.configured({...env, PUBLIC_ORIGIN: origin + '/'}), false);
  assert.equal(testing.configured({...env, ADMIN_API_KEY: 'short'}), false);
  assert.equal(testing.configured({...env, INTERNAL_READ_KEY: ADMIN_KEY}), false, 'admin and internal keys must differ');
  assert.equal(testing.configured({...env, AES_GCM_KEY_BASE64: btoa('x'.repeat(16))}), false, '16-byte key');
  assert.equal(testing.configured({...env, AES_GCM_KEY_BASE64: '!!!not-base64!!!'}), false);
  assert.equal(testing.configured({...env, EXPECTED_IG_USER_ID: '1784e10'}), false);
  assert.equal(testing.configured({...env, EXPECTED_IG_USERNAME: 'ana savu'}), false);
});

test('standard base64 AES key (with + and /) and surrounding whitespace are accepted', () => {
  const bytes = Uint8Array.from({length: 32}, (_, i) => 250 - i); // produces + and / in standard base64
  const std = btoa(String.fromCharCode(...bytes));
  assert.match(std, /[+/]/);
  assert.equal(testing.configured(mockEnv({AES_GCM_KEY_BASE64: std + '\n'})), true);
});

test('authorize URL: documented host, exact redirect, exactly two read-only scopes, no forced re-login', () => {
  const u = new URL(testing.metaOAuthURL(mockEnv(), 'abc123'));
  assert.equal(u.origin + u.pathname, 'https://www.instagram.com/oauth/authorize');
  assert.equal(u.searchParams.get('client_id'), '1000000000000001');
  assert.equal(u.searchParams.get('redirect_uri'), origin + '/instagram/callback');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('state'), 'abc123');
  assert.deepEqual(u.searchParams.get('scope').split(','), ['instagram_business_basic', 'instagram_business_manage_insights']);
  // force_reauth=true made Instagram demand a fresh login (and its SMS/backup-code security check) on every
  // attempt; an existing instagram.com session may be reused. Identity is still enforced by the callback.
  assert.equal(u.searchParams.has('force_reauth'), false);
  assert.deepEqual([...u.searchParams.keys()].sort(), ['client_id', 'redirect_uri', 'response_type', 'scope', 'state']);
});

test('reused Instagram session of another account is still rejected (no forced re-login does not weaken identity)', async () => {
  const env = mockEnv();
  const a = await prepareAttempt(env);
  installMeta({me: () => Response.json({user_id: '17841400000000999', id: APP_SCOPED_ID, username: 'someone_else'})});
  const r = await worker.fetch(callbackReq(`state=${a.state}&code=${uniqueCode()}`, a.cookie), env);
  assert.equal(r.status, 422);
  assert.match(await r.text(), /nicht das freigegebene Instagram-Konto/);
  assert.equal(rows(env.DB, 'instagram_tokens').length, 0);
});

// =================== crypto ===================
test('AES-GCM: random nonce, authenticated, bound to account id', async () => {
  const env = mockEnv();
  const a = await testing.seal('sensitive-token', env, IG_USER_ID), b = await testing.seal('sensitive-token', env, IG_USER_ID);
  assert.notEqual(a.ciphertext, b.ciphertext);
  assert.equal(await testing.openSealed({account_id: IG_USER_ID, token_iv: a.iv, token_ciphertext: a.ciphertext}, env), 'sensitive-token');
  await assert.rejects(testing.openSealed({account_id: IG_USER_ID, token_iv: b.iv, token_ciphertext: a.ciphertext}, env));
  await assert.rejects(testing.openSealed({account_id: '17841400000000999', token_iv: a.iv, token_ciphertext: a.ciphertext}, env), 'ciphertext moved to another row must not decrypt');
});

// =================== routing & auth ===================
test('health is public; everything else is 503 until configured; unknown routes 404', async () => {
  const h = await worker.fetch(new Request(origin + '/healthz'), {});
  assert.equal(h.status, 200);
  assert.deepEqual(await h.json(), {ok: true, service: 'ana-instagram-oauth'});
  for (const [p, m] of [['/admin/status', 'GET'], ['/instagram/start', 'GET'], ['/instagram/callback', 'GET'], ['/internal/media', 'GET']])
    assert.equal((await worker.fetch(new Request(origin + p, {method: m}), {})).status, 503, p);
  assert.equal((await worker.fetch(new Request(origin + '/nope'), mockEnv())).status, 404);
  assert.equal((await worker.fetch(new Request(origin + '/admin/status', {method: 'DELETE'}), mockEnv())).status, 404);
});

test('admin endpoints reject missing, wrong, non-Bearer and internal-read credentials', async () => {
  const env = mockEnv();
  const admin = [['/admin/invitations', 'POST'], ['/admin/status', 'GET'], ['/admin/refresh', 'POST'], ['/admin/probe', 'GET'], ['/admin/insights-probe', 'GET']];
  for (const [p, m] of admin) {
    assert.equal((await worker.fetch(new Request(origin + p, {method: m}), env)).status, 401, p + ' none');
    assert.equal((await worker.fetch(adminReq(p, m, 'wrong'), env)).status, 401, p + ' wrong');
    assert.equal((await worker.fetch(adminReq(p, m, INTERNAL_KEY), env)).status, 401, p + ' internal key');
    assert.equal((await worker.fetch(new Request(origin + p, {method: m, headers: {Authorization: `Basic ${ADMIN_KEY}`}}), env)).status, 401, p + ' basic');
  }
  assert.equal(rows(env.DB, 'oauth_invites').length, 0, 'no invite created by unauthorized calls');
  assert.equal((await worker.fetch(new Request(origin + '/internal/media', {headers: {Authorization: `Bearer ${ADMIN_KEY}`}}), env)).status, 401, 'admin key is not a read key');
});

// =================== start page / browser-policy regressions ===================
test('start page lets browsers send a real Origin on the form POST (Referrer-Policy is not no-referrer)', async () => {
  const env = mockEnv();
  const inv = await createInvite(env);
  const r = await worker.fetch(new Request(inv.url), env);
  assert.equal(r.status, 200);
  // With `no-referrer`, the Fetch spec serializes the POST's Origin as "null" and the origin check fails.
  assert.equal(r.headers.get('Referrer-Policy'), 'same-origin');
  assert.match(r.headers.get('Content-Security-Policy'), /form-action 'self'/);
  assert.match(await r.text(), /action="\/instagram\/start" method="post"/);
});

test('POST /instagram/start is not a cross-origin redirect (CSP form-action would block it)', async () => {
  const env = mockEnv();
  const inv = await createInvite(env);
  const r = await worker.fetch(postStart(inv.invite), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Location'), null);
  const page = await r.text();
  const href = new URL(page.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&'));
  assert.equal(href.origin, 'https://www.instagram.com');
  assert.ok(href.searchParams.get('state'));
  const cookie = r.headers.get('Set-Cookie');
  assert.match(cookie, /^__Secure-ana_ig_oauth=[A-Za-z0-9_-]{43};/);
  for (const attr of ['Path=/instagram/callback', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=600']) assert.ok(cookie.includes(attr), attr);
});

test('POST /instagram/start rejects missing, null and foreign Origin, oversized and malformed bodies', async () => {
  const env = mockEnv();
  const inv = await createInvite(env);
  for (const headers of [{}, {Origin: 'null'}, {Origin: 'https://evil.example'}, {Origin: 'https://ana-instagram-oauth.example.workers.dev'}])
    assert.equal((await worker.fetch(postStart(inv.invite, headers), env)).status, 403, JSON.stringify(headers));
  const big = new Request(origin + '/instagram/start', {method: 'POST', headers: {Origin: origin}, body: 'invite=' + 'a'.repeat(3000)});
  assert.equal((await worker.fetch(big, env)).status, 400);
  assert.equal((await worker.fetch(postStart('short'), env)).status, 400);
  assert.equal(rows(env.DB, 'oauth_invites')[0].attempt_count, 0, 'rejected requests do not spend attempts');
});

test('invalid, unknown and expired invitations are refused on GET and POST', async () => {
  const env = mockEnv();
  assert.equal((await worker.fetch(new Request(origin + '/instagram/start?invite=bad'), env)).status, 400);
  assert.equal((await worker.fetch(new Request(origin + '/instagram/start?invite=' + 'A'.repeat(43)), env)).status, 410);
  assert.equal((await worker.fetch(postStart('A'.repeat(43)), env)).status, 410);
  const inv = await createInvite(env);
  env.DB.sqlite.prepare('UPDATE oauth_invites SET expires_at=?').run(now() - 1);
  assert.equal((await worker.fetch(new Request(inv.url), env)).status, 410);
  assert.equal((await worker.fetch(postStart(inv.invite), env)).status, 410);
});

test('an invitation allows a bounded number of attempts', async () => {
  const env = mockEnv();
  const inv = await createInvite(env);
  for (let i = 0; i < testing.MAX_ATTEMPTS_PER_INVITE; i++) assert.equal((await worker.fetch(postStart(inv.invite), env)).status, 200);
  assert.equal((await worker.fetch(postStart(inv.invite), env)).status, 410);
  assert.equal((await worker.fetch(new Request(inv.url), env)).status, 410);
});

// =================== callback ===================
test('callback rejects missing state, missing cookie, missing code and oversized code', async () => {
  const env = mockEnv();
  const a = await prepareAttempt(env);
  installMeta();
  assert.equal((await worker.fetch(callbackReq('code='+uniqueCode(), a.cookie), env)).status, 400);
  assert.equal((await worker.fetch(callbackReq(`state=${a.state}&code=${uniqueCode()}`), env)).status, 400);
  assert.equal((await worker.fetch(callbackReq(`state=${a.state}`, a.cookie), env)).status, 400);
  assert.equal((await worker.fetch(callbackReq(`state=${a.state}&code=${'c'.repeat(2001)}`, a.cookie), env)).status, 400);
  assert.equal(rows(env.DB, 'oauth_attempts')[0].consumed_at, null, 'malformed callbacks do not burn the attempt');
});

test('callback state is bound to the browser cookie that started it', async () => {
  const env = mockEnv();
  const victim = await prepareAttempt(env);
  const attacker = await prepareAttempt(env);
  const calls = installMeta();
  const r = await worker.fetch(callbackReq(`state=${victim.state}&code=${uniqueCode()}`, attacker.cookie), env);
  assert.equal(r.status, 410);
  assert.equal(calls.length, 0, 'no code exchange without matching cookie');
  assert.ok(rows(env.DB, 'oauth_attempts').every(x => x.consumed_at === null));
});

test('expired attempt is refused before any Meta call', async () => {
  const env = mockEnv();
  const a = await prepareAttempt(env);
  env.DB.sqlite.prepare('UPDATE oauth_attempts SET expires_at=?').run(now() - 1);
  const calls = installMeta();
  const r = await worker.fetch(callbackReq(`state=${a.state}&code=${uniqueCode()}`, a.cookie), env);
  assert.equal(r.status, 410);
  assert.match(await r.text(), /Freigabe abgelaufen/, 'rejected by the attempt match, not by the later consume guard');
  assert.equal(calls.length, 0);
});

test('forged callback links (?code= with bad or missing state) never clear the real attempt\'s cookie', async () => {
  const env = mockEnv();
  const a = await prepareAttempt(env);
  const calls = installMeta();
  for (const qs of [`code=${uniqueCode()}`, `code=${uniqueCode()}&state=${'B'.repeat(43)}`]) {
    const r = await worker.fetch(callbackReq(qs, a.cookie), env);
    assert.ok([400, 410].includes(r.status), qs);
    assert.equal(r.headers.get('Set-Cookie'), null, qs);
  }
  assert.equal(calls.length, 0);
  assert.equal((await worker.fetch(callbackReq(`state=${a.state}&code=${uniqueCode()}`, a.cookie), env)).status, 200, 'real attempt still completes');
});

test('after one attempt succeeds, the invitation\'s other open attempts are dead', async () => {
  const env = mockEnv();
  const inv = await createInvite(env);
  const first = await startAttempt(env, inv.invite);
  const second = await startAttempt(env, inv.invite); // e.g. a second browser/device
  installMeta();
  assert.equal((await worker.fetch(callbackReq(`state=${first.state}&code=${uniqueCode()}`, first.cookie), env)).status, 200);
  const sealedBefore = tokenRow(env).token_ciphertext;
  const calls = installMeta();
  const r = await worker.fetch(callbackReq(`state=${second.state}&code=${uniqueCode()}`, second.cookie), env);
  assert.equal(r.status, 410);
  assert.equal(calls.length, 0, 'no second code exchange');
  assert.equal(tokenRow(env).token_ciphertext, sealedBefore, 'stored token not overwritten');
  assert.ok(rows(env.DB, 'oauth_attempts').every(x => x.consumed_at !== null));
});

test('concurrent callbacks of one invitation: only the callback that claims the invitation succeeds or stores a token', async () => {
  const env = mockEnv();
  const inv = await createInvite(env);
  const first = await startAttempt(env, inv.invite);
  const second = await startAttempt(env, inv.invite);
  // Both callbacks pass matchAttempt/consumeAttempt before either commits: hold every code exchange until both arrived.
  let release;
  const bothArrived = new Promise(r => { release = r; });
  let arrived = 0;
  let longTokens = 0;
  installMeta({
    exchange: async () => { if (++arrived === 2) release(); await bothArrived; return Response.json({data: [{access_token: SHORT_TOKEN, user_id: APP_SCOPED_ID, permissions: 'instagram_business_basic,instagram_business_manage_insights'}]}); },
    long: () => Response.json({access_token: track(`RACE_TOKEN_${++longTokens}_${'z'.repeat(8)}`), token_type: 'bearer', expires_in: 5183944})
  });
  const results = await Promise.all([first, second].map(a => worker.fetch(callbackReq(`state=${a.state}&code=${uniqueCode()}`, a.cookie), env)));
  const statuses = results.map(r => r.status).sort();
  assert.deepEqual(statuses, [200, 410], 'exactly one callback reports success');
  const loser = results.find(r => r.status === 410);
  assert.match(await loser.text(), /Bereits verwendet/);
  assert.equal(rows(env.DB, 'instagram_tokens').length, 1);
  const stored = await testing.openSealed(tokenRow(env), env);
  const winnerIndex = results.findIndex(r => r.status === 200);
  assert.equal(stored, `RACE_TOKEN_${winnerIndex + 1}_${'z'.repeat(8)}`, 'stored token is the winner\'s, not overwritten by the loser');
  assert.equal(rows(env.DB, 'oauth_invites').filter(i => i.used_at !== null).length, 1);
});

test('an open attempt of an already spent invitation is refused even if it was never marked consumed', async () => {
  const env = mockEnv();
  const a = await prepareAttempt(env);
  env.DB.sqlite.prepare('UPDATE oauth_invites SET used_at=?').run(now()); // defense in depth: invite check alone
  const calls = installMeta();
  assert.equal((await worker.fetch(callbackReq(`state=${a.state}&code=${uniqueCode()}`, a.cookie), env)).status, 410);
  assert.equal(calls.length, 0);
});

test('forged ?error= cannot cancel or clear another browser\'s attempt; a genuine denial consumes only that attempt', async () => {
  const env = mockEnv();
  const a = await prepareAttempt(env);
  const forged = await worker.fetch(callbackReq(`error=access_denied&state=${a.state}`), env);
  assert.equal(forged.status, 400);
  assert.equal(forged.headers.get('Set-Cookie'), null, 'forged denial must not clear the cookie');
  assert.equal(rows(env.DB, 'oauth_attempts')[0].consumed_at, null);
  const real = await worker.fetch(callbackReq(`error=access_denied&error_reason=user_denied&state=${a.state}`, a.cookie), env);
  assert.equal(real.status, 400);
  assert.match(real.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.notEqual(rows(env.DB, 'oauth_attempts')[0].consumed_at, null);
  assert.equal(rows(env.DB, 'oauth_invites')[0].used_at, null, 'denial does not spend the invitation');
  assert.equal((await worker.fetch(postStart(a.invite), env)).status, 200, 'Ana can retry with the same link');
});

test('successful OAuth stores only ciphertext, keyed by the professional account ID, and spends the invite', async () => {
  const env = mockEnv();
  const a = await prepareAttempt(env);
  const calls = installMeta();
  const r = await worker.fetch(callbackReq(`state=${a.state}&code=test-code%23_`, a.cookie), env);
  assert.equal(r.status, 200);
  const page = await r.text();
  assert.match(page, /erfolgreich verbunden/);
  for (const s of [LONG_TOKEN, SHORT_TOKEN, 'test-code']) assert.ok(!page.includes(s), s);
  assert.match(r.headers.get('Set-Cookie'), /Max-Age=0/);
  const row = tokenRow(env);
  assert.equal(row.account_id, IG_USER_ID, 'identity is /me user_id, not the app-scoped id');
  assert.equal(row.username, 'anasavu');
  assert.deepEqual(JSON.parse(row.granted_permissions), ['instagram_business_basic', 'instagram_business_manage_insights'], 'comma-separated permissions are parsed');
  const dump = JSON.stringify(rows(env.DB, 'instagram_tokens')) + JSON.stringify(rows(env.DB, 'oauth_attempts')) + JSON.stringify(rows(env.DB, 'oauth_invites'));
  for (const s of [LONG_TOKEN, SHORT_TOKEN, a.state, a.invite, 'test-code']) assert.ok(!dump.includes(s), 'D1 holds no plaintext ' + s);
  assert.notEqual(rows(env.DB, 'oauth_invites')[0].used_at, null);
  // exchange: code `#_` suffix stripped, secret only in POST body to api.instagram.com
  const ex = calls.find(c => c.url.hostname === 'api.instagram.com');
  assert.equal(new URLSearchParams(ex.opts.body).get('code'), 'test-code');
  assert.equal(new URLSearchParams(ex.opts.body).get('redirect_uri'), origin + '/instagram/callback');
  assert.equal(ex.opts.method, 'POST');
  assert.equal(ex.url.search, '', 'nothing in the exchange URL');
  const form = new URLSearchParams(ex.opts.body);
  assert.equal(form.get('grant_type'), 'authorization_code');
  assert.equal(form.get('client_id'), '1000000000000001');
  assert.equal(form.get('client_secret'), APP_SECRET);
  const lg = calls.find(c => c.url.pathname === '/access_token');
  assert.equal(lg.url.searchParams.get('grant_type'), 'ig_exchange_token');
  assert.equal(lg.url.searchParams.get('access_token'), SHORT_TOKEN);
  assert.equal(lg.url.searchParams.get('client_secret'), APP_SECRET);
  const me = calls.find(c => c.url.pathname === '/v26.0/me');
  assert.deepEqual(me.url.searchParams.get('fields').split(','), ['user_id', 'username']);
  assert.ok(calls.filter(c => c.url.searchParams.has('client_secret') || String(c.opts.body ?? '').includes(APP_SECRET)).every(c => c.url.pathname === '/access_token' || c.url.pathname === '/oauth/access_token'), 'App Secret only on the two exchange calls');
  // graph calls use the documented access_token query parameter, no Authorization header
  for (const c of calls.filter(c => c.url.pathname.startsWith('/v26.0/'))) {
    assert.equal(c.url.searchParams.get('access_token'), LONG_TOKEN);
    assert.equal(c.opts.headers, undefined);
  }
  assert.ok(calls.every(c => ['api.instagram.com', 'graph.instagram.com'].includes(c.url.hostname)), 'secrets only go to Instagram hosts');
  // replay of the same callback and reuse of the spent invite
  assert.equal((await worker.fetch(callbackReq(`state=${a.state}&code=test-code`, a.cookie), env)).status, 410);
  assert.equal((await worker.fetch(postStart(a.invite), env)).status, 410);
  assert.equal((await worker.fetch(new Request(a.url), env)).status, 410);
});

test('top-level (unwrapped) code-exchange response is accepted too', async () => {
  const env = mockEnv();
  const a = await prepareAttempt(env);
  installMeta({exchange: () => Response.json({access_token: SHORT_TOKEN, user_id: APP_SCOPED_ID, permissions: ['instagram_business_basic']})});
  assert.equal((await worker.fetch(callbackReq(`state=${a.state}&code=${uniqueCode()}`, a.cookie), env)).status, 200);
  assert.deepEqual(JSON.parse(tokenRow(env).granted_permissions), ['instagram_business_basic']);
});

test('wrong account, wrong username, numeric or missing user_id: fail closed, nothing stored, invite retryable', async () => {
  const cases = {
    'other account': [() => Response.json({user_id: '17841400000000999', id: APP_SCOPED_ID, username: 'anasavu'}), 'wrong-account'],
    'other username': [() => Response.json({user_id: IG_USER_ID, id: APP_SCOPED_ID, username: 'attacker'}), 'wrong-account'],
    'app-scoped id only': [() => Response.json({id: IG_USER_ID, username: 'anasavu'}), 'bad-identity'],
    // safe-integer value: would match after String(), so only the string-type check can reject it
    'numeric user_id': [() => new Response('{"user_id":17841400000001,"username":"anasavu"}', {headers: {'Content-Type': 'application/json'}}), 'bad-identity', '17841400000001']
  };
  for (const [name, [me, reason, expectedId]] of Object.entries(cases)) {
    const env = mockEnv(expectedId ? {EXPECTED_IG_USER_ID: expectedId} : {});
    const before = logs.length;
    const a = await prepareAttempt(env);
    installMeta({me});
    const r = await worker.fetch(callbackReq(`state=${a.state}&code=${uniqueCode()}`, a.cookie), env);
    assert.equal(r.status, 422, name);
    assert.ok(logs.slice(before).some(l => l.includes('"oauth-failed"') && l.includes(`"reason":"${reason}"`)), `${name}: rejected as ${reason}`);
    const page = await r.text();
    assert.ok(!page.includes(LONG_TOKEN), name);
    assert.equal(rows(env.DB, 'instagram_tokens').length, 0, name);
    assert.equal(rows(env.DB, 'oauth_invites')[0].used_at, null, name);
  }
});

test('Meta failures during exchange fail closed without storing anything', async () => {
  const cases = {
    'code rejected': {exchange: metaError(100)},
    'non-JSON': {exchange: () => new Response('<html>', {status: 502})},
    'network/timeout': {exchange: () => { throw new DOMException('timeout', 'TimeoutError'); }},
    'long-lived rejected': {long: metaError(190)},
    'short lifetime': {long: () => Response.json({access_token: LONG_TOKEN, expires_in: 3600})},
    'no access_token': {exchange: () => Response.json({data: [{user_id: APP_SCOPED_ID}]})}
  };
  for (const [name, o] of Object.entries(cases)) {
    const env = mockEnv();
    const a = await prepareAttempt(env);
    installMeta(o);
    const r = await worker.fetch(callbackReq(`state=${a.state}&code=${uniqueCode()}`, a.cookie), env);
    assert.equal(r.status, 422, name);
    assert.equal(rows(env.DB, 'instagram_tokens').length, 0, name);
  }
});

// =================== admin status / probes / internal read ===================
test('status reflects NOT_AUTHORIZED, CONNECTED and expiry', async () => {
  const env = mockEnv();
  assert.equal((await (await worker.fetch(adminReq('/admin/status'), env)).json()).status, 'NOT_AUTHORIZED');
  await connect(env);
  const s = await (await worker.fetch(adminReq('/admin/status'), env)).json();
  assert.equal(s.status, 'CONNECTED');
  assert.equal(s.connected, true);
  assert.equal(s.username, 'anasavu');
  assert.ok(!JSON.stringify(s).includes(LONG_TOKEN));
  env.DB.sqlite.prepare('UPDATE instagram_tokens SET expires_at=?').run(now() - 1);
  const e = await (await worker.fetch(adminReq('/admin/status'), env)).json();
  assert.equal(e.status, 'REAUTH_REQUIRED');
  assert.equal(e.connected, false);
});

test('media probe: caption accepted, caption rejected falls back, no token -> 409, Meta failure -> 502 without leaks', async () => {
  const env = mockEnv();
  assert.equal((await worker.fetch(adminReq('/admin/probe'), env)).status, 409);
  await connect(env);
  const ok = await (await worker.fetch(adminReq('/admin/probe'), env)).json();
  assert.equal(ok.connected, true);
  assert.equal(ok.caption_field, 'ACCEPTED');
  assert.equal(ok.caption_value_observed, true);
  assert.match(ok.insights, /^NOT_TESTED/);
  installMeta({media: (u) => u.searchParams.get('fields').includes('caption') ? metaError(100)() : Response.json({data: [{id: 'm1'}]})});
  const fb = await (await worker.fetch(adminReq('/admin/probe'), env)).json();
  assert.equal(fb.caption_field, 'REJECTED_BY_META');
  assert.equal(fb.caption_error, 'meta-100');
  assert.equal(fb.sample_received, 1);
  installMeta({me: metaError(190)});
  const bad = await worker.fetch(adminReq('/admin/probe'), env);
  assert.equal(bad.status, 502);
  const body = await bad.text();
  assert.match(body, /meta-190/);
  assert.ok(!body.includes(LONG_TOKEN));
});

test('insights probe: PASS only with real metric data, FAILED otherwise; uses the professional account ID', async () => {
  const env = mockEnv();
  await connect(env);
  const calls = installMeta();
  const ok = await (await worker.fetch(adminReq('/admin/insights-probe'), env)).json();
  assert.deepEqual(ok, {insights: 'PASS', metrics: [{name: 'reach', period: 'day', total_value: 42}]});
  const c = calls.find(x => x.url.pathname.endsWith('/insights'));
  assert.equal(c.url.pathname, `/v26.0/${IG_USER_ID}/insights`);
  assert.equal(c.url.searchParams.get('metric'), 'reach');
  assert.equal(c.url.searchParams.get('access_token'), LONG_TOKEN);
  assert.equal(c.url.searchParams.get('period'), 'day');
  installMeta({insights: metaError(10)});
  const r = await worker.fetch(adminReq('/admin/insights-probe'), env);
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), {insights: 'FAILED', reason: 'meta-10'});
  installMeta({insights: () => Response.json({data: []})});
  assert.equal((await (await worker.fetch(adminReq('/admin/insights-probe'), env)).json()).insights, 'FAILED');
});

test('internal media read: separate key, limit validation, reauth state', async () => {
  const env = mockEnv();
  const read = (q, key = INTERNAL_KEY) => worker.fetch(new Request(origin + '/internal/media' + q, {headers: {Authorization: `Bearer ${key}`}}), env);
  assert.equal((await read('')).status, 409);
  await connect(env);
  for (const q of ['?limit=0', '?limit=26', '?limit=abc', '?limit=100', '?limit=-1']) assert.equal((await read(q)).status, 400, q);
  const calls = installMeta();
  const r = await read('?limit=2');
  assert.equal(r.status, 200);
  assert.equal(calls.find(c => c.url.pathname === '/v26.0/me/media').url.searchParams.get('limit'), '2');
  const body = await r.json();
  assert.equal(body.account_id, IG_USER_ID);
  assert.equal(body.data.length, 1);
  assert.ok(!JSON.stringify(body).includes(LONG_TOKEN));
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), null, 'no CORS for browser JS');
});

// =================== social snapshot (internal read contract for the dashboard BFF) ===================
// Synthetic paged /me/media: `total` items, cursor paging; `next` carries a token like Meta's real URL does.
function pagedMedia(total, {fields = null} = {}) {
  return u => {
    if (fields) fields.push(u.searchParams.get('fields'));
    const start = u.searchParams.has('after') ? Number(u.searchParams.get('after').slice(1)) : 0;
    const limit = Number(u.searchParams.get('limit'));
    const end = Math.min(total, start + limit);
    const data = Array.from({length: end - start}, (_, k) => ({
      id: `m${start + k}`, media_type: (start + k) % 3 === 2 ? 'IMAGE' : 'VIDEO', media_product_type: (start + k) % 3 === 2 ? 'FEED' : 'REELS', permalink: `https://example.invalid/p/${start + k}`,
      media_url: (start + k) % 3 === 2 ? `https://example.invalid/i/${start + k}.jpg` : `https://example.invalid/v/${start + k}.mp4`,
      timestamp: new Date(Date.now() - (start + k) * 0.5 * DAY * 1000).toISOString().replace('.000Z', '+0000'),
      thumbnail_url: `https://example.invalid/t/${start + k}.jpg`, caption: track(`synthetic caption ${start + k} ${'c'.repeat(8)}`),
      like_count: 5, comments_count: 1
    }));
    const paging = end < total ? {cursors: {before: `c${start}`, after: `c${end}`}, next: `https://graph.instagram.com/v26.0/me/media?access_token=${LONG_TOKEN}&after=c${end}`} : {cursors: {before: `c${start}`, after: `c${end}`}};
    return Response.json({data, paging});
  };
}
test('social snapshot: image_url carries the picture of photo posts, never a video file', async () => {
  const env = mockEnv();
  await connect(env);
  const fields = [];
  installMeta({media: pagedMedia(6, {fields})});
  const r = await snapshot(env, '?max=6');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.match(fields[0], /media_url/);
  for (const m of body.media.items) {
    if (m.media_type === 'IMAGE') assert.equal(m.image_url, `https://example.invalid/i/${m.id.slice(1)}.jpg`);
    else assert.equal(m.image_url, null, 'a video never passes its file URL on');
  }
});

test('social snapshot: a refused media_url costs only the picture, never caption and counters', async () => {
  const env = mockEnv();
  await connect(env);
  const fields = [];
  const inner = pagedMedia(3, {fields});
  installMeta({media: u => u.searchParams.get('fields').includes('media_url')
    ? (fields.push(u.searchParams.get('fields')), Response.json({error: {message: 'synthetic', type: 'OAuthException', code: 100}}, {status: 400}))
    : inner(u)});
  const body = await (await snapshot(env, '?max=3')).json();
  assert.equal(body.media.optional_fields_state, 'ACCEPTED');
  assert.equal(body.media.picture_field_state, 'REJECTED_BY_META');
  assert.equal(typeof body.media.items[0].caption, 'string');
  assert.ok(!('image_url' in body.media.items[0]));
  assert.equal(fields.length, 2, 'one refused attempt, then one read without media_url');
});

test('social snapshot: a carousel that opens with a video passes no video file', async () => {
  const env = mockEnv();
  await connect(env);
  installMeta({media: () => Response.json({data: [
    {id: 'c1', media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', permalink: 'https://example.invalid/p/c1', timestamp: '2026-11-01T10:00:00+0000', media_url: 'https://example.invalid/v/c1.mp4?x=1', caption: 'c', like_count: 1, comments_count: 0},
    {id: 'c2', media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', permalink: 'https://example.invalid/p/c2', timestamp: '2026-11-01T09:00:00+0000', media_url: 'https://example.invalid/i/c2.jpg', caption: 'c', like_count: 1, comments_count: 0},
  ], paging: {cursors: {before: 'a', after: 'b'}}})});
  const body = await (await snapshot(env, '?max=2')).json();
  assert.equal(body.media.items[0].image_url, null);
  assert.equal(body.media.items[1].image_url, 'https://example.invalid/i/c2.jpg');
});
const snapshot = (env, q = '', key = INTERNAL_KEY) => worker.fetch(new Request(origin + '/internal/social-snapshot' + q, {headers: {Authorization: `Bearer ${key}`}}), env);

test('social snapshot: internal key only, max validation, reauth and account checks', async () => {
  const env = mockEnv();
  assert.equal((await worker.fetch(new Request(origin + '/internal/social-snapshot'), env)).status, 401);
  assert.equal((await snapshot(env, '', ADMIN_KEY)).status, 401, 'admin key is not the internal read key');
  assert.equal((await snapshot(env)).status, 409, 'no token -> reauth-required');
  await connect(env);
  for (const q of ['?max=0', '?max=51', '?max=abc', '?max=-1', '?max=100']) assert.equal((await snapshot(env, q)).status, 400, q);
  installMeta({me: () => Response.json({user_id: IG_USER_ID, username: 'someoneelse'})});
  assert.equal((await snapshot(env)).status, 409, 'account mismatch');
  installMeta({media: metaError(4, 400)});
  const failed = await snapshot(env);
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), {error: 'instagram-media-fetch-failed', reason: 'meta-4'});
});

test('social snapshot: cursor pagination to max, never forwards Meta paging URLs or tokens', async () => {
  const env = mockEnv();
  await connect(env);
  const calls = installMeta({media: pagedMedia(60)});
  const r = await snapshot(env, '?max=30');
  assert.equal(r.status, 200);
  const text = await r.text();
  assert.ok(!text.includes(LONG_TOKEN) && !text.includes('access_token'), 'no token or paging URL in output');
  const body = JSON.parse(text);
  const mediaCalls = calls.filter(c => c.url.pathname === '/v26.0/me/media');
  assert.deepEqual(mediaCalls.map(c => [c.url.searchParams.get('limit'), c.url.searchParams.get('after')]), [['25', null], ['5', 'c25']]);
  assert.equal(body.snapshot_version, 1);
  assert.equal(body.api_version, 'v26.0');
  assert.equal(body.account.id, IG_USER_ID);
  assert.deepEqual({requested: body.media.requested_max, returned: body.media.returned, pages: body.media.pages_fetched, more: body.media.has_more},
    {requested: 30, returned: 30, pages: 2, more: true});
  assert.equal(body.media.items[29].id, 'm29');
  assert.equal(body.media.items[0].caption, `synthetic caption 0 ${'c'.repeat(8)}`, 'caption passes through (localhost display decided by PO; never logged — see the suite-wide log guard)');
  assert.equal(body.media.optional_fields_state, 'ACCEPTED');
});

test('social snapshot: fewer posts than max are reported honestly; default max is 30', async () => {
  const env = mockEnv();
  await connect(env);
  installMeta({media: pagedMedia(7)});
  const body = await (await snapshot(env)).json();
  assert.deepEqual({requested: body.media.requested_max, returned: body.media.returned, pages: body.media.pages_fetched, more: body.media.has_more},
    {requested: 30, returned: 7, pages: 1, more: false});
});

test('social snapshot: per-post insights with per-metric isolation; missing values are null + unavailable, never 0', async () => {
  const env = mockEnv();
  await connect(env);
  installMeta({
    media: pagedMedia(3),
    mediaInsights: u => {
      const id = u.pathname.split('/')[2];
      const metrics = u.searchParams.get('metric').split(',');
      if (id === 'm1' && metrics.length > 1) return Response.json({error: {message: 'synthetic', type: 'OAuthException', code: 100}}, {status: 400});
      if (id === 'm1' && metrics[0] === 'views') return Response.json({error: {message: 'synthetic', type: 'OAuthException', code: 100}}, {status: 400});
      if (id === 'm1' && metrics[0] === 'shares') return Response.json({data: []});
      if (id === 'm2') return Response.json({error: {message: 'synthetic', type: 'OAuthException', code: 10}}, {status: 403});
      return Response.json({data: metrics.map((name, i) => ({name, period: 'lifetime', values: [{value: 10 + i}]}))});
    }
  });
  const body = await (await snapshot(env)).json();
  const byId = Object.fromEntries(body.media.items.map(i => [i.id, i.insights]));
  assert.deepEqual(body.insights.requested_metrics, ['reach', 'views', 'saved', 'shares', 'likes', 'comments', 'total_interactions']);
  assert.equal(byId.m0.state, 'ok');
  assert.deepEqual(byId.m0.metrics.find(m => m.name === 'saved'), {name: 'saved', value: 12, state: 'ok', period: 'lifetime'});
  assert.equal(byId.m1.state, 'partial');
  assert.deepEqual(byId.m1.metrics.find(m => m.name === 'views'), {name: 'views', value: null, state: 'unavailable', period: null, error_class: 'meta-100'});
  assert.deepEqual(byId.m1.metrics.find(m => m.name === 'shares'), {name: 'shares', value: null, state: 'unavailable', period: null, error_class: 'empty-response'});
  assert.deepEqual(byId.m1.metrics.find(m => m.name === 'reach'), {name: 'reach', value: 10, state: 'ok', period: 'lifetime'});
  assert.equal(byId.m2.state, 'error');
  assert.ok(byId.m2.metrics.every(m => m.value === null && m.state === 'error' && m.error_class === 'meta-10'));
});

test('social snapshot: a hard sub-request budget bounds Meta calls; posts beyond it are marked not_fetched', async () => {
  const env = mockEnv();
  await connect(env);
  const calls = installMeta({media: pagedMedia(60)});
  const body = await (await snapshot(env, '?max=50')).json();
  assert.equal(body.media.returned, 50);
  assert.ok(calls.length <= body.insights.budget.limit, `calls ${calls.length} <= budget ${body.insights.budget.limit}`);
  assert.equal(body.insights.budget.used, calls.length);
  const fetched = body.media.items.filter(i => i.insights.state === 'ok').length;
  const skipped = body.media.items.filter(i => i.insights.state === 'not_fetched');
  assert.equal(fetched + skipped.length, 50);
  assert.ok(fetched > 0 && skipped.length > 0);
  assert.equal(body.insights.posts_with_insights, fetched);
  assert.ok(skipped.every(i => i.insights.reason === 'subrequest-budget' && i.insights.metrics.every(m => m.value === null && m.state === 'not_fetched')));
  // posts at least 7 days old get insights first (younger lifetime metrics are never compared); the newest go short
  const ageDays = i => (Date.now() - Date.parse(i.timestamp)) / (DAY * 1000);
  assert.ok(skipped.every(i => ageDays(i) < 7), 'only young posts are left without insights');
  assert.ok(body.media.items.filter(i => ageDays(i) >= 7).slice(0, 10).every(i => i.insights.state === 'ok'));
  assert.equal(body.insights.priority, 'mature-first');
  // a budget shortfall is never reported as an error
  assert.ok(body.media.items.every(i => i.insights.state !== 'error'));
});

test('social snapshot: only Meta error 100 triggers the optional-field fallback; a rate limit fails the read', async () => {
  const env = mockEnv();
  await connect(env);
  const calls = installMeta({media: metaError(4, 400)});
  const r = await snapshot(env);
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), {error: 'instagram-media-fetch-failed', reason: 'meta-4'});
  assert.equal(calls.filter(c => c.url.pathname === '/v26.0/me/media').length, 1, 'no retry without optional fields');
});

test('social snapshot: identity extras fall back only on Meta error 100; a rate limit fails the read', async () => {
  const env = mockEnv();
  await connect(env);
  const calls = installMeta({media: pagedMedia(1), me: u => u.searchParams.get('fields').includes('followers_count') ? Response.json({error: {message: 'synthetic', type: 'OAuthException', code: 4}}, {status: 400}) : Response.json({user_id: IG_USER_ID, username: 'anasavu'})});
  const r = await snapshot(env);
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), {error: 'instagram-media-fetch-failed', reason: 'meta-4'});
  assert.equal(calls.filter(c => c.url.pathname === '/v26.0/me').length, 1, 'no retry without extras on a rate limit');
});

test('social snapshot: a budget that runs out inside the per-metric fallback yields not_fetched, never error', async () => {
  const env = mockEnv();
  await connect(env);
  // 1 identity + 1 media page + 4 account metrics = 6; then each post's combined call fails with 100 and the
  // per-metric fallback (7 calls per post) exhausts the 45-call budget mid-post
  installMeta({media: pagedMedia(30), mediaInsights: u => u.searchParams.get('metric').includes(',')
    ? Response.json({error: {message: 'synthetic', type: 'OAuthException', code: 100}}, {status: 400})
    : Response.json({data: []})});
  const body = await (await snapshot(env)).json();
  assert.equal(body.insights.budget.used, body.insights.budget.limit);
  const states = body.media.items.map(i => i.insights.state);
  assert.ok(!states.includes('error'), 'budget shortfall is never an error');
  assert.ok(states.includes('not_fetched'));
  // the post cut mid-fallback holds unavailable + not_fetched metrics and no ok one: still not_fetched, not error
  const cut = body.media.items.find(i => i.insights.metrics.some(m => m.state === 'unavailable') && i.insights.metrics.some(m => m.state === 'not_fetched'));
  assert.ok(cut, 'scenario reaches a post cut mid-fallback');
  assert.equal(cut.insights.state, 'not_fetched');
});

test('social snapshot: media without insight support stops the per-metric fallback after reach', async () => {
  const env = mockEnv();
  await connect(env);
  const calls = installMeta({media: pagedMedia(1), mediaInsights: () => Response.json({error: {message: 'synthetic', type: 'OAuthException', code: 100}}, {status: 400})});
  const body = await (await snapshot(env)).json();
  const ins = body.media.items[0].insights;
  assert.equal(ins.state, 'unavailable');
  assert.ok(ins.metrics.every(m => m.value === null && m.state === 'unavailable'));
  assert.equal(calls.filter(c => /\/m0\/insights$/.test(c.url.pathname)).length, 2, 'combined call + reach only');
});

test('social snapshot: a throttle or token error stops further insight calls', async () => {
  const env = mockEnv();
  await connect(env);
  const calls = installMeta({media: pagedMedia(30), mediaInsights: metaError(4, 400)});
  const body = await (await snapshot(env)).json();
  const insightCalls = calls.filter(c => /\/m\d+\/insights$/.test(c.url.pathname)).length;
  assert.ok(insightCalls <= 5, `stopped after the first throttled batch (${insightCalls} calls)`);
  const states = body.media.items.map(i => i.insights.state);
  assert.ok(states.includes('error'));
  const skipped = body.media.items.filter(i => i.insights.state === 'not_fetched');
  assert.ok(skipped.length > 0 && skipped.every(i => i.insights.reason === 'meta-throttled'));
});

test('social snapshot: optional media fields rejected by Meta fall back to the base field set', async () => {
  const env = mockEnv();
  await connect(env);
  const fields = [];
  const base = pagedMedia(2, {fields});
  installMeta({media: u => u.searchParams.get('fields').includes('caption') ? Response.json({error: {message: 'synthetic', type: 'OAuthException', code: 100}}, {status: 400}) : base(u)});
  const body = await (await snapshot(env)).json();
  assert.equal(body.media.optional_fields_state, 'REJECTED_BY_META');
  assert.equal(body.media.returned, 2);
  assert.deepEqual(fields, ['id,media_type,permalink,timestamp,thumbnail_url,media_product_type'], 'product type survives the fallback: formats stay separable');
});

test('social snapshot: account metrics per metric over a 28-day window; followers degrade to unavailable', async () => {
  const env = mockEnv();
  await connect(env);
  const accountCalls = [];
  installMeta({
    media: pagedMedia(1),
    me: u => u.searchParams.get('fields').includes('followers_count')
      ? Response.json({error: {message: 'synthetic', type: 'OAuthException', code: 100}}, {status: 400})
      : Response.json({user_id: IG_USER_ID, id: APP_SCOPED_ID, username: 'anasavu'}),
    insights: u => {
      accountCalls.push(u);
      const metric = u.searchParams.get('metric');
      if (metric === 'accounts_engaged') return Response.json({error: {message: 'synthetic', type: 'OAuthException', code: 100}}, {status: 400});
      return Response.json({data: [{name: metric, period: 'day', total_value: {value: 1000}}]});
    }
  });
  const body = await (await snapshot(env)).json();
  assert.deepEqual(accountCalls.map(u => u.searchParams.get('metric')), ['reach', 'views', 'accounts_engaged', 'total_interactions']);
  for (const u of accountCalls) {
    assert.equal(u.searchParams.get('period'), 'day');
    assert.equal(u.searchParams.get('metric_type'), 'total_value');
    assert.equal(Number(u.searchParams.get('until')) - Number(u.searchParams.get('since')), 28 * DAY);
  }
  const m = Object.fromEntries(body.account.metrics.map(x => [x.name, x]));
  assert.equal(m.reach.value, 1000);
  assert.equal(m.reach.state, 'ok');
  assert.equal(m.reach.window_days, 28);
  assert.deepEqual({value: m.accounts_engaged.value, state: m.accounts_engaged.state, error_class: m.accounts_engaged.error_class}, {value: null, state: 'unavailable', error_class: 'meta-100'});
  assert.deepEqual(body.account.followers_count, {value: null, state: 'unavailable'});
  assert.equal(body.account.username, 'anasavu');
});

// =================== refresh ===================
test('refresh: not due, too young, due -> rotates ciphertext and keeps token private', async () => {
  const env = mockEnv();
  await seedToken(env, {issuedAgo: 10 * DAY, expiresIn: 50 * DAY});
  installMeta();
  assert.equal((await testing.refresh(env)).status, 'NOT_DUE');
  const young = mockEnv();
  await seedToken(young, {issuedAgo: 3600, expiresIn: 10 * DAY});
  assert.equal((await testing.refresh(young, true)).status, 'NOT_DUE', 'Meta refuses refresh < 24h');
  const due = mockEnv();
  await seedToken(due);
  const calls = installMeta();
  assert.equal((await testing.refresh(due)).status, 'REFRESHED');
  assert.equal(await testing.openSealed(tokenRow(due), due), 'ROTATED_TOKEN');
  assert.equal(tokenRow(due).last_refresh_error, null);
  assert.equal(calls[0].url.searchParams.get('grant_type'), 'ig_refresh_token');
  assert.equal(calls[0].url.searchParams.get('access_token'), 'OLD_TOKEN');
  assert.ok(!calls[0].url.searchParams.has('client_secret'));
  assert.equal((await testing.refresh(due)).status, 'NOT_DUE');
});

test('refresh: a short-lived or malformed refreshed token is rejected and the old token kept', async () => {
  for (const [name, body] of [['short', {access_token: 'X_SHORT_REFRESHED', expires_in: 3600}], ['no expiry', {access_token: 'X_NO_EXPIRY'}], ['no token', {expires_in: 5184000}]]) {
    const env = mockEnv();
    await seedToken(env);
    installMeta({refresh: () => Response.json(body)});
    const res = await testing.refresh(env);
    assert.equal(res.status, 'REFRESH_FAILED', name);
    assert.equal(tokenRow(env).last_refresh_error, 'invalid-refresh', name);
    assert.equal(await testing.openSealed(tokenRow(env), env), 'OLD_TOKEN', name);
  }
});

test('refresh: a REAUTH_REQUIRED token is never sent to Meta again, even when forced', async () => {
  const env = mockEnv();
  await seedToken(env, {status: 'REAUTH_REQUIRED'});
  const before = tokenRow(env);
  const calls = installMeta();
  assert.equal((await testing.refresh(env, true)).status, 'REAUTH_REQUIRED');
  assert.equal(calls.length, 0);
  assert.deepEqual(tokenRow(env), before);
});

test('refresh: a successful refresh never overwrites a token re-authorized concurrently', async () => {
  const env = mockEnv();
  await seedToken(env);
  installMeta();
  const reauth = await testing.seal('REAUTHORIZED_TOKEN', env, IG_USER_ID);
  sensitive.add('REAUTHORIZED_TOKEN');
  const real = env.DB.prepare;
  env.DB.prepare = sql => {
    if (sql.startsWith('UPDATE instagram_tokens SET token_iv')) // Ana re-authorizes between refresh's read and write
      env.DB.sqlite.prepare('UPDATE instagram_tokens SET token_iv=?, token_ciphertext=?').run(reauth.iv, reauth.ciphertext);
    return real.call(env.DB, sql);
  };
  assert.equal((await testing.refresh(env)).status, 'CONCURRENT_UPDATE');
  assert.equal(await testing.openSealed(tokenRow(env), env), 'REAUTHORIZED_TOKEN');
});

test('refresh: transient failure is recorded and keeps the old token; revoked token (190) requires reauth', async () => {
  const env = mockEnv();
  await seedToken(env);
  installMeta({refresh: () => new Response('bad gateway', {status: 502})});
  assert.equal((await testing.refresh(env)).status, 'REFRESH_FAILED');
  let row = tokenRow(env);
  assert.equal(row.connection_status, 'CONNECTED');
  assert.equal(row.last_refresh_error, 'meta-non-json');
  assert.ok(row.last_refresh_attempt_at > 0);
  assert.equal(await testing.openSealed(row, env), 'OLD_TOKEN');
  const status = await (await worker.fetch(adminReq('/admin/status'), env)).json();
  assert.equal(status.last_refresh_error, 'meta-non-json', 'operator can see failing refreshes');
  installMeta({refresh: metaError(190)});
  assert.equal((await testing.refresh(env)).status, 'REAUTH_REQUIRED');
  row = tokenRow(env);
  assert.equal(row.connection_status, 'REAUTH_REQUIRED');
  assert.equal(row.last_refresh_error, 'meta-190');
  assert.equal((await worker.fetch(adminReq('/admin/probe'), env)).status, 409, 'revoked token is not used');
});

test('refresh: expired token is marked REAUTH_REQUIRED, but a concurrent re-authorization is never clobbered', async () => {
  const env = mockEnv();
  await seedToken(env, {issuedAgo: 61 * DAY, expiresIn: -DAY});
  assert.equal((await testing.refresh(env)).status, 'REAUTH_REQUIRED');
  assert.equal(tokenRow(env).connection_status, 'REAUTH_REQUIRED');
  // Simulate: refresh read the stale row, then Ana re-authorized before refresh wrote.
  const raced = mockEnv();
  await seedToken(raced, {issuedAgo: 61 * DAY, expiresIn: -DAY});
  const realFirst = raced.DB.prepare;
  let swapped = false;
  raced.DB.prepare = sql => {
    if (!swapped && sql.startsWith('UPDATE instagram_tokens SET connection_status')) {
      swapped = true;
      raced.DB.sqlite.prepare("UPDATE instagram_tokens SET token_ciphertext='NEW', expires_at=?, connection_status='CONNECTED'").run(now() + 60 * DAY);
    }
    return realFirst.call(raced.DB, sql);
  };
  await testing.refresh(raced);
  assert.equal(tokenRow(raced).connection_status, 'CONNECTED');
});

// =================== robustness / hygiene ===================
test('async handler failures are caught: generic 500, no details', async () => {
  const env = mockEnv({DB: {prepare() { return {bind() { return {first: async () => { throw Error('D1_ERROR: synthetic SELECT failure'); }, run: async () => { throw Error('D1_ERROR'); }}; }}; }}});
  const r = await worker.fetch(adminReq('/admin/status'), env);
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), {error: 'internal-error'});
  const r2 = await worker.fetch(new Request(origin + '/instagram/start?invite=' + 'A'.repeat(43)), env);
  assert.equal(r2.status, 500);
});

test('scheduled cleanup is FK-safe and survives errors', async () => {
  const env = mockEnv();
  const waits = [];
  const ctx = {waitUntil: p => waits.push(p)};
  const t = now();
  const cutoff = t - DAY;
  env.DB.sqlite.prepare('INSERT INTO oauth_invites (invite_hash, expires_at) VALUES (?,?)').run('old', cutoff - 10);
  env.DB.sqlite.prepare('INSERT INTO oauth_attempts (state_hash,cookie_hash,invite_hash,expires_at) VALUES (?,?,?,?)').run('s1', 'c', 'old', cutoff + 300);
  env.DB.sqlite.prepare('INSERT INTO oauth_invites (invite_hash, expires_at) VALUES (?,?)').run('older', cutoff - 5000);
  env.DB.sqlite.prepare('INSERT INTO oauth_attempts (state_hash,cookie_hash,invite_hash,expires_at) VALUES (?,?,?,?)').run('s2', 'c', 'older', cutoff - 4400);
  await worker.scheduled({}, env, ctx);
  await Promise.all(waits);
  assert.deepEqual(rows(env.DB, 'oauth_invites').map(r => r.invite_hash), ['old'], 'invite with a live attempt is kept');
  assert.deepEqual(rows(env.DB, 'oauth_attempts').map(r => r.state_hash), ['s1']);
  assert.ok(!logs.some(l => l.includes('cron-cleanup-error')));
  const broken = mockEnv({DB: {prepare() { throw Error('D1 down'); }}});
  const w2 = [];
  await worker.scheduled({}, broken, {waitUntil: p => w2.push(p)});
  await Promise.all(w2);
  assert.ok(logs.some(l => l.includes('cron-refresh-error')));
});

test('no secret, token, code, state or invite ever appears in logs (whole suite)', async () => {
  const env = mockEnv();
  const a = await connect(env);
  await worker.fetch(adminReq('/admin/probe'), env);
  await worker.fetch(adminReq('/admin/insights-probe'), env);
  assert.ok(logs.length > 0, 'log capture is live');
  const all = logs.join('\n');
  for (const s of [APP_SECRET, ADMIN_KEY, INTERNAL_KEY, LONG_TOKEN, SHORT_TOKEN, 'ROTATED_TOKEN', 'OLD_TOKEN', 'test-code', a.state, a.invite, '/instagram/callback?'])
    assert.ok(!all.includes(s), 'log leak: ' + s);
});

// =================== world pulse and audience (ANA World) ===================
const internalGet = (env, path, key = INTERNAL_KEY) => worker.fetch(new Request(origin + path, key ? {headers: {Authorization: `Bearer ${key}`}} : {}), env);

test('social pulse: internal key only, max validation, reauth, account mismatch', async () => {
  const env = mockEnv();
  assert.equal((await internalGet(env, '/internal/social-pulse', null)).status, 401);
  assert.equal((await internalGet(env, '/internal/social-pulse', ADMIN_KEY)).status, 401, 'admin key is not the internal read key');
  assert.equal((await internalGet(env, '/internal/social-pulse?max=0', null)).status, 401, 'auth is checked before input');
  assert.equal((await internalGet(env, '/internal/social-pulse')).status, 409, 'no token -> reauth-required');
  await connect(env);
  for (const q of ['?max=0', '?max=26', '?max=abc', '?max=-1']) assert.equal((await internalGet(env, '/internal/social-pulse' + q)).status, 400, q);
  installMeta({me: () => Response.json({user_id: IG_USER_ID, username: 'someoneelse'})});
  assert.equal((await internalGet(env, '/internal/social-pulse')).status, 409, 'account mismatch');
});

test('social pulse: one media page with public counters, at most 3 Meta calls, no token in output', async () => {
  const env = mockEnv();
  await connect(env);
  const calls = installMeta({
    me: () => Response.json({user_id: IG_USER_ID, username: 'anasavu', followers_count: 1234, media_count: 77}),
    media: () => Response.json({data: [
      {id: 'p1', timestamp: '2026-10-31T10:00:00+0000', media_product_type: 'REELS', like_count: 12, comments_count: 3},
      {id: 'p2', timestamp: '2026-10-30T10:00:00+0000', media_product_type: 'FEED', like_count: -1},
    ], paging: {next: `https://graph.instagram.com/v26.0/me/media?access_token=${LONG_TOKEN}`}}),
  });
  const r = await internalGet(env, '/internal/social-pulse?max=5');
  assert.equal(r.status, 200);
  const text = await r.text();
  assert.ok(!text.includes(LONG_TOKEN) && !text.includes('access_token'));
  const body = JSON.parse(text);
  assert.equal(body.pulse_version, 1);
  assert.deepEqual(body.account, {followers_count: 1234, media_count: 77});
  assert.deepEqual(body.items[0], {id: 'p1', timestamp: '2026-10-31T10:00:00+0000', media_product_type: 'REELS', like_count: 12, comments_count: 3});
  assert.equal(body.items[1].like_count, null, 'a negative count is not a count');
  assert.equal(body.items[1].comments_count, null, 'a missing count is null, never 0');
  const meta = calls.filter(c => c.url.origin === 'https://graph.instagram.com');
  assert.ok(meta.length <= 3);
  const media = meta.find(c => c.url.pathname === '/v26.0/me/media');
  assert.equal(media.url.searchParams.get('limit'), '5');
  assert.equal(media.url.searchParams.get('fields'), 'id,timestamp,media_product_type,like_count,comments_count');
});

test('social pulse: a Meta failure on the media read is a 502 with an error class only', async () => {
  const env = mockEnv();
  await connect(env);
  installMeta({media: metaError(4, 400)});
  const r = await internalGet(env, '/internal/social-pulse');
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), {error: 'instagram-media-fetch-failed', reason: 'meta-4'});
});

const demo = (name, breakdown, rows) => Response.json({data: [{name, period: 'lifetime', total_value: {breakdowns: [{dimension_keys: ['timeframe', ...breakdown.split(',')], results: rows.map(([k, v]) => ({dimension_values: ['THIS_MONTH', ...k.split('|')], value: v}))}]}}]});

test('social audience: documented demographic reads, aggregated results, per-metric states', async () => {
  const env = mockEnv();
  await connect(env);
  const calls = installMeta({
    insights: u => {
      const metric = u.searchParams.get('metric'), breakdown = u.searchParams.get('breakdown');
      if (metric === 'follower_demographics' && breakdown === 'city') return metaError(100)();
      if (metric === 'follower_demographics' && breakdown === 'country') return Response.json({data: []});
      if (breakdown === 'country') return demo(metric, 'country', [['DE', 120], ['ES', 40], ['', 9], ['IT', -3]]);
      if (breakdown === 'city') return demo(metric, 'city', [['Berlin, Berlin', 30]]);
      if (breakdown === 'age') return demo(metric, 'age', [['25-34', 70], ['18-24', 20]]);
      if (breakdown === 'gender') return demo(metric, 'gender', [['F', 60], ['M', 30], ['U', 2]]);
      return demo(metric, breakdown, [['25-34|F', 50], ['18-24|M', 11]]);
    },
  });
  const r = await internalGet(env, '/internal/social-audience');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.audience_version, 1);
  const [ec, ecity, fc, fcity] = body.metrics;
  assert.deepEqual([ec.name, ec.breakdown, ec.timeframe, ec.state], ['engaged_audience_demographics', 'country', 'this_month', 'ok']);
  assert.deepEqual(ec.results, [{key: 'DE', value: 120}, {key: 'ES', value: 40}], 'empty keys and negative values are dropped');
  assert.deepEqual(ecity.results, [{key: 'Berlin, Berlin', value: 30}]);
  assert.deepEqual([fc.state, fc.error_class], ['unavailable', 'empty-response']);
  assert.deepEqual([fcity.state, fcity.error_class], ['unavailable', 'meta-100']);
  const reads = calls.filter(c => c.url.pathname === `/v26.0/${IG_USER_ID}/insights`);
  assert.equal(reads.length, 13);
  for (const c of reads) {
    assert.equal(c.url.searchParams.get('period'), 'lifetime');
    assert.equal(c.url.searchParams.get('metric_type'), 'total_value');
  }
  // the first four keep the this_month contract older dashboards read by name and breakdown
  assert.deepEqual(reads.slice(0, 4).map(c => c.url.searchParams.get('timeframe')), ['this_month', 'this_month', 'this_month', 'this_month']);
  assert.deepEqual(body.metrics.map(m => `${m.name === 'follower_demographics' ? 'f' : 'e'}:${m.breakdown}:${m.timeframe}`), [
    'e:country:this_month', 'e:city:this_month', 'f:country:this_month', 'f:city:this_month',
    'e:country:this_week', 'e:city:this_week', 'e:age:this_week', 'e:gender:this_week',
    'e:age:this_month', 'e:gender:this_month', 'e:age,gender:this_month', 'f:age:this_month', 'f:gender:this_month']);
  for (const m of body.metrics) assert.equal(reads[body.metrics.indexOf(m)].url.searchParams.get('timeframe'), m.timeframe);
  const ageWeek = body.metrics[6], genderWeek = body.metrics[7], combo = body.metrics[10];
  assert.deepEqual(ageWeek.results, [{key: '25-34', value: 70}, {key: '18-24', value: 20}]);
  assert.deepEqual(genderWeek.results, [{key: 'F', value: 60}, {key: 'M', value: 30}, {key: 'U', value: 2}]);
  assert.deepEqual(combo.results, [{key: '25-34|F', value: 50}, {key: '18-24|M', value: 11}], 'a combined breakdown joins both values');
  assert.equal(combo.state, 'ok');
});

test('social audience: a throttle stops further reads and is reported as error / not_fetched, never as data', async () => {
  const env = mockEnv();
  await connect(env);
  installMeta({insights: metaError(4, 400)});
  const body = await (await internalGet(env, '/internal/social-audience')).json();
  assert.deepEqual(body.metrics.map(m => m.state), ['error', ...Array(12).fill('not_fetched')]);
  assert.ok(body.metrics.every(m => m.results.length === 0));
  assert.equal((await internalGet(env, '/internal/social-audience', null)).status, 401);
});

const history = (env, q = '', key = INTERNAL_KEY) => worker.fetch(new Request(origin + '/internal/media-history' + q, {headers: {Authorization: `Bearer ${key}`}}), env);

test('media history: internal key only, max validation, reauth and account checks', async () => {
  const env = mockEnv();
  assert.equal((await worker.fetch(new Request(origin + '/internal/media-history'), env)).status, 401);
  assert.equal((await history(env, '', ADMIN_KEY)).status, 401, 'admin key is not the internal read key');
  assert.equal((await history(env)).status, 409, 'no token -> reauth-required');
  await connect(env);
  for (const q of ['?max=0', '?max=201', '?max=abc', '?max=-1', '?max=1000']) assert.equal((await history(env, q)).status, 400, q);
  const mismatch = installMeta({me: () => Response.json({user_id: IG_USER_ID, username: 'someoneelse'})});
  assert.equal((await history(env)).status, 409, 'account mismatch');
  assert.ok(mismatch.every(c => c.url.pathname !== '/v26.0/me/media'), 'no media read for another account');
  installMeta({media: metaError(4, 400)});
  const failed = await history(env);
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), {error: 'instagram-media-fetch-failed', reason: 'meta-4'});
});

test('media history: pages to 200 posts within its budget, no insights, never forwards Meta paging URLs or tokens', async () => {
  const env = mockEnv();
  await connect(env);
  const calls = installMeta({media: pagedMedia(260)});
  const r = await history(env, '?max=200');
  assert.equal(r.status, 200);
  const text = await r.text();
  assert.ok(!text.includes(LONG_TOKEN) && !text.includes('access_token'), 'no token in output');
  assert.ok(!text.includes('graph.instagram.com') && !text.includes('paging') && !text.includes('after=') && !text.includes('"c25"'), 'no Meta paging URL, link or cursor in output');
  const body = JSON.parse(text);
  assert.deepEqual({requested: body.media.requested_max, returned: body.media.returned, pages: body.media.pages_fetched, more: body.media.has_more, stopped: body.media.stopped}, {requested: 200, returned: 200, pages: 8, more: true, stopped: null});
  assert.equal(body.media.items[199].id, 'm199');
  assert.equal(body.media.items[0].caption, `synthetic caption 0 ${'c'.repeat(8)}`);
  const image = body.media.items.find(m => m.media_type === 'IMAGE');
  const video = body.media.items.find(m => m.media_type === 'VIDEO');
  const keys = ['caption', 'id', 'image_url', 'media_product_type', 'media_type', 'thumbnail_url', 'timestamp'];
  assert.deepEqual(Object.keys(image).sort(), keys, 'exactly these fields, nothing else from Meta');
  assert.deepEqual(Object.keys(video).sort(), keys);
  assert.equal(image.image_url, `https://example.invalid/i/${image.id.slice(1)}.jpg`);
  assert.equal(video.image_url, null, 'a video never passes its file URL on');
  assert.ok(calls.every(c => !c.url.pathname.includes('/insights')), 'no insights calls');
  assert.equal(body.budget.limit, 14);
  assert.equal(body.budget.used, calls.length);
});

test('media history: the worst case (identity and both field fallbacks) still reads 200 posts within 14 calls', async () => {
  const env = mockEnv();
  await connect(env);
  const refused = () => Response.json({error: {message: 'synthetic', type: 'OAuthException', code: 100}}, {status: 400});
  const inner = pagedMedia(260);
  const calls = installMeta({
    me: u => (u.searchParams.get('fields').includes('followers_count') ? refused() : Response.json({user_id: IG_USER_ID, username: 'anasavu'})),
    media: u => (u.searchParams.get('fields').includes('caption') || u.searchParams.get('fields').includes('media_url') ? refused() : inner(u)),
  });
  const body = await (await history(env, '?max=200')).json();
  assert.equal(body.media.returned, 200);
  assert.equal(body.media.optional_fields_state, 'REJECTED_BY_META');
  assert.equal(body.budget.used, 12);
  assert.equal(calls.length, 12);
  assert.ok(body.media.items.every(m => !('caption' in m) && !('image_url' in m)));
});

test('media history: when the budget runs out mid-paging, the posts read so far come back and the stop is named', async () => {
  const env = mockEnv();
  await connect(env);
  const short = pagedMedia(300);
  // Meta answers 10 posts per page although 25 were asked for: the budget ends before 200
  installMeta({media: u => { u.searchParams.set('limit', '10'); return short(u); }});
  const r = await history(env, '?max=200');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.media.stopped, 'subrequest-budget');
  assert.equal(body.media.has_more, true);
  assert.equal(body.media.returned, 130);
  assert.equal(body.budget.used, 14);
});

test('media history: default 100, fewer posts reported honestly', async () => {
  const env = mockEnv();
  await connect(env);
  installMeta({media: pagedMedia(7)});
  const body = await (await history(env)).json();
  assert.deepEqual({requested: body.media.requested_max, returned: body.media.returned, more: body.media.has_more}, {requested: 100, returned: 7, more: false});
});

const insightsOf = (env, q = '', key = INTERNAL_KEY) => worker.fetch(new Request(origin + '/internal/media-insights' + q, {headers: {Authorization: `Bearer ${key}`}}), env);

test('media insights: internal key only, id validation, reauth and account checks', async () => {
  const env = mockEnv();
  assert.equal((await worker.fetch(new Request(origin + '/internal/media-insights?ids=1'), env)).status, 401);
  assert.equal((await insightsOf(env, '?ids=1', ADMIN_KEY)).status, 401, 'admin key is not the internal read key');
  assert.equal((await insightsOf(env, '?ids=1')).status, 409, 'no token -> reauth-required');
  await connect(env);
  const many = Array.from({length: 41}, (_, i) => String(1000 + i)).join(',');
  for (const q of ['', '?ids=', '?ids=abc', '?ids=1,,2', '?ids=1,1', '?ids=1%2F..%2Fme', '?ids=' + many, '?ids=' + '9'.repeat(31)]) assert.equal((await insightsOf(env, q)).status, 400, q);
  const mismatch = installMeta({me: () => Response.json({user_id: IG_USER_ID, username: 'someoneelse'})});
  assert.equal((await insightsOf(env, '?ids=1')).status, 409, 'account mismatch');
  assert.ok(mismatch.every(c => !c.url.pathname.endsWith('/insights')), 'no insights read for another account');
});

test('media insights: one call per post within 45, same per-metric isolation as the snapshot, no token in the output', async () => {
  const env = mockEnv();
  await connect(env);
  const ids = Array.from({length: 40}, (_, i) => String(9000 + i));
  const calls = installMeta({
    mediaInsights: u => {
      const id = u.pathname.split('/')[2];
      const metrics = u.searchParams.get('metric').split(',');
      if (id === '9001' && metrics.length > 1) return Response.json({error: {message: 'synthetic', type: 'OAuthException', code: 100}}, {status: 400});
      if (id === '9001' && metrics[0] === 'views') return Response.json({error: {message: 'synthetic', type: 'OAuthException', code: 100}}, {status: 400});
      return Response.json({data: metrics.map((name, i) => ({name, period: 'lifetime', values: [{value: 10 + i}]}))});
    }
  });
  const r = await insightsOf(env, '?ids=' + ids.join(','));
  assert.equal(r.status, 200);
  const text = await r.text();
  assert.ok(!text.includes(LONG_TOKEN) && !text.includes('access_token') && !text.includes('graph.instagram.com'));
  const body = JSON.parse(text);
  assert.deepEqual(body.items.map(x => x.id), ids, 'same order as asked');
  assert.equal(body.items[0].insights.state, 'ok');
  assert.deepEqual(body.items[0].insights.metrics.find(m => m.name === 'saved'), {name: 'saved', value: 12, state: 'ok', period: 'lifetime'});
  assert.equal(body.items[1].insights.state, 'partial');
  assert.equal(body.budget.limit, 45);
  assert.equal(body.budget.used, calls.length);
  assert.ok(calls.length <= 45);
  // posts the budget did not reach are not_fetched, never errors
  const skipped = body.items.filter(x => x.insights.state === 'not_fetched');
  assert.ok(skipped.every(x => x.insights.reason === 'subrequest-budget'));
  assert.equal(body.items.filter(x => x.insights.state === 'ok' || x.insights.state === 'partial').length + skipped.length, 40);
});

test('media insights: a throttle halts the rest and is named', async () => {
  const env = mockEnv();
  await connect(env);
  installMeta({mediaInsights: () => Response.json({error: {message: 'synthetic', type: 'OAuthException', code: 4}}, {status: 400})});
  const body = await (await insightsOf(env, '?ids=1,2,3,4,5,6,7')).json();
  assert.equal(body.halted, 'meta-4');
  assert.ok(body.items.every(x => x.insights.state === 'error' || x.insights.state === 'not_fetched'));
  assert.ok(body.items.slice(5).every(x => x.insights.state === 'not_fetched'));
});
