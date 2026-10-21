import { test } from "node:test";
import assert from "node:assert/strict";
import { isReservedName } from "../src/auth.ts";

test("team names are reserved however they're written", () => {
  for (const name of ["Blockwork", "Blockworked", "BLOCKWORK", "Block Work", "block-worked", "Bl0ckworked", "B1ockwork", "Blóckwork", " blockwork. "]) {
    assert.ok(isReservedName(name), name);
  }
  for (const name of ["Blockwork fan", "octocat", "Blockworks", "Treetrain1"]) {
    assert.ok(!isReservedName(name), name);
  }
});
