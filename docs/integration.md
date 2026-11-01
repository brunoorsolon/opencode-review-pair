> Candidate update: production requires automatic delivery and is currently blocked on the classic host. Manual pull/owned-run flows below are diagnostic/test-only. See [current lifecycle contract](message-lifecycle.md) for hidden operation keys and new APIs. Historical fixture pins are separate from the runtime candidate.

# Native host integration contract

For a bounded user-launchable mode, see [fresh owned headless run](owned-run.md).
This document describes the separate lower-level custom-supervisor interface; it
does not imply that a generic project plugin can attach to an existing TUI.

## Supported native shape, unsupported lifecycle inference

Official [custom-tool documentation](https://opencode.ai/docs/custom-tools/) and
[plugin documentation](https://opencode.ai/docs/plugins/) describe a tool map:

```js
import { tool } from '@opencode-ai/plugin';
// Only AFTER a trusted host owner has established the binding below:
const attached = await attachVerifiedSession({ /* trusted configuration */ });
// Return/install attached.hooks through the host's supported plugin mechanism.
// On exact host teardown, abort its lifetime signal and await attached.close().
```

`tool({ description, args, execute })` takes a Zod property shape and receives
native context `sessionID`, `messageID`, `directory`, `worktree`, `abort`, etc.
The adapter uses these documented fields, returns a string tool result, and never
calls `context.ask`. `@opencode-ai/plugin@1.19.4/dist/tool.d.ts` and `tool.js` were
inspected and the real helper was executed during tests.

The ordinary plugin initializer is project/server scoped. Neither that initializer,
a server PID, a persisted transcript, session status/idle, nor session ID alone is
sufficient proof of an attached human TUI lifetime. The generic factory does **not**
claim a supported existing-TUI lifecycle hook or invent one. A supported owner must
provide the contract below before this adapter can be enabled. A custom supervisor
that only runs this factory without owning the actual native host is insufficient.

## Trusted operator configuration

Import `createOpenCodeAdapter` and `loadBrokerReference`, or call the
[example](../examples/owned-session.mjs). Supply:

| Value | Requirement |
| --- | --- |
| `referenceDirectory` | Absolute path to a reviewed, pinned `ai-agent-msg-broker` checkout. No arbitrary model-supplied module path. |
| `tool` | Official tool helper from the host's pinned plugin package. |
| `host.binding.sessionID` | Exact native session identifier, not its title. |
| `host.binding.directory`, `worktree` | Exact, normalized absolute native paths. No `process.cwd()` guess. |
| `host.binding.lifetime` | Private `Symbol`, issued for this verified live host incarnation; never serialized or a tool argument. |
| `host.binding.signal` | Owner's `AbortSignal`; abort immediately when that exact host closes, changes or becomes uncertain. |
| `host.currentBinding()` | Fresh owner verification returning the same binding only while that exact native host remains live; `null`/throw when unknown. |
| `inboxDirectory` | New private local directory per new lifetime; owner-only, no symlink/network filesystem. |
| `broker.url` | Explicit HTTPS origin, no embedded credentials. |
| `broker.tokenFile` | Existing authorized mounted secret, private `0600`; never a tool argument or command-line token. |
| `broker.caFile` | Optional explicitly trusted private CA; no TLS bypass. |
| `metadata` | Truthful name/model/project; unknown model is `{provider:null,id:null,source:'unknown'}`. No full-path project disclosure by default. |

The owner installs `{ tool: adapter.tools }` only after `await adapter.start(metadata)`.
On teardown it aborts `host.binding.signal` and awaits `adapter.stop()`. `stop()` is
idempotent; the instance cannot restart. Do not stop only when a long-lived server
finally exits: host close is the relevant boundary.

The sample creates fresh broker UUID identity every time. Reconnect of an existing
reference inbox is available through the lower-level factory only when an owner
independently proves the exact surviving native lifetime. Same `sessionID` alone
is explicitly insufficient. Do not clear the inbox merely to make reconnect work.

## Shared modules — no protocol copy

`loadBrokerReference()` imports these files from the trusted checkout:

- `reference/inbox.mjs`: `Inbox`, `newSessionIdentity`
- `reference/client.mjs`: `BrokerClient`
- `reference/runtime.mjs`: `AdapterRuntime`
- `reference/tools.mjs`: `createTools`, `invokeTool`
- `reference/mcp-stdio.mjs`: `TOOL_DEFINITIONS` (catalog only)
- `reference/errors.mjs`: fixed safe `LocalError` and `safeError`

Pin shared broker commit `2de9cc3758b9fc593f5afca4fc501fd013d416ec`.
The repository's test snapshot hashes identify the exact local source used for
verification. The loader exports this expected commit as documentation; it does
not execute Git or independently authenticate the supplied directory. The trusted
operator/CI checkout must establish the pin. This adapter fails if the nine-tool catalog or schema contains unsupported
shapes. Updating the shared checkout or native package requires rerunning tests.
The adapter does not open an additional HTTP listener or run the stdio server.

## Tool boundary and failure semantics

Every call checks exact native session/project context, a real non-aborted native
`AbortSignal`, private host lifetime and retained inbox identity. Shared client
operations are rechecked before execution, including after asynchronous metadata
observation. Concurrent calls carry independent context closures.

An already-started write may commit before cancellation/lifetime loss becomes
visible. The result then has `effect: unknown`; its technical operation key remains
private in the ledger. Explicit stop aborts and joins admitted calls before closing
the transport/inbox, but does not revoke a request already sent remotely.
Review/reconcile the original operation through shared reference semantics.

`broker_receive` peeks one pending head and keeps it. Returned content includes the
compact AI-agent header and escaped sender/text JSON. It is not an approval, native
input lease or proof the model consumed it. A head already in uncertain native
injection state stays blocked; it is neither skipped nor automatically retried.
There is no autonomous receive-to-prompt loop. This deliberately limited mode can
be used by a model explicitly calling the native tools in an existing turn; it
cannot wake an idle session.
