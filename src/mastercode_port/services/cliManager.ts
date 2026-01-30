/**
 * CLI Manager - Handles checking and managing CLI tools (claude, codex)
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CliStatus {
  installed: boolean;
  version?: string;
  path?: string;
  loggedIn: boolean;
  error?: string;
}

export interface AllCliStatus {
  claude: CliStatus;
  codex: CliStatus;
}

export class CliManager {
  /**
   * Check status of all CLIs
   */
  async checkAllStatus(): Promise<AllCliStatus> {
    const [claude, codex] = await Promise.all([
      this.checkClaudeStatus(),
      this.checkCodexStatus(),
    ]);

    return { claude, codex };
  }

  /**
   * Check Claude CLI status
   */
  async checkClaudeStatus(): Promise<CliStatus> {
    const status: CliStatus = {
      installed: false,
      loggedIn: false,
    };

    try {
      // Check if installed
      const { stdout: whichOutput } = await execAsync('which claude');
      status.path = whichOutput.trim();
      status.installed = true;

      // Get version
      const { stdout: versionOutput } = await execAsync('claude --version');
      status.version = versionOutput.trim();

      // Check if logged in by trying a simple command
      // Claude CLI stores auth in ~/.claude/
      try {
        const { stdout: authCheck } = await execAsync('claude --print "test" 2>&1', {
          timeout: 10000,
        });
        // If it responds without auth error, we're logged in
        status.loggedIn = !authCheck.includes('not authenticated') &&
                          !authCheck.includes('log in') &&
                          !authCheck.includes('authenticate');
      } catch (authError: any) {
        // Check error message for auth issues
        const errorMsg = authError.message || authError.stderr || '';
        status.loggedIn = !errorMsg.includes('not authenticated') &&
                          !errorMsg.includes('log in') &&
                          !errorMsg.includes('authenticate');
      }
    } catch (error: any) {
      status.error = error.message;
    }

    return status;
  }

  /**
   * Check Codex CLI status
   */
  async checkCodexStatus(): Promise<CliStatus> {
    const status: CliStatus = {
      installed: false,
      loggedIn: false,
    };

    try {
      // Check if installed
      const { stdout: whichOutput } = await execAsync('which codex');
      status.path = whichOutput.trim();
      status.installed = true;

      // Get version
      const { stdout: versionOutput } = await execAsync('codex --version');
      status.version = versionOutput.trim();

      // Check if logged in - codex uses OPENAI_API_KEY or web auth
      // We'll assume logged in if installed, as auth is checked at runtime
      status.loggedIn = true; // Will fail at runtime if not authenticated
    } catch (error: any) {
      status.error = error.message;
    }

    return status;
  }

  /**
   * Get install command for a CLI
   */
  getInstallCommand(cli: 'claude' | 'codex'): string {
    if (cli === 'claude') {
      return 'npm install -g @anthropic-ai/claude-code';
    } else {
      return 'npm install -g @openai/codex';
    }
  }

  /**
   * Get login command for a CLI
   */
  getLoginCommand(cli: 'claude' | 'codex'): string {
    if (cli === 'claude') {
      return 'claude login';
    } else {
      return 'codex auth';
    }
  }

  /**
   * Install a CLI (requires terminal interaction for npm)
   */
  async installCli(cli: 'claude' | 'codex'): Promise<{ success: boolean; message: string }> {
    const command = this.getInstallCommand(cli);

    try {
      await execAsync(command, { timeout: 120000 });
      return {
        success: true,
        message: `${cli} CLI installed successfully`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to install ${cli} CLI: ${error.message}`,
      };
    }
  }
}

// Singleton instance
export const cliManager = new CliManager();
