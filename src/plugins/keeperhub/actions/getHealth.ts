/**
 * GET_AAVE_HEALTH — the risk-guardian's SENSE step.
 *
 * Reads an Aave V3 position's health factor (and collateral/debt) for any
 * wallet via KeeperHub's execute_protocol_action (actionType
 * "aave-v3/get-user-account-data"). This is a read-only action — no wallet,
 * no gas, no on-chain transaction.
 *
 * Aave returns healthFactor as a 1e18-scaled integer (1e18 == 1.0 == "just
 * safe"). Below 1.0 the position is liquidatable. When there is no debt,
 * Aave returns type(uint256).max — we surface that as "no debt / safe".
 */
import {
  type Action,
  type ActionResult,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
} from '@elizaos/core';
import { KeeperHubClient, CHAIN } from '../client.ts';
import { classifyHealth } from '../aaveUtils.ts';

const DEFAULT_THRESHOLD = '1.5'; // guard triggers protective action below this

export const getHealthAction: Action = {
  name: 'GET_AAVE_HEALTH',
  similes: ['CHECK_HEALTH', 'HEALTH_FACTOR', 'AAVE_HEALTH', 'CHECK_AAVE', 'POSITION_HEALTH'],
  description:
    'Read an Aave V3 position health factor (collateral, debt, liquidation threshold) for a wallet through KeeperHub. Read-only.',

  validate: async (runtime: IAgentRuntime, _message: Memory, _state: State): Promise<boolean> => {
    return !!runtime.getSetting('KEEPERHUB_API_KEY');
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ): Promise<ActionResult> => {
    const apiKey = runtime.getSetting('KEEPERHUB_API_KEY') as string | undefined;
    const baseUrl =
      (runtime.getSetting('KEEPERHUB_BASE_URL') as string | undefined) || 'https://app.keeperhub.com';
    const defaultNetwork =
      (runtime.getSetting('KEEPERHUB_DEFAULT_NETWORK') as string | undefined) || CHAIN.SEPOLIA;

    if (!apiKey) {
      return {
        text: 'KeeperHub API key not configured. Please set KEEPERHUB_API_KEY.',
        success: false,
        error: new Error('Missing KEEPERHUB_API_KEY'),
      };
    }

    const client = new KeeperHubClient(apiKey, baseUrl);

    try {
      const content = message.content as any;
      const walletAddress = content.walletAddress || content.user || content.address;
      const network = content.network || defaultNetwork;
      const threshold = Number(content.threshold || DEFAULT_THRESHOLD);

      if (!walletAddress) {
        await callback({
          text: 'I need a wallet address to check. Example: "Check Aave health for 0x742d… on Sepolia"',
          action: 'GET_AAVE_HEALTH',
        });
        return {
          text: 'Missing wallet address',
          success: false,
          error: new Error('Missing walletAddress'),
        };
      }

      logger.info(`[KeeperHub] Reading Aave V3 health for ${walletAddress} on network ${network}`);

      const result = (await client.executeProtocolAction({
        actionType: 'aave-v3/get-user-account-data',
        params: { network, user: walletAddress },
      })) as any;

      const data = result?.result ?? result;
      const hfWei = String(data?.healthFactor ?? '');
      const { human, verdict } = classifyHealth(hfWei, threshold);

      const emoji =
        verdict === 'at-risk' ? '⚠️' : verdict === 'no-debt' ? '✅' : '✅';
      const responseText =
        `${emoji} **Aave V3 Health — \`${walletAddress}\`** (network ${network})\n` +
        `- Health factor: **${human}** ${verdict === 'at-risk' ? '⚠️ below threshold ' + threshold : ''}\n` +
        `- Total collateral (base): ${data?.totalCollateralBase ?? '0'}\n` +
        `- Total debt (base): ${data?.totalDebtBase ?? '0'}\n` +
        `- Available borrows (base): ${data?.availableBorrowsBase ?? '0'}\n` +
        `- Liquidation threshold: ${data?.currentLiquidationThreshold ?? '0'}\n` +
        `- LTV: ${data?.ltv ?? '0'}\n` +
        (result?.addressLink ? `- Pool: ${result.addressLink}\n` : '') +
        `- Verdict: ${verdict}${verdict === 'at-risk' ? ' — consider AAVE_REPAY or AAVE_SUPPLY to restore safety' : ''}`;

      await callback({
        text: responseText,
        action: 'GET_AAVE_HEALTH',
        data: result as unknown as Record<string, unknown>,
      });

      return {
        text: responseText,
        success: true,
        data: { ...result, verdict, threshold, healthFactorHuman: human } as unknown as Record<string, unknown>,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[KeeperHub] Aave health read failed: ${errorMsg}`);
      await callback({
        text: `❌ **Health read failed**\nError: ${errorMsg}`,
        action: 'GET_AAVE_HEALTH',
      });
      return {
        text: `Health read failed: ${errorMsg}`,
        success: false,
        error: error instanceof Error ? error : new Error(errorMsg),
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Check the Aave health of 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb on Sepolia',
        },
      },
      {
        name: 'Risk Guardian',
        content: {
          text: '✅ Aave V3 Health — `0x742d…` (network 11155111)\n- Health factor: 1.820\n- Total debt (base): 5400\n- Verdict: safe',
          actions: ['GET_AAVE_HEALTH'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: { text: 'My health factor is dropping. Wallet 0xAbC…. Am I at risk?' },
      },
      {
        name: 'Risk Guardian',
        content: {
          text: '⚠️ Aave V3 Health — `0xAbC…`\n- Health factor: 1.280 (below threshold 1.5)\n- Verdict: at-risk — consider AAVE_REPAY or AAVE_SUPPLY to restore safety',
          actions: ['GET_AAVE_HEALTH'],
        },
      },
    ],
  ],
};
