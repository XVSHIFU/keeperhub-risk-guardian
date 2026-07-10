/**
 * AAVE_REPAY — the risk-guardian's ACT step.
 *
 * Repays part of an Aave V3 debt through KeeperHub (execute_protocol_action,
 * actionType "aave-v3/repay"). This is a WRITE: KeeperHub signs with the org
 * wallet, sponsors the gas, and submits an MEV-protected transaction. The
 * result carries the transaction hash and Etherscan link.
 *
 * Use after GET_AAVE_HEALTH shows the health factor below the safety
 * threshold — repaying debt raises the health factor away from liquidation.
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

export const repayAction: Action = {
  name: 'AAVE_REPAY',
  similes: ['REPAY', 'REPAY_DEBT', 'AAVE_REPAY_DEBT', 'REPAY_AAVE', 'PROTECT_REPAY'],
  description:
    'Repay an Aave V3 debt through KeeperHub to raise the health factor away from liquidation. On-chain write, gas-sponsored.',

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
      const network = content.network || defaultNetwork;
      const asset = content.asset || content.tokenAddress || content.token;
      const amount = content.amount;
      const onBehalfOf = content.onBehalfOf || content.walletAddress || content.user;
      const interestRateMode = content.interestRateMode; // e.g. "2" = variable

      if (!asset || !amount || !onBehalfOf) {
        await callback({
          text:
            'I need more to execute the repay:\n' +
            '- asset (the debt token address, e.g. USDC)\n' +
            '- amount\n' +
            '- onBehalfOf (the wallet whose debt to repay)\n' +
            'Optional: network (defaults to Sepolia), interestRateMode (2=variable)',
          action: 'AAVE_REPAY',
        });
        return {
          text: 'Missing required parameters for repay',
          success: false,
          error: new Error('Missing asset, amount, or onBehalfOf'),
        };
      }

      logger.info(
        `[KeeperHub] Aave repay: ${amount} of ${asset} on behalf of ${onBehalfOf} (network ${network})`
      );

      const result = (await client.executeProtocolAction({
        actionType: 'aave-v3/repay',
        params: {
          network,
          asset,
          amount,
          onBehalfOf,
          ...(interestRateMode ? { interestRateMode } : {}),
        },
      })) as any;

      const txHash = result?.transactionHash || result?.result?.transactionHash;
      const txLink = result?.transactionLink || result?.result?.transactionLink;
      const execId = result?.executionId || result?.result?.executionId;

      const responseText =
        `✅ **Aave Repay Executed via KeeperHub**\n` +
        `- Asset: ${asset}\n` +
        `- Amount: ${amount}\n` +
        `- On behalf of: \`${onBehalfOf}\`\n` +
        `- Network: ${network}\n` +
        (execId ? `- Execution ID: \`${execId}\`\n` : '') +
        (txHash ? `- TX hash: \`${txHash}\`\n` : '') +
        (txLink ? `- Explorer: ${txLink}\n` : '') +
        `- Gas: sponsored by KeeperHub\n` +
        `Follow up with GET_EXECUTION_AUDIT for the full trail.`;

      await callback({
        text: responseText,
        action: 'AAVE_REPAY',
        data: result as unknown as Record<string, unknown>,
      });

      return {
        text: responseText,
        success: true,
        data: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[KeeperHub] Aave repay failed: ${errorMsg}`);
      await callback({
        text: `❌ **Repay failed**\nError: ${errorMsg}`,
        action: 'AAVE_REPAY',
      });
      return {
        text: `Repay failed: ${errorMsg}`,
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
          text: 'Health factor is 1.3, below my 1.5 threshold. Repay 50 USDC of my Aave debt on Sepolia. Debt asset USDC at 0x…, wallet 0xAbC…',
        },
      },
      {
        name: 'Risk Guardian',
        content: {
          text: '✅ Aave Repay Executed via KeeperHub\n- Asset: USDC\n- Amount: 50\n- TX hash: `0x…`\n- Explorer: https://sepolia.etherscan.io/tx/0x…\n- Gas: sponsored',
          actions: ['AAVE_REPAY'],
        },
      },
    ],
  ],
};
