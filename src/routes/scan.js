const express = require('express');
const cors = require('cors');
const scanner = require('../services/scanner');
const zipBuilder = require('../utils/zipBuilder');
const config = require('../config');
const logger = require('../logger');

const router = express.Router();

function parseBoolean(value) {
  return value === true || value === 'true' || value === '1';
}

function normalizeScanOptions(source) {
  return {
    url: source.url,
    depth: source.depth !== undefined ? Number(source.depth) : 0,
    concurrency: source.concurrency !== undefined ? Number(source.concurrency) : 6,
    timeoutMs: source.timeoutMs !== undefined ? Number(source.timeoutMs) : config.REQUEST_TIMEOUT_MS,
    maxPages: source.maxPages !== undefined ? Number(source.maxPages) : 20,
    allowExternal: parseBoolean(source.allowExternal)
  };
}

/**
 * OPTIONS /api/scan - Preflight support
 */
router.options('/scan', cors());

/**
 * GET /api/scan - Scan website using query params for compatibility
 */
router.get('/scan', async (req, res) => {
  try {
    const options = normalizeScanOptions(req.query);

    if (!options.url) {
      return res.status(400).json({ error: 'URL is required', status: 400 });
    }

    if (!Number.isInteger(options.depth) || options.depth < 0 || options.depth > 5) {
      return res.status(400).json({ error: 'Depth must be an integer between 0 and 5', status: 400 });
    }

    if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 20) {
      return res.status(400).json({ error: 'Concurrency must be an integer between 1 and 20', status: 400 });
    }

    if (!Number.isInteger(options.maxPages) || options.maxPages < 1) {
      return res.status(400).json({ error: 'Max pages must be a positive integer', status: 400 });
    }

    const actualMaxPages = Math.min(options.maxPages, config.HARD_MAX_PAGES);

    logger.info(`Scan request: url=${options.url}, depth=${options.depth}, maxPages=${actualMaxPages}`);

    const result = await scanner.scanWebsite({
      url: options.url,
      depth: options.depth,
      concurrency: options.concurrency,
      timeoutMs: options.timeoutMs,
      maxPages: actualMaxPages,
      allowExternal: options.allowExternal,
      downloadImages: false
    });

    res.json({
      scannedPages: result.scannedPages,
      images: result.images.map(img => ({
        url: img.url,
        alt: img.alt,
        tag: img.tag,
        pageUrls: img.pageUrls,
        contentLength: img.contentLength,
        contentType: img.contentType,
        width: img.width,
        height: img.height,
        status: img.status
      })),
      stats: result.stats
    });
  } catch (err) {
    logger.error('Error in GET /api/scan:', err);
    res.status(500).json({
      error: err.message || 'Internal server error',
      status: 500
    });
  }
});

/**
 * POST /api/scan - Scan website and return JSON results
 */
router.post('/scan', async (req, res) => {
  try {
    const {
      url,
      depth = 0,
      concurrency = 6,
      timeoutMs = config.REQUEST_TIMEOUT_MS,
      maxPages = 20,
      allowExternal = false
    } = req.body;

    // Validate required fields
    if (!url) {
      return res.status(400).json({
        error: 'URL is required',
        status: 400
      });
    }

    // Validate and sanitize inputs
    if (!Number.isInteger(depth) || depth < 0 || depth > 5) {
      return res.status(400).json({
        error: 'Depth must be an integer between 0 and 5',
        status: 400
      });
    }

    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) {
      return res.status(400).json({
        error: 'Concurrency must be an integer between 1 and 20',
        status: 400
      });
    }

    if (!Number.isInteger(maxPages) || maxPages < 1) {
      return res.status(400).json({
        error: 'Max pages must be a positive integer',
        status: 400
      });
    }

    // Enforce hard limit
    const actualMaxPages = Math.min(maxPages, config.HARD_MAX_PAGES);

    logger.info(`Scan request: url=${url}, depth=${depth}, maxPages=${actualMaxPages}`);

    const result = await scanner.scanWebsite({
      url,
      depth,
      concurrency,
      timeoutMs,
      maxPages: actualMaxPages,
      allowExternal,
      downloadImages: false
    });

    res.json({
      scannedPages: result.scannedPages,
      images: result.images.map(img => ({
        url: img.url,
        alt: img.alt,
        tag: img.tag,
        pageUrls: img.pageUrls,
        contentLength: img.contentLength,
        contentType: img.contentType,
        width: img.width,
        height: img.height,
        status: img.status
      })),
      stats: result.stats
    });
  } catch (err) {
    logger.error('Error in /api/scan:', err);
    res.status(500).json({
      error: err.message || 'Internal server error',
      status: 500
    });
  }
});

const scanJobs = require('../services/scanJobs');

/**
 * POST /api/scan/async - enqueue a background scan job
 */
router.post('/scan/async', (req, res) => {
  const options = {
    url: req.body.url,
    depth: req.body.depth !== undefined ? Number(req.body.depth) : 0,
    concurrency: req.body.concurrency !== undefined ? Number(req.body.concurrency) : 6,
    timeoutMs: req.body.timeoutMs !== undefined ? Number(req.body.timeoutMs) : config.REQUEST_TIMEOUT_MS,
    maxPages: req.body.maxPages !== undefined ? Number(req.body.maxPages) : 20,
    allowExternal: parseBoolean(req.body.allowExternal)
  };

  if (!options.url) {
    return res.status(400).json({ error: 'URL is required', status: 400 });
  }

  const jobId = scanJobs.createJob(options);

  res.status(202).json({
    jobId,
    statusUrl: `/api/scan/jobs/${jobId}`,
    resultUrl: `/api/scan/jobs/${jobId}/result`
  });
});

