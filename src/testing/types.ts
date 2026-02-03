/**
 * Testing Module Types
 *
 * Defines data structures for test running and results.
 */

/**
 * Test result status
 */
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'running';

/**
 * Test framework type
 */
export type TestFramework = 'jest' | 'mocha' | 'vitest' | 'unity-editmode' | 'unity-playmode' | 'unknown';

/**
 * A single test case result
 */
export interface TestCase {
  id: string;
  name: string;
  suite: string;
  file: string;
  line?: number;
  status: TestStatus;
  duration?: number;
  error?: {
    message: string;
    stack?: string;
    expected?: string;
    actual?: string;
  };
}

/**
 * A test suite (file/class)
 */
export interface TestSuite {
  id: string;
  name: string;
  file: string;
  tests: TestCase[];
  status: TestStatus;
  duration: number;
  passed: number;
  failed: number;
  skipped: number;
}

/**
 * Test run result
 */
export interface TestRunResult {
  completedAt: number;
  duration: number;
  framework: TestFramework;
  suites: TestSuite[];
  passed: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
  };
  coverage?: {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
  };
}

/**
 * Test run options
 */
export interface TestRunOptions {
  /** Specific files to test */
  files?: string[];
  /** Test name patterns to run */
  patterns?: string[];
  /** Include coverage */
  coverage?: boolean;
  /** Watch mode */
  watch?: boolean;
  /** Run specific framework */
  framework?: TestFramework;
  /** Timeout per test */
  timeout?: number;
}

/**
 * Test discovery result
 */
export interface TestDiscoveryResult {
  framework: TestFramework;
  suites: Array<{
    file: string;
    name: string;
    testCount: number;
  }>;
  totalTests: number;
}
