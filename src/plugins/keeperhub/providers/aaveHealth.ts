/**
 * AAVE_HEALTH provider — the risk-guardian's autonomous SENSE step.
 *
 * Injected into the agent's context on every turn. If a watch wallet is
 * configured (KEEPERHUB_WATCH_WALLET), it reads that wallet's Aave V3 health
 * factor through KeeperHub and surfaces a verdict. When the health factor is
 * below the threshold, the injected text tells the LLM to act — which, per
 * the character system prompt, triggers AAVE_REPAY / AAVE_SUPPLY through
 * KeeperHub. This is what makes the guardian autonomous: it senses every
 * turn without being asked, and acts when the position is at risk.
 *
 * Silent (returns no text) when no watch wallet is configured, so it costs
 * nothing on agents that aren't guarding a position.
 */
import { type Provider, type IAgentRuntime, type Memory, type State, logger } from '@elizaos/core';
import { KeeperHubClient } from '../client.ts';
import { AAVE_V3, renderHealthLine, CHAIN } from '../aaveUtils.ts';

const DEFAULT_THRESHOLD = 1.5;

export const aaveHealthProvider: Provider = {
  name: 'AAVE_HEALTH',
  description:
    'Autonomously reads the watched Aave V3 health factor each turn and flags liquidation risk (sense step of the risk guardian).',

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State
  ): Promise<{ text: string; values: Record<string, unknown>; data: Record<string, unknown> }> => {
    const apiKey = runtime.getSetting('KEEPERHUB_API_KEY') as string | undefined;
    const watchWallet = runtime.getSetting('KEEPERHUB_WATCH_WALLET') as string | undefined;

    // No wallet to watch → provider is silent (no cost on non-guarding turns).
    if (!apiKey || !watchWallet) {
      return { text: '', values: {}, data: {} };
    }

    const baseUrl =
      (runtime.getSetting('KEEPERHUB_BASE_URL') as string | undefined) || 'https://app.keeperhub.com';
    const network =
      (runtime.getSetting('KEEPERHUB_DEFAULT_NETWORK') as string | undefined) || CHAIN.SEPOLIA;
    const threshold = Number(
      (runtime.getSetting('KEEPERHUB_HEALTH_THRESHOLD') as string | undefined) || DEFAULT_THRESHOLD
    );

    const client = new KeeperHubClient(apiKey, baseUrl);

    try {
      const result = (await client.executeProtocolAction({
        actionType: AAVE_V3.GET_USER_ACCOUNT_DATA,
        params: { network, user: watchWallet },
      })) as any;

      const data = result?.result ?? result;
      const { text, verdict, scaled } = renderHealthLine(watchWallet, network, threshold, data);

      logger.info(
        `[KeeperHub] AAVE_HEALTH provider: ${watchWallet} hf=${scaled} verdict=${verdict}`
      );

      return {
        text,
        values: {
          watchWallet,
          network,
          healthFactor: scaled,
          verdict,
          threshold,
          atRisk: verdict === 'at-risk',
        },
        data: result as Record<string, unknown>,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`[KeeperHub] AAVE_HEALTH provider read failed: ${errorMsg}`);
      return {
        text: `Aave health read failed for ${watchWallet}: ${errorMsg}`,
        values: { watchWallet, error: errorMsg },
        data: {},
      };
    }
  },
};

export default aaveHealthProvider;
