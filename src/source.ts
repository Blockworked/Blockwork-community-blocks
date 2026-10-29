// A pack file shown as source: each block's body drawn as nested blocks, and
// the file itself as highlighted, numbered JSON. Pure functions, so they test
// without a Worker.

import { esc, icon, NOTCH, TAB } from "./pages.ts";
import { ICONS, OPERATORS, ROWS } from "./block-rows.ts";
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

type Piece = { kind: string; [key: string]: any };
interface Row { shape?: string; icon?: string; head: Piece[] | ((i: Obj) => Piece[]); mouths?: string[]; separators?: string[]; components?: any[] }

const label = (text: string): Piece => ({ kind: "label", text });
const value = (key: string, extra: object = {}): Piece => ({ kind: "value", key, ...extra });
const dropdown = (key: string, options: [string, string][]): Piece => ({ kind: "dropdown", key, options: options.map(([v, l]) => ({ value: v, label: l })) });
const DIRECTIONS: [string, string][] = [["Click", "Click"], ["Press", "Press"], ["Release", "Release"]];

// The blocks blockstitch draws itself (InstructionBlock.qml), in the editor's own words.
const CORE: Record<string, Row> = {
  Wait: { head: [label("Wait"), value("duration", { tag: "MS" })] },
  Text: { head: [label("Text"), value("text")] },
  Key: { head: [label("Key"), value("key"), dropdown("direction", DIRECTIONS)] },
  Button: { head: [label("Mouse button"), dropdown("button", []), dropdown("direction", DIRECTIONS)] },
  MoveMouse: { head: [label("Move mouse"), dropdown("coordinate", [["Rel", "Relative"], ["Abs", "Absolute"]]), value("x", { tag: "X" }), value("y", { tag: "Y" })] },
  Scroll: { head: [label("Scroll"), value("amount", { tag: "AMOUNT" }), dropdown("axis", [["Vertical", "Vertical"], ["Horizontal", "Horizontal"]])] },
  CloseApp: { head: [label("Close app"), { kind: "button", icon: "app-window", text: (i: Obj) => String(i.name || "Choose app...") }] },
  SetVariable: { head: [label("set"), { kind: "name", key: "name" }, label("to"), value("value")] },
  ChangeVariable: { head: [label("change"), { kind: "name", key: "name" }, label("by"), value("value")] },
  SetClipboard: { head: [label("set clipboard to"), value("value")] },
  AddToList: { head: [label("add"), value("value"), label("to"), { kind: "name", key: "name" }] },
  DeleteOfList: { head: [label("delete"), value("index"), label("of"), { kind: "name", key: "name" }] },
  DeleteAllOfList: { head: [label("delete all of"), { kind: "name", key: "name" }] },
  InsertIntoList: { head: [label("insert"), value("value"), label("at"), value("index"), label("of"), { kind: "name", key: "name" }] },
  ReplaceItemOfList: { head: [label("replace item"), value("index"), label("of"), { kind: "name", key: "name" }, label("with"), value("value")] },
  ReverseList: { head: [label("reverse"), { kind: "name", key: "name" }] },
  Return: { shape: "cap", head: [label("return"), value("value")] },
  EscapeLoop: { shape: "cap", head: [label("break loop")] },
  ContinueLoop: { shape: "cap", head: [label("continue loop")] },
  If: { mouths: ["body"], head: [label("if"), value("condition", { bool: true }), label("then")] },
  IfElse: { mouths: ["then_body", "else_body"], separators: ["else"], head: [label("if"), value("condition", { bool: true }), label("then")] },
  Repeat: { mouths: ["body"], head: [label("repeat"), value("count")] },
  Forever: { mouths: ["body"], head: [label("forever")] },
  While: { mouths: ["body"], head: [label("while"), value("condition", { bool: true })] },
  Comment: { head: [{ kind: "text", key: "comment" }] },
};

