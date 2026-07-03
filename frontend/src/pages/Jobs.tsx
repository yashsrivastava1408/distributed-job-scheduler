import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  Filter,
  Play,
  X,
  RotateCcw,
  Clock,
  Briefcase,
  AlertTriangle,
  Logs,
  Calendar,
  Loader2,
  ListFilter,
  Plus
} from 'lucide-react';

export const Jobs: React.FC = () => {
  const { activeProject, apiFetch } = useAuth();
  const queryClient = useQueryClient();

  // Filters
  const [selectedQueue, setSelectedQueue] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Selected Job for drawer
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Submit Job Form State
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [targetQueueId, setTargetQueueId] = useState('');
  const [jobType, setJobType] = useState('simulate');
  const [jobPayload, setJobPayload] = useState('{\n  "durationMs": 2000,\n  "failureRate": 0.2,\n  "failMessage": "Simulated failure!"\n}');
  const [jobPriority, setJobPriority] = useState<number | ''>('');
  const [jobRunAt, setJobRunAt] = useState('');
  const [jobIdempotencyKey, setJobIdempotencyKey] = useState('');
  const [submitError, setSubmitError] = useState('');

  // Fetch queues to populate selectors
  const { data: queues } = useQuery({
    queryKey: ['queues', activeProject?.id],
    queryFn: () => apiFetch(`/queues/project/${activeProject?.id}`),
    enabled: !!activeProject?.id,
  });

  // Automatically select first queue in forms if not set
  React.useEffect(() => {
    if (queues && queues.length > 0 && !targetQueueId) {
      setTargetQueueId(queues[0].id);
    }
  }, [queues, targetQueueId]);

  // Fetch jobs (for active queue or fall back to listing for first queue if selectedQueue is empty)
  const defaultQueueId = queues?.[0]?.id || '';
  const currentQueueId = selectedQueue || defaultQueueId;

  const { data: jobsResponse, isLoading: loadingJobs } = useQuery({
    queryKey: ['jobs', currentQueueId, page, selectedStatus, selectedType],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (selectedStatus) params.append('status', selectedStatus);
      if (selectedType) params.append('type', selectedType);
      return apiFetch(`/queues/${currentQueueId}/jobs?${params.toString()}`);
    },
    enabled: !!currentQueueId,
  });

  // Fetch active job detail for drawer
  const { data: jobDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['job-detail', selectedJobId],
    queryFn: () => apiFetch(`/jobs/${selectedJobId}`),
    enabled: !!selectedJobId,
  });

  // Submit job mutation
  const submitJobMutation = useMutation({
    mutationFn: (body: any) => apiFetch(`/queues/${targetQueueId}/jobs`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['project-metrics'] });
      setShowSubmitForm(false);
      setJobIdempotencyKey('');
      setSubmitError('');
    },
    onError: (err) => {
      setSubmitError(err.message || 'Failed to submit job');
    },
  });

  // Manual retry mutation
  const retryMutation = useMutation({
    mutationFn: (jobId: string) => apiFetch(`/jobs/${jobId}/retry`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      if (selectedJobId) {
        queryClient.invalidateQueries({ queryKey: ['job-detail', selectedJobId] });
      }
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: (jobId: string) => apiFetch(`/jobs/${jobId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      if (selectedJobId) {
        queryClient.invalidateQueries({ queryKey: ['job-detail', selectedJobId] });
      }
    },
  });

  const handleJobSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    try {
      const parsedPayload = JSON.parse(jobPayload);
      const body: any = {
        type: jobType,
        payload: parsedPayload,
      };
      if (jobPriority !== '') body.priority = Number(jobPriority);
      if (jobRunAt) body.runAt = new Date(jobRunAt).toISOString();
      if (jobIdempotencyKey) body.idempotencyKey = jobIdempotencyKey;

      submitJobMutation.mutate(body);
    } catch {
      setSubmitError('Invalid JSON payload');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'failed':
      case 'dead_letter':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      case 'claimed':
      case 'running':
        return 'bg-violet-500/10 text-violet-400 border border-violet-500/20';
      case 'queued':
      case 'scheduled':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center p-8 bg-slate-900/10 rounded-2xl border border-dashed border-slate-800">
        <Briefcase className="w-12 h-12 text-slate-500 mb-4 animate-bounce" />
        <h3 className="text-xl font-bold text-slate-300">No Project Selected</h3>
        <p className="text-slate-500 text-sm mt-1 max-w-sm">Please select or create a project in the sidebar to view jobs.</p>
      </div>
    );
  }

  const jobs = jobsResponse?.data || [];
  const totalPages = jobsResponse?.meta?.totalPages || 1;

  return (
    <div className="space-y-8 relative">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-bold bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
            Job Explorer
          </h3>
          <p className="text-slate-400 text-xs mt-1">Search, monitor logs, and manage the execution lifecycle of jobs</p>
        </div>
        <button
          onClick={() => setShowSubmitForm(!showSubmitForm)}
          disabled={!queues || queues.length === 0}
          className="flex items-center gap-2 py-2 px-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-medium rounded-xl text-xs transition-all hover:scale-[1.02] disabled:opacity-55 cursor-pointer"
        >
          {showSubmitForm ? 'Close Form' : <><Plus className="w-4 h-4" /> Submit Job</>}
        </button>
      </div>

      {/* Submit Job Form */}
      {showSubmitForm && (
        <form onSubmit={handleJobSubmit} className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/5 rounded-full blur-[60px] pointer-events-none" />
          <h4 className="font-bold text-slate-200 text-sm">Submit New Job</h4>

          {submitError && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl">{submitError}</p>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Target Queue</label>
              <select
                value={targetQueueId}
                onChange={(e) => setTargetQueueId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500"
              >
                {queues?.map((q: any) => (
                  <option key={q.id} value={q.id}>{q.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Handler Type</label>
              <select
                value={jobType}
                onChange={(e) => {
                  setJobType(e.target.value);
                  if (e.target.value === 'simulate') {
                    setJobPayload('{\n  "durationMs": 2000,\n  "failureRate": 0.2,\n  "failMessage": "Simulated failure!"\n}');
                  } else if (e.target.value === 'http-request') {
                    setJobPayload('{\n  "url": "https://httpbin.org/get",\n  "method": "GET"\n}');
                  } else {
                    setJobPayload('{\n  "message": "Custom log message"\n}');
                  }
                }}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500"
              >
                <option value="simulate">Simulate Worker Execution</option>
                <option value="http-request">Make HTTP Request</option>
                <option value="log">Logging Message</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Priority Override (optional)</label>
              <input
                type="number"
                value={jobPriority}
                onChange={(e) => setJobPriority(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="e.g. 5"
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Delayed Execution / Scheduled At (optional)</label>
              <input
                type="datetime-local"
                value={jobRunAt}
                onChange={(e) => setJobRunAt(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Idempotency Key (optional)</label>
              <input
                type="text"
                value={jobIdempotencyKey}
                onChange={(e) => setIdempotencyKey(e.target.value)}
                placeholder="e.g. order-12345"
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 font-medium mb-1.5">JSON Payload</label>
            <textarea
              rows={4}
              required
              value={jobPayload}
              onChange={(e) => setJobPayload(e.target.value)}
              className="w-full p-3 font-mono bg-slate-950/70 border border-slate-800 rounded-xl text-slate-300 text-xs focus:outline-none focus:border-violet-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitJobMutation.isPending}
            className="py-2 px-6 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-xl text-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            {submitJobMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enqueue Job'}
          </button>
        </form>
      )}

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900/30 border border-slate-800/40 rounded-xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400 mr-2">
            <ListFilter className="w-4 h-4 text-violet-400" /> Filters
          </div>

          {/* Queue Filter */}
          <select
            value={selectedQueue}
            onChange={(e) => {
              setSelectedQueue(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 bg-slate-950/60 border border-slate-850 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-violet-500"
          >
            {queues?.map((q: any) => (
              <option key={q.id} value={q.id}>Queue: {q.name}</option>
            ))}
            {(!queues || queues.length === 0) && <option value="">No Queues</option>}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 bg-slate-950/60 border border-slate-850 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-violet-500"
          >
            <option value="">All Statuses</option>
            <option value="queued">Queued</option>
            <option value="claimed">Claimed</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="dead_letter">Dead Letter</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Handler Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 bg-slate-950/60 border border-slate-850 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-violet-500"
          >
            <option value="">All Types</option>
            <option value="simulate">simulate</option>
            <option value="http-request">http-request</option>
            <option value="log">log</option>
          </select>
        </div>

        <span className="text-[10px] text-slate-500 font-semibold tracking-wider">
          PAGE {page} OF {totalPages}
        </span>
      </div>

      {/* Jobs Table */}
      {loadingJobs ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
        </div>
      ) : jobs.length > 0 ? (
        <div className="bg-slate-900/10 border border-slate-800/40 rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="p-4">Job ID</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Attempts</th>
                  <th className="p-4">Priority</th>
                  <th className="p-4">Scheduled At</th>
                  <th className="p-4">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {jobs.map((job: any) => (
                  <tr
                    key={job.id}
                    onClick={() => setSelectedJobId(job.id)}
                    className="hover:bg-slate-900/30 transition-colors cursor-pointer"
                  >
                    <td className="p-4 font-mono font-medium text-slate-300 max-w-32 truncate">{job.id}</td>
                    <td className="p-4 font-semibold text-slate-200">{job.type}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${getStatusBadge(job.status)}`}>
                        {job.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4 text-slate-300">
                      {job.attemptCount} / {job.maxAttempts}
                    </td>
                    <td className="p-4 text-slate-300 font-semibold">{job.priority}</td>
                    <td className="p-4 text-slate-400 font-medium">
                      {new Date(job.runAt).toLocaleString()}
                    </td>
                    <td className="p-4 text-slate-400 font-medium">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/20">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="py-1.5 px-3 bg-slate-850 border border-slate-800 rounded-lg text-xs font-semibold hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
              >
                Previous
              </button>
              <span className="text-slate-400 text-xs font-medium">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="py-1.5 px-3 bg-slate-850 border border-slate-800 rounded-lg text-xs font-semibold hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-20 bg-slate-900/10 rounded-2xl border border-dashed border-slate-800">
          <Briefcase className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h4 className="text-base font-bold text-slate-300">No Jobs Found</h4>
          <p className="text-slate-500 text-xs mt-1">Try submitting a job or changing your filters.</p>
        </div>
      )}

      {/* Drawer Overlay for Job detail */}
      {selectedJobId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-xs">
          {/* Backdrop closer */}
          <div className="absolute inset-0 cursor-pointer" onClick={() => setSelectedJobId(null)} />

          {/* Drawer body */}
          <div className="w-full max-w-2xl bg-[#0b101c] border-l border-slate-800/80 shadow-2xl relative z-10 flex flex-col h-full animate-slide-in p-6 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800/60">
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">Job Details</span>
                <h4 className="text-sm font-mono text-slate-300 mt-1 truncate max-w-md">{selectedJobId}</h4>
              </div>
              <button
                onClick={() => setSelectedJobId(null)}
                className="p-1.5 hover:bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingDetail ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
              </div>
            ) : jobDetail ? (
              <div className="flex-1 overflow-y-auto py-6 space-y-6 pr-2">
                {/* Meta details */}
                <div className="grid grid-cols-2 gap-4 bg-slate-900/30 p-4 border border-slate-850 rounded-xl text-xs">
                  <div className="space-y-1">
                    <span className="text-slate-500">Type</span>
                    <span className="font-semibold text-slate-200 block">{jobDetail.type}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-500">Status</span>
                    <div>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold ${getStatusBadge(jobDetail.status)}`}>
                        {jobDetail.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-500">Attempts</span>
                    <span className="font-semibold text-slate-200 block">{jobDetail.attemptCount} / {jobDetail.maxAttempts}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-500">Priority</span>
                    <span className="font-semibold text-slate-200 block">{jobDetail.priority}</span>
                  </div>
                  {jobDetail.idempotencyKey && (
                    <div className="col-span-2 space-y-1">
                      <span className="text-slate-500">Idempotency Key</span>
                      <span className="font-mono text-slate-200 block bg-slate-950/40 p-1.5 rounded border border-slate-850">{jobDetail.idempotencyKey}</span>
                    </div>
                  )}
                  {jobDetail.lastError && (
                    <div className="col-span-2 space-y-1">
                      <span className="text-slate-500 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Last Error Message</span>
                      <span className="text-rose-400 block bg-rose-500/5 p-2.5 rounded-xl border border-rose-500/20 font-medium leading-normal">{jobDetail.lastError}</span>
                    </div>
                  )}
                </div>

                {/* Actions Panel */}
                <div className="flex gap-4">
                  {/* Retry Action */}
                  {['failed', 'dead_letter', 'cancelled'].includes(jobDetail.status) && (
                    <button
                      onClick={() => retryMutation.mutate(jobDetail.id)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" /> Requeue / Retry Now
                    </button>
                  )}

                  {/* Cancel Action */}
                  {['queued', 'scheduled', 'claimed', 'running'].includes(jobDetail.status) && (
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to cancel this job?')) {
                          cancelMutation.mutate(jobDetail.id);
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" /> Cancel Job
                    </button>
                  )}
                </div>

                {/* Payload */}
                <div>
                  <h5 className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">Job Payload JSON</h5>
                  <pre className="p-4 font-mono text-[11px] text-slate-300 bg-slate-950 border border-slate-850 rounded-xl overflow-x-auto">
                    {JSON.stringify(jobDetail.payload, null, 2)}
                  </pre>
                </div>

                {/* Executions & Logs Timeline */}
                <div>
                  <h5 className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Logs className="w-4 h-4 text-violet-400" /> Execution History & Output
                  </h5>

                  {jobDetail.executions && jobDetail.executions.length > 0 ? (
                    <div className="space-y-6">
                      {jobDetail.executions.map((exec: any) => (
                        <div key={exec.id} className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl space-y-4">
                          {/* Attempt Header */}
                          <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                            <span className="font-semibold text-xs text-slate-200">Attempt #{exec.attemptNumber}</span>
                            <div className="flex items-center gap-3">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                exec.status === 'succeeded'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : exec.status === 'running'
                                  ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}>
                                {exec.status.toUpperCase()}
                              </span>
                              {exec.durationMs !== null && (
                                <span className="text-[10px] text-slate-500 font-semibold">{exec.durationMs}ms</span>
                              )}
                            </div>
                          </div>

                          {/* Worker & Timeline details */}
                          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                            <div>Worker: <span className="text-slate-300 font-medium font-mono">{exec.worker.hostname} ({exec.workerId.slice(0, 8)})</span></div>
                            <div className="text-right">Started: <span className="text-slate-300 font-medium">{new Date(exec.startedAt).toLocaleTimeString()}</span></div>
                            {exec.finishedAt && (
                              <div className="col-span-2 text-right">Finished: <span className="text-slate-300 font-medium">{new Date(exec.finishedAt).toLocaleTimeString()}</span></div>
                            )}
                          </div>

                          {/* Execution Error Detail if present */}
                          {exec.errorMessage && (
                            <div className="p-2.5 bg-rose-500/5 border border-rose-500/15 rounded-lg text-[10px] text-rose-400 font-mono overflow-x-auto">
                              <div>Error: {exec.errorMessage}</div>
                              {exec.errorStack && <div className="mt-1 opacity-60 text-[9px] whitespace-pre-wrap">{exec.errorStack}</div>}
                            </div>
                          )}

                          {/* Execution Log stream */}
                          {exec.logs && exec.logs.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Log Stream</span>
                              <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg max-h-48 overflow-y-auto font-mono text-[10px] space-y-1">
                                {exec.logs.map((log: any) => (
                                  <div key={log.id} className="flex gap-2">
                                    <span className="text-slate-500 shrink-0 select-none">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                    <span className={log.level === 'error' ? 'text-rose-400' : log.level === 'warn' ? 'text-amber-400' : 'text-slate-300'}>
                                      {log.message}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 bg-slate-950/20 border border-dashed border-slate-850 rounded-xl text-center text-xs text-slate-500">
                      No executions have been attempted yet for this job.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-slate-500 text-xs">Failed to load details.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
