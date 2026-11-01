> Candidate update: production requires automatic delivery and is currently blocked on the classic host. Manual pull/owned-run flows below are diagnostic/test-only. See [current lifecycle contract](message-lifecycle.md) for hidden operation keys and new APIs. Historical fixture pins are separate from the runtime candidate.

# Native plugin verification (October 24, 2026)

The current default package adds native session-keyed cooperative tools and a self-contained pinned reference runtime. CI runs the full suite with the integrity-verified official OpenCode 1.19.4 Linux x64 fixture (embedded Bun 1.4.4).

The new end-to-end test packs the actual npm package, extracts it to a disposable directory, loads that package's production plugin entry in the actual OpenCode CLI, connects to a real local Psst server over certificate-verified HTTPS with a disposable trusted CA, receives and explicitly acknowledges two FIFO messages, and sends a reply. It uses a deterministic local model provider, not a remote provider account. It exercises real native tool contexts, real BrokerClient requests and real SQLite in Bun. Temporary credentials are fixture-only; no live broker or user's sandbox is contacted.

Other tests cover exact-session isolation, concurrent initialization, invalid/cancelled contexts, session deletion/disposal, non-blocking chat warm-up when SDK verification stalls, enrollment config permissions/type/URL checks, the explicit model-read acknowledgment ledger, packet contents and reference integrity. npm pack excludes broker daemon/test fixtures, credentials and journals.

No test proves live provider authentication, every third-party plugin combination, every OpenCode version/platform, a human TUI's continued presence, or automatic model wakeup. Normal plugin registration is native-session scoped, not TUI ownership. Restarts create a new broker address and retain old journals without replay. Native consumption/action success is never claimed from a cooperative tool return.

## Run all native checks

```sh
npm ci --ignore-scripts
npm ci --prefix test/official-cli --ignore-scripts
OPENCODE_BINARY="$PWD/test/official-cli/node_modules/opencode-linux-x64/bin/opencode" npm test
npm run check
npm run pack:check
```

Without OPENCODE_BINARY, actual-CLI tests are explicitly skipped, not treated as passed. CI supplies the binary. The final PR commit/CI is the authoritative evidence for the current test count.

---

## Historical foundation verification

## Evidence (2026-10-23 UTC)

Pinned components:

- Node **24.19.0** for launcher and test orchestration.
- Official `@opencode-ai/plugin` **1.19.4**, Zod **4.1.8**; lockfile integrity pins,
  installed with lifecycle scripts disabled.
- Official Linux x64 OpenCode **1.19.4**, embedded Bun **1.4.4**; npm tarball
  integrity and executable SHA256 pinned in the fixture/launcher.
- Shared broker/reference **`ba2219cd87a1feac23e01b23d2c2b3d3bdd65359`**,
  source-byte verified before import.

The aggregate suite has **25 tests**. The final exact-SHA CI and independent-review
checkpoint is recorded in the draft PR. A skipped optional native test is not a
native pass; CI supplies the pinned binary so it must execute that test.

### Shared transport and factory gate

The original 16 tests exercise the official native helper and strict shared
schemas; exact session/project/worktree/lifetime/cancellation guards; reconnect
and close-during-registration/final-epoch races; metadata/send-key recovery;
concurrent native contexts; hostile-text provenance; inbox dedupe/FIFO blocking;
and pre-import reference tamper/symlink refusal.

One test uses an **actual local HTTP broker + BrokerClient + SQLite inbox** and
native tool-helper execute calls. It verifies durable delivery, cooperative peek,
reply and same-key retry. Its host lifecycle is simulated. Credentials are random
fixture values; HTTP is only the explicit numeric-loopback development mode.

### Fresh owned-run gate

Eight focused tests cover fixed no-attach/no-resume/no-auto arguments, policy and
plugin overlay preservation, unbound native proxies, exact fresh root creation,
second-root/deletion/marker revocation, PID/starttime/boot-ID mismatch, symlink
records, old or parented native sessions, concurrent disposal and bounded SDK
reads that never settle.

