# Outgoing message lifecycle

`broker_send` takes recipient ID and text; retry keys are private.
`broker_sent_history` lists the exact sender session's outgoing metadata;
`broker_message_content` retrieves a retained original; `broker_resend` explicitly
creates a new delivery; `broker_cancel` cannot undo receipt or execution.

A native call's original assistant tool block supplies its stable ID and creation
time. The connector persists the operation before HTTP and preserves its key on
technical retry/recovery. A different native call is new intent even when text is
identical. Aged or missing original proof fails closed, including after ledger GC.

Inspect current status/history after uncertainty before requesting a new explicit
send. Recovery is bounded to 10 retained operations and 5 seconds. Unknown effects
remain unknown, never fabricated success. Broker 0.5.0 supplies the lifecycle APIs;
transport, native admission and model completion remain separate evidence.