// Variants serialized as tuples, and the field names the editor gives their parts (frontend.rs).
const TUPLES: Record<string, string[]> = {
  Wait: ["duration"], Command: ["command"], CommandWait: ["command"], SetVariable: ["name", "value"], ChangeVariable: ["name", "value"],
  SetClipboard: ["value"], Return: ["value"], Log: ["value"], ThrowError: ["message"], BlockHeader: ["block_id"], PasteText: ["text"],
  ShowMessage: ["message"], WhenAt: ["at"], StopMacroNamed: ["target"], WhenFileChanged: ["path"], WhenIdle: ["minutes"],
  WhenCron: ["expression"], WhenBatteryDischargedTo: ["threshold"], WhenBatteryChargedTo: ["threshold"], WhenTime: ["schedule", "time"],
  WhenKey: ["key", "direction"], RunBranch: ["name"], Comment: ["comment"], WhenSignal: ["name"],
  // Recorded input, under Token.
  Text: ["text"], Key: ["key", "direction"], Button: ["button", "direction"], MoveMouse: ["x", "y", "coordinate"], Scroll: ["amount", "axis"],
};

interface Ctx {
  defs: Map<string, Obj>;
}

function isInstruction(v: Json): v is Obj {
  return isObj(v) && "id" in v && "kind" in v;
}

function variantOf(kind: Json): [string, Json] {
  if (typeof kind === "string") return [kind, null];
  if (isObj(kind)) {
    const keys = Object.keys(kind);
    if (keys.length === 1) return [keys[0], kind[keys[0]]];
  }
  return ["Unknown", kind];
}

/** A saved instruction in the editor's shape: {type, ...fields}. */
export function flatten(ins: Obj): Obj {
  let [type, payload] = variantOf(ins.kind);
  if (type === "Token") [type, payload] = variantOf(payload);
  const out: Obj = { type, id: ins.id ?? "" };
  if (isObj(payload) && !("kind" in payload) && !(type === "WhenSignal")) return { ...payload, ...out };
  const names = TUPLES[type] ?? ["value"];
  const parts = Array.isArray(payload) ? payload : payload === null ? [] : [payload];
  // A signal name is {value, expression}.
  parts.forEach((p, i) => (out[names[i] ?? `arg${i}`] = isObj(p) && "expression" in p && typeof p.value === "string" ? { kind: "Text", value: p.value } : p));
  return out;
}

function attempt<T>(f: () => T, fallback: T): T {
  try {
    return f();
  } catch {
    return fallback;
  }
}

const CHEVRON = icon("chevron-down", "currentColor", 12);

function nameSlot(name: Json): string {
  return `<span class="slot dd">${esc(name) || "&nbsp;"}${CHEVRON}</span>`;
}

/** A value slot: a literal in a box, or a reporter dropped into it. */
function slot(v: Json, ctx: Ctx, opts: { bool?: boolean; tag?: string } = {}): string {
  const tag = opts.tag ? `<span class="slot-tag">${esc(opts.tag)}</span>` : "";
  if (isObj(v) && (v.kind === "Op" || v.kind === "Var" || v.kind === "Param" || v.kind === "Call")) return reporter(v, ctx);
  if (v === null || v === undefined || (isObj(v) && v.kind === "Bool" && typeof v.value !== "boolean")) {
    return opts.bool ? `<span class="slot bool"></span>` : `<span class="slot">${tag}&nbsp;</span>`;
  }
  const text = isObj(v) ? v.value : v;
  return `<span class="slot">${tag}${esc(String(text ?? "")).replace(/\n/g, "↵") || "&nbsp;"}</span>`;
}

function reporterShell(bool: boolean, inner: string): string {
  return `<span class="blk ${bool ? "boolean" : "reporter"}"><span class="blk-row">${inner}</span></span>`;
}

