// @ts-nocheck

export async function handleGitMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'getGitStatus':
      await panel._getGitStatus();
      return true;

    case 'gitStageFiles':
      await panel._gitStageFiles(message.files);
      return true;

    case 'gitCommit':
      await panel._gitCommit(message.message, message.files);
      return true;

    case 'gitCreateBranch':
      await panel._gitCreateBranch(message.name, message.checkout);
      return true;

    case 'gitCheckout':
      await panel._gitCheckout(message.ref);
      return true;

    case 'gitPush':
      await panel._gitPush(message.remote, message.branch, message.setUpstream);
      return true;

    case 'gitPull':
      await panel._gitPull(message.remote, message.branch);
      return true;

    case 'getRecentCommits':
      await panel._getRecentCommits(message.count);
      return true;

    default:
      return false;
  }
}
