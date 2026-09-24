# SPDX-FileCopyrightText: 2026 BeeFlow
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Quantum Chess: build, test, lint, package and sign.
#
#   make                    list the targets
#   make build              install JS dependencies (npm ci, only when needed) and build js/
#   make test               JS unit tests (Vitest) and PHP unit tests (PHPUnit)
#   make lint               ESLint, comment references, php -l, php-cs-fixer, Psalm, info.xml schema, SPDX headers
#   make appstore           build/artifacts/quantumchess.tar.gz with runtime files only
#   make sign KEY=… CERT=…  code-sign the package with occ and write the tarball signature
#   make e2e                Playwright end-to-end tests against a running Nextcloud
#
# The app has no runtime Composer dependencies: Nextcloud autoloads lib/ through the <namespace> of
# appinfo/info.xml, so vendor/ (development tools only) is never shipped.

APP_NAME := quantumchess
BUILD_DIR := build
ARTIFACTS_DIR := $(BUILD_DIR)/artifacts
TOOLS_DIR := $(BUILD_DIR)/tools
STAGE_DIR := $(ARTIFACTS_DIR)/$(APP_NAME)
TARBALL := $(ARTIFACTS_DIR)/$(APP_NAME).tar.gz

# Everything the app needs at runtime. Anything else (src/, tests/, docs/, tools/, vendor/, node_modules/,
# dotfiles) stays out of the package. .nextcloudignore removes unwanted files inside these paths.
APPSTORE_PATHS := appinfo lib templates js assets img l10n LICENSE README.md CHANGELOG.md

# Root of a Nextcloud server checkout (for occ). Defaults to the usual apps/<app> or custom_apps/<app> layout.
NEXTCLOUD ?= $(abspath ../..)
OCC ?= php $(NEXTCLOUD)/occ

NPM ?= npm
COMPOSER ?= composer
TAR ?= tar
OPENSSL ?= openssl

# App Store schema for info.xml (the one the App Store validates uploads against)
INFO_XSD_URL := https://raw.githubusercontent.com/nextcloud/appstore/master/nextcloudappstore/api/v1/release/info.xsd
INFO_XSD ?= $(TOOLS_DIR)/info.xsd

# Reproducible archives with GNU tar: sorted entries, no owner names, mtime of the last commit
SOURCE_DATE_EPOCH ?= $(shell git log -1 --format=%ct 2>/dev/null || date +%s)
TAR_REPRO := $(shell $(TAR) --version 2>/dev/null | grep -q 'GNU tar' && echo '--sort=name --owner=0 --group=0 --numeric-owner --mtime=@$(SOURCE_DATE_EPOCH)')

# Files that must carry an SPDX header (generated, vendored and fixture files are excluded)
SPDX_GLOBS := '*.php' '*.js' '*.mjs' '*.cjs' '*.ts' '*.vue' '*.scss' '*.yml' '*.yaml'
SPDX_EXCLUDE := ^(js|assets|vendor|node_modules|l10n|build|tests/fixtures)/

.DEFAULT_GOAL := help
.PHONY: help build dev test test-js test-php lint lint-js lint-refs lint-php cs psalm lint-xml lint-spdx appstore sign \
	check-runtime-deps version-check e2e l10n-pot l10n clean distclean

help: ## List the targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# --- Dependencies -----------------------------------------------------------------------------------------

# npm ci only when package.json or the lock file changed since the last install
node_modules/.package-lock.json: package.json package-lock.json
	$(NPM) ci
	@touch $@

vendor/autoload.php: composer.json composer.lock
	$(COMPOSER) install --no-interaction --prefer-dist
	@touch $@

# --- Build ------------------------------------------------------------------------------------------------

build: node_modules/.package-lock.json ## Build the JavaScript bundles into js/ (production)
	$(NPM) run build

dev: node_modules/.package-lock.json ## Build the JavaScript bundles with source maps for development
	$(NPM) run dev

