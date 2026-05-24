.PHONY: install build electron electron-a electron-b dev

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

dev:
	ELECTRON_EXEC="$(ELECTRON)" $(NPM) run dev
