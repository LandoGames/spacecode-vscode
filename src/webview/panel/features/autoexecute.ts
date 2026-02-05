// @ts-nocheck

export function createAutoexecuteHandlers(deps) {
  const { vscode } = deps;

  function renderJobList(jobs) {
    const list = document.getElementById('jobList');
    if (!list) return;
    list.innerHTML = '';
    if (!Array.isArray(jobs) || jobs.length === 0) {
      list.innerHTML = '<div style="color: var(--text-secondary); font-size:11px;">No pending approvals.</div>';
      return;
    }
    jobs.forEach(job => {
      const entry = document.createElement('div');
      entry.className = 'job-entry';
      entry.innerHTML = `<strong>${job.action}</strong>
          <div>Sector: ${job.sector}</div>
          <div>Doc: ${job.docTarget || '(none)'}</div>
          <div style="font-size:10px; color:var(--text-secondary);">status: ${job.status}</div>`;
      const actions = document.createElement('div');
      actions.className = 'job-actions';
      if (job.status === 'pending') {
        const approve = document.createElement('button');
        approve.textContent = 'Approve';
        approve.className = 'btn-secondary';
        approve.onclick = () => vscode.postMessage({ type: 'autoexecuteApprove', jobId: job.id });
        const reject = document.createElement('button');
        reject.textContent = 'Reject';
        reject.className = 'btn-secondary';
        reject.onclick = () => vscode.postMessage({ type: 'autoexecuteReject', jobId: job.id });
        actions.appendChild(approve);
        actions.appendChild(reject);
      } else {
        const span = document.createElement('span');
        span.style.opacity = '0.7';
        span.textContent = job.status.toUpperCase();
        actions.appendChild(span);
      }
      entry.appendChild(actions);
      list.appendChild(entry);
    });
  }

  function requestJobList() {
    vscode.postMessage({ type: 'autoexecuteList' });
  }

  function clearAllJobs() {
    vscode.postMessage({ type: 'autoexecuteClearAll' });
  }

  return {
    renderJobList,
    requestJobList,
    clearAllJobs,
  };
}