# --- Tests and linters ------------------------------------------------------------------------------------

test: test-js test-php ## Run the JS and PHP unit tests

test-js: node_modules/.package-lock.json ## Run the Vitest unit tests
	$(NPM) test

test-php: vendor/autoload.php ## Run the PHPUnit unit tests
	$(COMPOSER) run test:unit

lint: lint-js lint-refs lint-php cs psalm lint-xml lint-spdx ## Run every linter and static check

lint-js: node_modules/.package-lock.json ## ESLint (fails on warnings too)
	$(NPM) run lint

lint-refs: ## Check doc paths, Markdown links and planning references in comments
	$(NPM) run lint:refs

lint-php: ## php -l on every PHP file
	$(COMPOSER) run lint

cs: vendor/autoload.php ## PHP coding standard (php-cs-fixer, dry run)
	$(COMPOSER) run cs:check

psalm: vendor/autoload.php ## Psalm static analysis
	$(COMPOSER) run psalm

$(INFO_XSD):
	@mkdir -p $(dir $@)
	curl -fsSL -o $@ $(INFO_XSD_URL)

lint-xml: $(INFO_XSD) ## Validate appinfo/info.xml against the App Store schema
	xmllint --noout --schema $(INFO_XSD) appinfo/info.xml

lint-spdx: ## Check that source files carry an SPDX licence header
	@missing=$$(git ls-files -co --exclude-standard -- $(SPDX_GLOBS) Makefile \
		| grep -Ev '$(SPDX_EXCLUDE)' \
		| while read -r f; do [ -f "$$f" ] && ! head -n 12 "$$f" | grep -q 'SPDX-License-Identifier' && echo "$$f"; done); \
	if [ -n "$$missing" ]; then echo "Missing SPDX-License-Identifier header:"; echo "$$missing" | sed 's/^/  /'; exit 1; fi; \
	echo "SPDX headers: ok"

# --- Release ----------------------------------------------------------------------------------------------

check-runtime-deps: ## Fail if composer.json gained runtime dependencies (the package ships without vendor/)
	@php -r '$$x = preg_grep("/^(php|ext-.+)$$/", array_keys(json_decode(file_get_contents("composer.json"), true)["require"] ?? []), PREG_GREP_INVERT); if ($$x) { fwrite(STDERR, "Runtime Composer dependencies are not packaged: " . implode(", ", $$x) . PHP_EOL); exit(1); }'

# A pre-release (a version with "-") keeps its notes under "## [Unreleased]": the App Store shows that section for it.
version-check: ## Check that info.xml, package.json and CHANGELOG.md agree (and TAG=vX.Y.Z, if given)
	@info=$$(sed -n 's:.*<version>\(.*\)</version>.*:\1:p' appinfo/info.xml | head -n 1); \
	pkg=$$(node -p "require('./package.json').version"); \
	log=$$(sed -n 's/^## \[\([0-9][^]]*\)\].*/\1/p' CHANGELOG.md | head -n 1); \
	case "$$info" in *-*) \
		notes=$$(awk '/^## \[Unreleased\]/ { f = 1; next } /^## \[/ { f = 0 } f && NF' CHANGELOG.md | head -n 1); \
		[ -n "$$notes" ] || { echo "Pre-release $$info: write its notes under ## [Unreleased] (the App Store shows that section)"; exit 1; }; \
		log="$$info"; echo "CHANGELOG.md: pre-release notes under [Unreleased]";; \
	esac; \
	echo "info.xml $$info · package.json $$pkg · CHANGELOG.md $$log$(if $(TAG), · tag $(TAG))"; \
	[ "$$info" = "$$pkg" ] && [ "$$info" = "$$log" ] || { echo "Versions differ"; exit 1; }; \
	[ -z "$(TAG)" ] || [ "v$$info" = "$(TAG)" ] || { echo "Tag $(TAG) does not match version $$info"; exit 1; }

