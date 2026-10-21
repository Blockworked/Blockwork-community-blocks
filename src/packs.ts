// Checks an uploaded block pack and works out what its blocks can do,
// mirroring blockwork-core's read_pack and blockwork-app's capability scan.

export const MAX_PACK_BYTES = 2 * 1024 * 1024;

/** The account that owns the starter packs. Sign-in ids are "<provider>:<id>", so no one can sign in as it. */
export const OFFICIAL_OWNER = "blockwork:team";

export interface PackMeta {
  id: string;
  name: string;
  description: string;
  version: string;
  blocks: string[];
  capabilities: string[];
}

// Same order and wording as the app's import review.
export const CAPABILITIES: [kind: string, label: string, risky: boolean][] = [
  ["commands", "Runs commands and opens or closes apps", true],
  ["secrets", "Reads your saved secrets", true],
  ["network", "Goes online", true],
  ["files_write", "Writes to files", true],
  ["files_read", "Reads files and folders", false],
  ["input", "Presses keys, clicks and moves the mouse", false],
  ["clipboard", "Reads or changes the clipboard", false],
  ["windows", "Reads or controls other apps and windows", false],
  ["triggers", "Starts on its own (schedules, keys, typing, apps, idle, windows, files and more)", false],
  ["screen", "Reads the screen (colors, images and text)", false],
  ["macros", "Runs or stops your other macros", false],
  ["globals", "Reads or changes global variables", false],
];

const INSTRUCTIONS: Record<string, string[]> = {
  Command: ["commands"],
  OpenApp: ["commands"],
  CloseApp: ["commands"],
  HttpRequest: ["network"],
  WriteFile: ["files_write"],
  Token: ["input"],
  SetClipboard: ["clipboard"],
  WhenClipboardChanged: ["clipboard"],
  WindowAction: ["windows"],
  MoveWindow: ["windows"],
  WhenWindow: ["windows"],
  WhenApp: ["windows"],
  WhenTyped: ["input"],
  WhenFileChanged: ["files_read"],
  RunMacro: ["macros"],
  StopMacroNamed: ["macros"],
  FindImage: ["screen"],
  WaitForImage: ["screen"],
  DetectObjectsInWindow: ["screen"],
  WaitForDetection: ["screen"],
  ClickImage: ["input", "screen"],
  AimAtDetection: ["input", "screen"],
  AimStep: ["input"],
  SetGlobal: ["globals"],
  ChangeGlobal: ["globals"],
  PasteText: ["input", "clipboard"],
};

const OPERATORS: Record<string, string> = {
  ShellOutput: "commands",
  ShellSucceeded: "commands",
  HttpGet: "network",
  ReadFile: "files_read",
  FileExists: "files_read",
  ListDirectory: "files_read",
  ClipboardText: "clipboard",
  ClipboardHasImage: "clipboard",
  ClipboardHasFiles: "clipboard",
  ActiveWindowTitle: "windows",
  ActiveWindowApp: "windows",
  WindowExists: "windows",
  WindowInfo: "windows",
  AppRunning: "windows",
  MacroRunning: "macros",
  PixelColor: "screen",
  AverageColor: "screen",
  ScreenText: "screen",
  GlobalVariable: "globals",
  Secret: "secrets",
};

/** Lowercase letters, digits and dashes, like blockwork-core's slug. */
export function slug(text: string): string {
  let out = "";
  for (const c of text.trim()) {
    if (/[\p{Alphabetic}\p{N}]/u.test(c)) {
      out += c.toLowerCase();
    } else if (out && !out.endsWith("-")) {
      out += "-";
    }
  }
  return out.replace(/-+$/, "");
}

export function blockName(def: any): string {
  const words: string[] = [];
  for (const piece of Array.isArray(def?.pieces) ? def.pieces : []) {
    if (piece?.kind === "Label") words.push(String(piece.text ?? "").trim());
    else words.push(`(${String(piece?.name ?? "")})`);
  }
  return words.filter((w) => w).join(" ");
}

// The variant name of a serialized InstructionKind: "WhenRan" or {"Token": ...}.
function variant(kind: unknown): string | null {
  if (typeof kind === "string") return kind;
  if (kind && typeof kind === "object" && !Array.isArray(kind)) {
    const keys = Object.keys(kind);
    if (keys.length === 1) return keys[0];
  }
  return null;
}

/** Everything the pack's blocks can do. Walks the whole document, so it errs towards listing too much. */
export function capabilities(blocks: unknown): string[] {
  const found = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (obj.kind === "Op" && typeof obj.op === "string" && OPERATORS[obj.op]) {
      found.add(OPERATORS[obj.op]);
    }
    if ("id" in obj && "kind" in obj) {
      const name = variant(obj.kind);
      if (name) {
        INSTRUCTIONS[name]?.forEach((c) => found.add(c));
        if (name.startsWith("When") && name !== "WhenRan") found.add("triggers");
      }
    }
    Object.values(obj).forEach(walk);
  };
  walk(blocks);
  return CAPABILITIES.map(([kind]) => kind).filter((kind) => found.has(kind));
}

/** Parses an upload, or says why it can't be accepted. */
export function readPack(bytes: Uint8Array): PackMeta | string {
  if (bytes.byteLength > MAX_PACK_BYTES) return "That file is over 2 MB.";
  let value: any;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    return "That isn't a block pack. Make one in Blockwork with \"Share blocks as a pack...\".";
  }
  if (!value || typeof value !== "object" || !("blockwork_block_pack" in value)) {
    return "That isn't a block pack. Make one in Blockwork with \"Share blocks as a pack...\".";
  }
  if (value.blockwork_block_pack !== 1) return "This pack was made by a newer version of Blockwork than the library supports.";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name) return "The pack has no name.";
  if (name.length > 80) return "The pack's name is over 80 characters.";
  const rawId = typeof value.id === "string" && value.id.trim() ? value.id : name;
  const id = slug(rawId);
  if (!id) return "The pack's id is empty.";
  if (id !== rawId) return `The pack's id should be "${id}". Share it again from Blockwork to fix it.`;
  if (id.length > 64) return "The pack's id is over 64 characters.";
  const description = typeof value.description === "string" ? value.description.trim() : "";
  if (description.length > 500) return "The description is over 500 characters.";
  const version = typeof value.version === "string" ? value.version.trim() : "";
  if (version.length > 32) return "The version is over 32 characters.";
  const defs = value.blocks?.block_defs;
  if (!Array.isArray(defs) || defs.length === 0) return "The pack has no blocks.";
  if (defs.length > 200) return "The pack has over 200 blocks.";
  if (defs.some((d: any) => typeof d?.id !== "string" || !Array.isArray(d?.pieces))) return "The pack's blocks are broken.";
  for (const def of defs) {
    for (const piece of def.pieces) {
      if (piece?.kind !== "Input" || piece.default_value == null) continue;
      const value = piece.default_value;
      const valid = piece.value_type === "Bool"
        ? value.kind === "Bool" && typeof value.value === "boolean"
        : (value.kind === "Text" && typeof value.value === "string")
          || (value.kind === "Number" && typeof value.value === "number" && Number.isFinite(value.value));
      if (!valid) return `Input "${piece.name}" needs a literal default matching its type.`;
    }
  }
  return { id, name, description, version, blocks: defs.map(blockName), capabilities: capabilities(value.blocks) };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
