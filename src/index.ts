// The Blockwork community block library: serves index.json and the pack files
// Blockwork downloads, and takes reviewed submissions from signed-in accounts.

import { callback, currentUser, isAdmin, login, logout, PROVIDERS, type Provider, type User } from "./auth.ts";
import { capabilityList, esc, loginPage, message, page, verifiedBadge } from "./pages.ts";
import { authorPage, home, packPage, published, sourcePage, sourceView, withBlockViews, type VersionRow } from "./browse.ts";
import { deleteComment, postComment } from "./comments.ts";
import { blockPictures, BROWSE_JS, renderFile, rendersPage, saveRenders, viewerUrl } from "./renders.ts";
import { OFFICIAL_OWNER, readPack, sha256Hex } from "./packs.ts";
import { FAVICON_PNG, LOGO_PNG } from "./logo.ts";
import { setMainSite, SITE_JS } from "./site-nav.ts";

export interface Env {
  DB: D1Database;
  PACKS: R2Bucket;
  SITE_URL: string;
  /** blockworked.com, which the shared top nav links to. */
  MAIN_SITE_URL?: string;
  LIBRARY_NAME: string;
  /** Comma-separated account ids, like "github:123". */
  ADMINS: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

const MAX_PENDING = 5;
const MAX_PER_DAY = 20;

function securityHeaders(env: Env): Record<string, string> {
  // The pack viewer is Blockwork's editor on blockworked.com (renders.ts).
  const viewer = new URL(viewerUrl(env)).origin;
  return {
    "Content-Security-Policy":
      `default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' https:; connect-src 'self'; frame-src ${viewer}; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    setMainSite(env.MAIN_SITE_URL);
    let res: Response;
    try {
      res = await route(req, env);
    } catch (e) {
      console.error(e);
      res = message(null, false, "Something went wrong", "Try again in a moment.", 500);
    }
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(securityHeaders(env))) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
};

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  // Forms only come from this site.
  if (method === "POST" && req.headers.get("Origin") !== new URL(env.SITE_URL).origin) {
    return new Response("Cross-site request refused", { status: 403 });
  }
  if (method === "GET" && path === "/index.json") return indexJson(env);
  let m: RegExpMatchArray | null;
  if (method === "GET" && (m = path.match(/^\/packs\/([0-9a-f]{64})\.json$/))) return packFile(env, m[1]);
  if (method === "GET" && path === "/logo.png") return png(LOGO_PNG);
  if (method === "GET" && path === "/favicon.png") return png(FAVICON_PNG);
  if (method === "GET" && path === "/browse.js") {
    return new Response(BROWSE_JS, {
      headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" },
    });
  }
  if (method === "GET" && path === "/site.js") {
    return new Response(SITE_JS, {
      headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" },
    });
  }

  const user = await currentUser(req, env);
  const admin = isAdmin(env, user);
  if (method === "GET" && path === "/") return home(env, user, admin, url.searchParams);
  if (method === "GET" && (m = path.match(/^\/renders\/([0-9a-f]{64})\/([A-Za-z0-9_-]{1,64})\.(dark|light)\.png$/))) {
    return renderFile(env, admin, m[1], m[2], m[3]);
  }
  if ((m = path.match(/^\/packs\/([^/]{1,400})(\/source|\/comments)?$/))) {
    let id = "";
    try {
      id = decodeURIComponent(m[1]);
    } catch {}
    if (method === "GET" && !m[2]) return packPage(env, user, admin, id);
    if (method === "GET" && m[2] === "/source") return sourcePage(env, user, admin, id, url.searchParams);
    if (method === "POST" && m[2] === "/comments") {
      if (!user) return new Response(null, { status: 303, headers: { Location: `/login?next=${encodeURIComponent(`/packs/${id}#comments`)}` } });
      return postComment(req, env, user, admin, id, async (error, draft) => {
        const res = await packPage(env, user, admin, id, error, draft);
        return new Response(res.body, { status: 400, headers: res.headers });
      });
    }
  }
  if (method === "GET" && (m = path.match(/^\/authors\/([a-z0-9]{1,32})$/))) return authorPage(env, user, admin, m[1]);
  if (method === "POST" && (m = path.match(/^\/comments\/(\d+)\/delete$/))) {
    if (!user) return message(user, admin, "Not found", "That comment doesn't exist.", 404);
    return deleteComment(env, user, admin, Number(m[1]));
  }
  if (method === "GET" && path === "/login") return loginPage(user, url.searchParams.get("next") ?? "");
  if ((m = path.match(/^\/auth\/(\w+)\/(login|callback)$/)) && m[1] in PROVIDERS && method === "GET") {
    const provider = m[1] as Provider;
    return m[2] === "login" ? login(env, provider, url.searchParams.get("next")) : callback(req, env, provider);
  }
  if (method === "POST" && path === "/auth/logout") return logout(req, env);

  if (path === "/submit" || path === "/me") {
    if (!user) return new Response(null, { status: 302, headers: { Location: `/login?next=${encodeURIComponent(path)}` } });
    if (path === "/me") return myPacks(env, user, admin);
    return method === "POST" ? submit(req, env, user, admin) : submitForm(user, admin);
  }

  if (path.startsWith("/admin")) {
    if (!admin || !user) return message(user, admin, "Not found", "There's nothing here.", 404);
    if (method === "GET" && path === "/admin") return reviewQueue(env, user, admin);
    if (method === "GET" && path === "/admin/renders") return rendersPage(env, user, admin);
    if (method === "POST" && (m = path.match(/^\/admin\/versions\/(\d+)\/renders$/))) return saveRenders(req, env, Number(m[1]));
    if ((m = path.match(/^\/admin\/versions\/(\d+)$/))) {
      return method === "POST" ? reviewDecision(req, env, Number(m[1])) : reviewPage(env, user, admin, Number(m[1]), url.searchParams);
    }
    if (method === "GET" && (m = path.match(/^\/admin\/versions\/(\d+)\/file$/))) return reviewFile(env, Number(m[1]));
    if (method === "POST" && (m = path.match(/^\/admin\/packs\/([^/]+)$/))) return setListed(req, env, decodeURIComponent(m[1]));
    if (method === "POST" && (m = path.match(/^\/admin\/users\/([^/]+)$/))) return setBanned(req, env, decodeURIComponent(m[1]));
  }
  return message(user, admin, "Not found", "There's nothing here.", 404);
}

async function indexJson(env: Env): Promise<Response> {
  const packs = (await published(env)).map((v) => ({
    id: v.pack_id,
    name: v.name,
    description: v.description,
    author: v.author,
    version: v.version,
    url: `packs/${v.sha256}.json`,
    sha256: v.sha256,
    blocks: JSON.parse(v.blocks),
    // Blockwork shows a verified badge for these.
    official: v.owner_id === OFFICIAL_OWNER,
  }));
  const body = JSON.stringify({ blockwork_block_index: 1, name: env.LIBRARY_NAME, packs }, null, 2) + "\n";
  return new Response(body, {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
}

async function packFile(env: Env, sha: string): Promise<Response> {
  const ok = await env.DB.prepare(
    `SELECT 1 FROM versions v JOIN packs p ON p.id = v.pack_id
     WHERE v.sha256 = ? AND v.status = 'approved' AND p.listed = 1`,
  )
    .bind(sha)
    .first();
  const object = ok ? await env.PACKS.get(`packs/${sha}.json`) : null;
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } });
}

function png(base64: string): Response {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Response(bytes, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}

function packCard(v: VersionRow, extra = ""): string {
  return `<div class="card"><h3>${esc(v.name)} <span class="version">${esc(v.version)}</span></h3>
    <p class="muted by">by ${esc(v.author)}${v.owner_id === OFFICIAL_OWNER ? verifiedBadge() : ""}</p><p>${esc(v.description)}</p>
    ${blockPictures(v)}${capabilityList(JSON.parse(v.capabilities))}${extra}</div>`;
}

function submitForm(user: User, admin: boolean, error = ""): Response {
  return page(
    "Submit a pack",
    user,
    admin,
    `<h1>Submit a pack</h1>
     ${error ? `<p class="risky">${esc(error)}</p>` : ""}
     <ol><li>In Blockwork, right-click a custom block in the My Blocks palette and pick "Share blocks as a pack...".</li>
     <li>Upload the file here. To update a pack you've shared, upload the new version with the same id.</li></ol>
     <p>Every pack is reviewed before it's listed. Once it is, anyone can see and download it, along with your account name.
     Packs shouldn't run commands, go online, write files or read secrets unless that's plainly their purpose.</p>
     <form method="post" enctype="multipart/form-data">
       <p><input type="file" name="pack" accept=".blockpack,.json,application/json" required></p>
       <p><button class="primary">Submit for review</button></p>
     </form>`,
    error ? 400 : 200,
  );
}

async function submit(req: Request, env: Env, user: User, admin: boolean): Promise<Response> {
  if (user.banned) return submitForm(user, admin, "This account can't submit packs.");
  const now = Date.now();
  const counts = await env.DB.prepare(
    `SELECT SUM(status = 'pending') AS pending, SUM(submitted_at > ?) AS today FROM versions WHERE submitted_by = ?`,
  )
    .bind(now - 86400_000, user.id)
    .first<{ pending: number | null; today: number | null }>();
  if ((counts?.pending ?? 0) >= MAX_PENDING) return submitForm(user, admin, `You have ${MAX_PENDING} packs waiting for review. Try again once they're reviewed.`);
  if ((counts?.today ?? 0) >= MAX_PER_DAY) return submitForm(user, admin, "That's a lot of uploads for one day. Try again tomorrow.");

  const file = (await req.formData()).get("pack");
  if (!file || typeof file === "string") return submitForm(user, admin, "Pick a pack file to upload.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const meta = readPack(bytes);
  if (typeof meta === "string") return submitForm(user, admin, meta);
  const sha = await sha256Hex(bytes);

  if (await env.DB.prepare("SELECT 1 FROM versions WHERE sha256 = ?").bind(sha).first()) {
    return submitForm(user, admin, "This exact file was already submitted.");
  }
  const pack = await env.DB.prepare("SELECT owner_id, listed FROM packs WHERE id = ?").bind(meta.id).first<{ owner_id: string; listed: number }>();
  if (pack && pack.owner_id !== user.id) {
    return submitForm(user, admin, `Another account already shares a pack with the id "${meta.id}". Give yours a different id.`);
  }
  if (pack && !pack.listed) return submitForm(user, admin, "This pack was taken down, so it can't be updated.");

  await env.PACKS.put(`packs/${sha}.json`, bytes, { httpMetadata: { contentType: "application/json" } });
  const statements = [
    // A newer upload replaces one still waiting.
    env.DB.prepare(
      "UPDATE versions SET status = 'rejected', reason = 'Replaced by a newer upload', reviewed_at = ? WHERE pack_id = ? AND status = 'pending'",
    ).bind(now, meta.id),
    env.DB.prepare(
      `INSERT INTO versions (pack_id, sha256, name, description, version, blocks, block_views, capabilities, status, submitted_by, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    ).bind(meta.id, sha, meta.name, meta.description, meta.version, JSON.stringify(meta.blocks), JSON.stringify(meta.views), JSON.stringify(meta.capabilities), user.id, now),
  ];
  if (!pack) {
    statements.unshift(env.DB.prepare("INSERT INTO packs (id, owner_id, created_at) VALUES (?, ?, ?)").bind(meta.id, user.id, now));
  }
  await env.DB.batch(statements);
  return new Response(null, { status: 303, headers: { Location: "/me" } });
}

async function myPacks(env: Env, user: User, admin: boolean): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT v.*, ? AS author FROM versions v WHERE submitted_by = ? ORDER BY submitted_at DESC LIMIT 100",
  )
    .bind(user.name, user.id)
    .all<VersionRow>();
  await withBlockViews(env, results);
  const label: Record<string, string> = { pending: "Waiting for review", approved: "Listed", rejected: "Not listed" };
  const list = results
    .map((v) =>
      packCard(
        v,
        `<p class="status"><strong>${esc(label[v.status])}</strong>${v.reason ? ` - ${esc(v.reason)}` : ""}
         <span class="muted">· submitted ${esc(new Date(v.submitted_at).toISOString().slice(0, 10))}</span></p>`,
      ),
    )
    .join("");
  return page("My packs", user, admin, `<h1>My packs</h1>${list || `<p class="muted">You haven't submitted any packs.</p>`}`);
}

async function reviewQueue(env: Env, user: User, admin: boolean): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT v.*, u.name AS author FROM versions v JOIN users u ON u.id = v.submitted_by
     WHERE v.status = 'pending' ORDER BY v.submitted_at`,
  ).all<VersionRow>();
  await withBlockViews(env, results);
  const list = results.map((v) => packCard(v, `<p><a class="button primary" href="/admin/versions/${v.id}">Review</a></p>`)).join("");
  return page(
    "Review",
    user,
    admin,
    `<h1>Waiting for review</h1>${list || `<p class="muted">Nothing to review.</p>`}
     <p class="muted"><a href="/admin/renders">Draw block pictures</a> for versions that don't have them yet.</p>`,
  );
}

async function reviewPage(env: Env, user: User, admin: boolean, id: number, params: URLSearchParams): Promise<Response> {
  const v = await env.DB.prepare(
    `SELECT v.*, u.name AS author, u.banned AS banned, p.listed AS listed FROM versions v
     JOIN users u ON u.id = v.submitted_by JOIN packs p ON p.id = v.pack_id WHERE v.id = ?`,
  )
    .bind(id)
    .first<VersionRow & { banned: number; listed: number }>();
  if (!v) return message(user, admin, "Not found", "That submission doesn't exist.", 404);
  await withBlockViews(env, [v]);
  const object = await env.PACKS.get(`packs/${v.sha256}.json`);
  const base = `/admin/versions/${v.id}`;
  const source = sourceView(
    env,
    object ? await object.text() : null,
    params.get("view") === "json" ? "json" : "blocks",
    // Opening it also draws the pictures the lists show, once.
    { blocks: `${base}#file`, json: `${base}?view=json#file`, file: `${base}/file`, render: v.renders ? "" : `${base}/renders` },
    `${v.name} in Blockwork's editor`,
  );
  const previous = await env.DB.prepare(
    "SELECT version, sha256 FROM versions WHERE pack_id = ? AND status = 'approved' AND id < ? ORDER BY id DESC LIMIT 1",
  )
    .bind(v.pack_id, v.id)
    .first<{ version: string; sha256: string }>();
  const decide =
    v.status === "pending"
      ? `<form method="post"><p><input type="text" name="reason" placeholder="Reason (shown to the submitter if rejected)" maxlength="300"></p>
         <p><button class="primary" name="action" value="approve">Approve</button> <button name="action" value="reject">Reject</button></p></form>`
      : `<p><strong>${esc(v.status)}</strong>${v.reason ? ` - ${esc(v.reason)}` : ""}</p>`;
  return page(
    `Review ${v.name}`,
    user,
    admin,
    `<h1>${esc(v.name)} <span class="version">${esc(v.version)}</span></h1>
     <p class="muted">id ${esc(v.pack_id)} · by ${esc(v.author)} (${esc(v.submitted_by)}) · sha256 <span class="mono">${esc(v.sha256)}</span></p>
     <p>${previous ? `Updates the listed version ${esc(previous.version || previous.sha256.slice(0, 12))}.` : "A new pack."}</p>
     <p>${esc(v.description)}</p>${blockPictures(v)}
     <h2>What it can do</h2>${capabilityList(JSON.parse(v.capabilities))}
     <h2>Decision</h2>${decide}
     <h2 id="file">File</h2>${source}
     <h2>Moderation</h2>
     <form class="inline" method="post" action="/admin/packs/${encodeURIComponent(v.pack_id)}">
       <button name="action" value="${v.listed ? "unlist" : "list"}">${v.listed ? "Take the pack down" : "List the pack again"}</button></form>
     <form class="inline" method="post" action="/admin/users/${encodeURIComponent(v.submitted_by)}">
       <button name="action" value="${v.banned ? "unban" : "ban"}">${v.banned ? "Unban the submitter" : "Ban the submitter"}</button></form>`,
  );
}

async function reviewFile(env: Env, id: number): Promise<Response> {
  const v = await env.DB.prepare("SELECT sha256 FROM versions WHERE id = ?").bind(id).first<{ sha256: string }>();
  const object = v ? await env.PACKS.get(`packs/${v.sha256}.json`) : null;
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": "application/json" } });
}

async function reviewDecision(req: Request, env: Env, id: number): Promise<Response> {
  const form = await req.formData();
  const action = form.get("action");
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  if (action !== "approve" && action !== "reject") return new Response("Bad request", { status: 400 });
  await env.DB.prepare("UPDATE versions SET status = ?, reason = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'")
    .bind(action === "approve" ? "approved" : "rejected", action === "approve" ? "" : reason, Date.now(), id)
    .run();
  return new Response(null, { status: 303, headers: { Location: "/admin" } });
}

async function setListed(req: Request, env: Env, packId: string): Promise<Response> {
  const action = (await req.formData()).get("action");
  await env.DB.prepare("UPDATE packs SET listed = ? WHERE id = ?").bind(action === "list" ? 1 : 0, packId).run();
  return new Response(null, { status: 303, headers: { Location: "/admin" } });
}

async function setBanned(req: Request, env: Env, userId: string): Promise<Response> {
  const ban = (await req.formData()).get("action") === "ban";
  const statements = [env.DB.prepare("UPDATE users SET banned = ? WHERE id = ?").bind(ban ? 1 : 0, userId)];
  if (ban) {
    statements.push(
      env.DB.prepare("UPDATE versions SET status = 'rejected', reason = 'Account banned', reviewed_at = ? WHERE submitted_by = ? AND status = 'pending'").bind(
        Date.now(),
        userId,
      ),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    );
  }
  await env.DB.batch(statements);
  return new Response(null, { status: 303, headers: { Location: "/admin" } });
}