appstore: check-runtime-deps build ## Package build/artifacts/quantumchess.tar.gz (runtime files only)
	rm -rf $(STAGE_DIR) $(TARBALL) $(TARBALL).sig
	mkdir -p $(STAGE_DIR)
	$(TAR) -cf - --exclude-from=.nextcloudignore $(wildcard $(APPSTORE_PATHS)) | $(TAR) -xf - -C $(STAGE_DIR)
	$(TAR) -cf - $(TAR_REPRO) -C $(ARTIFACTS_DIR) $(APP_NAME) | gzip -9n > $(TARBALL)
	@echo "Packaged $(TARBALL) ($$(du -h $(TARBALL) | cut -f1), $$($(TAR) -tzf $(TARBALL) | grep -vc '/$$') files)"

# Code signing: occ integrity:sign-app writes appinfo/signature.json into the staged app, the tarball is
# rebuilt, and its App Store signature (SHA-512, base64) is written next to it as quantumchess.tar.gz.sig.
sign: ## Sign the package: make sign KEY=quantumchess.key CERT=quantumchess.crt [NEXTCLOUD=/path/to/server]
	@[ -n "$(KEY)" ] && [ -f "$(KEY)" ] || { echo "KEY=<path to quantumchess.key> is required"; exit 1; }
	@[ -n "$(CERT)" ] && [ -f "$(CERT)" ] || { echo "CERT=<path to quantumchess.crt> is required"; exit 1; }
	@[ -f "$(NEXTCLOUD)/occ" ] || { echo "No Nextcloud server at NEXTCLOUD=$(NEXTCLOUD) (needed for occ integrity:sign-app)"; exit 1; }
	@[ -d "$(STAGE_DIR)/appinfo" ] || { echo "Run 'make appstore' first"; exit 1; }
	rm -f $(STAGE_DIR)/appinfo/signature.json
	$(OCC) integrity:sign-app --privateKey="$(abspath $(KEY))" --certificate="$(abspath $(CERT))" --path="$(abspath $(STAGE_DIR))"
	$(TAR) -cf - $(TAR_REPRO) -C $(ARTIFACTS_DIR) $(APP_NAME) | gzip -9n > $(TARBALL)
	$(OPENSSL) dgst -sha512 -sign "$(KEY)" $(TARBALL) | $(OPENSSL) base64 > $(TARBALL).sig
	@echo "Signed $(TARBALL); App Store signature in $(TARBALL).sig"

# --- End-to-end and translations --------------------------------------------------------------------------

e2e: node_modules/.package-lock.json ## Playwright tests against a running Nextcloud (see tests/e2e/README.md)
	$(NPM) run test:e2e

TRANSLATIONTOOL_URL := https://raw.githubusercontent.com/nextcloud/docker-ci/master/translations/translationtool/translationtool.phar

$(TOOLS_DIR)/translationtool.phar:
	@mkdir -p $(dir $@)
	curl -fsSL -o $@ $(TRANSLATIONTOOL_URL)

# The translation tool treats every directory holding an l10n/ folder as an app, so the staged package goes first.
l10n-pot: $(TOOLS_DIR)/translationtool.phar ## Extract every translatable string into translationfiles/templates/quantumchess.pot (needs xgettext)
	rm -rf $(STAGE_DIR)
	php $(TOOLS_DIR)/translationtool.phar create-pot-files

l10n: $(TOOLS_DIR)/translationtool.phar ## Convert translationfiles/<lang>/quantumchess.po into l10n/<lang>.js and .json
	rm -rf $(STAGE_DIR)
	php $(TOOLS_DIR)/translationtool.phar convert-po-files

# --- Housekeeping -----------------------------------------------------------------------------------------

clean: ## Remove build output (build/, js/, assets/)
	rm -rf $(BUILD_DIR) js assets

distclean: clean ## Also remove node_modules/ and vendor/
	rm -rf node_modules vendor
