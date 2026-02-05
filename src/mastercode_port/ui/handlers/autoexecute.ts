// @ts-nocheck

export async function handleAutoexecuteMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'autoexecuteList':
      panel._postJobList();
      return true;

    case 'autoexecuteApprove':
      if (typeof message.jobId === 'string') {
        panel._updateJobStatus(message.jobId, 'approved');
        await panel._runApprovedJob(message.jobId);
      }
      return true;

    case 'autoexecuteReject':
      if (typeof message.jobId === 'string') {
        panel._updateJobStatus(message.jobId, 'rejected');
      }
      return true;

    case 'autoexecuteClearAll':
      panel._saveJobs([]);
      panel._postMessage({ type: 'autoexecuteJobs', jobs: [] });
      return true;

    default:
      return false;
  }
}
