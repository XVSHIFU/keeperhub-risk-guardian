import { logger, type IAgentRuntime, type Project, type ProjectAgent } from '@elizaos/core';
import { character } from './character.ts';
import { keeperhubPlugin } from './plugins/keeperhub/index.ts';

const initCharacter = ({ runtime }: { runtime: IAgentRuntime }) => {
  logger.info('[KeeperHub Agent] Initializing...');
  logger.info({ name: character.name }, 'Agent name:');
  logger.info('[KeeperHub Agent] Ready for on-chain operations');
};

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
  plugins: [keeperhubPlugin],
};

const project: Project = {
  agents: [projectAgent],
};

export { character } from './character.ts';

export default project;
