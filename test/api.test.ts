import { test } from "node:test";
import assert from "node:assert/strict";
import { challengeOf, readLoginAsk } from "../src/api.ts";

test("the app's sign-in request is checked before anything is shown", () => {
  const good = new URLSearchParams({ port: "49152", state: "abcdefghijklmnop", challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", label: "Desk" });
  assert.deepEqual(readLoginAsk(good), { port: 49152, state: "abcdefghijklmnop", challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", label: "Desk" });
  for (const [k, v] of [["port", "80"], ["port", "70000"], ["port", "12.5"], ["state", "short"], ["state", "has spaces in it ok"], ["challenge", "abc"]]) {
    const bad = new URLSearchParams(good);
    bad.set(k, v);
    assert.equal(readLoginAsk(bad), null, `${k}=${v}`);
  }
});

test("the challenge is PKCE's S256", async () => {
  // RFC 7636 appendix B.
  assert.equal(await challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});
