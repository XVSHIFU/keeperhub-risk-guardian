/**
 * List every Aave V3 protocol action (actionType + requiresCredentials +
 * requiredFields) so the risk-guardian actions call the right ones.
 *
 * Run from agent/:  bun run scripts/list-aave-actions.ts   (read-only)
 */
import { KeeperHubClient } from '../src/plugins/keeperhub/client.ts';

const apiKey = process.env.KEEPERHUB_API_KEY;
if (!apiKey) {
  console.error('KEEPERHUB_API_KEY not set');
  process.exit(1);
}
const client = new KeeperHubClient(apiKey);

const all = (await client.searchProtocolActions({})) as { actions?: Array<Record<string, unknown>> };
const actions = all.actions ?? [];
const aaveV3 = actions.filter((a) => String(a.actionType ?? '').startsWith('aave-v3/'));

console.log(`aave-v3 actions: ${aaveV3.length}\n`);
for (const a of aaveV3) {
  console.log(`${a.actionType}  [${a.requiresCredentials ? 'writes' : 'read'}]  ${a.label}`);
  console.log(`    required: ${JSON.stringify(a.requiredFields)}`);
  if (a.optionalFields && Object.keys(a.optionalFields as object).length) {
    console.log(`    optional: ${JSON.stringify(a.optionalFields)}`);
  }
  console.log('');
}
