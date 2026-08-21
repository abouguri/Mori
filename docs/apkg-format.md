# `.apkg` format — implementation notes

Findings and decisions made while building the importer (M2), beyond what's
already specified in `AGENT.html` §05–§07. Add to this file as new quirks
turn up; don't regenerate it from scratch.

## Legacy schema (v11)

Confirmed against the public schema layout (`col`, `notes`, `cards`, `revlog`,
`graves`). No Anki source was read to build this — see `NOTICE.md`.

- `col` has exactly one row; `models`/`decks`/`dconf` are JSON text columns.
- Deck names use `\x1f` as the hierarchy separator on import
  (`services/api/app/importer/normalize.py::import_decks`), reusing the same
  `create_deck_path` walker that the manual "New deck" UI uses with `::` —
  see `services/api/app/services/decks.py`.
- The `cards` table is authoritative for which (note, template) pairs exist.
  Anki has already applied its own "blank front → no card" and
  "one card per cloze number" rules by the time a `.apkg` is exported, so the
  importer does **not** re-derive card generation from templates — it just
  imports whatever rows are in `cards`. The renderer's card-generation rule
  (§09.1) only matters later, when a note is edited inside Mori itself (M3+).

## Deliberate limitations in the M2 importer

- **Modern format (`collection.anki21b`, schema v18) is not supported yet.**
  Detected and rejected with `UNSUPPORTED_SCHEMA` — lands in M7.
- **Filtered decks are not specially handled.** `odue`/`odid` are ignored;
  a card pulled into a filtered deck at export time imports using its home
  deck and `due` as given. Revisit alongside M7 or the review loop (M4) if
  filtered-deck decks show up in real test decks.
- **`revlog` import is capped** at the most recent `REVLOG_IMPORT_CAP =
  100_000` entries per collection (`importer/legacy.py`). The spec calls for
  "batched and capped" without a number; 100k bounds worst-case import time
  on decks with years of daily history without being restrictive for normal
  use. Raise it if a real deck's history matters and gets truncated.
- **Imported `review_logs` rows are approximate**, same spirit as the FSRS
  Tier 1 seeding note in §08.3:
  - `state_before` is Anki's raw `revlog.type` (0 learn / 1 review / 2
    relearn / 3 filtered / 4 manual) — not translated to Mori's `state` enum,
    since the two don't map cleanly.
  - `elapsed_days` is always `0` for imported rows. Anki's revlog doesn't
    store it directly, and deriving it from gaps between consecutive
    revlog ids for the same card was judged not worth the complexity for
    data that's already historical and not re-scheduled.
  - `scheduled_days` converts Anki's negative (sub-day, in seconds) intervals
    to a rounded day count via `max(1, round(-ivl / 86400))`.
- **SVG media is stored as-is at import time**, not sanitized. The spec's
  defense-in-depth for SVG (§07.4) is sanitize-at-import *and*
  `Content-Security-Policy: sandbox` at render time. Only the CSP half
  exists so far — SVG content sanitization is still open; don't serve
  imported SVGs outside the sandboxed iframe until it's added.

## Template sanitization (retrofitted from M2 into M3)

§07.4 says card templates must be sanitized at import ("Card templates may
contain `<script>`. Strip at import"). This was missed in the original M2
pass and got caught while building the M3 renderer's sandboxing story —
added now via `services/api/app/importer/sanitize.py` (`nh3`, a Rust/Ammonia
allow-list sanitizer), applied to `qfmt`/`afmt` in
`normalize.py::import_note_types`. `{{Field}}`-style tags are plain text to
an HTML parser and pass through untouched; only real markup is filtered.

External media/tracking pixels in templates (`<img src="https://evil/…">`)
are intentionally *not* blocked at the sanitizer layer — that's the render-time
iframe CSP's job (`img-src`/`media-src` restricted to the media origin),
which a browser enforces regardless of what the HTML string contains, unlike
string-level filtering which is easier to bypass.

## Test fixtures

There's no Anki install in this environment to export real fixtures from.
`services/api/tests/fixtures/apkg_builder.py` builds synthetic legacy-schema
`.apkg` files directly against the documented SQLite layout above — it's
recreating a public format, not derived from Anki source. Fixtures are built
fresh at test time rather than committed as binaries, including a 10,000-note
cloze deck for the M2 acceptance criterion ("10k-note cloze deck imports with
correct counts").

**This is a stand-in.** If real Anki-exported `.apkg` fixtures become
available (images/audio/LaTeX/nested-deck decks, per §12), commit them to
`services/api/tests/fixtures/*.apkg` and prefer them over the synthetic
builder for anything asserting real-world fidelity — the synthetic builder
can't catch quirks in decks it wasn't told to reproduce.
