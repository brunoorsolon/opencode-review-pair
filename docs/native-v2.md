# Native OpenCode V2 candidate (2.2.5 only)

This is an **isolated candidate**, not an upgrade/migration of classic OpenCode
1.19.x, a release, or a claim that classic automatic delivery is fixed. The
existing default export and classic capability guard are unchanged.

## Explicit host loading (installation UX not yet qualified)

Use an already installed **OpenCode V2 2.2.5**. The integration fixture points the
host's documented `plugins` configuration at the
**installed package's `v2` directory** (not its classic root). The nested package
has only the server part, so it does not load the classic TUI extension.

```json
{
  "plugins": [{
    "package": "/absolute/path/to/node_modules/@matuto-ai/opencode-broker-connector/v2"
  }]
}
```

After explicit loading, ask the native agent to use `broker_setup` with only
`broker_url: "https://your-broker.example"`. It returns the exact public request ID
and broker admin URL. Human admin approval remains required; the plugin polls the
same durable request with GET-only continuation and connects automatically after
approval. `broker_setup_status` is read-only; `broker_cancel_setup` pauses only the
local pending flow. Startup never creates enrollment requests. No token or private
file handoff is required. Existing approved installation selection is reused.

An explicit private `connectionFile` option or `PSST_CONFIG_FILE` override remains
available for compatibility/fixtures; it disables URL setup to avoid secretly
switching an explicitly configured connection. It does not rewrite host config, change permissions, select
an agent/model, install/upgrade OpenCode, or migrate classic sessions. The `./v2`
JavaScript export is also available, but a native `plugins` entry must be a
**directory**, not a single file. New native root sessions connect automatically;
known exact session bindings restore after plugin reload. Subagents do not share
the root's inbox.

**Still missing:** qualification of a friendly native package-manager install path
for this optional nested entry. The documented local-directory config path above
was proven in an isolated host fixture; it is not a verified one-command user
installer. Classic TUI setup is not reused. Keep this an unreleased V2 candidate
until installer, independent review and supported-host rollout are complete.

## Delivery and recovery contract

- Public V2 APIs only: `session.get`, `synthetic`, `context`, session prompt hook,
  event subscription, storage, tool transform. Host version is explicitly gated.
- Stable private binding: server plugin-storage anchor, native session ID,
  creation time, project, location/workspace, broker installation; exclusive
  SQLite ownership; persisted random broker identity. Partial/foreign state is
  never automatically discarded, migrated or taken over.
- Compact sender/message envelope; native `synthetic` role and machine-source
  metadata. No human prompt, repeated policy paragraph, visible authority field,
  current agent/model override, user draft edit or steering injection.
- Commit exact payload, native ID and local injection ID before the single
  `synthetic({delivery:"queue",resume:true})` call. Require exact native session,
  ID, type, delivery and payload, not merely HTTP success.
- A receipt proves **durable native admission**, not model reading, task success,
  or authorization. At most one pending native item; the next waits for exact
  prior promotion in native context.
- Native cancellation removes the host's pending idempotency lookup entry.
  Therefore **no automatic synthetic retry**, even with the same ID. Lost
  responses reconcile read-only against exact promoted synthetic context.
  Pending-but-unproven, cancelled, compacted-away or mismatched receipts remain
  pinned/blocked, never guessed, deleted or reinjected.
- Interrupted/failed host sessions and cancel/revert events pause delivery.
  Only subsequent native execution can reopen the event pause. Session move,
  archive, delete or plugin unload fences the owner. Unload is resumable and does
  not terminally close a surviving broker identity; native disappearance is not
  treated as permission to silently allocate a replacement. A queued item cancelled by
  the user is not recreated.
- No cooperative receive/ack tools are registered in V2. The eight outgoing/
  status/metadata lifecycle tools use the shared reviewed SDK. Native tool-call
  identity scopes private durable send/retry keys. Send/resend additionally require
  the actual matching native assistant tool block creation time, so an aged replay
  cannot mint a new operation after journal GC. Missing/compacted proof fails closed.

## Verification

```sh
node --test test/v2-delivery.test.mjs test/v2-plugin.test.mjs test/v2-setup.test.mjs
OPENCODE_V2_BINARY=/path/to/official/opencode2 node --test test/v2-host.test.mjs
npm test
npm run check
npm run pack:check
```

The real-host test packs/extracts the candidate, loads its nested V2 directory
through the native plugin manager in an isolated HOME/XDG tree with random local
HTTP Basic credentials, connects a real local TLS broker, sends a real envelope,
and verifies automatic native synthetic admission and Plan→Build preservation.
With `PSST_APPROVAL_BROKER_DIR` pointing to the approval-enabled broker checkout,
a second real-host test invokes the registered native setup executor through a
fixture command/public tool API, approves the real TLS request in the disposable
admin fixture, and verifies automatic connection/delivery. This is actual native
plugin/tool integration, not a model-issued tool-call proof.
The selected fixture provider deliberately does not exist: **no user credentials,
model API or authenticated LLM response is used or proved**. Unit mocks separately
exercise uncertain writes, exact receipts, cancellation, restart, owner isolation,
selection changes, FIFO bounds and stalled requests.

Official contracts: [plugin loading](https://opencode.ai/v2/docs/plugins/),
[server plugins](https://opencode.ai/v2/docs/build/plugins/server),
[native synthetic admission](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/core/src/session/session.ts#L280-L320),
[pending/reconciliation semantics](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/core/src/session/inbox.ts).
