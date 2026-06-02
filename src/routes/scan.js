const express = require('express');
const scanner = require('../services/scanner');
const zipBuilder = require('../utils/zipBuilder');
const config = require('../config');
const logger = require('../logger');

const router = express.Router();

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
