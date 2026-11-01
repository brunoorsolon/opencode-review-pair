import { randomUUID } from 'node:crypto';
import { LocalError } from '../vendor/broker/reference/errors.mjs';
import { nativeMessage } from './message-format.mjs';
import { validateUuid } from '../vendor/broker/src/protocol.mjs';

/** Application-level explicit read ACK. Never a native injection receipt or action success. */
export function createCooperativeInbox({ inbox, isActive = () => true }) {
  if (!inbox?.db || typeof isActive !== 'function') throw new LocalError('invalid_configuration');
  inbox.transaction(() => inbox.db.exec(`CREATE TABLE IF NOT EXISTS cooperative_receipts(
    message_id TEXT PRIMARY KEY REFERENCES inbox(message_id) ON DELETE CASCADE,
    receipt_token TEXT NOT NULL, exposed_at INTEGER NOT NULL, acknowledged_at INTEGER)`));
  const active = () => { if (isActive() !== true) throw new LocalError('session_mismatch'); inbox.assertUsable(); };
  return {
    async broker_receive(args = {}) {
      if (!args || Array.isArray(args) || typeof args !== 'object' || Object.keys(args).some(key => key !== 'diagnostic')) throw new LocalError('invalid_configuration');
      if (args.diagnostic !== true) { const error = new LocalError('unsafe_boundary', {field:'automatic_delivery_required'}); error.message = 'Automatic delivery is required. Manual receive is available only for an explicitly requested diagnostic test with diagnostic:true; nothing was consumed.'; throw error; }
      active();
      return inbox.transaction(() => {
        const head = inbox.head();
        if (!head) return { message: null, local_mode: 'diagnostic_pull' };
        if (head.state !== 'pending') throw new LocalError('injection_uncertain', { effect: 'unknown' });
        let receipt = inbox.db.prepare('SELECT receipt_token FROM cooperative_receipts WHERE message_id=?').get(head.message_id);
        if (!receipt) {
          receipt = { receipt_token: randomUUID() };
          inbox.db.prepare('INSERT INTO cooperative_receipts(message_id,receipt_token,exposed_at) VALUES(?,?,?)').run(head.message_id, receipt.receipt_token, inbox.now());
        }
        return { message_id: head.message_id, message: nativeMessage(head.envelope),
          local_state: 'pending', local_mode: 'diagnostic_pull', native_acceptance_recorded: false,
          acknowledgment_required: true };
      }, { growth: 4096 });
    },
    async broker_acknowledge(args) {
      if (!args || typeof args !== 'object' || Array.isArray(args) || !['message_id','message_id,receipt_token'].includes(Object.keys(args).sort().join(','))) throw new LocalError('invalid_configuration');
      try { validateUuid(args.message_id); if (args.receipt_token !== undefined) validateUuid(args.receipt_token); } catch { throw new LocalError('invalid_configuration'); }
      active();
      return inbox.transaction(() => {
        const receipt = inbox.db.prepare('SELECT receipt_token,acknowledged_at FROM cooperative_receipts WHERE message_id=?').get(args.message_id);
        if (!receipt || args.receipt_token !== undefined && receipt.receipt_token !== args.receipt_token) {
          const error = new LocalError('receipt_required', {field: receipt ? 'receipt_token' : 'message_id'});
          error.message = receipt ? 'The supplied legacy read receipt does not match. Nothing was acknowledged; this is not a transient network error. Omit the token and use the exact previously read message_id.' : 'Read this exact message in this inbox before acknowledging it. Nothing was acknowledged; this is not a transient network error.';
          throw error;
        }
        if (receipt.acknowledged_at == null) {
          const head = inbox.head();
          if (!head || head.message_id !== args.message_id || head.state !== 'pending') throw new LocalError('unsafe_boundary');
          inbox.db.prepare('UPDATE cooperative_receipts SET acknowledged_at=? WHERE message_id=?').run(inbox.now(), args.message_id);
          // consumed is local queue bookkeeping. Deliberately do NOT populate native_receipt.
          inbox.db.prepare("UPDATE inbox SET state='consumed',consumed_at=? WHERE message_id=?").run(inbox.now(), args.message_id);
        }
        return { message_id: args.message_id, acknowledged: true, acknowledgment_kind: 'explicit_model_read',
          native_acceptance_recorded: false, action_success: 'unknown' };
      });
    },
  };
}
