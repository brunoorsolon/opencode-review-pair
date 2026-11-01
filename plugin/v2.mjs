import { tool } from '@opencode-ai/plugin';
import { loadBrokerReference } from '../src/reference.mjs';
import { readExistingConnection } from '../src/enrollment.mjs';
import { readInstallation } from '../src/installation.mjs';
import { setupV2Plugin } from '../src/v2-plugin.mjs';

// Structurally the public @opencode/plugin Plugin.define({ id, setup }) contract.
// define is identity-only; no V2 host, runtime or CLI is installed by this package.
export default {
  id: 'matuto.psst.v2',
  async setup(ctx) {
    const reference = await loadBrokerReference();
    const connectionFile = ctx.options?.connectionFile ?? process.env.PSST_CONFIG_FILE;
    const runtime = await setupV2Plugin({ ctx, reference, tool, setupEnabled: !connectionFile,
      loadSettings: () => connectionFile ? readExistingConnection(connectionFile) : readInstallation() });
    return runtime.dispose;
  },
};
