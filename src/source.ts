// A pack file shown as source: each block's body drawn as nested blocks, and
// the file itself as highlighted, numbered JSON. Pure functions, so they test
// without a Worker.

import { esc } from "./pages.ts";
import { blockView, type BlockView } from "./packs.ts";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** "TryCatch" -> "try catch". */
export function words(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}

// What the editor calls the blocks whose type name reads badly.
const STATEMENTS: Record<string, string> = {
  SetVariable: "set",
  ChangeVariable: "change",
  IfElse: "if",
  TryCatch: "try",
  WithLock: "with lock",
  ThrowError: "throw error",
  Token: "",
  Text: "type",
  Key: "press key",
  Button: "click",
  Command: "run command",
  CommandWait: "run command and wait",
  SetClipboard: "set clipboard to",
  WaitUntil: "wait until",
  Retry: "retry",
  EscapeLoop: "escape loop",
  ContinueLoop: "continue loop",
  StopMacro: "stop this macro",
  Return: "return",
  Wait: "wait (ms)",
};

// Field names worth spelling out; the rest are shown as their own words.
const BODY_LABELS: Record<string, string> = { body: "", else_body: "else", catch_body: "on error" };

// Fields the block's own word already names.
const QUIET_FIELDS = new Set(["condition", "count", "name", "value", "times"]);

const INFIX: Record<string, string> = {
  Add: "+", Sub: "−", Mul: "×", Div: "÷", Mod: "mod", Eq: "=", Neq: "≠",
  Lt: "<", Gt: ">", Lte: "≤", Gte: "≥", And: "and", Or: "or", Join: "join",
};

const OPS: Record<string, string> = {
  Not: "not", Length: "length of", LastError: "error message", IndexOf: "position of",
  LetterOf: "letter of", SplitPart: "piece of", SplitCount: "pieces in", Substring: "letters of",
  TextReplace: "replace", RegexReplace: "regex replace", TextCheck: "text check", JsonGet: "JSON value",
};

interface Ctx {
  defs: Map<string, Obj>;
}

function isInstruction(v: Json): v is Obj {
  return isObj(v) && "id" in v && "kind" in v;
}

function isBody(v: Json): v is Obj[] {
  return Array.isArray(v) && v.length > 0 && v.every(isInstruction);
}

function variantOf(kind: Json): [string, Json] {
  if (typeof kind === "string") return [kind, null];
  if (isObj(kind)) {
    const keys = Object.keys(kind);
    if (keys.length === 1) return [keys[0], kind[keys[0]]];
  }
  return ["Unknown", kind];
}

function defLabel(def: Obj | undefined, args: Json[], ctx: Ctx): string {
  if (!def || !Array.isArray(def.pieces)) return `<span class="src-word">call</span>${args.map((a) => value(a, ctx)).join("")}`;
  let i = 0;
  return def.pieces
    .map((p) => {
      if (!isObj(p)) return "";
      if (p.kind === "Label") return `<span class="src-word">${esc(p.text)}</span>`;
      const arg = args[i++];
      return arg === undefined ? `<span class="src-slot src-param">${esc(p.name)}</span>` : value(arg, ctx);
    })
    .join("");
}

/** A value slot: a literal, a variable, an input of the block, or a nested reporter. */
export function value(v: Json, ctx: Ctx = { defs: new Map() }): string {
  if (v === null || v === undefined) return `<span class="src-slot src-empty"></span>`;
  if (typeof v === "string") return `<span class="src-slot src-choice">${esc(words(v))}</span>`;
  if (typeof v === "number" || typeof v === "boolean") return `<span class="src-slot">${esc(v)}</span>`;
  if (Array.isArray(v)) return v.map((x) => value(x, ctx)).join("");
  switch (v.kind) {
    case "Text":
      return `<span class="src-slot src-text">${esc(v.value).replace(/\n/g, "↵")}</span>`;
    case "Number":
      return `<span class="src-slot src-number">${esc(v.value)}</span>`;
    case "Bool":
      return typeof v.value === "boolean" ? `<span class="src-slot">${v.value}</span>` : `<span class="src-slot src-empty src-bool"></span>`;
    case "Var":
      return `<span class="src-reporter">${esc(v.name)}</span>`;
    case "Param":
      return `<span class="src-reporter src-param">${esc(v.name)}</span>`;
    case "Call": {
      const def = ctx.defs.get(String(v.block_id));
      return `<span class="src-reporter">${defLabel(def, Array.isArray(v.args) ? v.args : [], ctx)}</span>`;
    }
    case "Op": {
      const [op, data] = variantOf(v.op);
      const args = Array.isArray(v.args) ? v.args : [];
      const extra = data === null ? "" : value(data, ctx);
      if (INFIX[op] && args.length === 2) {
        return `<span class="src-reporter">${value(args[0], ctx)}<span class="src-word">${esc(INFIX[op])}</span>${value(args[1], ctx)}</span>`;
      }
      return `<span class="src-reporter"><span class="src-word">${esc(OPS[op] ?? words(op))}</span>${extra}${args.map((a) => value(a, ctx)).join("")}</span>`;
    }
  }
  // Anything else: its fields in order.
  return Object.entries(v)
    .map(([k, x]) => `<span class="src-word">${esc(words(k))}</span>${value(x, ctx)}`)
    .join("");
}

