var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// cloudflare/worker.js
var GITHUB_OWNER = "vietng228";
var GITHUB_BRANCH = "main";
var GITHUB_REPOS = /* @__PURE__ */ new Set(["tv", "dmtm", "miss", "mibn", "mihp", "tq", "pcd", "ms", "bq", "dttl", "vxm", "mils"]);
var DEFAULT_EXPIRY = "2026-12-31";
var VIETNAM_OFFSET = "+07:00";
var APP_ORIGIN = "https://ximaotv.github.io";
var APP_DEDUPE_SECONDS = 30 * 60;
var APP_DOWNLOADS = /* @__PURE__ */ new Set(["ferrari-apk", "mix-apk", "vietmitv99-apk", "manager-apk", "vxmstore-apk", "project-apk", "imou-apk", "yoosee-apk", "ezviz-apk", "hbomax-apk", "fptplay-xapk", "tv360-apk", "vtvgo-apk", "vtvprime-apk", "mytv-apk", "tvbro-apk", "coccoc-apk", "smarttube-apk", "ytb-apk", "ytb2-apk", "vietmitv-apk", "quantv-apk", "vietplaytv-apk", "vapp-apk", "phim4k-apk", "chophim-apk", "nvc-apk", "sgphim-apk", "rapphim-apk", "vgt-apk", "cotv-apk", "getout-apk", "tiktok-apk", "netflix-apk", "mapvoice-apk", "supervoice-apk", "kiki-apk", "mcu-apk", "mstore-apk", "adb-apk", "sportstream-apk", "taskmgr-apk", "hik-apk"]);
var worker_default = { async fetch(request, env) {
  try {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return json({ success: true, service: "tv-download", source: "github-private", admin: true, repositories: [...GITHUB_REPOS] });
    if (url.pathname === "/admin" && request.method === "GET") return adminPage();
    if (url.pathname === "/admin/api/licenses") {
      if (!await isAdmin(request, env)) return unauthorized();
      if (request.method === "GET") return listLicenses(env);
      if (request.method === "POST") return createLicense(request, env);
      return json({ success: false, error: "Ph\u01B0\u01A1ng th\u1EE9c kh\xF4ng \u0111\u01B0\u1EE3c h\u1ED7 tr\u1EE3." }, 405);
    }
    if (url.pathname === "/admin/api/licenses/action" && request.method === "POST") {
      if (!await isAdmin(request, env)) return unauthorized();
      return updateLicense(request, env);
    }
    if (url.pathname === "/app-downloads" && request.method === "OPTIONS") return appPreflight();
    if (url.pathname === "/app-downloads" && request.method === "GET") return listAppDownloads(request, env);
    const appDownloadMatch = url.pathname.match(/^\/app-downloads\/([a-z0-9-]+)$/);
    if (appDownloadMatch && request.method === "OPTIONS") return appPreflight();
    if (appDownloadMatch && request.method === "POST") return recordAppDownload(request, env, appDownloadMatch[1]);
    const downloadMatch = url.pathname.match(/^\/download(?:\/([a-z0-9-]+))?$/);
    if (downloadMatch && request.method === "POST") {
      const repository = downloadMatch[1] || "tv";
      if (!GITHUB_REPOS.has(repository)) return json({ success: false, error: "G\xF3i c\xE0i \u0111\u1EB7t kh\xF4ng t\u1ED3n t\u1EA1i." }, 404);
      return downloadPackage(request, env, repository);
    }
    return json({ success: false, error: "\u0110\u01B0\u1EDDng d\u1EABn kh\xF4ng h\u1EE3p l\u1EC7." }, 404);
  } catch (error) {
    console.error(JSON.stringify({ event: "worker_error", message: String(error) }));
    return json({ success: false, error: "M\xE1y ch\u1EE7 \u0111ang g\u1EB7p l\u1ED7i. Vui l\xF2ng th\u1EED l\u1EA1i." }, 500);
  }
} };
async function downloadPackage(request, env, repository) {
  const code = request.headers.get("X-Activation-Code")?.trim().toUpperCase();
  if (!code || code.length > 128) return json({ success: false, error: "M\xE3 k\xEDch ho\u1EA1t kh\xF4ng h\u1EE3p l\u1EC7." }, 400);
  const codeHash = await sha256(code), now = Math.floor(Date.now() / 1e3);
  const result = await env.DB.prepare(`UPDATE licenses SET downloads=downloads+1,last_download_at=? WHERE code_hash=? AND active=1 AND downloads<max_downloads AND (expires_at IS NULL OR expires_at>=?)`).bind(now, codeHash, now).run();
  if (result.meta.changes !== 1) return json({ success: false, error: "M\xE3 kh\xF4ng t\u1ED3n t\u1EA1i, \u0111\xE3 b\u1ECB kh\xF3a, h\u1EBFt h\u1EA1n ho\u1EB7c h\u1EBFt l\u01B0\u1EE3t t\u1EA3i." }, 403);
  let packageBody, packageLength;
  if (env.GITHUB_TOKEN) {
    const githubResponse = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${repository}/zipball/${encodeURIComponent(GITHUB_BRANCH)}`, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "viet-xiaomi-tv-download-worker" }, redirect: "follow", cf: { cacheTtl: 0, cacheEverything: false } });
    if (!githubResponse.ok || !githubResponse.body) {
      await refundDownload(env, codeHash);
      console.error(JSON.stringify({ event: "github_download_error", repository, status: githubResponse.status }));
      return json({ success: false, error: "Kh\xF4ng th\u1EC3 l\u1EA5y b\u1EA3n m\u1EDBi nh\u1EA5t t\u1EEB GitHub." }, 502);
    }
    packageBody = githubResponse.body;
    packageLength = githubResponse.headers.get("Content-Length");
  } else {
    if (repository !== "tv") {
      await refundDownload(env, codeHash);
      return json({ success: false, error: "K\u1EBFt n\u1ED1i GitHub ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh cho g\xF3i n\xE0y." }, 503);
    }
    const object = await env.PACKAGES.get("tv-package-20260815.zip");
    if (!object) {
      await refundDownload(env, codeHash);
      return json({ success: false, error: "G\xF3i c\xE0i \u0111\u1EB7t ch\u01B0a c\xF3 tr\xEAn m\xE1y ch\u1EE7." }, 503);
    }
    packageBody = object.body;
    packageLength = String(object.size);
  }
  const headers = secureHeaders("application/zip");
  headers.set("Content-Disposition", `attachment; filename="${repository}-package.zip"`);
  if (packageLength) headers.set("Content-Length", packageLength);
  return new Response(packageBody, { status: 200, headers });
}
__name(downloadPackage, "downloadPackage");
async function listAppDownloads(request, env) {
  const result = await env.DB.prepare("SELECT app,count FROM app_download_counts").all(), counts = {};
  for (const app of APP_DOWNLOADS) counts[app] = 0;
  for (const row of result.results || []) if (APP_DOWNLOADS.has(row.app)) counts[row.app] = Number(row.count) || 0;
  return appJson(request, { success: true, counts });
}
__name(listAppDownloads, "listAppDownloads");
async function recordAppDownload(request, env, app) {
  if (!APP_DOWNLOADS.has(app)) return appJson(request, { success: false, error: "\u1EE8ng d\u1EE5ng kh\xF4ng h\u1EE3p l\u1EC7." }, 404);
  if (request.headers.get("Origin") !== APP_ORIGIN) return appJson(request, { success: false, error: "Ngu\u1ED3n y\xEAu c\u1EA7u kh\xF4ng h\u1EE3p l\u1EC7." }, 403);
  const body = await readJson(request), visitorId = String(body?.visitorId || "").trim();
  if (!/^[a-zA-Z0-9-]{16,128}$/.test(visitorId)) return appJson(request, { success: false, error: "M\xE3 thi\u1EBFt b\u1ECB kh\xF4ng h\u1EE3p l\u1EC7." }, 400);
  const ip = request.headers.get("CF-Connecting-IP") || "", userAgent = (request.headers.get("User-Agent") || "").slice(0, 200);
  const visitorHash = await sha256(visitorId + "|" + ip + "|" + userAgent), now = Math.floor(Date.now() / 1e3), cutoff = now - APP_DEDUPE_SECONDS;
  const batch = await env.DB.batch([
    env.DB.prepare("DELETE FROM app_download_dedupe WHERE app=? AND visitor_hash=? AND counted_at<=?").bind(app, visitorHash, cutoff),
    env.DB.prepare("INSERT OR IGNORE INTO app_download_dedupe(app,visitor_hash,counted_at) VALUES(?,?,?)").bind(app, visitorHash, now)
  ]);
  const counted = batch[1].meta.changes === 1;
  if (counted) await env.DB.prepare("INSERT INTO app_download_counts(app,count,updated_at) VALUES(?,1,?) ON CONFLICT(app) DO UPDATE SET count=count+1,updated_at=excluded.updated_at").bind(app, now).run();
  const count = Number(await env.DB.prepare("SELECT count FROM app_download_counts WHERE app=?").bind(app).first("count")) || 0;
  return appJson(request, { success: true, app, count, counted, retryAfterSeconds: counted ? APP_DEDUPE_SECONDS : Math.max(0, APP_DEDUPE_SECONDS - (now - Number(await env.DB.prepare("SELECT counted_at FROM app_download_dedupe WHERE app=? AND visitor_hash=?").bind(app, visitorHash).first("counted_at")))) });
}
__name(recordAppDownload, "recordAppDownload");
function appPreflight() {
  const headers = appCorsHeaders();
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(null, { status: 204, headers });
}
__name(appPreflight, "appPreflight");
function appCorsHeaders() {
  const headers = secureHeaders("application/json; charset=utf-8");
  headers.set("Access-Control-Allow-Origin", APP_ORIGIN);
  headers.set("Vary", "Origin");
  return headers;
}
__name(appCorsHeaders, "appCorsHeaders");
function appJson(request, value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: appCorsHeaders(request) });
}
__name(appJson, "appJson");
async function listLicenses(env) {
  const result = await env.DB.prepare(`SELECT code_hash,customer_name,active,downloads,max_downloads,expires_at,created_at,last_download_at FROM licenses ORDER BY created_at DESC`).all();
  return json({ success: true, licenses: result.results || [] });
}
__name(listLicenses, "listLicenses");
async function createLicense(request, env) {
  const body = await readJson(request);
  if (!body) return json({ success: false, error: "D\u1EEF li\u1EC7u g\u1EEDi l\xEAn kh\xF4ng h\u1EE3p l\u1EC7." }, 400);
  const customerName = String(body.customerName || "").trim(), maxDownloads = Number(body.maxDownloads), expiresAt = expiryToUnix(String(body.expiresDate || DEFAULT_EXPIRY));
  if (!customerName || customerName.length > 100) return json({ success: false, error: "T\xEAn kh\xE1ch ph\u1EA3i c\xF3 t\u1EEB 1 \u0111\u1EBFn 100 k\xFD t\u1EF1." }, 400);
  if (!Number.isInteger(maxDownloads) || maxDownloads < 1 || maxDownloads > 1e4) return json({ success: false, error: "S\u1ED1 l\u01B0\u1EE3t t\u1EA3i ph\u1EA3i t\u1EEB 1 \u0111\u1EBFn 10.000." }, 400);
  if (!expiresAt) return json({ success: false, error: "Ng\xE0y h\u1EBFt h\u1EA1n kh\xF4ng h\u1EE3p l\u1EC7." }, 400);
  const now = Math.floor(Date.now() / 1e3);
  for (let attempt = 0; attempt < 3; attempt++) {
    const activationCode = generateCode(), codeHash = await sha256(activationCode);
    try {
      await env.DB.prepare(`INSERT INTO licenses(code_hash,customer_name,active,downloads,max_downloads,expires_at,created_at) VALUES(?,?,1,0,?,?,?)`).bind(codeHash, customerName, maxDownloads, expiresAt, now).run();
      return json({ success: true, activationCode, message: "\u0110\xE3 t\u1EA1o m\xE3 th\xE0nh c\xF4ng." }, 201);
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
}
__name(createLicense, "createLicense");
async function updateLicense(request, env) {
  const body = await readJson(request);
  if (!body) return json({ success: false, error: "D\u1EEF li\u1EC7u g\u1EEDi l\xEAn kh\xF4ng h\u1EE3p l\u1EC7." }, 400);
  const codeHash = String(body.codeHash || "").toLowerCase(), action = String(body.action || "");
  if (!/^[a-f0-9]{64}$/.test(codeHash)) return json({ success: false, error: "M\xE3 \u0111\u1ECBnh danh kh\xF4ng h\u1EE3p l\u1EC7." }, 400);
  let statement;
  if (action === "reset") statement = env.DB.prepare("UPDATE licenses SET downloads=0,last_download_at=NULL WHERE code_hash=?").bind(codeHash);
  else if (action === "toggle") statement = env.DB.prepare("UPDATE licenses SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE code_hash=?").bind(codeHash);
  else if (action === "update") {
    const maxDownloads = Number(body.maxDownloads), expiresAt = expiryToUnix(String(body.expiresDate || ""));
    if (!Number.isInteger(maxDownloads) || maxDownloads < 1 || maxDownloads > 1e4 || !expiresAt) return json({ success: false, error: "S\u1ED1 l\u01B0\u1EE3t ho\u1EB7c ng\xE0y h\u1EBFt h\u1EA1n kh\xF4ng h\u1EE3p l\u1EC7." }, 400);
    statement = env.DB.prepare("UPDATE licenses SET max_downloads=?,expires_at=? WHERE code_hash=?").bind(maxDownloads, expiresAt, codeHash);
  } else return json({ success: false, error: "Thao t\xE1c kh\xF4ng h\u1EE3p l\u1EC7." }, 400);
  const result = await statement.run();
  if (result.meta.changes !== 1) return json({ success: false, error: "Kh\xF4ng t\xECm th\u1EA5y m\xE3." }, 404);
  return json({ success: true, message: "\u0110\xE3 c\u1EADp nh\u1EADt th\xE0nh c\xF4ng." });
}
__name(updateLicense, "updateLicense");
async function isAdmin(request, env) {
  if (!env.ADMIN_KEY) return false;
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return false;
  const supplied = header.slice(7);
  if (!supplied || supplied.length > 512) return false;
  const [a, b] = await Promise.all([sha256Bytes(supplied), sha256Bytes(String(env.ADMIN_KEY))]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
__name(isAdmin, "isAdmin");
function unauthorized() {
  return json({ success: false, error: "M\u1EADt kh\u1EA9u qu\u1EA3n tr\u1ECB kh\xF4ng \u0111\xFAng." }, 401);
}
__name(unauthorized, "unauthorized");
function generateCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let value = "";
  for (const byte of bytes) value += alphabet[byte % alphabet.length];
  return `TV-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
}
__name(generateCode, "generateCode");
function expiryToUnix(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const millis = Date.parse(`${date}T23:59:59${VIETNAM_OFFSET}`);
  if (!Number.isFinite(millis)) return null;
  const normalized = new Date(millis + 7 * 36e5).toISOString().slice(0, 10);
  return normalized === date ? Math.floor(millis / 1e3) : null;
}
__name(expiryToUnix, "expiryToUnix");
async function readJson(request) {
  if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
}
__name(readJson, "readJson");
async function refundDownload(env, codeHash) {
  await env.DB.prepare("UPDATE licenses SET downloads=CASE WHEN downloads>0 THEN downloads-1 ELSE 0 END WHERE code_hash=?").bind(codeHash).run();
}
__name(refundDownload, "refundDownload");
async function sha256(value) {
  return [...await sha256Bytes(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
async function sha256Bytes(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
__name(sha256Bytes, "sha256Bytes");
function secureHeaders(type) {
  const h = new Headers({ "Content-Type": type, "Cache-Control": "private, no-store, no-cache, must-revalidate", Pragma: "no-cache", Expires: "0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" });
  return h;
}
__name(secureHeaders, "secureHeaders");
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: secureHeaders("application/json; charset=utf-8") });
}
__name(json, "json");
function adminPage() {
  const h = secureHeaders("text/html; charset=utf-8");
  h.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  return new Response(ADMIN_HTML, { headers: h });
}
__name(adminPage, "adminPage");
var ADMIN_HTML = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#07101f"><title>Qu\u1EA3n l\xFD m\xE3 TV</title><style>
:root{color-scheme:dark;--bg:#07101f;--card:#101b2e;--line:#293852;--text:#eef4ff;--muted:#9fb0cb;--blue:#2563eb}*{box-sizing:border-box}body{margin:0;background:linear-gradient(145deg,#07101f,#0b1730);color:var(--text);font:15px system-ui,-apple-system,sans-serif;min-height:100vh}main{width:min(920px,100%);margin:auto;padding:20px 14px 60px}.top,.row{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.top{justify-content:space-between;margin-bottom:18px}h1{font-size:24px;margin:0}h2{font-size:18px}.sub,.meta{color:var(--muted);font-size:13px}.card{background:#101b2ef5;border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:14px;box-shadow:0 12px 30px #0004}.grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px}@media(max-width:650px){.grid{grid-template-columns:1fr}}label{display:block;color:var(--muted);font-size:12px;margin:0 0 6px}input,button{border-radius:10px;border:1px solid var(--line);font:inherit}input{width:100%;background:#0a1426;color:var(--text);padding:12px}button{padding:10px 12px;color:#fff;background:#1a2941;font-weight:650;cursor:pointer}button.primary{background:var(--blue)}button.green{background:#15803d}button.red{background:#991b1b}button.small{font-size:12px;padding:8px 10px}.hidden{display:none!important}#message{padding:11px;border-radius:10px;margin:12px 0}.ok{background:#123b26}.error{background:#471b23}.code{font:700 20px ui-monospace,monospace;background:#081323;border:1px dashed #4b638a;padding:14px;border-radius:10px;margin:10px 0}.license{padding:14px 0;border-top:1px solid var(--line)}.license:first-child{border:0}.name{font-size:17px;font-weight:700}.meta{line-height:1.7;margin:5px 0 9px}.badge{border-radius:999px;padding:3px 8px;font-size:11px;font-weight:700}.active{background:#143c27;color:#86efac}.inactive{background:#481d25;color:#fda4af}.expired{background:#49351a;color:#fcd34d}dialog{width:min(440px,calc(100% - 24px));background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:15px;padding:18px}dialog::backdrop{background:#000a}
</style></head><body><main><div class="top"><div><h1>Qu\u1EA3n l\xFD m\xE3 TV</h1><div class="sub">T\u1EA1o m\xE3 v\xE0 qu\u1EA3n l\xFD l\u01B0\u1EE3t t\u1EA3i tr\xEAn \u0111i\u1EC7n tho\u1EA1i</div></div><button id="logout" class="small red hidden">\u0110\u0103ng xu\u1EA5t</button></div>
<section id="loginCard" class="card"><h2>\u0110\u0103ng nh\u1EADp qu\u1EA3n tr\u1ECB</h2><label for="adminKey">M\u1EADt kh\u1EA9u Admin</label><div class="row"><input id="adminKey" type="password" autocomplete="current-password" placeholder="Nh\u1EADp m\u1EADt kh\u1EA9u qu\u1EA3n tr\u1ECB"><button id="login" class="primary">\u0110\u0103ng nh\u1EADp</button></div></section>
<div id="app" class="hidden"><section class="card"><h2>T\u1EA1o m\xE3 m\u1EDBi</h2><div class="grid"><div><label for="customer">T\xEAn kh\xE1ch h\xE0ng</label><input id="customer" maxlength="100" placeholder="V\xED d\u1EE5: Nguy\u1EC5n V\u0103n A"></div><div><label for="maxDownloads">S\u1ED1 l\u01B0\u1EE3t t\u1EA3i</label><input id="maxDownloads" type="number" min="1" max="10000" value="10"></div><div><label for="expiresDate">Ng\xE0y h\u1EBFt h\u1EA1n</label><input id="expiresDate" type="date" value="${DEFAULT_EXPIRY}"></div></div><button id="create" class="primary" style="width:100%;margin-top:12px">T\u1EA1o m\xE3 t\u1EF1 \u0111\u1ED9ng</button><div id="newCode" class="hidden"><div class="code" id="codeValue"></div><button id="copy" class="green" style="width:100%">Sao ch\xE9p m\xE3 g\u1EEDi kh\xE1ch</button><div class="sub">M\xE3 g\u1ED1c ch\u1EC9 hi\u1EC7n \u1EDF \u0111\xE2y. H\xE3y sao ch\xE9p tr\u01B0\u1EDBc khi \u0111\xF3ng trang.</div></div></section><div id="message" class="hidden"></div><section class="card"><div class="top"><h2>Danh s\xE1ch m\xE3</h2><button id="refresh" class="small">L\xE0m m\u1EDBi</button></div><div id="licenses"><div class="sub">\u0110ang t\u1EA3i...</div></div></section></div></main>
<dialog id="editDialog"><h3>Gia h\u1EA1n / \u0111\u1ED5i s\u1ED1 l\u01B0\u1EE3t</h3><input id="editHash" type="hidden"><label for="editMax">T\u1ED5ng s\u1ED1 l\u01B0\u1EE3t t\u1EA3i</label><input id="editMax" type="number" min="1" max="10000"><br><label for="editExpiry">Ng\xE0y h\u1EBFt h\u1EA1n</label><input id="editExpiry" type="date"><div class="row" style="margin-top:14px"><button id="saveEdit" class="primary">L\u01B0u</button><button id="cancelEdit">H\u1EE7y</button></div></dialog>
<script>(()=>{const $=id=>document.getElementById(id);let key=sessionStorage.getItem('tvAdminKey')||'';const api=async(path,opt={})=>{const r=await fetch(path,{...opt,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',...(opt.headers||{})}}),data=await r.json().catch(()=>({error:'Ph\u1EA3n h\u1ED3i m\xE1y ch\u1EE7 kh\xF4ng h\u1EE3p l\u1EC7.'}));if(r.status===401)logout();if(!r.ok)throw Error(data.error||'C\xF3 l\u1ED7i x\u1EA3y ra.');return data};const msg=(text,ok=true)=>{$('message').textContent=text;$('message').className=ok?'ok':'error'};const logout=()=>{key='';sessionStorage.removeItem('tvAdminKey');$('app').classList.add('hidden');$('logout').classList.add('hidden');$('loginCard').classList.remove('hidden')};const login=async()=>{key=$('adminKey').value.trim()||key;if(!key)return;try{await load();sessionStorage.setItem('tvAdminKey',key);$('loginCard').classList.add('hidden');$('app').classList.remove('hidden');$('logout').classList.remove('hidden')}catch(e){key='';alert(e.message)}};const dateValue=s=>s?new Date((Number(s)+25200)*1000).toISOString().slice(0,10):'';const dateText=s=>{const v=dateValue(s);if(!v)return'Kh\xF4ng gi\u1EDBi h\u1EA1n';const[y,m,d]=v.split('-');return d+'/'+m+'/'+y};const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};async function load(){const data=await api('/admin/api/licenses');render(data.licenses)}function render(items){const root=$('licenses');root.replaceChildren();if(!items.length){root.append(el('div','Ch\u01B0a c\xF3 m\xE3 n\xE0o.','sub'));return}for(const item of items){const box=el('div',undefined,'license'),top=el('div',undefined,'top'),name=el('div',item.customer_name,'name'),expired=item.expires_at&&Number(item.expires_at)<Date.now()/1000,badge=el('span',expired?'H\u1EBFt h\u1EA1n':item.active?'Ho\u1EA1t \u0111\u1ED9ng':'\u0110\xE3 kh\xF3a','badge '+(expired?'expired':item.active?'active':'inactive'));top.append(name,badge);box.append(top,el('div','\u0110\xE3 d\xF9ng: '+item.downloads+'/'+item.max_downloads+' \u2022 H\u1EBFt h\u1EA1n: '+dateText(item.expires_at)+' \u2022 ID: '+item.code_hash.slice(0,10)+'\u2026','meta'));const actions=el('div',undefined,'row'),reset=el('button','\u0110\u1EB7t l\u1EA1i l\u01B0\u1EE3t','small'),toggle=el('button',item.active?'Kh\xF3a m\xE3':'M\u1EDF m\xE3','small '+(item.active?'red':'green')),edit=el('button','Gia h\u1EA1n / s\u1EEDa l\u01B0\u1EE3t','small');reset.onclick=()=>act(item.code_hash,'reset','\u0110\xE3 \u0111\u1EB7t l\u01B0\u1EE3t v\u1EC1 0.');toggle.onclick=()=>act(item.code_hash,'toggle','\u0110\xE3 \u0111\u1ED5i tr\u1EA1ng th\xE1i.');edit.onclick=()=>{$('editHash').value=item.code_hash;$('editMax').value=item.max_downloads;$('editExpiry').value=dateValue(item.expires_at);$('editDialog').showModal()};actions.append(reset,toggle,edit);box.append(actions);root.append(box)}}async function act(codeHash,action,success){try{await api('/admin/api/licenses/action',{method:'POST',body:JSON.stringify({codeHash,action})});msg(success);await load()}catch(e){msg(e.message,false)}}$('login').onclick=login;$('adminKey').onkeydown=e=>{if(e.key==='Enter')login()};$('logout').onclick=logout;$('refresh').onclick=()=>load().catch(e=>msg(e.message,false));$('create').onclick=async()=>{const b=$('create');b.disabled=true;try{const data=await api('/admin/api/licenses',{method:'POST',body:JSON.stringify({customerName:$('customer').value,maxDownloads:Number($('maxDownloads').value),expiresDate:$('expiresDate').value})});$('codeValue').textContent=data.activationCode;$('newCode').classList.remove('hidden');msg('\u0110\xE3 t\u1EA1o m\xE3 m\u1EDBi. H\xE3y sao ch\xE9p v\xE0 g\u1EEDi kh\xE1ch.');$('customer').value='';await load()}catch(e){msg(e.message,false)}finally{b.disabled=false}};$('copy').onclick=async()=>{await navigator.clipboard.writeText($('codeValue').textContent);msg('\u0110\xE3 sao ch\xE9p m\xE3.')};$('cancelEdit').onclick=()=>$('editDialog').close();$('saveEdit').onclick=async()=>{try{await api('/admin/api/licenses/action',{method:'POST',body:JSON.stringify({codeHash:$('editHash').value,action:'update',maxDownloads:Number($('editMax').value),expiresDate:$('editExpiry').value})});$('editDialog').close();msg('\u0110\xE3 c\u1EADp nh\u1EADt.');await load()}catch(e){msg(e.message,false)}};if(key)login()})();<\/script></body></html>`;
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
