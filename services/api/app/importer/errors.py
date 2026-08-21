class ImportFailed(Exception):
    """Raised anywhere in the import pipeline; carries a closed error_code (§07.4)."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def not_a_zip() -> ImportFailed:
    return ImportFailed(
        "NOT_A_ZIP",
        "This file isn't a deck package. Export from Anki with File → Export → Anki Deck Package.",
    )


def no_collection_db() -> ImportFailed:
    return ImportFailed(
        "NO_COLLECTION_DB",
        "This package doesn't contain a deck database. It may be corrupted — try exporting again.",
    )


def unsupported_schema() -> ImportFailed:
    return ImportFailed(
        "UNSUPPORTED_SCHEMA",
        "This deck uses a newer format than Mori reads. Re-export with "
        '"Support older Anki versions" turned on.',
    )


def too_large() -> ImportFailed:
    return ImportFailed(
        "TOO_LARGE",
        "This deck is over 500 MB. Split it into smaller decks and import them one at a time.",
    )


def corrupt_db() -> ImportFailed:
    return ImportFailed(
        "CORRUPT_DB",
        "The deck database couldn't be read. Try opening it in Anki and exporting again.",
    )


def internal() -> ImportFailed:
    return ImportFailed("INTERNAL", "Something broke on our side. The import wasn't saved — try again.")
