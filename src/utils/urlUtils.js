const url = require('url');

/**
 * Resolve a relative URL against a base URL
 */
const resolveUrl = (baseUrl, relativeUrl) => {
  if (!baseUrl || !relativeUrl) {
    return null;
  }

  try {
    // If relative URL is already absolute
    if (/^https?:\/\//.test(relativeUrl)) {
      return relativeUrl;
    }

    // If starts with //, use current protocol
    if (/^\/\//.test(relativeUrl)) {
      const parsedBase = new URL(baseUrl);
      return `${parsedBase.protocol}${relativeUrl}`;
    }

    // Resolve relative to base
    const resolved = new URL(relativeUrl, baseUrl);
    return resolved.href;
  } catch (err) {
    return null;
  }
};

/**
 * Check if URL belongs to same domain as reference URL
 */
const isSameDomain = (urlStr, referenceUrl) => {
  try {
    const parsed = new URL(urlStr);
    const ref = new URL(referenceUrl);
    return parsed.hostname === ref.hostname;
  } catch (err) {
    return false;
  }
};

/**
 * Get domain from URL
 */
const getDomain = (urlStr) => {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname;
  } catch (err) {
    return null;
  }
};

/**
 * Normalize URL (remove fragment, standardize protocol)
 */
const normalizeUrl = (urlStr) => {
  try {
    const parsed = new URL(urlStr);
    // Remove fragment and trailing slash for comparison
    parsed.hash = '';
    let normalized = parsed.href;
    if (normalized.endsWith('/') && parsed.pathname === '/') {
      // Keep trailing slash for root
    } else if (normalized.endsWith('/') && parsed.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch (err) {
    return urlStr;
  }
};

/**
 * Parse srcset attribute and return array of URLs
 * Format: "url1 1x, url2 2x" or "url1 100w, url2 200w"
 */
const parseSrcset = (srcsetStr, baseUrl) => {
  if (!srcsetStr) return [];

  const candidates = srcsetStr.split(',').map(s => s.trim());
  const urls = [];

  candidates.forEach(candidate => {
    // Extract URL (before descriptor like "2x" or "100w")
    const parts = candidate.split(/\s+/);
    if (parts.length > 0 && parts[0]) {
      const resolved = resolveUrl(baseUrl, parts[0]);
      if (resolved) {
        urls.push(resolved);
      }
    }
  });

  return urls;
};

/**
 * Extract filename from URL
 */
const getFilenameFromUrl = (urlStr) => {
  try {
    const parsed = new URL(urlStr);
    const pathname = parsed.pathname;
    let filename = pathname.split('/').pop() || 'image';
    
    // Remove query params
    filename = filename.split('?')[0];
    
    // If no extension, add .jpg
    if (!filename.includes('.')) {
      filename += '.jpg';
    }
    
    // Sanitize filename
    filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    return filename;
  } catch (err) {
    return 'image.jpg';
  }
};

/**
 * Check if URL is valid
 */
const isValidUrl = (urlStr) => {
  try {
    new URL(urlStr);
    return true;
  } catch (err) {
    return false;
  }
};

module.exports = {
  resolveUrl,
  isSameDomain,
  getDomain,
  normalizeUrl,
  parseSrcset,
  getFilenameFromUrl,
  isValidUrl
};