function defPieces(def: Obj | undefined, args: Json[], ctx: Ctx, asParams: boolean): string {
  if (!def || !Array.isArray(def.pieces)) return `<span>custom block</span>`;
  let n = 0;
  return def.pieces
    .filter(isObj)
    .map((p) => {
      if (p.kind === "Label") return `<span>${esc(p.text)}</span>`;
      if (p.kind !== "Input") return "";
      const bool = p.value_type === "Bool";
      if (asParams) return reporterShell(bool, `<span>${esc(p.name)}</span>`);
      return slot(args[n++] ?? null, ctx, { bool });
    })
    .join("");
}

function defIcon(def: Obj | undefined, size = 16): string {
  const color = def && typeof def.color === "string" && /^#[0-9a-fA-F]{6}$/.test(def.color) ? def.color : "#4C97FF";
  const name = def && typeof def.icon === "string" && /^[a-z0-9-]{1,64}$/.test(def.icon) ? def.icon : "blocks";
  return icon(name, color, size);
}

/** A reporter: an oval, or a hexagon for a true/false one, laid out as the editor lays it out. */
function reporter(v: Obj, ctx: Ctx): string {
  if (v.kind === "Var") return reporterShell(false, `<span>${esc(v.name)}</span>`);
  if (v.kind === "Param") return reporterShell(false, `<span>${esc(v.name)}</span>`);
  if (v.kind === "Call") {
    const def = ctx.defs.get(String(v.block_id));
    return reporterShell(def?.shape === "ReturnsBool", `${defIcon(def, 14)}${defPieces(def, Array.isArray(v.args) ? v.args : [], ctx, false)}`);
  }
  const [op] = variantOf(v.op);
  const spec = OPERATORS[op];
  const args = Array.isArray(v.args) ? v.args : [];
  if (!spec) return reporterShell(false, `<span>${esc(words(op))}</span>${args.map((a) => slot(a, ctx)).join("")}`);
  const infix: string[] = Array.isArray(spec.infix) ? spec.infix : spec.infix ? [spec.infix] : [];
  const enumArg = spec.enumArg;
  const parts: string[] = [];
  if (spec.prefix) parts.push(`<span>${esc(spec.prefix)}</span>`);
  args.forEach((a, i) => {
    if (i > 0) {
      const gap = infix.length ? infix[Math.min(i - 1, infix.length - 1)] : "";
      if (gap) parts.push(`<span>${esc(gap)}</span>`);
    }
    if (enumArg && enumArg.index === i && isObj(a) && a.kind === "Text") {
      const options = Array.isArray(enumArg.options) ? enumArg.options : [];
      const chosen = options.find((o: any) => o.value === a.value);
      parts.push(nameSlot(chosen ? chosen.label : a.value));
    } else {
      const bool = spec.result === "bool" && ["And", "Or", "Not"].includes(op);
      parts.push(slot(a, ctx, { bool }));
    }
  });
  if (spec.suffix) parts.push(`<span>${esc(spec.suffix)}</span>`);
  return reporterShell(spec.result === "bool", parts.join(""));
}

function piece(p: Piece, ins: Obj, ctx: Ctx): string {
  if (typeof p.when === "function" && !attempt(() => p.when(ins), true)) return "";
  const raw = (k: string) => (p.index !== undefined ? (ins[k] as any)?.[p.index] : ins[k]);
  switch (p.kind) {
    case "label":
      return `<span>${esc(p.text)}</span>`;
    case "value":
      return slot(raw(p.key) ?? null, ctx, { bool: !!p.bool, tag: p.tag });
    case "text":
      return `<span class="slot">${esc(raw(p.key)) || "&nbsp;"}</span>`;
    case "name":
      return nameSlot(raw(p.key));
    case "dropdown": {
      const stored = raw(p.key);
      const current = typeof p.decode === "function" ? attempt(() => p.decode(stored, ins), stored) : stored;
      const options = typeof p.options === "function" ? attempt(() => p.options(ins), []) : Array.isArray(p.options) ? p.options : [];
      const chosen = options.find((o: any) => o.value === current);
      return nameSlot(chosen ? chosen.label : typeof current === "object" ? "" : current);
    }
    case "button": {
      const text = typeof p.text === "function" ? attempt(() => p.text(ins), "") : p.text ?? "";
      return `<span class="slot btn">${p.icon ? icon(p.icon, "currentColor", 13) : ""}${esc(text)}</span>`;
    }
  }
  return "";
}

