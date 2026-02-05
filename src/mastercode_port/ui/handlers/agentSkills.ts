// @ts-nocheck

import { AGENTS, SKILLS, getAgentSkills, getSkillByCommand } from '../../../agents/definitions';

export async function handleAgentSkillsMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'getAgentList': {
      const agents = Object.values(AGENTS).map(a => ({
        ...a,
        status: 'idle', // Future: track active/working/idle
        currentAction: null,
      }));
      panel._postMessage({ type: 'agentList', agents });
      return true;
    }

    case 'getSkills':
    case 'getSkillList': {
      const skills = SKILLS.map(s => ({
        ...s,
        enabled: true, // Future: per-skill enable/disable
      }));
      panel._postMessage({ type: 'skillList', skills });
      return true;
    }

    case 'getAgentSkills': {
      const skills = getAgentSkills(message.agentId || 'nova');
      panel._postMessage({ type: 'agentSkillsList', agentId: message.agentId, skills });
      return true;
    }

    case 'runSkillByCommand': {
      const skill = getSkillByCommand(message.command || '');
      if (skill) {
        panel._postMessage({
          type: 'skillTriggered',
          skill,
          input: message.input || '',
        });
      } else {
        panel._postMessage({
          type: 'skillError',
          error: 'Unknown skill command: ' + (message.command || ''),
        });
      }
      return true;
    }

    case 'getAgentDetails': {
      const agent = AGENTS[message.agentId];
      if (agent) {
        const skills = getAgentSkills(message.agentId);
        panel._postMessage({ type: 'agentDetails', agent, skills });
      }
      return true;
    }

    default:
      return false;
  }
}
