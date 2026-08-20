# Notice

## Clean-room implementation

Mori is an independent, clean-room reimplementation of a spaced-repetition
flashcard application compatible with the Anki `.apkg` deck package format.
No source code from `ankitects/anki`, `ankidroid/Anki-Android`, or any AGPL
fork of either project has been copied, transliterated, or ported into this
repository.

File formats and database schemas are not copyrightable. This project was
built by reading public format documentation and Anki's published `.proto`
schema definitions, and by independently observing the behaviour of the
file format — not by reading and rewriting Anki's implementation.

## Trademark

Anki is a trademark of its respective owner. Mori is not called "Anki" and
does not use Anki's logo or colour palette. Mori is described as importing
`.apkg` decks / reading Anki deck packages, never as "Anki for web" or an
"AnkiWeb clone."

## Licence

Mori is licensed AGPL-3.0-or-later. This is a values decision, not a legal
obligation inherited from any AGPL codebase — Mori contains no Anki code.

## Third-party licences

- FSRS scheduling algorithm — MIT (`open-spaced-repetition/py-fsrs`,
  `open-spaced-repetition/ts-fsrs`).

This file will be updated as further third-party dependencies are added.
