/**
 * Shared Aave V3 helpers for the risk-guardian plugin.
 */

import { CHAIN } from './client.ts';

// Aave V3 protocol action types (verified via search_protocol_actions).
export const AAVE_V3 = {
  GET_USER_ACCOUNT_DATA: 'aave-v3/get-user-account-data', // read: health factor + collateral + debt
  SUPPLY: 'aave-v3/supply', // write: add collateral (raises health factor)
  REPAY: 'aave-v3/repay', // write: repay debt (raises health factor)
  BORROW: 'aave-v3/borrow',
  WITHDRAW: 'aave-v3/withdraw',
} as const;

// Aave scales healthFactor to 1e18 (1e18 == 1.0 == "just safe"); below 1.0 is
// liquidatable. With no debt, Aave returns type(uint256).max.
const ONE_E18 = 10n ** 18n;
const MAX_UINT = 2n ** 256n - 1n;
const INFINITE = 10n ** 30n; // anything above this is treated as "no debt"

export type HealthVerdict = 'safe' | 'at-risk' | 'no-debt';

/** Interpret an Aave healthFactor (1e18-scaled BigInt string) as a risk verdict. */
export function classifyHealth(
  hfWei: string,
  threshold: number
): { human: string; verdict: HealthVerdict; scaled: number } {
  let hf: bigint;
  try {
    hf = BigInt(hfWei);
  } catch {
    return { human: 'unknown', verdict: 'no-debt', scaled: Infinity };
  }
  if (hf >= MAX_UINT || hf >= INFINITE) {
    return { human: '∞ (no debt)', verdict: 'no-debt', scaled: Infinity };
  }
  const scaled = Number(hf) / Number(ONE_E18); // human health factor (1.0 == just safe)
  const verdict: HealthVerdict = scaled < threshold ? 'at-risk' : 'safe';
  return { human: scaled.toFixed(3), verdict, scaled };
}

/** Build a human-readable risk line from an Aave getUserAccountData result. */
export function renderHealthLine(
  walletAddress: string,
  network: string,
  threshold: number,
  data: any
): { text: string; verdict: HealthVerdict; scaled: number } {
  const hfWei = String(data?.healthFactor ?? '');
  const { human, verdict, scaled } = classifyHealth(hfWei, threshold);
  const emoji = verdict === 'at-risk' ? '⚠️' : '✅';
  const text =
    `${emoji} Aave V3 health for \`${walletAddress}\` (network ${network}): ${human}` +
    (verdict === 'at-risk'
      ? ` — ⚠️ below threshold ${threshold}. Consider AAVE_REPAY (reduce debt) or AAVE_SUPPLY (add collateral).`
      : verdict === 'no-debt'
        ? ' — no debt, perfectly safe.'
        : ` — above threshold ${threshold}, safe.`);
  return { text, verdict, scaled };
}

export { CHAIN };
