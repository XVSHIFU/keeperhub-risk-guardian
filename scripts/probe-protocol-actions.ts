/**
 * Probe KeeperHub DeFi protocol actions (search_protocol_actions) to map the
 * write-side surface for the DeFi risk-guardian agent — e.g. which Aave
 * actions (repay / supply / withdraw) can the agent execute via KeeperHub.
 *
 * Run from agent/:  bun run scripts/probe-protocol-actions.ts
 * Read-only discovery — fires no on-chain transaction.
 */
import { KeeperHubClient } from '../src/plugins/keeperhub/client.ts';

const apiKey = process.env.KEEPERHUB_API_KEY;
if (!apiKey) {
  console.error('KEEPERHUB_API_KEY not set');
  process.exit(1);
}
const client = new KeeperHubClient(apiKey);

function summarize(label: string, raw: unknown) {
  console.log(`\n=== ${label} ===`);
  if (!raw || (typeof raw === 'object' && Object.keys(raw as object).length === 0)) {
    console.log('(empty)');
    return;
  }
  if (Array.isArray(raw)) {
    console.log(`array of ${raw.length}:`);
    for (const item of raw.slice(0, 25)) {
      console.log('  -', typeof item === 'string' ? item : JSON.stringify(item));
    }
    return;
  }
  const obj = raw as Record<string, unknown>;
  console.log('top-level keys:', Object.keys(obj));
  // Try common shapes
  for (const k of ['protocols', 'actions', 'results', 'items', 'data']) {
    const v = obj[k];
    if (Array.isArray(v)) {
      console.log(`${k} (${v.length}):`);
      for (const item of v.slice(0, 25)) {
        if (typeof item === 'string') console.log('  -', item);
        else if (item && typeof item === 'object') {
          const m = item as Record<string, unknown>;
          console.log('  -', JSON.stringify({
            name: m.name ?? m.actionName ?? m.slug ?? m.action,
            protocol: m.protocol,
            network: m.network,
            required: m.requiredFields ?? m.required ?? m.params,
            desc: typeof m.description === 'string' ? m.description.slice(0, 90) : m.desc,
          }));
        }
      }
    } else if (v && typeof v === 'object') {
      console.log(`${k} keys:`, Object.keys(v as object).slice(0, 30));
    }
  }
}

console.log('→ searchProtocolActions({ protocol: "aave" }) …');
const aave = await client.searchProtocolActions({ protocol: 'aave' });
summarize('aave', aave);

console.log('\n→ searchProtocolActions({}) …');
const all = await client.searchProtocolActions({});
summarize('all', all);
