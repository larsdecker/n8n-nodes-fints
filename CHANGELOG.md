# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Improved FinTS 3.0 decoupled TAN flow to reuse one authenticated dialog across `accounts()` and `statements()` requests in a single execution item, preventing repeated push/TAN prompts.
- Decoupled TAN confirmation now uses `dialog.handleDecoupledTan(...)` when the TAN challenge is raised during dialog initialization, including support for return-code combinations like `3955` + `HITAN`.

### Dependencies

- Bumped `fints-lib` from `0.11.0` to `0.12.0`.

## [0.15.0] - 2026-04-17

### Added

- **Decoupled TAN support (AppTAN / PushTAN)**: The node can now handle 2FA flows that require a push notification or app approval instead of a classic chip-TAN. This enables compatibility with banks like Sparda Bank.
  - New optional parameter **TAN Wait Timeout** (seconds) to control how long the node waits for the user to confirm the TAN in their banking app.
- **FinTS 4.1 (experimental) protocol support**: A new `fintsProtocol` parameter lets you choose between three modes:
  - **FinTS 3.0 (Stable)** – the established MT940-based flow (default, recommended).
  - **FinTS 4.1 (Experimental)** – the newer XML-based protocol.
  - **Auto-Detect (Prefers 4.1, Falls Back to 3.0)** – the node probes whether your bank supports FinTS 4.1 and automatically falls back to FinTS 3.0 if not. An incorrect PIN is reported immediately without attempting the fallback.
- Distinct PIN error handling in the auto-detect flow so authentication failures are surfaced as clear `NodeOperationError` messages.
- Debug log output for authentication error branches to simplify troubleshooting.

### Changed

- The internal FinTS client creation is now handled by a dedicated `resolveFinTSClient` helper, improving code organisation and testability.
- Protocol selection was consolidated from two separate parameters into a single `fintsProtocol` dropdown parameter.
- FinTS protocol types and config mapping are now strictly typed.

### Fixed

- `tanWaitTimeout` is now validated with a null-coalescing guard and raises a `NodeOperationError` for invalid values instead of passing `undefined` to the FinTS library.
- Minor wording improvements in parameter descriptions and guards after code review.

### Dependencies

- Bumped `@typescript-eslint/parser` from 8.57.1 → 8.58.2.
- Bumped `prettier` from 3.8.1 → 3.8.2.

---

## [0.14.0] - 2025-10-01

### Added

- Exclude IBANs / Account Numbers parameter to filter out specific accounts from results.
- Firefly III field mapping (`firefly` nested object) with SEPA end-to-end reference support.
- Initial FinTS product registration ID (`fintsProductId`) parameter.

### Changed

- README clarified regarding FinTS credentials and product ID requirements.

---

## [0.13.0] and earlier

See the [GitHub release history](https://github.com/larsdecker/n8n-nodes-fints/releases) for earlier versions.
