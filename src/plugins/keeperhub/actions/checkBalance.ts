/**
 * KeeperHub Check Balance Action
 * 
 * Reads token balance for a wallet address via KeeperHub (read-only contract call).
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
import { KeeperHubClient } from '../client.ts';

export const checkBalanceAction: Action = {
  name: 'CHECK_BALANCE',
  similes: ['GET_BALANCE', 'BALANCE', 'CHECK_WALLET', 'HOW_MUCH'],
  description: 'Check the native token or ERC-20 balance of a wallet address through KeeperHub',

  validate: async (runtime: IAgentRuntime, _message: Memory, _state: State): Promise<boolean> => {
    const apiKey = runtime.getSetting('KEEPERHUB_API_KEY');
    return !!apiKey;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ): Promise<ActionResult> => {
    const apiKey = runtime.getSetting('KEEPERHUB_API_KEY');
    const baseUrl = runtime.getSetting('KEEPERHUB_BASE_URL') || 'https://app.keeperhub.com';
    const defaultNetwork = runtime.getSetting('KEEPERHUB_DEFAULT_NETWORK') || 'sepolia';

    if (!apiKey) {
      return {
        text: 'KeeperHub API key not configured.',
        success: false,
        error: new Error('Missing KEEPERHUB_API_KEY'),
      };
    }

    const client = new KeeperHubClient(apiKey, baseUrl);

    try {
      const content = message.content as any;
      const network = content.network || defaultNetwork;
      const address = content.address || content.walletAddress;
      const tokenAddress = content.tokenAddress || content.token;

      if (!address) {
        await callback({
          text: 'Please provide a wallet address to check. Example: "Check balance of 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb on Sepolia"',
          action: 'CHECK_BALANCE',
        });
        return {
          text: 'Missing wallet address',
          success: false,
          error: new Error('Missing address'),
        };
      }

      logger.info(`[KeeperHub] Checking balance for ${address} on ${network}`);

      if (tokenAddress) {
        // ERC-20 balance check via balanceOf
        const result = await client.contractCall({
          contractAddress: tokenAddress,
          network,
          functionName: 'balanceOf',
          functionArgs: JSON.stringify([address]),
          abi: JSON.stringify([{
            constant: true,
            inputs: [{ name: '_owner', type: 'address' }],
            name: 'balanceOf',
            outputs: [{ name: 'balance', type: 'uint256' }],
            type: 'function',
          }]),
          simulate: true,
        });

        await callback({
          text: `💰 **Token Balance**\n- Address: \`${address}\`\n- Token: \`${tokenAddress}\`\n- Network: ${network}\n- Balance (raw): ${result.simulatedReturnValue}`,
          action: 'CHECK_BALANCE',
          data: result,
        });

        return {
          text: `Balance check completed`,
          success: true,
          data: result,
        };
      } else {
        // Native token balance via contract call to check balance
        const result = await client.contractCall({
          contractAddress: address,
          network,
          functionName: 'getBalance', // Will use eth_getBalance
          simulate: true,
        });

        await callback({
          text: `💰 **Native Balance**\n- Address: \`${address}\`\n- Network: ${network}\n- Balance (raw): ${result.simulatedReturnValue || 'N/A'}`,
          action: 'CHECK_BALANCE',
          data: result,
        });

        return {
          text: `Balance check completed`,
          success: true,
          data: result,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[KeeperHub] Balance check failed: ${errorMsg}`);

      await callback({
        text: `❌ **Balance Check Failed**\nError: ${errorMsg}`,
        action: 'CHECK_BALANCE',
      });

      return {
        text: `Balance check failed: ${errorMsg}`,
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
          text: 'Check balance of 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb on Sepolia',
        },
      },
      {
        name: 'KeeperHub Agent',
        content: {
          text: '💰 Native Balance\n- Address: `0x742d...`\n- Network: sepolia\n- Balance: 0.5 ETH',
          actions: ['CHECK_BALANCE'],
        },
      },
    ],
  ],
};