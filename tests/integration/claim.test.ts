import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import prisma from '../../src/shared/db';
import { claimJobs } from '../../src/worker/claimer';

describe('Atomic Claiming Integration', () => {
  let organizationId: string;
  let projectId: string;
  let queueId: string;

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
        maxConcurrency: 10,
      },
    });
    queueId = queue.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('claims jobs atomically and prevents duplicate claims under concurrency', async () => {
    // Register fake workers
    await prisma.worker.createMany({
      data: [
        { id: '00000000-0000-0000-0000-000000000001', hostname: 'worker-1', pid: 101, status: 'online' },
        { id: '00000000-0000-0000-0000-000000000002', hostname: 'worker-2', pid: 102, status: 'online' },
        { id: '00000000-0000-0000-0000-000000000003', hostname: 'worker-3', pid: 103, status: 'online' },
      ],
    });

    // Create 10 queued jobs
    await Promise.all(
      Array.from({ length: 10 }).map((_, i) =>
        prisma.job.create({
          data: {
            queueId,
            type: 'simulate',
            status: 'queued',
            runAt: new Date(),
          },
        })
      )
    );

    // Call claimJobs concurrently for 3 workers
    const worker1Promise = claimJobs('00000000-0000-0000-0000-000000000001', [queueId], 5);
    const worker2Promise = claimJobs('00000000-0000-0000-0000-000000000002', [queueId], 5);
    const worker3Promise = claimJobs('00000000-0000-0000-0000-000000000003', [queueId], 5);

    const [worker1Jobs, worker2Jobs, worker3Jobs] = await Promise.all([
      worker1Promise,
      worker2Promise,
      worker3Promise,
    ]);

    const allClaimedJobs = [...worker1Jobs, ...worker2Jobs, ...worker3Jobs];

    // Total claimed jobs must be 10 (since we have 10 and capacity is high)
    expect(allClaimedJobs.length).toBe(10);

    // Check unique job IDs to ensure no duplicates
    const jobIds = allClaimedJobs.map((j) => j.id);
    const uniqueJobIds = new Set(jobIds);
    expect(uniqueJobIds.size).toBe(10);
  });

  it('enforces queue max concurrency limits', async () => {
    // Register worker
    await prisma.worker.create({
      data: { id: '00000000-0000-0000-0000-000000000001', hostname: 'worker-1', pid: 101, status: 'online' },
    });

    // Set max concurrency to 2
    await prisma.queue.update({
      where: { id: queueId },
      data: { maxConcurrency: 2 },
    });

    // Create 5 queued jobs
    await Promise.all(
      Array.from({ length: 5 }).map((_, i) =>
        prisma.job.create({
          data: {
            queueId,
            type: 'simulate',
            status: 'queued',
            runAt: new Date(),
          },
        })
      )
    );

    // Worker 1 claims 5 jobs
    const claimed = await claimJobs('00000000-0000-0000-0000-000000000001', [queueId], 5);

    // Should only claim 2 jobs due to queue concurrency limit
    expect(claimed.length).toBe(2);
  });
});
