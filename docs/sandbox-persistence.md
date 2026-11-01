# Sandbox bootstrap contract

Historical source inspected: `ai-agents-sandbox` snapshot
`a7f63e8b98d37c030df6ca095d2e75960111e37c`,
`agents/opencode-native/config.sh:get_project_mounts/get_project_env`.
This is design evidence, **not verification of current live mounts**.

The existing launcher maps `<project>/opencode-zen/{config,data,cache,state}`
(or the separate `opencode-go` profile) to:

| Leaf | Container path |
| --- | --- |
| config | `/home/node/.config/opencode` |
| data | `/home/node/.local/share/opencode` |
| cache | `/home/node/.cache/opencode` |
| state | `/home/node/.local/state/opencode` |

Use `PSST_OPENCODE_CONFIG_DIR=/home/node/.config/opencode/psst` in that bootstrap
so the whole installation uses the **existing config mount**, including Go's
managed `XDG_CONFIG_HOME=/etc` override. The `psst` subdirectory must be owned by
the sandbox user, mode 0700; config/key files are 0600. Recreated containers must
mount it at the same absolute path. Different project/profile mounts intentionally
remain separate authorizations unless bootstrap explicitly shares this private
installation directory. Sharing it never means sharing native session IDs/inboxes.
Do not mount the ephemeral `/tmp/psst-opencode-<uid>` directory across containers.

The archived launcher also sets `OPENCODE_PURE=1` and disables project config.
Official 1.19.4 explicitly skips external TUI plugins in pure mode. Therefore
that historical bootstrap needs an intentional native plugin allowlist/install
integration before this connector can load; merely saving files cannot override
that policy. Preserve managed model/provider, permission and credential policy.
This connector does not remove pure mode or edit the sandbox launcher itself.
The current owner environment remains an acceptance gate until its effective
bootstrap is inspected and the intended plugin installation is permitted.

## Read-only capability diagnosis

The packaged `psst-opencode` doctor reports `OPENCODE_PURE` only as observed in
its own process environment; it never disables it or claims to inspect every
managed source. A host that skips the plugin cannot run the plugin's diagnostic
hook. Ask the administrator to review the actual approved launcher source.
Even with plugins enabled, the pinned classic host remains `automatic_blocked`;
transport presence/manual receive must not be reported as production readiness.
