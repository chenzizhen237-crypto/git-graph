# Git Graph tasks. `just` lists them.

[private]
default:
    @just --list

# Install dependencies
install:
    pnpm install --frozen-lockfile

# Desktop app in development
app:
    pnpm app

# Web view only at the Vite dev server; git and GitHub calls need the app
dev:
    pnpm dev

# Typecheck, build the web view
build:
    pnpm build

# Installers in src-tauri/target/release/bundle
bundle:
    pnpm bundle

# Typecheck, lint and format check; tests run on Jimmy
check:
    pnpm typecheck
    pnpm lint
    pnpm format:check

# Rust format check and clippy
check-rust:
    cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings

# Unit tests on Jimmy: `just test src/lib/__tests__/counts.test.ts`
test *args:
    jimmy-test -- pnpm exec vitest run {{args}}

# Everything CI runs, on Jimmy
ci:
    jimmy-test ci

# Fix formatting and lint
format:
    pnpm format
    pnpm lint:fix

# Regenerate the CSS and Tailwind tokens from the design file
tokens:
    pnpm tokens

# Copy the Nib design into the repository, then regenerate the tokens
design:
    ./assets/sync-design.sh
    pnpm tokens

# Merge a branch onto main, test that merge on Jimmy, and push main if it passes: `just land <branch>`
land *args:
    bash scripts/land.sh {{args}}

# Build and publish a release on Jimmy from main
release:
    jimmy-test --ref main -- pnpm release