/**
 * GET /api/scan/jobs/:id - get job status/metadata
 */
router.get('/scan/jobs/:id', (req, res) => {
  const job = scanJobs.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found', status: 404 });

  const meta = {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    stats: job.result ? job.result.stats : undefined
  };

  res.json(meta);
});

/**
 * GET /api/scan/jobs/:id/result - fetch full result if completed
 */
router.get('/scan/jobs/:id/result', (req, res) => {
  const job = scanJobs.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found', status: 404 });

  if (job.status === 'completed') {
    res.json(job.result);
  } else if (job.status === 'failed') {
    res.status(500).json({ error: job.error || 'Job failed', status: 500 });
  } else {
    res.status(202).json({ status: job.status, message: 'Job not completed yet' });
  }
});

router.all('/scan', (req, res) => {
  res.set('Allow', 'GET,POST,OPTIONS');
  res.status(405).json({
    error: `Method ${req.method} not allowed on /api/scan. Use POST.`,
    status: 405
  });
});

/**
 * OPTIONS /api/scan/zip - Preflight support
 */
router.options('/scan/zip', cors());

/**
 * GET /api/scan/zip - Scan website using query params and return ZIP
 */
router.get('/scan/zip', async (req, res) => {
  try {
    const options = normalizeScanOptions(req.query);
    const includeImages = req.query.includeImages !== undefined ? parseBoolean(req.query.includeImages) : true;

    if (!options.url) {
      return res.status(400).json({ error: 'URL is required', status: 400 });
    }

    if (!Number.isInteger(options.depth) || options.depth < 0 || options.depth > 5) {
      return res.status(400).json({ error: 'Depth must be an integer between 0 and 5', status: 400 });
    }

    if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 20) {
      return res.status(400).json({ error: 'Concurrency must be an integer between 1 and 20', status: 400 });
    }

    if (!Number.isInteger(options.maxPages) || options.maxPages < 1) {
      return res.status(400).json({ error: 'Max pages must be a positive integer', status: 400 });
    }

    const actualMaxPages = Math.min(options.maxPages, config.HARD_MAX_PAGES);

    logger.info(`Scan & ZIP request: url=${options.url}, depth=${options.depth}, includeImages=${includeImages}`);

    const result = await scanner.scanWebsite({
      url: options.url,
      depth: options.depth,
      concurrency: options.concurrency,
      timeoutMs: options.timeoutMs,
      maxPages: actualMaxPages,
      allowExternal: options.allowExternal,
      downloadImages: includeImages
    });

    const zipBuffer = await zipBuilder.buildZipStream(
      result.images.map(img => ({
        url: img.url,
        alt: img.alt,
        tag: img.tag,
        pageUrls: img.pageUrls,
        contentLength: img.contentLength,
        contentType: img.contentType,
        width: img.width,
        height: img.height,
        status: img.status,
        buffer: img.buffer
      })),
      includeImages
    );

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="image-scan-results.zip"');
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);
  } catch (err) {
    logger.error('Error in GET /api/scan/zip:', err);
    res.status(500).json({
      error: err.message || 'Internal server error',
      status: 500
    });
  }
});

router.all('/scan/zip', (req, res) => {
  res.set('Allow', 'GET,POST,OPTIONS');
  res.status(405).json({
    error: `Method ${req.method} not allowed on /api/scan/zip. Use POST.`,
    status: 405
  });
});

/**
 * POST /api/scan/zip - Scan website and return ZIP with CSV and optional images
 */
router.post('/scan/zip', async (req, res) => {
  try {
    const {
      url,
      depth = 0,
      concurrency = 6,
      timeoutMs = config.REQUEST_TIMEOUT_MS,
      maxPages = 20,
      allowExternal = false,
      includeImages = false
    } = req.body;

    // Validate required fields
    if (!url) {
      return res.status(400).json({
        error: 'URL is required',
        status: 400
      });
    }

    // Validate inputs
    if (!Number.isInteger(depth) || depth < 0 || depth > 5) {
      return res.status(400).json({
        error: 'Depth must be an integer between 0 and 5',
        status: 400
      });
    }

    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) {
      return res.status(400).json({
        error: 'Concurrency must be an integer between 1 and 20',
        status: 400
      });
    }

    if (!Number.isInteger(maxPages) || maxPages < 1) {
      return res.status(400).json({
        error: 'Max pages must be a positive integer',
        status: 400
      });
    }

    const actualMaxPages = Math.min(maxPages, config.HARD_MAX_PAGES);

    logger.info(`Scan & ZIP request: url=${url}, depth=${depth}, includeImages=${includeImages}`);

    const result = await scanner.scanWebsite({
      url,
      depth,
      concurrency,
      timeoutMs,
      maxPages: actualMaxPages,
      allowExternal,
      downloadImages: includeImages
    });

    // Build ZIP
    const zipBuffer = await zipBuilder.buildZipStream(
      result.images.map(img => ({
        url: img.url,
        alt: img.alt,
        tag: img.tag,
        pageUrls: img.pageUrls,
        contentLength: img.contentLength,
        contentType: img.contentType,
        width: img.width,
        height: img.height,
        status: img.status,
        buffer: img.buffer
      })),
      includeImages
    );

    // Return ZIP file
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="image-scan-results.zip"');
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);
  } catch (err) {
    logger.error('Error in /api/scan/zip:', err);
    res.status(500).json({
      error: err.message || 'Internal server error',
      status: 500
    });
  }
});

/**
 * GET /api/config - Get configuration info (non-sensitive)
 */
router.get('/config', (req, res) => {
  res.json({
    hardMaxPages: config.HARD_MAX_PAGES,
    maxConcurrency: 20,
    minConcurrency: 1,
    maxDepth: 5
  });
});

module.exports = router;
