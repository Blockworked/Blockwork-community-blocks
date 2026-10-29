// Comments on a pack's page. Anyone signed in can post; the writer, the pack's
// owner and admins can delete one.

import type { User } from "./auth.ts";
import type { Env } from "./index.ts";
import { esc, message, verifiedBadge } from "./pages.ts";
import { OFFICIAL_OWNER } from "./packs.ts";
import { date, type ListedPack } from "./browse.ts";

export const MAX_COMMENT = 2000;
const BURST = 5;
const BURST_MS = 10 * 60_000;

interface CommentRow {
  id: number;
  user_id: string;
  body: string;
  created_at: number;
  name: string;
  avatar: string;
  public_id: string | null;
}

/** Trims a comment and says why it can't be posted, if it can't. */
export function checkComment(raw: string): { body: string } | { error: string } {
  const body = raw.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!body) return { error: "Write something first." };
  if (body.length > MAX_COMMENT) return { error: `Comments can be up to ${MAX_COMMENT} characters.` };
  return { body };
}

/** The comment's text with web addresses made into links. Everything else is escaped. */
export function commentHtml(body: string): string {
  let out = "";
  let last = 0;
  for (const m of body.matchAll(/https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g)) {
    out += esc(body.slice(last, m.index));
    out += `<a href="${esc(m[0])}" rel="nofollow ugc noopener" target="_blank">${esc(m[0])}</a>`;
    last = m.index! + m[0].length;
  }
  return out + esc(body.slice(last));
}

function canDelete(user: User | null, admin: boolean, ownerId: string, c: { user_id: string }): boolean {
  return !!user && (admin || user.id === c.user_id || user.id === ownerId);
}

export async function commentsSection(env: Env, user: User | null, admin: boolean, p: ListedPack, error = "", draft = ""): Promise<string> {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.user_id, c.body, c.created_at, u.name, u.avatar, u.public_id FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.pack_id = ? AND c.deleted_at IS NULL AND u.banned = 0 ORDER BY c.created_at LIMIT 500`,
  )
    .bind(p.pack_id)
    .all<CommentRow>();
  const action = `/packs/${encodeURIComponent(p.pack_id)}/comments`;
  const items = results
    .map((c) => {
      const who = `${esc(c.name)}${c.user_id === OFFICIAL_OWNER ? verifiedBadge() : ""}`;
      const name = c.public_id ? `<a href="/authors/${encodeURIComponent(c.public_id)}">${who}</a>` : who;
      const badge = c.user_id === p.owner_id ? ` <span class="pill">author</span>` : "";
      const del = canDelete(user, admin, p.owner_id, c)
        ? `<form class="inline" method="post" action="/comments/${c.id}/delete"><button class="ghost small" title="Delete this comment">Delete</button></form>`
        : "";
      return `<li class="comment" id="comment-${c.id}">
        ${c.avatar ? `<img class="avatar" src="${esc(c.avatar)}" alt="">` : `<span class="avatar blank" aria-hidden="true">${esc(c.name.slice(0, 1).toUpperCase())}</span>`}
        <div class="comment-main"><div class="comment-meta"><strong>${name}</strong>${badge}
          <a class="muted" href="#comment-${c.id}">${date(c.created_at)}</a>${del}</div>
        <p class="comment-body">${commentHtml(c.body)}</p></div></li>`;
    })
    .join("");
  let form: string;
  if (!user) {
    form = `<p class="muted"><a href="/login?next=${encodeURIComponent(`/packs/${p.pack_id}#comments`)}">Sign in</a> to comment.</p>`;
  } else if (user.banned) {
    form = `<p class="muted">This account can't comment.</p>`;
  } else {
    form = `<form class="comment-form" method="post" action="${action}">
      ${error ? `<p class="risky">${esc(error)}</p>` : ""}
      <label class="sr" for="comment">Comment</label>
      <textarea id="comment" name="body" rows="4" maxlength="${MAX_COMMENT}" required placeholder="Ask a question, share how you use it, or report a problem">${esc(draft)}</textarea>
      <p class="form-foot"><span class="muted">Plain text. Links work. Be kind.</span><button class="primary">Post comment</button></p></form>`;
  }
  return `<section class="comments" id="comments"><h2>Comments <span class="n">${results.length}</span></h2>
    ${items ? `<ol class="comment-list">${items}</ol>` : `<p class="muted">No comments yet.</p>`}${form}</section>`;
}

export async function postComment(req: Request, env: Env, user: User, admin: boolean, packId: string, render: (error: string, draft: string) => Promise<Response>): Promise<Response> {
  const pack = await env.DB.prepare("SELECT 1 FROM packs p JOIN users u ON u.id = p.owner_id WHERE p.id = ? AND p.listed = 1 AND u.banned = 0")
    .bind(packId)
    .first();
  if (!pack) return message(user, admin, "Not found", "That pack isn't in the library.", 404);
  const raw = String((await req.formData()).get("body") ?? "");
  if (user.banned) return render("This account can't comment.", raw);
  const checked = checkComment(raw);
  if ("error" in checked) return render(checked.error, raw);
  const now = Date.now();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE user_id = ? AND created_at > ?")
    .bind(user.id, now - BURST_MS)
    .first<{ n: number }>();
  if (!admin && (recent?.n ?? 0) >= BURST) return render("That's a lot of comments in a few minutes. Try again shortly.", raw);
  const row = await env.DB.prepare("INSERT INTO comments (pack_id, user_id, body, created_at) VALUES (?, ?, ?, ?) RETURNING id")
    .bind(packId, user.id, checked.body, now)
    .first<{ id: number }>();
  return new Response(null, { status: 303, headers: { Location: `/packs/${encodeURIComponent(packId)}#comment-${row?.id ?? ""}` } });
}

export async function deleteComment(env: Env, user: User, admin: boolean, id: number): Promise<Response> {
  const c = await env.DB.prepare("SELECT c.user_id, c.pack_id, p.owner_id FROM comments c JOIN packs p ON p.id = c.pack_id WHERE c.id = ? AND c.deleted_at IS NULL")
    .bind(id)
    .first<{ user_id: string; pack_id: string; owner_id: string }>();
  if (!c || !canDelete(user, admin, c.owner_id, c)) return message(user, admin, "Not found", "That comment doesn't exist.", 404);
  await env.DB.prepare("UPDATE comments SET deleted_at = ? WHERE id = ?").bind(Date.now(), id).run();
  return new Response(null, { status: 303, headers: { Location: `/packs/${encodeURIComponent(c.pack_id)}#comments` } });
}
