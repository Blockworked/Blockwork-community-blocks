import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { capabilities, readPack, slug } from "../src/packs.ts";

const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const pack = (extra: object = {}) => ({
  blockwork_block_pack: 1,
  id: "my-pack",
  name: "My pack",
  blocks: { block_defs: [{ id: "a", pieces: [{ kind: "Label", text: "say" }, { kind: "Input", name: "text" }] }], strands: [] },
  ...extra,
});

test("seed packs are accepted and match index.json", () => {
  const index = JSON.parse(readFileSync("index.json", "utf8"));
  for (const file of readdirSync("packs")) {
    const bytes = readFileSync(`packs/${file}`);
    const meta = readPack(bytes);
    assert.equal(typeof meta, "object", `${file}: ${meta}`);
    const entry = index.packs.find((p: any) => p.url === `packs/${file}`);
    assert.equal((meta as any).id, entry.id);
    assert.deepEqual((meta as any).blocks, entry.blocks);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
    for (const def of JSON.parse(bytes.toString()).blocks.block_defs) {
      assert.ok(def.identifier.trim(), `${file}: missing Details ID`);
      assert.ok(def.description.trim(), `${file}: missing description`);
    }
  }
});

test("block names match the app's", () => {
  const meta = readPack(enc(pack())) as any;
  assert.deepEqual(meta.blocks, ["say (text)"]);
});

test("broken uploads say why", () => {
  assert.match(readPack(new TextEncoder().encode("nope")) as string, /isn't a block pack/);
  assert.match(readPack(enc({ name: "x" })) as string, /isn't a block pack/);
  assert.match(readPack(enc(pack({ blockwork_block_pack: 2 }))) as string, /newer version/);
  assert.match(readPack(enc(pack({ id: "My Pack" }))) as string, /should be "my-pack"/);
  assert.match(readPack(enc(pack({ blocks: { block_defs: [] } }))) as string, /no blocks/);
  assert.match(readPack(new Uint8Array(3 * 1024 * 1024)) as string, /over 2 MB/);
});

test("slug keeps letters from any script", () => {
  assert.equal(slug("  Hello, World! "), "hello-world");
  assert.equal(slug("Größe 2"), "größe-2");
});

test("capabilities cover instructions, operators and triggers", () => {
  const blocks = {
    strands: [
      {
        instructions: [
          { id: "1", kind: { BlockHeader: "a" } },
          { id: "2", kind: { Command: { kind: "Text", value: "ls" } } },
          { id: "3", kind: { Log: { kind: "Op", op: "Secret", args: [] } } },
          { id: "4", kind: { Repeat: { count: { kind: "Number", value: 2 }, body: [{ id: "5", kind: { PasteText: "x" } }] } } },
          { id: "6", kind: "WhenClipboardChanged" },
          { id: "7", kind: "WhenRan" },
        ],
      },
    ],
  };
  assert.deepEqual(capabilities(blocks), ["commands", "secrets", "input", "clipboard", "triggers"]);
  assert.deepEqual(capabilities({ strands: [{ instructions: [{ id: "1", kind: "WhenRan" }] }] }), []);
});
