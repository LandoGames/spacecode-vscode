/**
 * Coordinator Client - Stub
 * TODO: Implement coordinator communication for job queue
 */

export class CoordinatorClient {
  private _connected = false;

  async connect(): Promise<void> { this._connected = true; }
  async disconnect(): Promise<void> { this._connected = false; }
  get connected(): boolean { return this._connected; }

  async submitJob(job: any): Promise<string> { return 'stub-job-id'; }
  async getJobStatus(jobId: string): Promise<string> { return 'pending'; }
  async cancelJob(jobId: string): Promise<void> {}
}
