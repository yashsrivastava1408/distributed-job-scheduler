import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import {
  Pause,
  Play,
  Trash2,
  Settings,
  Plus,
  Loader2,
  Layers,
  ChevronDown,
  ChevronUp,
  Clock,
  Gauge,
  RotateCcw
} from 'lucide-react';

export const Queues: React.FC = () => {
  const { activeProject, apiFetch } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedQueueId, setExpandedQueueId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(0);
  const [maxConcurrency, setMaxConcurrency] = useState(10);
  const [useRetryPolicy, setUseRetryPolicy] = useState(true);
  const [retryStrategy, setRetryStrategy] = useState<'fixed' | 'linear' | 'exponential'>('exponential');
  const [baseDelayMs, setBaseDelayMs] = useState(1000);
  const [maxDelayMs, setMaxDelayMs] = useState(60000);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [jitter, setJitter] = useState(true);
  const [error, setError] = useState('');

  // Fetch queues
  const { data: queues, isLoading } = useQuery({
    queryKey: ['queues', activeProject?.id],
    queryFn: () => apiFetch(`/queues/project/${activeProject?.id}`),
    enabled: !!activeProject?.id,
  });

  // Create queue mutation
  const createQueueMutation = useMutation({
    mutationFn: (body: any) => apiFetch(`/queues/project/${activeProject?.id}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues', activeProject?.id] });
      setShowCreateForm(false);
      setName('');
      setPriority(0);
      setMaxConcurrency(10);
      setError('');
    },
    onError: (err) => {
      setError(err.message || 'Failed to create queue');
    },
  });

  // Pause queue mutation
  const pauseMutation = useMutation({
    mutationFn: (queueId: string) => apiFetch(`/queues/${queueId}/pause`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues', activeProject?.id] });
    },
  });

  // Resume queue mutation
  const resumeMutation = useMutation({
    mutationFn: (queueId: string) => apiFetch(`/queues/${queueId}/resume`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues', activeProject?.id] });
    },
  });

  // Delete queue mutation
  const deleteMutation = useMutation({
    mutationFn: (queueId: string) => apiFetch(`/queues/${queueId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues', activeProject?.id] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const body: any = {
      name,
      priority,
      maxConcurrency,
    };

    if (useRetryPolicy) {
      body.retryPolicy = {
        strategy: retryStrategy,
        baseDelayMs,
        maxDelayMs,
        maxAttempts,
        jitter,
      };
    }

    createQueueMutation.mutate(body);
  };

  const toggleExpand = (queueId: string) => {
    setExpandedQueueId(expandedQueueId === queueId ? null : queueId);
  };

  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center p-8 bg-slate-900/10 rounded-2xl border border-dashed border-slate-800">
        <Layers className="w-12 h-12 text-slate-500 mb-4 animate-bounce" />
        <h3 className="text-xl font-bold text-slate-300">No Project Selected</h3>
        <p className="text-slate-500 text-sm mt-1 max-w-sm">Please select or create a project in the sidebar to manage queues.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-bold bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
            Queues Configuration
          </h3>
          <p className="text-slate-400 text-xs mt-1">Manage processing priorities, concurrency limits, and retry patterns</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 py-2 px-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-medium rounded-xl text-xs transition-all hover:scale-[1.02] cursor-pointer"
        >
          {showCreateForm ? 'Cancel' : <><Plus className="w-4 h-4" /> Add Queue</>}
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <form onSubmit={handleCreate} className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/5 rounded-full blur-[60px] pointer-events-none" />

          <h4 className="font-bold text-slate-200 text-sm">Create New Queue</h4>

          {error && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl">{error}</p>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Queue Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. video-processing"
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Default Priority (higher is claimed first)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1.5">Max Concurrency (running concurrently)</label>
              <input
                type="number"
                min="1"
                max="1000"
                value={maxConcurrency}
                onChange={(e) => setMaxConcurrency(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-850 space-y-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useRetryPolicy}
                onChange={(e) => setUseRetryPolicy(e.target.checked)}
                className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500"
              />
              <span className="text-xs text-slate-300 font-medium">Attach Default Retry Policy</span>
            </label>

            {useRetryPolicy && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-6 p-4 bg-slate-950/40 border border-slate-850 rounded-xl">
                <div>
                  <label className="block text-[10px] text-slate-500 font-semibold mb-1 uppercase">Strategy</label>
                  <select
                    value={retryStrategy}
                    onChange={(e) => setRetryStrategy(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none"
                  >
                    <option value="fixed">Fixed Delay</option>
                    <option value="linear">Linear Backoff</option>
                    <option value="exponential">Exponential Backoff</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 font-semibold mb-1 uppercase">Base Delay (ms)</label>
                  <input
                    type="number"
                    min="100"
                    value={baseDelayMs}
                    onChange={(e) => setBaseDelayMs(parseInt(e.target.value, 10) || 1000)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 font-semibold mb-1 uppercase">Max Delay (ms)</label>
                  <input
                    type="number"
                    min="100"
                    value={maxDelayMs}
                    onChange={(e) => setMaxDelayMs(parseInt(e.target.value, 10) || 60000)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 font-semibold mb-1 uppercase">Max Attempts</label>
                  <input
                    type="number"
                    min="1"
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(parseInt(e.target.value, 10) || 3)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none"
                  />
                </div>
                <div className="flex items-center">
                  <label className="flex items-center gap-2 mt-4 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={jitter}
                      onChange={(e) => setJitter(e.target.checked)}
                      className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500"
                    />
                    <span className="text-xs text-slate-300">Add Random Jitter</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={createQueueMutation.isPending}
            className="w-full md:w-auto py-2 px-6 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-xl text-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            {createQueueMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Queue'}
          </button>
        </form>
      )}

      {/* Queues List */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
        </div>
      ) : queues && queues.length > 0 ? (
        <div className="space-y-4">
          {queues.map((queue: any) => {
            const isExpanded = expandedQueueId === queue.id;
            return (
              <div
                key={queue.id}
                className="bg-slate-900/35 border border-slate-800/50 rounded-xl overflow-hidden shadow-md"
              >
                {/* Queue Summary Header */}
                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 bg-slate-950 border border-slate-850 rounded-xl">
                      <Layers className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-slate-200">{queue.name}</h4>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
                        Priority: <span className="text-slate-300 font-semibold">{queue.priority}</span> | Max Concurrency:{' '}
                        <span className="text-slate-300 font-semibold">{queue.maxConcurrency}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* Status breakdown metrics */}
                    <div className="flex gap-4">
                      <div className="text-center min-w-14">
                        <span className="text-[9px] text-slate-500 block">Queued</span>
                        <span className="text-sm font-semibold text-blue-400 block mt-0.5">{queue.statusCounts.queued}</span>
                      </div>
                      <div className="text-center min-w-14">
                        <span className="text-[9px] text-slate-500 block">Running</span>
                        <span className="text-sm font-semibold text-violet-400 block mt-0.5">{queue.statusCounts.running}</span>
                      </div>
                      <div className="text-center min-w-14">
                        <span className="text-[9px] text-slate-500 block">Success</span>
                        <span className="text-sm font-semibold text-emerald-400 block mt-0.5">{queue.statusCounts.completed}</span>
                      </div>
                      <div className="text-center min-w-14">
                        <span className="text-[9px] text-slate-500 block">DLQ</span>
                        <span className="text-sm font-semibold text-rose-400 block mt-0.5">{queue.statusCounts.deadLetter}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pl-4 border-l border-slate-850">
                      {/* Pause / Resume action */}
                      {queue.isPaused ? (
                        <button
                          onClick={() => resumeMutation.mutate(queue.id)}
                          className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg cursor-pointer transition-colors"
                          title="Resume Queue"
                        >
                          <Play className="w-4 h-4 fill-emerald-400/20" />
                        </button>
                      ) : (
                        <button
                          onClick={() => pauseMutation.mutate(queue.id)}
                          className="p-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-lg cursor-pointer transition-colors"
                          title="Pause Queue"
                        >
                          <Pause className="w-4 h-4 fill-amber-400/20" />
                        </button>
                      )}

                      {/* Delete Action */}
                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete the queue "${queue.name}"? This will delete all associated jobs!`)) {
                            deleteMutation.mutate(queue.id);
                          }
                        }}
                        className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg cursor-pointer transition-colors"
                        title="Delete Queue"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      {/* Expand details toggler */}
                      <button
                        onClick={() => toggleExpand(queue.id)}
                        className="p-2 bg-slate-850 hover:bg-slate-800 border border-slate-800 hover:text-white rounded-lg cursor-pointer transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Queue Details Collapse Area */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-1 border-t border-slate-850 bg-slate-950/20 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Retry Policy details */}
                    <div>
                      <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Retry Config</h5>
                      {queue.defaultRetryPolicy ? (
                        <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Backoff Strategy:</span>
                            <span className="text-slate-300 font-semibold uppercase">{queue.defaultRetryPolicy.strategy}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Attempts Limit:</span>
                            <span className="text-slate-300 font-semibold">{queue.defaultRetryPolicy.maxAttempts}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Base Delay:</span>
                            <span className="text-slate-300 font-semibold">{queue.defaultRetryPolicy.baseDelayMs} ms</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Max Delay:</span>
                            <span className="text-slate-300 font-semibold">{queue.defaultRetryPolicy.maxDelayMs} ms</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Jitter Enabled:</span>
                            <span className="text-slate-300 font-semibold">{queue.defaultRetryPolicy.jitter ? 'Yes' : 'No'}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-slate-900/40 border border-dashed border-slate-850 rounded-xl text-center text-xs text-slate-500">
                          No custom retry policy configured. Falling back to default exponential backoff policies.
                        </div>
                      )}
                    </div>

                    {/* Stats details (e.g. latency, throughput) */}
                    <div>
                      <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Performance Metrics</h5>
                      <QueueStatsDetails queueId={queue.id} apiFetch={apiFetch} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 bg-slate-900/10 rounded-2xl border border-dashed border-slate-800">
          <Layers className="w-12 h-12 text-slate-600 mx-auto mb-4 animate-pulse" />
          <h4 className="text-base font-bold text-slate-300">No Queues Configured</h4>
          <p className="text-slate-500 text-xs mt-1">Add a new queue configuration above to start submitting jobs.</p>
        </div>
      )}
    </div>
  );
};

// Sub-component to load detailed statistics on expand
const QueueStatsDetails: React.FC<{ queueId: string; apiFetch: any }> = ({ queueId, apiFetch }) => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['queue-stats', queueId],
    queryFn: () => apiFetch(`/queues/${queueId}/stats`),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-6">
        <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 text-xs">
      <div className="p-3 bg-slate-900/60 border border-slate-850 rounded-xl flex items-center justify-between">
        <div className="space-y-1">
          <span className="text-slate-500 block">Throughput (1h)</span>
          <span className="text-sm font-bold text-slate-200 block">{stats?.throughputLastHour || 0} jobs</span>
        </div>
        <Gauge className="w-4 h-4 text-slate-500" />
      </div>
      <div className="p-3 bg-slate-900/60 border border-slate-850 rounded-xl flex items-center justify-between">
        <div className="space-y-1">
          <span className="text-slate-500 block">Avg Duration</span>
          <span className="text-sm font-bold text-slate-200 block">{stats?.avgDurationMs || 0} ms</span>
        </div>
        <Clock className="w-4 h-4 text-slate-500" />
      </div>
      <div className="p-3 bg-slate-900/60 border border-slate-850 rounded-xl flex items-center justify-between">
        <div className="space-y-1">
          <span className="text-slate-500 block">Backlog Total</span>
          <span className="text-sm font-bold text-slate-200 block">{stats?.backlogSize || 0} jobs</span>
        </div>
        <RotateCcw className="w-4 h-4 text-slate-500" />
      </div>
      <div className="p-3 bg-slate-900/60 border border-slate-850 rounded-xl flex items-center justify-between">
        <div className="space-y-1">
          <span className="text-slate-500 block">Active Claims</span>
          <span className="text-sm font-bold text-slate-200 block">{stats?.activeCount || 0} jobs</span>
        </div>
        <Clock className="w-4 h-4 text-slate-500" />
      </div>
    </div>
  );
};
