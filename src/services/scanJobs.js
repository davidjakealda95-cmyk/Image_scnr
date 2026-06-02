const scanner = require('./scanner');
const logger = require('../logger');

// In-memory job store and queue (simple, reset on restart)
const jobs = new Map();
const queue = [];
let processing = false;

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
}

function createJob(options) {
  const id = makeId();
  const job = {
    id,
    status: 'queued',
    options,
    createdAt: Date.now()
  };

  jobs.set(id, job);
  queue.push(id);
  processQueue().catch(err => logger.error('ScanJobs queue error:', err));
  return id;
}

function getJob(id) {
  return jobs.get(id);
}

async function processQueue() {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const id = queue.shift();
    const job = jobs.get(id);
    if (!job) continue;

    job.status = 'running';
    job.startedAt = Date.now();

    try {
      const result = await scanner.scanWebsite(job.options);
      job.status = 'completed';
      job.result = result;
      job.completedAt = Date.now();
    } catch (err) {
      logger.error(`Job ${id} failed:`, err.message || err);
      job.status = 'failed';
      job.error = err.message || String(err);
      job.completedAt = Date.now();
    }
  }

  processing = false;
}

module.exports = {
  createJob,
  getJob
};
