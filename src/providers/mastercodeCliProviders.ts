import { ClaudeCliProvider } from '../mastercode_port/providers/claudeCli';
import { GptCliProvider } from '../mastercode_port/providers/gptCli';

export function createClaudeCliProvider() {
  return new ClaudeCliProvider();
}

export function createGptCliProvider() {
  return new GptCliProvider();
}
