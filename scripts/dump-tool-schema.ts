/**
 * Print the inputSchema of execute_protocol_action (and execute_transfer) so
 * we call them with the right argument shape.
 * Run from agent/:  bun run scripts/dump-tool-schema.ts   (read-only)
 */
import { KeeperHubClient } from '../src/plugins/keeperhub/client.ts';

const apiKey = process.env.KEEPERHUB_API_KEY;
if (!apiKey) {
  console.error('KEEPERHUB_API_KEY not set');
  process.exit(1);
}
const client = new KeeperHubClient(apiKey);

const tools = await client.listTools();
const want = ['execute_protocol_action', 'execute_transfer', 'execute_contract_call', 'execute_check_and_execute', 'get_direct_execution_status'];
for (const name of want) {
  const t = tools.find((x) => x.name === name);
  console.log(`\n=== ${name} ===`);
  if (!t) {
    console.log('(not found)');
    continue;
  }
  console.log('desc:', (t.description ?? '').slice(0, 150));
  console.log('inputSchema:', JSON.stringify(t.inputSchema, null, 2).slice(0, 3200));
}