The ninth uses the **actual pinned OpenCode CLI and actual `launchOwnedRun`**:
private child-incarnation record → native root session/chat hooks → cooperative
list/send/receive tools → close/dispose → marker revocation. Its deterministic
local provider receives the fixed untrusted-agent provenance inside the actual
model-facing tool result, not just terminal output. Existing `bash: deny` policy
is retained; an attempted fixture command does not execute. A swallowed/no-plugin
startup followed by native exit zero is rejected for missing binding proof, with
no automatic retry of the prompt.

**Boundary:** that native test substitutes a fixture plugin constructor only to
inject fake broker client methods. The adapter factory, shared runtime and SQLite
are real; the default production HTTPS transport is not exercised inside that
same native process. This gate and the separate real-broker transport gate must
not be represented as one live end-to-end transport certification.

## Reproduce in isolated local directories

The repository-local installs below do not alter a global CLI or package prefix:

```sh
node --version # v24.19.0
npm ci --ignore-scripts --no-audit --no-fund
npm ci --prefix test/official-cli --ignore-scripts --no-audit --no-fund
echo '538fcb1b6408c8d4608822acee19f7ff5b3a3eb3383c0633c4f06170857312a7  test/official-cli/node_modules/opencode-linux-x64/bin/opencode' | sha256sum -c -
export BROKER_REFERENCE_DIR=/absolute/path/to/pinned/ai-agent-msg-broker
export OPENCODE_TOOL_MODULE="$PWD/node_modules/@opencode-ai/plugin/dist/tool.js"
export OPENCODE_BINARY="$PWD/test/official-cli/node_modules/opencode-linux-x64/bin/opencode"
npm run check
npm test
```

The reference checkout must include its `test/helpers.mjs` for the local HTTP
fixture. The native test uses disposable HOME/project/config/state and a local
file-backed model module; no real provider authentication or model call is used.
No test paths or credentials are exposed as model tool arguments. GitHub Actions
pins actions, helper/executable packages, the shared reference and Node, and runs
only isolated tests—not deployment.

## Still not verified or implemented

Real provider credentials/native permission UI; default-plugin-to-real-HTTPS
transport in the actual CLI; arbitrary existing plugin combinations; other
OpenCode versions/platforms; existing TUI/server-session attachment; native
consumption receipts; automatic input insertion/wakeup or atomic human/agent
arbitration; per-CLI Podman containers or two-host LAN operation.

`broker_receive` remains a non-consuming FIFO **peek**. A native tool return or
model read does not advance the inbox. See [owned-run instructions](owned-run.md)
for operator requirements and failure/unknown-outcome behavior.

## Explicit connection regression coverage

The packed production plugin is loaded by official OpenCode 1.19.4 with no `PSST_CONFIG_FILE`. A native session command connects using a private file, discovery sees the exact new session, and native disconnect prevents subsequent message injection while the host remains available. The fixture uses a deterministic local model provider and a trusted loopback TLS broker; no paid provider, user credential, desktop/TUI automation, or production installation is exercised. Unit tests cover disconnected startup, session-isolated status, disconnect/no re-registration, and deleted-session fencing. Automatic model delivery and pairing issuance are separate changes, not claims of this connection-only step.

## Experimental native delivery (explicit opt-in only)

The second actual-host regression loads the npm-packed production plugin into official OpenCode 1.19.4/Bun, connects with no startup broker environment, sends two FIFO messages through verified TLS, with the fixed-session-snapshot experimental opt-in, preserves Plan mode and the selected model, and observes both exact synthetic native messages and the second payload in the deterministic local model's input. It never calls `broker_receive`, never accesses paid providers, and verifies disconnect prevents later injection. This proves real native integration, not a desktop/TUI end-to-end installation or production-broker test. Unit regressions cover missing/wrong readback, single in-flight FIFO, busy/reverted/human boundaries, compaction during submit, abort during receipt lookup, lost submit responses, delayed readback reconciliation and same-session journal reopen without another native submission. Native source basis: `packages/opencode/src/session/prompt.ts`, `effect/runner.ts`, and `server/routes/instance/httpapi/handlers/session.ts` at official tag v1.19.4.

