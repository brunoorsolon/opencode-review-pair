/** Capability statements are not broker presence and never change host policy. */
export function deliveryCapability(env = process.env, { experimental = false } = {}) {
  const pure = ['1', 'true'].includes(String(env.OPENCODE_PURE).toLowerCase());
  return {
    mode: 'automatic_required', ready: false,
    delivery: experimental ? 'experimental_test_only' : 'automatic_blocked',
    automatic_receive: false,
    blocker: pure ? 'opencode_pure_mode' : 'classic_atomic_admission_unavailable',
    next_action: pure
      ? 'OPENCODE_PURE is enabled in this process. Ask the sandbox administrator to review the approved launcher source; the connector does not disable policy. No loaded plugin can diagnose itself when the host skips it entirely.'
      : 'This classic OpenCode integration lacks safe automatic admission preserving the current agent/model and conversation. Transport may connect, but production messaging is not ready. Manual receive is diagnostic/test-only; do not enable a snapshot override as a fix.',
  };
}
