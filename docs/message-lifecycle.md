# Outgoing message lifecycle (unreleased candidate)

`broker_send` takes recipient ID and text; retry keys are never model arguments or
results. `broker_sent_history` lists this exact sender session's outgoing metadata;
`broker_message_content` explicitly retrieves one retained original;
`broker_resend` requests a **new** delivery and can duplicate prior delivery;
`broker_cancel` stops further pending delivery but cannot undo receipt or execution.
Check the returned current receipt, uncertainty and cancellation result.

The connector persists an internal operation before HTTP. Technical HTTP retries
and bounded recovery after exact-session reattachment preserve it. A fresh model
tool invocation is a new intent, even with identical text: there is no semantic
deduplication or global gate blocking unrelated sends. These hosts do not expose a
verified durable intent ID plus original timestamp through this adapter. MCP
JSON-RPC IDs can be reused; OpenCode messageID covers multiple calls. Neither is
misrepresented as durable retry identity. After an uncertain result, inspect
history/status before requesting a fresh send. Reconnection attempts recovery of
at most 10 retained operations, bounded to 5 seconds, without replacing their keys.
An expired/unknown operation remains uncertain; recovery does not fabricate success.

New history/content/resend/cancel routes require the matching Psst broker candidate.
An older deployed broker may reject those routes; send/receive compatibility is
separate from availability of new APIs. No native automatic-readiness claim follows
from these tool or transport tests.
