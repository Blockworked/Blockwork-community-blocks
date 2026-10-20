// Server-rendered HTML. Every value goes through esc().

import type { User } from "./auth.ts";
import { PROVIDERS } from "./auth.ts";
import { CAPABILITIES } from "./packs.ts";

export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const STYLE = `
:root { color-scheme: light dark; --bg: #fafafa; --fg: #1d1d1f; --muted: #6e6e73; --card: #fff; --line: #e3e3e8; --accent: #4c6ef5; --warn: #c2410c; }
@media (prefers-color-scheme: dark) { :root { --bg: #161618; --fg: #ececf0; --muted: #9a9aa2; --card: #1f1f23; --line: #2e2e34; --accent: #7c93ff; --warn: #fb923c; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
header, main { max-width: 860px; margin: 0 auto; padding: 16px; }
header { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid var(--line); }
header a.home { font-weight: 600; color: var(--fg); text-decoration: none; margin-right: auto; }
a { color: var(--accent); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 12px 0; }
.muted { color: var(--muted); }
.risky { color: var(--warn); font-weight: 600; }
.tag { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 0 8px; font-size: 13px; margin: 2px 4px 2px 0; }
button, .button { font: inherit; padding: 6px 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--fg); cursor: pointer; text-decoration: none; display: inline-block; }
button.primary, .button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
form.inline { display: inline; }
input[type=text] { font: inherit; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); width: min(100%, 360px); }
pre { overflow: auto; max-height: 480px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 10px; font-size: 13px; }
img.avatar { width: 24px; height: 24px; border-radius: 50%; vertical-align: middle; }
`;

export function page(title: string, user: User | null, admin: boolean, body: string, status = 200): Response {
  const nav = user
    ? `<a href="/submit">Submit a pack</a><a href="/me">My packs</a>${admin ? `<a href="/admin">Review</a>` : ""}
       <span>${user.avatar ? `<img class="avatar" src="${esc(user.avatar)}" alt="">` : ""} ${esc(user.name)}</span>
       <form class="inline" method="post" action="/auth/logout"><button>Sign out</button></form>`
    : `<a href="/login">Sign in</a>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - Blockwork blocks</title><style>${STYLE}</style></head>
<body><header><a class="home" href="/">Blockwork community blocks</a>${nav}</header><main>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export function capabilityList(kinds: string[]): string {
  if (!kinds.length) return `<p class="muted">Doesn't use any blocks that need permission.</p>`;
  const items = CAPABILITIES.filter(([k]) => kinds.includes(k)).map(
    ([, label, risky]) => `<li${risky ? ` class="risky"` : ""}>${esc(label)}</li>`,
  );
  return `<ul>${items.join("")}</ul>`;
}

export function blockTags(blocks: string[]): string {
  return blocks.map((b) => `<span class="tag">${esc(b)}</span>`).join("");
}

export function loginPage(user: User | null, next: string): Response {
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  const buttons = Object.entries(PROVIDERS)
    .map(([id, name]) => `<p><a class="button" href="/auth/${id}/login${q}">Sign in with ${esc(name)}</a></p>`)
    .join("");
  return page("Sign in", user, false, `<h1>Sign in</h1><p>An account is needed to submit packs. Browsing doesn't need one.</p>${buttons}`);
}

export function message(user: User | null, admin: boolean, title: string, text: string, status = 200): Response {
  return page(title, user, admin, `<h1>${esc(title)}</h1><p>${esc(text)}</p>`, status);
}
