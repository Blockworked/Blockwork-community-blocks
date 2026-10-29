// A pack file's blocks, listed for the pack page, and the file itself as
// highlighted, numbered JSON. Blocks are drawn by Blockwork's own editor
// (renders.ts and the pack viewer on blockworked.com), not here. Pure
// functions, so they test without a Worker.

import { esc } from "./pages.ts";
import { blockName } from "./packs.ts";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

export interface BlockSource {
  id: string;
  name: string;
  identifier: string;
  description: string;
  inputs: { name: string; type: string; default: string }[];
}

function literal(v: Json): string {
  if (!isObj(v)) return "";
  if (v.kind === "Text") return JSON.stringify(v.value);
  return String(v.value ?? "");
}

/** Every block a pack defines, in the file's order. */
export function packSource(pack: unknown): BlockSource[] {
  const blocks = isObj(pack) && isObj(pack.blocks) ? pack.blocks : {};
  const defs = Array.isArray(blocks.block_defs) ? blocks.block_defs.filter(isObj) : [];
  return defs.map((d) => {
    const pieces = Array.isArray(d.pieces) ? d.pieces.filter(isObj) : [];
    return {
      id: String(d.id),
      name: blockName(d),
      identifier: typeof d.identifier === "string" ? d.identifier : "",
      description: typeof d.description === "string" ? d.description : "",
      inputs: pieces
        .filter((p) => p.kind === "Input")
        .map((p) => ({ name: String(p.name ?? ""), type: String(p.value_type ?? "Any"), default: literal(p.default_value) })),
    };
  });
}

/** Pretty JSON, colored, one block span per line, numbered by CSS counters so copying skips the numbers. */
export function highlightJson(text: string): string {
  let pretty = text;
  try {
    pretty = JSON.stringify(JSON.parse(text), null, 2);
  } catch {}
  const token = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  return pretty
    .split("\n")
    .map((line) => {
      let out = "";
      let last = 0;
      for (const m of line.matchAll(token)) {
        out += esc(line.slice(last, m.index));
        const cls = m[1] ? (m[2] ? "j-key" : "j-str") : m[3] ? "j-lit" : "j-num";
        out += `<span class="${cls}">${esc(m[1] ?? m[0])}</span>${m[2] ? esc(m[2]) : ""}`;
        last = m.index! + m[0].length;
      }
      return `<span class="ln">${out}${esc(line.slice(last))}</span>`;
    })
    .join("");
}
