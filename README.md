# Blockwork community blocks

The block library Blockwork shows under My Blocks > Browse library, served
by a Cloudflare Worker. People sign in with GitHub or Google to submit
packs; every upload is reviewed before it's listed.

- `GET /index.json` lists each listed pack's newest approved version, in
  the format Blockwork reads. Each entry pins the file's SHA-256.
- `GET /packs/<sha256>.json` serves an approved pack file.
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

## Other libraries

Anyone can host a library: an `index.json` in this format plus the pack
files, over `https://`. People add its address in Blockwork's settings.
