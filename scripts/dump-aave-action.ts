/**
 * Dump one full Aave action object so we know the exact shape — i.e. which
 * fields identify the action to `executeProtocol_action` (name/actionId/protocol),
 * beyond the `required` + `desc` we already saw.
 *
 * Run from agent/:  bun run scripts/dump-aave-action.ts
 * Read-only — fires no on-chain transaction.
 */
import { KeeperHubClient } from '../src/plugins/keeperhub/client.ts';

const apiKey = process.env.KEEPERHUB_API_KEY;
if (!apiKey) {
  console.error('KEEPERHUB_API_KEY not set');
  process.exit(1);
}
const client = new KeeperHubClient(apiKey);

const all = (await client.searchProtocolActions({})) as { actions?: unknown[]; count?: number };
const actions = (all.actions ?? []) as Array<Record<string, unknown>>;

console.log('total actions:', actions.length);
console.log('\n=== full object: actions[0] ===');
console.log(JSON.stringify(actions[0], null, 2));
console.log('\n=== full object: actions[1] ===');
console.log(JSON.stringify(actions[1], null, 2));
console.log('\n=== keys of actions[0] ===');
console.log(actions[0] ? Object.keys(actions[0]) : '(none)');

// Find the Aave V3 repay action by searching any string field for "repay" + "Aave V3"
const repay = actions.find((a) =>
  Object.values(a).some((v) => typeof v === 'string' && /repay/i.test(v) && /aave v3/i.test(v)),
);
console.log('\n=== Aave V3 repay action (full) ===');
console.log(JSON.stringify(repay, null, 2));
console.log('\n=== repay keys ===');
console.log(repay ? Object.keys(repay) : '(none)');
