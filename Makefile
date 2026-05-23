.PHONY: install build electron dev

NPM      ?= npm
ELECTRON ?= $(shell command -v electron 2>/dev/null || echo npx electron)

install:
	$(NPM) install

build:
	$(NPM) run build

electron: build
	ELECTRON_EXEC="$(ELECTRON)" $(NPM) run electron

dev:
	ELECTRON_EXEC="$(ELECTRON)" $(NPM) run dev
