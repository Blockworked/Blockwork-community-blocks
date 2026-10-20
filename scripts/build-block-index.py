#!/usr/bin/env python3
"""Rebuilds index.json from the pack files next to it.

Each entry pins its pack's SHA-256, so Blockwork refuses a download that
doesn't match. Run it after adding or changing a pack:

    python3 scripts/build-block-index.py [repo root]
"""

import hashlib
import json
import sys
from pathlib import Path


def block_name(defn):
    words = []
    for piece in defn.get("pieces", []):
        if piece.get("kind") == "Label":
            words.append(piece.get("text", "").strip())
        else:
            words.append("(" + piece.get("name", "") + ")")
    return " ".join(w for w in words if w)


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent.parent)
    entries = []
    seen = set()
    for path in sorted((root / "packs").glob("*.json")):
        data = path.read_bytes()
        pack = json.loads(data)
        if pack.get("blockwork_block_pack") != 1:
            sys.exit(f"{path} isn't a block pack")
        pack_id = pack.get("id", "")
        if not pack_id or pack_id in seen:
            sys.exit(f"{path} needs a unique id")
        seen.add(pack_id)
        entries.append({
            "id": pack_id,
            "name": pack.get("name", pack_id),
            "description": pack.get("description", ""),
            "author": pack.get("author", ""),
            "version": pack.get("version", ""),
            "url": "packs/" + path.name,
            "sha256": hashlib.sha256(data).hexdigest(),
            "blocks": [block_name(d) for d in pack.get("blocks", {}).get("block_defs", [])],
        })
    index = {"blockwork_block_index": 1, "name": "Blockwork community blocks", "packs": entries}
    (root / "index.json").write_text(json.dumps(index, indent=2) + "\n")
    print(f"{len(entries)} packs in {root / 'index.json'}")


if __name__ == "__main__":
    main()