function rowFor(type: string): Row | undefined {
  return (ROWS as Record<string, Row>)[type] ?? CORE[type];
}

/** One statement, drawn as the editor draws it, with any bodies inside. */
function statement(raw: Obj, ctx: Ctx): string {
  const ins = flatten(raw);
  const type = String(ins.type);
  let head = "";
  let shape = "stack";
  let mouths: Obj[][] = [];
  let separators: string[] = [];
  if (type === "BlockHeader" || type === "CallBlock") {
    const def = ctx.defs.get(String(ins.block_id));
    head = defIcon(def) + defPieces(def, Array.isArray(ins.args) ? ins.args : [], ctx, type === "BlockHeader");
    if (type === "BlockHeader") shape = "hat";
    else if (def?.shape === "Ending") shape = "ending";
    if (Array.isArray(ins.branches)) mouths = ins.branches.map((b) => (Array.isArray(b) ? b.filter(isInstruction) : []));
  } else {
    const row = rowFor(type);
    const pieces: Piece[] = row ? (typeof row.head === "function" ? attempt(() => (row.head as any)(ins), []) : row.head) : [label(words(type))];
    const extra = (row?.components ?? []).filter((c: any) =>
      typeof c.present === "function" ? attempt(() => c.present(ins), false) : ins[c.key] !== undefined && ins[c.key] !== null && ins[c.key] !== "",
    );
    const iconName = (ICONS as Record<string, string>)[type] ?? row?.icon ?? "blocks";
    const header = row?.shape === "header" || (!row?.shape && type.startsWith("When"));
    head = `${icon(iconName, "currentColor", 16).replace('class="ico"', `class="ico${header ? " accent" : ""}"`)}${pieces.map((p) => piece(p, ins, ctx)).join("")}${extra
      .flatMap((c: any) => c.pieces ?? [])
      .map((p: Piece) => piece(p, ins, ctx))
      .join("")}`;
    if (!row) head += Object.entries(ins).filter(([k]) => k !== "type" && k !== "id").map(([k, v]) => `<span class="dim">${esc(words(k))}</span>${slot(v, ctx)}`).join("");
    shape = header ? "hat" : row?.shape === "cap" ? "ending" : "stack";
    mouths = (row?.mouths ?? []).map((k) => (Array.isArray(ins[k]) ? (ins[k] as Json[]).filter(isInstruction) : []));
    separators = row?.separators ?? [];
  }
  if (!mouths.length) {
    return `<div class="blk ${shape}"><div class="blk-row">${head}</div>${shape === "hat" ? "" : NOTCH}${shape === "ending" ? "" : TAB()}</div>`;
  }
  let html = `<div class="blk wrap"><div class="blk-row">${head}</div>`;
  mouths.forEach((body, k) => {
    const sep = k < mouths.length - 1 ? separators[k] ?? "" : "";
    html += `<div class="blk-mouth filled">${stack(body, ctx)}</div><div class="blk-row foot">${sep ? `<span>${esc(sep)}</span>` : ""}</div>`;
  });
  return `${html}${NOTCH}${shape === "ending" ? "" : TAB()}</div>`;
}

function stack(list: Obj[], ctx: Ctx): string {
  return `<div class="src-stack">${list.map((i) => statement(i, ctx)).join("")}</div>`;
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
      html: body ? `<div class="src">${stack(body, ctx)}</div>` : "",
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
