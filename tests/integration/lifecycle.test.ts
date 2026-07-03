import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import prisma from '../../src/shared/db';
import { jobService } from '../../src/api/services/job.service';
import { reaperService } from '../../src/api/services/reaper.service';

describe('Job Lifecycle & Reaper Integration', () => {
  let organizationId: string;
  let projectId: string;
  let queueId: string;
  const workerId = '00000000-0000-0000-0000-000000000009';

  beforeEach(async () => {
    // Clear dependencies cleanly
    await prisma.jobExecution.deleteMany();
    await prisma.deadLetterEntry.deleteMany();
    await prisma.job.deleteMany();
    await prisma.queue.deleteMany();
    await prisma.project.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.worker.deleteMany();

    const org = await prisma.organization.create({
      data: { name: 'Test Org' },
    });
    organizationId = org.id;

    const proj = await prisma.project.create({
      data: { name: 'Test Proj', organizationId },
    });
    projectId = proj.id;

    const queue = await prisma.queue.create({
      data: {
        name: 'test-queue',
        projectId,
      },
    });
    queueId = queue.id;

    // Register active worker
    await prisma.worker.create({
      data: {
        id: workerId,
        hostname: 'test-worker',
        pid: 12345,
        status: 'online',
        concurrency: 5,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('completes jobs successfully and updates history', async () => {
    // Create job
    const { job } = await jobService.create(queueId, { type: 'simulate' });

    // Simulate worker claiming and running it
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'running',
        attemptCount: 1,
        claimedByWorkerId: workerId,
      },
    });

    await prisma.jobExecution.create({
      data: {
        jobId: job.id,
        attemptNumber: 1,
        workerId,
        status: 'running',
      },
    });

    // Complete job
    await jobService.complete(job.id, workerId, 150);

    // Verify job is marked completed
    const updatedJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe('completed');
    expect(updatedJob?.completedAt).not.toBeNull();

    // Verify execution history updated
    const execs = await prisma.jobExecution.findMany({ where: { jobId: job.id } });
    expect(execs.length).toBe(1);
    expect(execs[0].status).toBe('succeeded');
    expect(execs[0].durationMs).toBe(150);
  });

  it('handles job failure, retries with delay, and moves to DLQ when exhausted', async () => {
    // Create job
    const { job } = await jobService.create(queueId, { type: 'simulate', maxAttempts: 2 });

    // Run attempt 1
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'running', attemptCount: 1, claimedByWorkerId: workerId },
    });
    await prisma.jobExecution.create({
      data: { jobId: job.id, attemptNumber: 1, workerId, status: 'running' },
    });

    // Fail attempt 1
    const failResult1 = await jobService.fail(job.id, workerId, { message: 'First fail' }, 50);
    expect(failResult1.retried).toBe(true);

    // Verify job is requeued (status: queued, attemptCount: 1, claimedByWorkerId: null)
    let reloaded = await prisma.job.findUnique({ where: { id: job.id } });
    expect(reloaded?.status).toBe('queued');
    expect(reloaded?.lastError).toBe('First fail');
    expect(reloaded?.claimedByWorkerId).toBeNull();

    // Run attempt 2 (final attempt)
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'running', attemptCount: 2, claimedByWorkerId: workerId },
    });
    await prisma.jobExecution.create({
      data: { jobId: job.id, attemptNumber: 2, workerId, status: 'running' },
    });

    // Fail attempt 2
    const failResult2 = await jobService.fail(job.id, workerId, { message: 'Second fail' }, 60);
    expect(failResult2.retried).toBe(false); // exhausted attempts

    // Verify job is marked as dead letter
    reloaded = await prisma.job.findUnique({ where: { id: job.id } });
    expect(reloaded?.status).toBe('dead_letter');
    expect(reloaded?.lastError).toBe('Second fail');

    // Verify DLQ record inserted
    const dlq = await prisma.deadLetterEntry.findUnique({ where: { jobId: job.id } });
    expect(dlq).not.toBeNull();
    expect(dlq?.finalError).toBe('Second fail');
    expect(dlq?.totalAttempts).toBe(2);
  });

  it('reaps stale/crashed workers and requeues their jobs', async () => {
    // Register a worker that went offline/stale (heartbeat 60 seconds ago)
    const staleWorkerId = '00000000-0000-0000-0000-000000000099';
    const oneMinuteAgo = new Date(Date.now() - 60000);

    await prisma.worker.create({
      data: {
        id: staleWorkerId,
        hostname: 'stale-worker',
        pid: 9999,
        status: 'online',
        lastHeartbeatAt: oneMinuteAgo,
      },
    });

    // Create a job running on the stale worker
    const { job } = await jobService.create(queueId, { type: 'simulate', maxAttempts: 3 });
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'running',
        attemptCount: 1,
        claimedByWorkerId: staleWorkerId,
      },
    });

    await prisma.jobExecution.create({
      data: {
        jobId: job.id,
        attemptNumber: 1,
        workerId: staleWorkerId,
        status: 'running',
      },
    });

    // Execute reaper (stale threshold: 30s)
    // Run private tick logic via public class wrapper or trigger via database states
    // Since reaper Service ticker is private, we can invoke reaping tick using local timeout
    const reaper = new (reaperService.constructor as any)();
    await reaper.reap(30000);

    // Verify worker status updated to offline
    const reloadedWorker = await prisma.worker.findUnique({ where: { id: staleWorkerId } });
    expect(reloadedWorker?.status).toBe('offline');

    // Verify job is requeued
    const reloadedJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(reloadedJob?.status).toBe('queued');
    expect(reloadedJob?.claimedByWorkerId).toBeNull();
    expect(reloadedJob?.lastError).toContain('crashed or became unresponsive');

    // Verify execution marked as timed_out
    const execs = await prisma.jobExecution.findMany({ where: { jobId: job.id } });
    expect(execs[0].status).toBe('timed_out');
    expect(execs[0].errorMessage).toContain('crashed');
  });
});
