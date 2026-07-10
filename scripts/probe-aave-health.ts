/**
 * Confirm the response shape of executeProtocolAction for the Aave V3 health
 * read (aave-v3/get-user-account-data) — read-only, no wallet, no on-chain tx.
 * Run from agent/:  bun run scripts/probe-aave-health.ts
 */
import { KeeperHubClient } from '../src/plugins/keeperhub/client.ts';

const apiKey = process.env.KEEPERHUB_API_KEY;
if (!apiKey) {
  console.error('KEEPERHUB_API_KEY not set');
  process.exit(1);
}
const client = new KeeperHubClient(apiKey);

// Org wallet on Sepolia (likely no Aave position → expect zero values, but
// the response SHAPE is what we need).
const res = await client.executeProtocolAction({
  actionType: 'aave-v3/get-user-account-data',
  params: {
    network: '11155111',
    user: '0xAC1FB4d2D8AbdA6358AE64CBEa1Ea8A19fd724f8',
  },
});

console.log('=== top-level type ===');
console.log(Array.isArray(res) ? 'array' : typeof res);
console.log('\n=== full response ===');
console.log(JSON.stringify(res, null, 2).slice(0, 2500));
console.log('\n=== keys (if object) ===');
if (res && typeof res === 'object' && !Array.isArray(res)) {
  console.log(Object.keys(res as object));
}
