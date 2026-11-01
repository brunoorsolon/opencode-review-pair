import { deliveryCapability } from '../src/capabilities.mjs';
import { installSetupUI } from '../src/setup-ui.mjs';
import { readSelection, readPending } from '../src/installation.mjs';
import { startContextPublisher } from '../src/native-context.mjs';
export default { id: 'matuto.psst', tui: async api => {
  startContextPublisher(api);
  await installSetupUI(api);
  const capability = deliveryCapability();
  api.ui.toast({ title: 'Psst: automatic delivery blocked', variant: 'warning', duration: 10000, message: capability.next_action });
  try {
    if (!process.env.PSST_CONFIG_FILE && !readSelection()) {
      const pending = readPending();
      api.ui.toast({ title: 'Psst', variant: 'info', duration: 6000,
        message: pending && !pending.paused ? 'Approval pending. Your saved request resumes without new enrollment.' : 'Setup needed: press Ctrl+Alt+P and enter the broker URL.' });
    }
  } catch { api.ui.toast({ title: 'Psst', variant: 'warning', message: 'Private configuration is invalid; no enrollment or credential reset was attempted.', duration: 6000 }); }
} };
