import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { filterPacks, matchScore, readFilters, type ListedPack } from "../src/browse.ts";
import { checkComment, commentHtml, MAX_COMMENT } from "../src/comments.ts";
import { flatten, highlightJson, packSource } from "../src/source.ts";

const row = (o: Partial<ListedPack>): ListedPack => ({
  id: 1, pack_id: "p", sha256: "", name: "P", description: "", version: "1", blocks: "[]", capabilities: "[]",
  status: "approved", reason: "", submitted_by: "u", submitted_at: 0, author: "someone", owner_id: "u",
  author_public_id: "x", author_avatar: "", pack_created_at: 0, comments: 0, ...o,
});
const packs = [
  row({ pack_id: "clipboard", name: "Clipboard tools", blocks: '["clean clipboard whitespace"]', capabilities: '["clipboard"]', submitted_at: 3, comments: 1 }),
  row({ pack_id: "net", name: "Web helpers", description: "Fetches café pages", capabilities: '["network"]', submitted_at: 5, pack_created_at: 9 }),
  row({ pack_id: "math", name: "Math", blocks: '["clamp (n)"]', owner_id: "blockwork:team", comments: 4 }),
];
const names = (f: string) => filterPacks(packs, readFilters(new URLSearchParams(f))).map((p) => p.pack_id);

test("filters read from the query string fall back to safe values", () => {
  assert.deepEqual(readFilters(new URLSearchParams("")), { q: "", uses: "", official: false, sort: "name" });
  assert.deepEqual(readFilters(new URLSearchParams("q=x&uses=bogus&sort=bogus&official=1")), { q: "x", uses: "", official: true, sort: "match" });
  assert.equal(readFilters(new URLSearchParams("uses=network")).uses, "network");
});

test("search needs every word, folds case and accents, and ranks names first", () => {
  assert.deepEqual(names("q=clipboard"), ["clipboard"]);
  assert.deepEqual(names("q=CAFE pages"), ["net"]);
  assert.deepEqual(names("q=clamp"), ["math"]);
  assert.deepEqual(names("q=clipboard nothing"), []);
  assert.ok(matchScore(packs[0], "clipboard") > matchScore(packs[0], "whitespace"));
});

test("permission, official and sort filters", () => {
  assert.deepEqual(names(""), ["clipboard", "math", "net"]);
  assert.deepEqual(names("uses=none"), ["math"]);
  assert.deepEqual(names("uses=safe"), ["clipboard", "math"]);
  assert.deepEqual(names("uses=network"), ["net"]);
  assert.deepEqual(names("official=1"), ["math"]);
  assert.deepEqual(names("sort=updated"), ["net", "clipboard", "math"]);
  assert.deepEqual(names("sort=new"), ["net", "clipboard", "math"]);
  assert.deepEqual(names("sort=discussed"), ["math", "clipboard", "net"]);
});

test("every starter pack's blocks draw, with no unknown parts", () => {
  for (const file of readdirSync("packs").filter((f) => f.endsWith(".json"))) {
    const blocks = packSource(JSON.parse(readFileSync(`packs/${file}`, "utf8")));
    assert.ok(blocks.length > 0, file);
    for (const b of blocks) {
      assert.ok(b.html.includes('class="blk hat"'), `${file}: ${b.name} has no body`);
      assert.ok(!/unknown|undefined|\[object|custom block|class="dim"/i.test(b.html), `${file}: ${b.name}`);
    }
  }
});

test("source view escapes whatever a pack says", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const pack = {
    blocks: {
      block_defs: [{ id: "d", pieces: [{ kind: "Label", text: evil }], description: evil, color: "red;}" }],
      strands: [{ instructions: [{ id: "1", kind: { BlockHeader: "d" } }, { id: "2", kind: { Log: { kind: "Text", value: evil } } }, { id: "3", kind: { SetVariable: [evil, { kind: "Var", name: evil }] } }] }],
    },
  };
  const [b] = packSource(pack);
  assert.ok(!b.html.includes("<img"));
  assert.equal(b.color, "");
  assert.ok(!highlightJson(JSON.stringify({ [evil]: evil })).includes("<img"));
});

test("saved instructions take the editor's field names", () => {
  assert.deepEqual(flatten({ id: "a", kind: { SetVariable: ["n", { kind: "Number", value: 1 }] } }), { type: "SetVariable", id: "a", name: "n", value: { kind: "Number", value: 1 } });
  assert.deepEqual(flatten({ id: "b", kind: { Token: { MoveMouse: [1, 2, "Abs"] } } }), { type: "MoveMouse", id: "b", x: 1, y: 2, coordinate: "Abs" });
  assert.deepEqual(flatten({ id: "c", kind: { WindowAction: { action: "Focus", by: "Title" } } }), { type: "WindowAction", id: "c", action: "Focus", by: "Title" });
  assert.deepEqual(flatten({ id: "d", kind: "StopMacro" }), { type: "StopMacro", id: "d" });
});

test("highlighted JSON keeps one line per line", () => {
  const html = highlightJson('{"a":[1,true,null,"x"]}');
  assert.equal(html.split('<span class="ln">').length - 1, JSON.stringify({ a: [1, true, null, "x"] }, null, 2).split("\n").length);
  assert.match(html, /<span class="j-key">&#34;a&#34;<\/span>:/);
  assert.match(html, /<span class="j-lit">true<\/span>/);
});

test("comments are trimmed, limited, escaped, and get links", () => {
  assert.deepEqual(checkComment("  hi\r\n\r\n\r\n\r\nthere  "), { body: "hi\n\nthere" });
  assert.ok("error" in checkComment("   "));
  assert.ok("error" in checkComment("x".repeat(MAX_COMMENT + 1)));
  const html = commentHtml('<b>see https://example.com/a?b=1&c=2. "javascript:alert(1)"</b>');
  assert.ok(!html.includes("<b>"));
  assert.match(html, /<a href="https:\/\/example.com\/a\?b=1&#38;c=2" rel="nofollow ugc noopener" target="_blank">/);
  assert.ok(!html.includes('href="javascript'));
});
