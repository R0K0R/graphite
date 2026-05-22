.PHONY: install build electron dev

NPM ?= npm
ELECTRON ?= $(shell command -v electron 2>/dev/null || echo npx electron)

install:
	$(NPM) install

build:
	$(NPM) run build

electron: build
	$(ELECTRON) .

dev:
	$(NPM) run dev
