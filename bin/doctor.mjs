#!/usr/bin/env node
import { deliveryCapability } from '../src/capabilities.mjs';
const capability = deliveryCapability();
console.log(JSON.stringify({ ...capability, native_plugin_loaded: 'not_verified', policy_changed: false }, null, 2));
process.exitCode = 2;
