// Styles for the browse, pack, source and comment pages (browse.ts, source.ts,
// comments.ts). Kept apart from pages.ts, which imports this, so the two
// don't import each other.

export const BROWSE_CSS = `
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.pill { display: inline-block; padding: 1px 7px; border-radius: 999px; background: rgba(var(--accent-rgb), 0.16); color: var(--accent); font-size: 11px; font-weight: 600; vertical-align: 1px; }
.n { display: inline-block; min-width: 20px; padding: 0 6px; border-radius: 999px; background: var(--bg3); color: var(--muted); font-size: 12px; font-weight: 600; text-align: center; vertical-align: 2px; }
a.author { color: inherit; font-weight: 600; }
.crumbs { margin: 0 0 10px; font-size: 13px; }
.crumbs a::before { content: "← "; }

/* Search and filters. */
.filters { display: flex; flex-direction: column; gap: 10px; margin: 0 0 8px; }
.search { position: relative; }
.search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
.search input { width: 100%; font: inherit; font-size: 15px; padding: 10px 12px 10px 36px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg2); color: var(--fg); }
.search input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.28); }
.filter-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
select { font: inherit; font-size: 13px; min-height: 32px; padding: 0 28px 0 10px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--bg2); color: var(--fg); max-width: 100%;
  appearance: none; background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%);
  background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50%; background-size: 5px 5px; background-repeat: no-repeat; }
label.check { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; padding: 0 4px; cursor: pointer; }
input[type=checkbox] { accent-color: var(--accent); width: 15px; height: 15px; margin: 0; }
.filter-row button { margin-left: auto; }
.results { font-size: 13px; margin: 14px 0 4px; }
.empty { text-align: center; padding: 40px 0; color: var(--muted); }

/* Pack cards in the list. */
.pack-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.pack-head h3 a { color: var(--fg); }
.count { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); font-size: 13px; }
.count:hover { color: var(--fg); text-decoration: none; }

/* A pack's page. */
.pack-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.pack-title h1 { margin-bottom: 4px; }
.pack-title .actions { margin: 6px 0 0; display: flex; gap: 8px; }
.tabs { display: flex; gap: 2px; margin: 18px 0 22px; border-bottom: 1px solid var(--glass-border); overflow-x: auto; }
.tabs a { padding: 8px 12px; color: var(--muted); font-size: 14px; font-weight: 600; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
.tabs a:hover { color: var(--fg); text-decoration: none; }
.tabs a[aria-current] { color: var(--fg); border-bottom-color: var(--accent); }
.tabs.small { margin: 0 0 16px; }
.tabs.small a { font-size: 13px; padding: 6px 10px; }
.tabs .end { margin-left: auto; font-weight: 500; }
.lede { font-size: 17px; line-height: 1.6; max-width: 65ch; }
.hint { font-size: 13px; color: var(--muted); }
.block-list { list-style: none; padding: 0; margin: 0; }
.block-item { padding: 14px 0; border-bottom: 1px solid var(--glass-border); }
.block-item:last-child { border-bottom: 0; }
.block-item p { margin: 6px 0; max-width: 70ch; }
.block-name { display: flex; align-items: center; gap: 8px; }
.block-name .blk, .source-head .blk { margin: 0; }
.kind { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.see-how { font-size: 13px; }
dl.inputs { margin: 8px 0; display: grid; gap: 2px; font-size: 13px; }
dl.inputs div { display: flex; gap: 8px; }
dl.inputs dt { font-weight: 600; min-width: 90px; }
dl.inputs dd { margin: 0; color: var(--muted); }
dl.inputs code { font-size: 12px; color: var(--fg); }
ul.versions { list-style: none; padding: 0; margin: 0; font-size: 14px; }
ul.versions li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; padding: 6px 0; }
ul.versions .v { font-weight: 600; }
ul.versions .links { margin-left: auto; font-size: 13px; }

/* Author pages. */
.profile { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.profile h1 { margin: 0; }
.profile p { margin: 4px 0 0; }
img.avatar.large { width: 64px; height: 64px; }

/* Source: block bodies drawn like the editor's canvas, and the pack file. */
.toc { display: flex; flex-wrap: wrap; gap: 6px 14px; list-style: none; padding: 0; margin: 0 0 8px; font-size: 13px; }
.source-block { margin: 18px 0 30px; scroll-margin-top: 80px; }
.source-head { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.source-block > p { max-width: 70ch; }
.canvas { overflow-x: auto; padding: 18px; border-radius: var(--radius-lg); border: 1px solid var(--glass-border);
  background-color: var(--bg2); background-image: radial-gradient(circle, var(--glass-border) 1px, transparent 1px); background-size: 20px 20px; }
/* Bodies use the same .blk shapes as every other block on the site (pages.ts);
   these rules stack them, fill C blocks' mouths and shrink reporters in slots. */
.src { display: inline-block; min-width: max-content; color: var(--blk-text); }
.src-stack { display: flex; flex-direction: column; align-items: flex-start; }
.src-stack > .blk { margin: 0; }
.src-stack > .blk + .blk { margin-top: -8px; }
.src .blk { max-width: none; }
.src .blk-row { flex-wrap: nowrap; }
.src .ico.accent { color: var(--accent); }
.blk.hat { padding-bottom: 8px; }
.blk.hat > .blk-row { border-top-left-radius: 12px; border-top-right-radius: 12px; }
.blk-mouth.filled { width: auto; height: auto; min-height: 24px; margin: -1.3px 0; padding: 0 0 0 20px; background: none; border: 0; }
.blk-mouth.filled::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 20px; box-sizing: border-box;
  background: var(--blk); border: 1.3px solid var(--blk-line); border-width: 0 1.3px; }
.blk-mouth.filled > .src-stack { position: relative; z-index: 1; padding: 1.3px 0; }
.blk.wrap > .blk-row.foot:not(:last-of-type) { border-radius: 0 5px 5px 0; }
.src .blk.reporter, .src .blk.boolean { vertical-align: middle; }
.src .blk.reporter > .blk-row { min-height: 26px; padding: 2px 10px; gap: 5px 6px; }
.src .blk.boolean { --h: 13px; }
.src .blk.boolean > .blk-row { min-height: 25px; padding-top: 2px; padding-bottom: 2px; gap: 5px 6px; }
.src .blk-row > .blk { margin: 0; }
.slot-tag { margin-right: 7px; font-size: 10px; font-weight: 600; letter-spacing: 0.04em; color: var(--blk-dim); }
.slot.dd { gap: 4px; font-weight: 400; }
.slot.dd svg, .slot.btn svg { flex: none; color: var(--blk-dim); }
.slot.btn { gap: 5px; }
.src .slot { white-space: pre; max-width: 360px; overflow: hidden; text-overflow: ellipsis; }

pre.code { max-height: 640px; counter-reset: line; padding-left: 0; }
pre.code .ln { display: block; padding-left: 56px; position: relative; }
pre.code .ln::before { counter-increment: line; content: counter(line); position: absolute; left: 0; width: 40px; text-align: right; color: var(--muted); opacity: 0.6; user-select: none; }
.j-key { color: var(--accent-light); }
.j-str { color: #e5a76b; }
.j-num { color: #b48ead; }
.j-lit { color: #59c059; }
:root[data-theme="light"] .j-str { color: #a0522d; }
:root[data-theme="light"] .j-key { color: #0060b8; }
@media (prefers-color-scheme: light) { :root:not([data-theme]) .j-str { color: #a0522d; } :root:not([data-theme]) .j-key { color: #0060b8; } }

/* Comments. */
.comments { margin-top: 40px; scroll-margin-top: 80px; }
.comment-list { list-style: none; padding: 0; margin: 0 0 18px; }
.comment { display: flex; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--glass-border); scroll-margin-top: 80px; }
.comment:target { background: rgba(var(--accent-rgb), 0.08); border-radius: var(--radius); }
.comment .avatar { width: 32px; height: 32px; flex-shrink: 0; }
.avatar.blank { display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--bg3); color: var(--muted); font-weight: 700; font-size: 14px; }
.comment-main { min-width: 0; flex: 1; }
.comment-meta { display: flex; min-height: 24px; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin: 0; font-size: 13px; }
.comment-meta strong a { color: var(--fg); }
.comment-meta form { margin-left: auto; }
.comment-body { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
button.small { min-height: 24px; padding: 0 8px; font-size: 12px; }
.comment-form textarea { display: block; width: 100%; font: inherit; font-size: 14px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--bg2); color: var(--fg); resize: vertical; min-height: 96px; }
.form-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 13px; }

@media (max-width: 560px) {
  .filter-row button { margin-left: 0; width: 100%; }
  .filter-row label:not(.check), .filter-row select { width: 100%; }
  ul.versions .links { margin-left: 0; width: 100%; }
}
`;
