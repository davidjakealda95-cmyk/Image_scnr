const sizeOf = require('image-size');
const fetcher = require('../utils/fetcher');
const logger = require('../logger');

/**
 * Probe image to get dimensions and metadata
 */
const probeImage = async (imageUrl, timeoutMs = 8000) => {
  const result = {
    url: imageUrl,
    contentLength: 0,
    contentType: '',
    width: null,
    height: null,
    status: 0,
    error: null
  };

  try {
    // First try HEAD request
    const headResult = await fetcher.headRequest(imageUrl, timeoutMs);
    result.status = headResult.status;
    result.contentType = headResult.contentType;
    result.contentLength = headResult.contentLength;

    // If HEAD succeeded, try to get dimensions with ranged GET
    if (result.status === 200) {
      try {
        const rangedResult = await fetcher.rangedGet(imageUrl, 32768, timeoutMs);
        const dimensions = sizeOf(rangedResult.buffer);
        if (dimensions) {
          result.width = dimensions.width;
          result.height = dimensions.height;
        }
      } catch (err) {
        logger.debug(`Could not get dimensions from ranged GET for ${imageUrl}:`, err.message);
        
        // Fallback: try full download for small files
        if (result.contentLength > 0 && result.contentLength < 1048576) {
          try {
            const downloadResult = await fetcher.downloadImage(imageUrl, 1048576, timeoutMs);
            const dimensions = sizeOf(downloadResult.buffer);
            if (dimensions) {
              result.width = dimensions.width;
              result.height = dimensions.height;
            }
          } catch (downloadErr) {
            logger.debug(`Could not download image for dimensions ${imageUrl}:`, downloadErr.message);
          }
        }
      }
    }
  } catch (err) {
    result.error = err.message;
    
    // Try full download as last resort
    try {
      const downloadResult = await fetcher.downloadImage(imageUrl, 5242880, timeoutMs);
      result.status = downloadResult.status;
      result.contentType = downloadResult.contentType;
      result.contentLength = downloadResult.contentLength;
      
      try {
        const dimensions = sizeOf(downloadResult.buffer);
        if (dimensions) {
          result.width = dimensions.width;
          result.height = dimensions.height;
        }
      } catch (sizeErr) {
        logger.debug(`Could not determine size for ${imageUrl}:`, sizeErr.message);
      }
    } catch (downloadErr) {
      logger.debug(`Final download attempt failed for ${imageUrl}:`, downloadErr.message);
      result.status = 0;
    }
  }

  return result;
};

module.exports = {
  probeImage
};
