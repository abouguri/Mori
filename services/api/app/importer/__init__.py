import sys
from pathlib import Path

# The generated app/importer/proto/anki/*_pb2.py files import each other as
# `from anki import X_pb2` (absolute — matching how `make proto` invoked
# protoc against the vendored .proto files' own `import "anki/x.proto"`
# statements), so `anki/` needs to be importable as a top-level package.
# Bootstrapping it here, in the importer package's own __init__, means it's
# in place before any submodule (apkg.py, modern.py, ...) runs its own
# `from anki import ...` — no fragile same-file import-order dependency.
_proto_dir = Path(__file__).parent / "proto"
if str(_proto_dir) not in sys.path:
    sys.path.insert(0, str(_proto_dir))
