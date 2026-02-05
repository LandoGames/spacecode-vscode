// @ts-nocheck

const CONTEXT_LIMITS = {
  claude: 200000,
  gpt: 272000,
  mastermind: 200000,
};

export function getContextLimit(mode) {
  return CONTEXT_LIMITS[mode] || 200000;
}
