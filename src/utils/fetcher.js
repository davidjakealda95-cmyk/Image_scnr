const axios = require('axios');
const config = require('../config');
const logger = require('../logger');

const axiosInstance = axios.create({
  timeout: config.REQUEST_TIMEOUT_MS,
  headers: {
    'User-Agent': config.DEFAULT_USER_AGENT
  }
});

/**
 * Fetch a page and return HTML content
 */
const fetchPage = async (pageUrl, timeoutMs = config.REQUEST_TIMEOUT_MS) => {
  try {
    const response = await axiosInstance.get(pageUrl, {
      timeout: timeoutMs,
      maxRedirects: 5,
      validateStatus: (status) => status < 400
    });

    return {
      status: response.status,
      html: response.data,
      headers: response.headers
    };
  } catch (err) {
    logger.debug(`Error fetching page ${pageUrl}:`, err.message);
    throw err;
  }
};

/**
 * Perform HEAD request to get headers without downloading full content
 */
const headRequest = async (imageUrl, timeoutMs = config.REQUEST_TIMEOUT_MS) => {
  try {
    const response = await axiosInstance.head(imageUrl, {
      timeout: timeoutMs,
      validateStatus: (status) => status < 400
    });

    return {
      status: response.status,
      headers: response.headers,
      contentLength: parseInt(response.headers['content-length'] || '0', 10),
      contentType: response.headers['content-type'] || ''
    };
  } catch (err) {
    logger.debug(`Error HEAD request for ${imageUrl}:`, err.message);
    throw err;
  }
};

/**
 * Perform ranged GET to fetch only first chunk of file
 */
const rangedGet = async (imageUrl, rangeBytes = 32768, timeoutMs = config.REQUEST_TIMEOUT_MS) => {
  try {
    const response = await axiosInstance.get(imageUrl, {
      timeout: timeoutMs,
      headers: {
        'Range': `bytes=0-${rangeBytes - 1}`
      },
      responseType: 'arraybuffer',
      validateStatus: (status) => status < 400
    });

    return {
      status: response.status,
      buffer: Buffer.from(response.data),
      headers: response.headers,
      contentLength: parseInt(response.headers['content-length'] || response.data.length, 10),
      contentType: response.headers['content-type'] || ''
    };
  } catch (err) {
    logger.debug(`Error ranged GET for ${imageUrl}:`, err.message);
    throw err;
  }
};

/**
 * Download entire image as buffer
 */
const downloadImage = async (imageUrl, maxBytes = 10485760, timeoutMs = config.REQUEST_TIMEOUT_MS) => {
  try {
    const response = await axiosInstance.get(imageUrl, {
      timeout: timeoutMs,
      maxContentLength: maxBytes,
      responseType: 'arraybuffer',
      validateStatus: (status) => status < 400
    });

    return {
      status: response.status,
      buffer: Buffer.from(response.data),
      headers: response.headers,
      contentLength: response.data.length,
      contentType: response.headers['content-type'] || ''
    };
  } catch (err) {
    logger.debug(`Error downloading image ${imageUrl}:`, err.message);
    throw err;
  }
};

/**
 * Fetch CSS file content
 */
const fetchCss = async (cssUrl, timeoutMs = config.REQUEST_TIMEOUT_MS) => {
  try {
    const response = await axiosInstance.get(cssUrl, {
      timeout: timeoutMs,
      validateStatus: (status) => status < 400
    });

    return response.data;
  } catch (err) {
    logger.debug(`Error fetching CSS ${cssUrl}:`, err.message);
    throw err;
  }
};

module.exports = {
  fetchPage,
  headRequest,
  rangedGet,
  downloadImage,
  fetchCss
};
