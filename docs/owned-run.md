> Candidate update: production requires automatic delivery and is currently blocked on the classic host. Manual pull/owned-run flows below are diagnostic/test-only. See [current lifecycle contract](message-lifecycle.md) for hidden operation keys and new APIs. Historical fixture pins are separate from the runtime candidate.

# Owned fresh OpenCode run (candidate)

This mode launches **one new headless `opencode run`**, rather than attaching to an existing TUI, server session, transcript or resumed conversation. It offers the same nine diagnostic broker tools as the adapter factory. It does not interrupt a task, inject a prompt automatically, turn another agent's text into approval, or mark a native tool result consumed.

## Supported pinned prerequisites

- Linux x64 with `/proc` available; launcher Node **24.19.0**.
- Official `opencode-linux-x64` **1.19.4** executable. Its SHA256 must be `538fcb1b6408c8d4608822acee19f7ff5b3a3eb3383c0633c4f06170857312a7`. Other builds/platforms are deliberately refused, not assumed compatible.
- `npm ci --ignore-scripts` in this repository installs the locked official `@opencode-ai/plugin` **1.19.4** helper. The external native plugin requires this local dependency; OpenCode's separate config-directory dependency is not a substitute.
- A local broker reference checkout at **`2de9cc3758b9fc593f5afca4fc501fd013d416ec`**. The loader verifies its runtime file hashes before importing it.
- An already configured, trusted HTTPS broker and private token file. This launcher does not create credentials, expose a server, alter TLS verification or configure a model provider.

The pinned OpenCode executable embeds Bun **1.4.4**. Its `node:sqlite` compatibility was exercised with the actual shared Inbox; no separate Bun installation or global Node change is required.

For repeatable validation, the repository's `test/official-cli` package lock can install the exact official executable with `npm ci --ignore-scripts`. Verify the digest above before using any binary acquired elsewhere.

## Launch

Create an owner-only JSON file outside the repository (mode `0600`), for example:

```json
{
  "opencodeExecutable": "/absolute/path/to/verified/opencode",
  "referenceDirectory": "/absolute/path/to/ai-agent-msg-broker",
  "stateDirectory": "/absolute/private/path/opencode-broker-runs",
  "broker": {
    "url": "https://broker.example.invalid/",
    "tokenFile": "/absolute/private/path/broker-token",
    "caFile": "/absolute/path/to/trusted-ca.pem"
  }
}
```

`caFile` is optional if normal system trust is appropriate. A configured model can be selected with the optional `model` field (`provider/model`); otherwise native OpenCode configuration selects it. The token is never a command argument. State directories must be owner-only (`0700`), owned by the launching user, and not symlinks.

From the project whose existing OpenCode policies/plugins should apply:

```sh
node /absolute/path/to/opencode-review-pair/bin/launch.mjs \
  /absolute/private/path/launch.json \
  'Complete my task; use broker_list_clients, broker_send and broker_receive when useful.'
```

The launcher does not change cwd, replace existing native permission rules or add `--auto`. Native configuration and plugins are loaded normally; the overlay appends only this plugin. OpenCode itself may maintain its normal dependency/cache/state files. If `OPENCODE_CONFIG_CONTENT` is already set, it must be an ordinary JSON object; JSONC is refused rather than silently losing policy. No `--session`, `--continue`, `--attach` or resume path is accepted.

A fresh broker identity and durable inbox are created for each run. Identity metadata initially reports the native model as unknown rather than guessing from a display name. Pending inbound messages remain in that run's private inbox; this mode intentionally does not reopen old identities or claim native consumption. `broker_receive` peeks and returns model-visible untrusted-agent provenance plus `native_acceptance_recorded:false`.

## Exact lifetime and failure behavior

The launcher writes a private record bound to the exact child **PID + Linux process starttime + boot ID**, and its own live process incarnation. The plugin additionally requires a newly observed parentless native `session.created`, then the matching user `chat.message`, and a matching SDK session ID, project directory and creation time. Tool proxies are unavailable before this check. Session reads are abortable and bounded to two seconds. Every binding check revalidates the private marker and both process incarnations, including after the awaited SDK read.

A second root session, matching root deletion, native plugin disposal, missing marker, dead/replaced launcher or mismatched native tool context fails closed. Shared runtime shutdown drains registration/reconnect work before closing the final lease. The launcher revokes the marker after child exit and makes a bounded best-effort close of that exact durable identity; it never deletes inbox contents. Abrupt process death can still leave the remote lease visible until expiry.

OpenCode may swallow a plugin-loading error and still run the ordinary model task. Therefore the launcher requires a private successful-binding proof before treating native exit code zero as broker availability. If absent, it exits nonzero with a fixed unavailable diagnostic. This is **not** proof the ordinary native prompt did not execute, and no automatic retry is made. Do not repeat a task blindly after an uncertain failure.

## Verification and limits

Run the focused suite with the pinned shared checkout and official helper:

```sh
BROKER_REFERENCE_DIR=/absolute/path/to/ai-agent-msg-broker \
OPENCODE_TOOL_MODULE="$PWD/node_modules/@opencode-ai/plugin/dist/tool.js" \
node --test test/owned-run.test.mjs
```

Set `OPENCODE_BINARY` to the verified executable to enable the optional actual CLI test. That test uses a disposable HOME/project, a deterministic local model module, the real launcher/private process record/native tool contexts/shared runtime/SQLite, and **injected fake broker client methods**. It also checks provider-visible provenance, rejection of a swallowed/missing plugin, and preservation of an existing `bash: deny` policy: native OpenCode reports bash unavailable and the attempted marker command never executes. It does not certify a live broker, real provider authentication, a third-party plugin combination, arbitrary OpenCode versions, or existing TUI attachment. Native executable/header compatibility is a separate boundary from shared broker HTTP tests.

The source contract was checked against official OpenCode v1.19.4 `run.ts`, plugin lifecycle and SDK/tool types, plus the [CLI](https://opencode.ai/docs/cli/), [plugins](https://opencode.ai/docs/plugins/) and [custom tools](https://opencode.ai/docs/custom-tools/) documentation. No hidden APIs or native permission shortcuts are used.
