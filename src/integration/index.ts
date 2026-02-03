/**
 * Integration Module
 *
 * External tool integrations for SpaceCode.
 */

export {
  GitAdapter,
  createGitAdapter,
  GitFileStatus,
  GitFile,
  DiffHunk,
  FileDiff,
  DiffResult,
  GitStatus,
  CommitInfo
} from './GitAdapter';

export {
  GitHubAdapter,
  createGitHubAdapter,
  GitHubIssue,
  GitHubPR,
  CreateIssueOptions,
  CreatePROptions,
  ListIssuesOptions
} from './GitHubAdapter';
