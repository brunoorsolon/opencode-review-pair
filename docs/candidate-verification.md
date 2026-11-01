# Unreleased candidate verification — 2026-11-01

Related issue: #8; not closed by this partial delivery.

## Checked locally

Syntax, all 103 tests and package checks passed. No native tests were skipped in this run.

Integrity-pinned official OpenCode 1.19.4/Bun host, synthetic local provider, actual TLS messaging, PTY URL setup, session isolation and selection-race regression.

Runtime vendoring is exact Psst candidate `2de9cc3758b9fc593f5afca4fc501fd013d416ec`. Shared acceptance-journal
failure after a remote success reports an unknown effect, never known-not-applied.
Model retry/receipt keys remain private; message ID acknowledgment is still scoped
to a previously exposed exact inbox item. Native messaging calls abort and drain
before their journal closes; lifetime-control operations do not wait on themselves.

## Not established

Production automatic delivery on the classic host remains blocked; explicit diagnostic receive is not a fallback or issue acceptance. The documented V2 2.2.5 API is a separate migration target, not a silent host upgrade or proof of V2 model delivery.

New outgoing history/content/resend/cancel routes require the matching Psst broker.
Older broker send/receive compatibility does not imply availability of new APIs.
These are local candidate results, not published registry versions, deployed code,
remote CI, authenticated-provider acceptance or a release. No permissions, managed
policy, accounts or production host configuration were changed.
