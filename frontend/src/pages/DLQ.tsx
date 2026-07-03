import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import {
  AlertTriangle,
  RotateCcw,
  Loader2,
  Calendar,
  AlertOctagon,
  Trash2,
  Layers
} from 'lucide-react';

export const DLQ: React.FC = () => {
  const { activeProject, apiFetch } = useAuth();
  const queryClient = useQueryClient();
  const [selectedQueue, setSelectedQueue] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Fetch queues to select from
  const { data: queues } = useQuery({
    queryKey: ['queues', activeProject?.id],
    queryFn: () => apiFetch(`/queues/project/${activeProject?.id}`),
    enabled: !!activeProject?.id,
  });

  const defaultQueueId = queues?.[0]?.id || '';
  const currentQueueId = selectedQueue || defaultQueueId;

  // Fetch DLQ entries
  const { data: dlqResponse, isLoading: loadingDlq } = useQuery({
    queryKey: ['dlq-entries', currentQueueId, page],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      return apiFetch(`/queues/${currentQueueId}/dlq?${params.toString()}`);
    },
    enabled: !!currentQueueId,
  });

  // Requeue mutation
  const requeueMutation = useMutation({
    mutationFn: (dlqEntryId: string) => apiFetch(`/dlq/${dlqEntryId}/requeue`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dlq-entries'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['project-metrics'] });
    },
  });

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
        <AlertTriangle className="w-12 h-12 text-slate-500 mb-4 animate-bounce" />
        <h3 className="text-xl font-bold text-slate-300">No Project Selected</h3>
        <p className="text-slate-500 text-sm mt-1 max-w-sm">Please select or create a project in the sidebar to manage DLQ.</p>
      </div>
    );
  }

  const entries = dlqResponse?.data || [];
  const totalPages = dlqResponse?.meta?.totalPages || 1;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-bold bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
            Dead Letter Queue (DLQ)
          </h3>
          <p className="text-slate-400 text-xs mt-1">Review failed jobs that have exhausted all retries, and manual requeue them</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 p-4 bg-slate-900/30 border border-slate-800/40 rounded-xl">
        <label className="text-xs text-slate-400 font-medium">Select Queue:</label>
        <select
          value={selectedQueue}
          onChange={(e) => {
            setSelectedQueue(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 bg-slate-950/60 border border-slate-850 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-violet-500"
        >
          {queues?.map((q: any) => (
            <option key={q.id} value={q.id}>{q.name}</option>
          ))}
          {(!queues || queues.length === 0) && <option value="">No Queues Configured</option>}
        </select>
      </div>

      {/* Entries List */}
      {loadingDlq ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
        </div>
      ) : entries.length > 0 ? (
        <div className="space-y-4">
          {entries.map((entry: any) => (
            <div
              key={entry.id}
              className="p-5 bg-slate-900/35 border border-slate-800/50 rounded-xl shadow-md space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <AlertOctagon className="w-5 h-5 text-rose-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-200">
                      Job ID: <span className="font-mono text-xs text-slate-300 font-semibold">{entry.jobId}</span>
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Type: <span className="text-slate-300 font-semibold">{entry.job.type}</span> | Total Attempts:{' '}
                      <span className="text-slate-300 font-semibold">{entry.totalAttempts}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => requeueMutation.mutate(entry.id)}
                    disabled={requeueMutation.isPending}
                    className="flex items-center gap-1.5 py-1.5 px-3.5 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-xl text-xs transition-colors cursor-pointer border border-violet-500/30"
                  >
                    {requeueMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <><RotateCcw className="w-3.5 h-3.5" /> Requeue Job</>
                    )}
                  </button>
                </div>
              </div>

              {/* Error Box */}
              <div className="p-3.5 bg-rose-500/5 border border-rose-500/10 rounded-lg space-y-1">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold block">Final Error Message</span>
                <span className="text-xs text-rose-400 font-mono block leading-normal">{entry.finalError}</span>
              </div>

              {/* Payload Preview */}
              <div>
                <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Payload JSON</span>
                <pre className="p-3.5 font-mono text-[10px] text-slate-300 bg-slate-950 border border-slate-850 rounded-xl max-h-36 overflow-y-auto">
                  {JSON.stringify(entry.payload, null, 2)}
                </pre>
              </div>

              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <Calendar className="w-3.5 h-3.5" /> Moved to DLQ: {new Date(entry.movedAt).toLocaleString()}
              </div>
            </div>
          ))}

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 bg-slate-900/20 border border-slate-800 rounded-xl">
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
          <AlertOctagon className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h4 className="text-base font-bold text-slate-300">DLQ is Empty</h4>
          <p className="text-slate-500 text-xs mt-1">Excellent! No jobs have failed permanently in this queue.</p>
        </div>
      )}
    </div>
  );
};
