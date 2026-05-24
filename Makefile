.PHONY: install build electron electron-a electron-b dev ws-server

NPM      ?= npm
ELECTRON ?= $(shell command -v electron 2>/dev/null || echo npx electron)

install:
	$(NPM) install

build:
	$(NPM) run build

electron: build
	ELECTRON_EXEC="$(ELECTRON)" $(NPM) run electron

electron-a: build
	"$(ELECTRON)" . --user-data-dir=/tmp/graphite-a

electron-b: build
	"$(ELECTRON)" . --user-data-dir=/tmp/graphite-b

ws-server:
	HOST=localhost PORT=1234 node node_modules/y-websocket/bin/server.js

dev:
	ELECTRON_EXEC="$(ELECTRON)" $(NPM) run dev
