# Blockwork community blocks

The block library Blockwork shows under My Blocks > Browse library, served
by a Cloudflare Worker. People sign in with GitHub or Google to submit
packs; every upload is reviewed before it's listed.

- `GET /index.json` lists each listed pack's newest approved version, in
  the format Blockwork reads. Each entry pins the file's SHA-256, and
  `official` marks the team account's packs (Blockwork shows a verified
  badge for them, from this library only).
- `GET /packs/<sha256>.json` serves an approved pack file.
- `/` lists packs with search (names, blocks, descriptions, authors) and
  filters for permissions, official packs and sort order, all as query
  parameters (`?q=&uses=&official=1&sort=`).
- `/packs/<id>` is a pack's page: its blocks, what they can do, its
  versions and comments. `/packs/<id>/source` draws each block's body as
  blocks or shows the pack file (`?view=json`, `?v=<sha256>` for an older
  version). `/authors/<public id>` lists one account's packs.
  The source view draws bodies with the editor's own block rows, words and
  icons, copied into `src/block-rows.ts` by `node scripts/extract-block-rows.mjs
  ../Blockwork ../blockstitch`; rerun it when the editor's blocks change.
- Signed-in accounts can comment on a pack; the writer, the pack's owner and
  admins can delete a comment.
- `/submit` takes uploads, `/me` shows their status, `/admin` is the review
  queue (approve, reject with a reason, take a pack down, ban an account).

A pack id belongs to the account that first submitted it, so only that
account can publish new versions. A new upload stays pending, and the
listed version stays up until it's approved.

`packs/` and `index.json` hold the starter packs. Blockwork releases that
still read `index.json` from this repo keep working, and `npm run seed:*`
loads the same packs into the Worker.

## Adding a pack

1. Make the blocks in a macro, then right-click one in the My Blocks palette
   and pick "Share blocks as a pack...". Blocks they call come along.
2. Sign in on the library site, open Submit a pack and upload the file.
   Keep the same id for later versions so they replace the old blocks.

Each entry in `blocks.block_defs` can include `identifier` (for example,
`Blockworked_ClickGrid`) and `description` for Blockwork's Details screen. These can
also be set in the app's Make/Edit Block dialog. Keep the internal `id`
stable across versions so installed calls continue to match; `identifier`
uses `AUTHOR_BLOCKNAME` for the Details screen. Set `description` on each
block to explain its inputs and behavior. Older packs without these fields still load.
Run `python3 scripts/build-block-index.py` after editing starter packs to
refresh their checksums.

Inputs can include an optional `default_value` literal. Blockwork uses it in
the sidebar and for new calls; updating a pack preserves existing call values.
For example, an active-window input can start empty and a monitor input at 1:

```json
[
  {"kind":"Input","id":"window-input","name":"window","value_type":"Any","default_value":{"kind":"Text","value":""}},
  {"kind":"Input","id":"monitor-input","name":"monitor","value_type":"Any","default_value":{"kind":"Number","value":1}}
]
```

`Any` inputs accept `Text` or finite `Number` defaults. `Bool` inputs accept
`{"kind":"Bool","value":true}` or `false` in the same shape. Defaults cannot
contain expressions or custom block calls. Without a default, inputs keep the
legacy zero or empty Boolean slot. Older app versions ignore the new field.

## Official packs

These packs combine multiple built-in blocks into reusable workflows. Their
definitions were checked against Blockwork's instruction and operator palettes.

| Pack | Blocks |
| --- | --- |
| Clipboard tools | Remove duplicate lines, remove blank lines, clean whitespace |
| Text extraction | Text between literal markers, all lines containing text, value for a `key=value` key |
| Window layouts | Center on a monitor, tile two windows side by side, capture geometry, restore geometry |
| Mouse patterns | Click a grid, drag through points, click relative to a window |

Clipboard tools replace clipboard text after processing it. Line-based blocks
accept LF, CRLF and CR, and produce LF. Duplicate lines and text markers match
exactly, including case. Key lookup trims keys and values, uses the first
matching entry and preserves additional `=` signs in its value.

Window patterns match the first window whose title or app contains the text.
Use patterns that identify different windows for tiling. Monitor numbers start
at 1; layouts use the full monitor rectangle, including panels. Window control
depends on the desktop, and window managers may enforce minimum sizes. Save
the geometry reporter's JSON in a variable, then pass it to the restore block;
it records position and size, not maximized or minimized state.

Mouse grids use absolute screen coordinates and visit columns within each row.
Rows and columns are nonnegative whole numbers; spacing may be negative.
Drag paths contain at least two `x,y` pairs separated by semicolons, such as
`100,100; 200,200`. Line-separated paths are also supported. Pauses
are in milliseconds. Window-relative clicks use offsets from the client area's
top-left and focus the window before clicking.

The four packs are generated with stable IDs:

```bash
python3 scripts/build-official-packs.py
python3 scripts/build-block-index.py
```

For behavior tests using Blockwork's actual Rust parser and interpreter, first
build `blockwork-core` in a Blockwork checkout with the current Rust toolchain,
then run:

```bash
npm run test:runtime -- /path/to/Blockwork/target/debug/deps
```

These tests simulate clipboard/window I/O and record mouse events without
controlling the desktop. They cover all 13 new blocks, Unicode and literal
matching, line endings, invalid inputs, monitor offsets and action order.

Reviewers: read the whole pack. The review page lists what its blocks can
do, but a pack in this library should not run commands, go online, write
files or read secrets unless that's plainly its purpose.

## Running it

Needs Node and a Cloudflare account.

```bash
npm install
npm run migrate:local && npm run seed:local
npm run dev        # http://localhost:8787
npm test           # pack checks
npm run typecheck
```

Locally, put the secrets in `.dev.vars`:

```
SITE_URL=http://localhost:8787
ADMINS=github:<your GitHub user id>
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

## Deploying

1. `npx wrangler d1 create blockwork-library` and put the id in
   `wrangler.toml`; `npx wrangler r2 bucket create blockwork-library`.
2. Set `SITE_URL` and `ADMINS` in `wrangler.toml`.
3. Create a GitHub OAuth app and a Google OAuth client with callbacks
   `<SITE_URL>/auth/github/callback` and `<SITE_URL>/auth/google/callback`,
   then `npx wrangler secret put` each of the four client values.
4. `npm run migrate:remote && npm run seed:remote && npm run deploy`.

After that, every push to master deploys on its own
(`.github/workflows/deploy.yml`): it typechecks, runs the tests, applies any
new migrations and deploys the Worker. When a push changes `packs/`, it
then runs `npm run seed:remote` to publish the starter packs to the live
library. Manual workflow runs also reseed, so they can retry a failed seed.
It needs two repository secrets: `CLOUDFLARE_API_TOKEN` (a token from the
"Edit Cloudflare Workers" template, with permission to edit D1 and write
R2 objects) and `CLOUDFLARE_ACCOUNT_ID`.

## Other libraries

Anyone can host a library: an `index.json` in this format plus the pack
files, over `https://`. People add its address in Blockwork's settings.
