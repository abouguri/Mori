# Run inside the activated venv (needs grpcio-tools, a dev dependency).
.PHONY: proto
proto:
	python3 -m grpc_tools.protoc \
		-I app/importer/proto \
		--python_out=app/importer/proto \
		app/importer/proto/anki/*.proto