## Scoped pairing boundary

A further actual OpenCode smoke loads the packed plugin, passes only a private pairing-file path to the native command, and exercises the unmodified shared enrollment helper over system-trusted HTTPS. A synthetic endpoint implementing the frozen broker contract records a hash-only credential and authorizes it in the real transport fixture; automatic peer messages then reach the deterministic local model. This checks native/helper/credential integration, not the production broker's operator issuance implementation (covered by upstream broker tests). Unit tests additionally cover marked bundle receipt deletion/type/origin/token mismatches, private permissions, per-native-session attempt separation, expiry shutdown, revoked authorization shutdown and no late connect after disconnect.

The default connector reports automatic readiness blocked; manual receive requires an explicit diagnostic request. Additional pinned-host coverage proves that the official v2 session identity is visible while its context/history remain empty for a classic CLI conversation with real messages. The connector does not mix these engines. Unknown agent/model state blocks the experiment and observed changes disconnect it. No test establishes atomic admission against simultaneous external native selection edits.

## URL-only approval and persistent native configuration (0.3.0 candidate)

The new gates use official **OpenCode 1.19.4**, not a mocked host API:

- `native-tui.test.mjs`: loads the production TUI entrypoint and sends real PTY
  keyboard input through the supported Ctrl+Alt+P setup binding. Invalid URLs
  remain unselected; the single-field URL form durably saves its request before
  attempted HTTPS transport. This is a disposable test terminal, not a user's TUI.
- `native-tui-approval.test.mjs`: loads the production TUI and server entrypoints;
  a transparent fixture creates/navigates to an empty existing classic session
  using the supported SDK. Real keyboard setup requests actual broker enrollment;
  authenticated admin form/CSRF approval commits config; the private native-context
  hint connects that already-idle session. Its native message history remains
  empty, proving setup/attachment did not manufacture a model turn.
- `native-approval-integration.test.mjs`: real broker approval, 30 distinct native
  sessions in the packed production plugin, process restart with unchanged
  installation authorization and new session addresses, then real admin revocation.
- `native-installation.test.mjs`: preserves legacy installation compatibility
  across the same native 30-session/restart path.
- `installation.test.mjs`, `setup-ui.test.mjs`, and `native-context.test.mjs` cover
  selection CAS, cancellation/late results, exact request binding, replacement,
  transient backoff, GET-only startup resume, terminal denial/revocation/expiry,
  corrupt/private files, distinct container runtime roots, stale incarnation/owner
  hints and route changes. These unit fixtures are not real container orchestration.

CI checks out the immutable broker dependency specified in `.github/workflows/ci.yml`
and supplies `PSST_APPROVAL_BROKER_DIR`; without it the real-broker native gates
explicitly skip. Locally point that variable at that exact reviewed broker tree.
No provider credentials, live broker, real user installation or release is used.
The helper hash/source anchor is recorded in `vendor/enrollment/ORIGIN.md`.

**Not established by these gates:** paid/authenticated model provider behavior,
classic atomic automatic model receive (the fresh native regression demonstrates
why it is unsafe), or unchanged historical sandbox pure-mode policy permitting
plugins. Native process recreation is not itself Docker/Podman mount evidence;
real orchestration gates are reported separately rather than inferred from unit
fixtures. See `docs/sandbox-persistence.md` for the exact audited bootstrap boundary.

The separate `native-containers` CI matrix runs the approved 30-session/revocation
native test with each official OpenCode server inside a fresh Docker or rootless
Podman container, using the pinned Node image and integrity-checked official CLI.
On recreation the test uses a new HOME/data/cache/state; only the private selected
installation plus read-only installed code/bootstrap fixtures remain available.
The runtime `/tmp` hints are not mounted. A submitted workflow is not a pass:
the exact PR head's Docker and Podman jobs are the authoritative execution evidence.
