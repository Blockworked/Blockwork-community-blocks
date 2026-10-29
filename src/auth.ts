// GitHub and Google sign-in, and cookie sessions backed by D1.

import type { Env } from "./index.ts";

export interface User {
  id: string;
  name: string;
  avatar: string;
  banned: number;
}

const SESSION_DAYS = 30;
export const PROVIDERS = { github: "GitHub", google: "Google" } as const;
export type Provider = keyof typeof PROVIDERS;

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function cookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("Cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function setCookie(name: string, value: string, maxAge: number, path = "/"): string {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function isAdmin(env: Env, user: User | null): boolean {
  return !!user && env.ADMINS.split(",").map((s) => s.trim()).includes(user.id);
}

/**
 * Names only the Blockworked team account may use. Compared after folding case, accents,
 * spaces and punctuation, and 0/1 lookalikes, so "Block-Work" and "BL0CKWORKED" count too.
 */
const RESERVED_NAMES = ["blockwork", "blockworked"];

export function isReservedName(name: string): boolean {
  const folded = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "l")
    .replace(/[^a-z]/g, "");
  return RESERVED_NAMES.includes(folded);
}

export async function currentUser(req: Request, env: Env): Promise<User | null> {
  const token = cookie(req, "session");
  if (!token) return null;
  return env.DB.prepare(
    "SELECT u.id, u.name, u.avatar, u.banned FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
  )
    .bind(await hash(token), Date.now())
    .first<User>()
    // Sessions from before the name was reserved stop working.
    .then((user) => (user && isReservedName(user.name) && !isAdmin(env, user) ? null : user));
}

/** Only same-site paths, so a login link can't bounce someone to another site. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

function redirectUri(env: Env, provider: Provider): string {
  return `${env.SITE_URL}/auth/${provider}/callback`;
}

export function login(env: Env, provider: Provider, next: string | null): Response {
  const state = randomToken();
  const url =
    provider === "github"
      ? new URL("https://github.com/login/oauth/authorize")
      : new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", provider === "github" ? env.GITHUB_CLIENT_ID : env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri(env, provider));
  url.searchParams.set("state", state);
  if (provider === "github") {
    url.searchParams.set("scope", "read:user");
    url.searchParams.set("allow_signup", "true");
  } else {
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid profile");
  }
  const headers = new Headers({ Location: url.toString() });
  headers.append("Set-Cookie", setCookie("oauth", `${state}.${encodeURIComponent(safeNext(next))}`, 600, "/auth"));
  return new Response(null, { status: 302, headers });
}

async function fetchProfile(env: Env, provider: Provider, code: string): Promise<{ id: string; name: string; avatar: string }> {
  if (provider === "github") {
    const token = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri(env, provider),
      }),
    }).then((r) => r.json<{ access_token?: string }>());
    if (!token.access_token) throw new Error("GitHub didn't sign you in");
    const me = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token.access_token}`, "User-Agent": "blockwork-library", Accept: "application/json" },
    }).then((r) => r.json<{ id: number; login: string; name?: string; avatar_url?: string }>());
    if (!me.id) throw new Error("GitHub didn't sign you in");
    return { id: `github:${me.id}`, name: me.name || me.login, avatar: me.avatar_url ?? "" };
  }
  const token = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(env, provider),
    }),
  }).then((r) => r.json<{ access_token?: string }>());
  if (!token.access_token) throw new Error("Google didn't sign you in");
  const me = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  }).then((r) => r.json<{ sub?: string; name?: string; picture?: string }>());
  if (!me.sub) throw new Error("Google didn't sign you in");
  return { id: `google:${me.sub}`, name: me.name || "Google user", avatar: me.picture ?? "" };
}

export async function callback(req: Request, env: Env, provider: Provider): Promise<Response> {
  const url = new URL(req.url);
  const saved = cookie(req, "oauth") ?? "";
  const dot = saved.indexOf(".");
  const state = dot > 0 ? saved.slice(0, dot) : "";
  const next = saved.slice(dot + 1);
  const code = url.searchParams.get("code");
  if (!state || !code || url.searchParams.get("state") !== state) {
    return new Response("Sign-in expired. Go back and try again.", { status: 400 });
  }
  const profile = await fetchProfile(env, provider, code);
  // Admins are exempt so a reviewer can't lock themselves out.
  if (isReservedName(profile.name) && !isAdmin(env, { id: profile.id, name: profile.name, avatar: "", banned: 0 })) {
    const where = provider === "github" ? "GitHub profile" : "Google account";
    return new Response(
      `"${profile.name}" is reserved for the Blockworked team. Change the name on your ${where} and sign in again.`,
      { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  const now = Date.now();
  // Name and avatar follow the provider; banned stays as it was.
  await env.DB.prepare(
    // public_id names the account in author page links, so provider ids stay private.
    `INSERT INTO users (id, name, avatar, created_at, public_id) VALUES (?, ?, ?, ?, lower(hex(randomblob(6))))
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar`,
  )
    .bind(profile.id, profile.name.slice(0, 80), profile.avatar, now)
    .run();
  const token = randomToken();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await hash(token), profile.id, now + SESSION_DAYS * 86400_000)
    .run();
  let target = "/";
  try {
    target = safeNext(decodeURIComponent(next));
  } catch {}
  const headers = new Headers({ Location: target });
  headers.append("Set-Cookie", setCookie("session", token, SESSION_DAYS * 86400));
  headers.append("Set-Cookie", setCookie("oauth", "", 0, "/auth"));
  return new Response(null, { status: 302, headers });
}

export async function logout(req: Request, env: Env): Promise<Response> {
  const token = cookie(req, "session");
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hash(token)).run();
  return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": setCookie("session", "", 0) } });
}
