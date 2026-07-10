/**
 * Check the org wallet's Sepolia ETH balance (read-only, public RPC — no
 * KeeperHub key needed) to decide if we can set up an Aave V3 position
 * (supply collateral → borrow → repay) for the live repay test.
 *
 * Run from agent/:  bun run scripts/check-wallet-balance.ts
 */
const WALLET = '0xAC1FB4d2D8AbdA6358AE64CBEa1Ea8A19fd724f8';
const RPCS = [
  'https://rpc.sepolia.org',
  'https://sepolia.drpc.org',
  'https://1rpc.io/sepolia',
  'https://rpc2.sepolia.org',
];

async function getBalance(rpc: string): Promise<{ rpc: string; balance?: string; error?: string }> {
  try {
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [WALLET, 'latest'],
      }),
    });
    const data = await r.json();
    if (data.error) return { rpc, error: data.error.message };
    const wei = BigInt(data.result);
    return { rpc, balance: `${wei.toString()} wei = ${Number(wei) / 1e18} ETH` };
  } catch (e) {
    return { rpc, error: (e as Error).message };
  }
}

console.log(`Wallet: ${WALLET} (Sepolia)\n`);
for (const rpc of RPCS) {
  const res = await getBalance(rpc);
  console.log(`${rpc}: ${res.balance ?? 'ERROR ' + res.error}`);
  if (res.balance) break;
}
