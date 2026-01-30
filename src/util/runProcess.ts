import { ChildProcessWithoutNullStreams, spawn } from 'child_process';

export interface RunProcessOptions {
  cmd: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface RunProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function runProcess(opts: RunProcessOptions): { proc: ChildProcessWithoutNullStreams; done: Promise<RunProcessResult> } {
  const proc = spawn(opts.cmd, opts.args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: 'pipe'
  });

  let stdout = '';
  let stderr = '';
  let timedOut = false;

  const onAbort = () => {
    try {
      proc.kill('SIGTERM');
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 1500);
    } catch {
      // ignore
    }
  };

  if (opts.signal) {
    if (opts.signal.aborted) onAbort();
    opts.signal.addEventListener('abort', onAbort, { once: true });
  }

  if (opts.timeoutMs && opts.timeoutMs > 0) {
    setTimeout(() => {
      timedOut = true;
      onAbort();
    }, opts.timeoutMs);
  }

  proc.stdout.on('data', (buf: Buffer) => {
    const s = buf.toString('utf8');
    stdout += s;
    opts.onStdout?.(s);
  });

  proc.stderr.on('data', (buf: Buffer) => {
    const s = buf.toString('utf8');
    stderr += s;
    opts.onStderr?.(s);
  });

  const done = new Promise<RunProcessResult>((resolve) => {
    proc.on('close', (code) => resolve({ code, stdout, stderr, timedOut }));
  });

  return { proc, done };
}