function statement(ins: Obj, ctx: Ctx): string {
  const [name, payload] = variantOf(ins.kind);
  if (name === "BlockHeader") {
    const def = ctx.defs.get(String(payload));
    return `<div class="src-block src-hat"><div class="src-row"><span class="src-word">define</span><span class="src-dot"></span>${defLabel(def, [], ctx)}</div></div>`;
  }
  let label = name in STATEMENTS ? STATEMENTS[name] : words(name);
  let inline = "";
  const bodies: [string, Obj[]][] = [];
  if (name === "CallBlock" && isObj(payload)) {
    const def = ctx.defs.get(String(payload.block_id));
    label = "";
    inline = defLabel(def, Array.isArray(payload.args) ? payload.args : [], ctx);
  } else if ((name === "SetVariable" || name === "ChangeVariable") && Array.isArray(payload)) {
    inline = `<span class="src-slot src-choice">${esc(payload[0])}</span><span class="src-word">${name === "SetVariable" ? "to" : "by"}</span>${value(payload[1], ctx)}`;
  } else if (name === "Token" && isObj(payload)) {
    // Recorded input: {"MoveMouse": [x, y, "Abs"]}.
    const [inner, data] = variantOf(payload);
    label = words(inner);
    inline = value(data, ctx);
  } else if (isObj(payload) && !("kind" in payload)) {
    for (const [k, x] of Object.entries(payload)) {
      if (k in BODY_LABELS || isBody(x)) bodies.push([BODY_LABELS[k] ?? words(k), Array.isArray(x) ? (x as Obj[]) : []]);
      else inline += `${QUIET_FIELDS.has(k) ? "" : `<span class="src-field">${esc(words(k))}</span>`}${value(x, ctx)}`;
    }
  } else if (payload !== null) {
    inline = value(payload, ctx);
  }
  const head = `<div class="src-row">${label ? `<span class="src-word">${esc(label)}</span>` : ""}${inline}</div>`;
  if (!bodies.length) return `<div class="src-block">${head}</div>`;
  const arms = bodies
    .map(([l, body], i) => `${i ? `<div class="src-row src-else"><span class="src-word">${esc(l)}</span></div>` : ""}<div class="src-body">${stack(body, ctx)}</div>`)
    .join("");
  return `<div class="src-block src-c">${head}${arms}<div class="src-foot"></div></div>`;
}

function stack(list: Obj[], ctx: Ctx): string {
  return list.map((i) => statement(i, ctx)).join("");
}

export interface BlockSource {
  id: string;
  name: string;
  identifier: string;
  description: string;
  color: string;
  shape: string;
  inputs: { name: string; type: string; default: string }[];
  /** How the block itself is drawn (pages.ts blockHtml). */
  view: BlockView;
  /** The body drawn as blocks, or "" when the pack has none for it. */
  html: string;
}

function literal(v: Json): string {
  if (!isObj(v)) return "";
  if (v.kind === "Text") return JSON.stringify(v.value);
  return String(v.value ?? "");
}

/** Every block a pack defines, with its body drawn. */
export function packSource(pack: unknown): BlockSource[] {
  const blocks = isObj(pack) && isObj(pack.blocks) ? pack.blocks : {};
  const defs = Array.isArray(blocks.block_defs) ? blocks.block_defs.filter(isObj) : [];
  const ctx: Ctx = { defs: new Map(defs.map((d) => [String(d.id), d])) };
  const strands = Array.isArray(blocks.strands) ? blocks.strands.filter(isObj) : [];
  const bodyOf = new Map<string, Obj[]>();
  for (const s of strands) {
    const list = Array.isArray(s.instructions) ? s.instructions.filter(isObj) : [];
    const [name, header] = list.length ? variantOf(list[0].kind) : ["", null];
    if (name === "BlockHeader") bodyOf.set(String(header), list);
  }
  return defs.map((d) => {
    const pieces = Array.isArray(d.pieces) ? d.pieces.filter(isObj) : [];
    const body = bodyOf.get(String(d.id));
    return {
      id: String(d.id),
      name: pieces.map((p) => (p.kind === "Label" ? String(p.text ?? "").trim() : `(${p.name})`)).filter(Boolean).join(" "),
      identifier: typeof d.identifier === "string" ? d.identifier : "",
      description: typeof d.description === "string" ? d.description : "",
      color: typeof d.color === "string" && /^#[0-9a-fA-F]{6}$/.test(d.color) ? d.color : "",
      shape: typeof d.shape === "string" ? d.shape : "Normal",
      inputs: pieces
        .filter((p) => p.kind === "Input")
        .map((p) => ({ name: String(p.name ?? ""), type: String(p.value_type ?? "Any"), default: literal(p.default_value) })),
      view: blockView(d),
      html: body ? `<div class="src-stack">${stack(body, ctx)}</div>` : "",
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
