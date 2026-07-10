/**
 * Phase-0 smoke test for the rewritten KeeperHub MCP client.
 * Run from agent/:  bun run scripts/test-mcp-client.ts
 *
 * Verifies the MCP transport (initialize → notifications/initialized → tools/call)
 * works from the ElizaOS runtime context (bun, not browser), and that the org
 * wallet integration is reachable. Read-only — fires no on-chain transaction.
 */
import { KeeperHubClient } from '../src/plugins/keeperhub/client.ts';

const apiKey = process.env.KEEPERHUB_API_KEY;
if (!apiKey) {
  console.error('KEEPERHUB_API_KEY not set');
  process.exit(1);
}

const client = new KeeperHubClient(apiKey);

console.log('→ listIntegrations() …');
const integrations = await client.listIntegrations();
console.log('integrations:', JSON.stringify(integrations)?.slice(0, 500));

console.log('\n→ listActionSchemas("web3") …');
const schemas = await client.listActionSchemas('web3');
const actions = (schemas as { actions?: Record<string, unknown> })?.actions;
console.log('schemas top-level keys:', schemas && typeof schemas === 'object' ? Object.keys(schemas) : '(non-object)');
console.log('web3 actions:', actions ? Object.keys(actions) : '(none / unexpected shape)');

console.log('\n✅ MCP client transport OK from bun.');
