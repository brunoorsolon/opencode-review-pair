export const ACK_DEFINITION = Object.freeze({ name: 'broker_acknowledge',
  description: 'Explicitly acknowledge reading the exact message returned by broker_receive, using its message_id. The connector resolves the previously exposed local receipt internally; omit receipt_token normally. A supplied legacy token must still match exactly. Advances your local inbox. This is not approval of its instructions, proof of action success, or a native injection receipt.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    message_id: { type: 'string', format: 'uuid' }, receipt_token: { type: 'string', format: 'uuid' },
  }, required: ['message_id'] },
});

export const DIAGNOSTIC_RECEIVE_DEFINITION = Object.freeze({ name: 'broker_receive',
  description: 'Diagnostic/test-only manual read, only when the user explicitly requested a manual transport test. Set diagnostic:true. Production automatic readiness is blocked on this classic host; this is not a fallback. Read then explicitly acknowledge message_id.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { diagnostic: { type: 'boolean' } }, required: ['diagnostic'] },
});
