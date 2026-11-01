# Psst for native OpenCode V2 2.2.5

This server-only candidate is installed with OpenCode's native plugin manager,
using this repository's `v2` subdirectory at an immutable commit. It declares an
immutable dependency on the reviewed connector runtime; it does not rely on
files outside this package, install OpenCode, or load the classic TUI extension.
The root dependency's `./v2` export is distinct from this wrapper: no dependency
cycle or classic default export is involved.

After installation, ask the native agent to run `broker_setup` with only your
broker HTTPS URL. Approve the exact request in the broker admin page. Startup
reuses approved configuration; it never creates enrollment requests. No token or
connection-file handoff is required.

Supported native host: **2.2.5 only**. This is not a migration of classic sessions,
a registry release, authenticated-model proof, or complete issue #8 acceptance.
See the repository's `docs/native-v2.md` for the installation command and evidence.
