const cheerio = require('cheerio');
const pLimit = require('p-limit');
const fetcher = require('../utils/fetcher');
const urlUtils = require('../utils/urlUtils');
const cssUtils = require('../utils/cssUtils');
const imageProcessor = require('./imageProcessor');
const config = require('../config');
const logger = require('../logger');

/**
 * Main scanner function
 */
const scanWebsite = async (options) => {
  const {
    url,
    depth = 0,
    concurrency = 6,
    timeoutMs = config.REQUEST_TIMEOUT_MS,
    maxPages = 20,
    allowExternal = false,
    downloadImages = false
  } = options;

  if (!urlUtils.isValidUrl(url)) {
    throw new Error('Invalid URL provided');
  }

  const startTime = Date.now();
  const normalizedSeedUrl = urlUtils.normalizeUrl(url);
  
  // Enforce hard limit
  const actualMaxPages = Math.min(maxPages, config.HARD_MAX_PAGES);
  
  const state = {
    visited: new Set(),
    toVisit: [normalizedSeedUrl],
    images: new Map(), // Map of image URL -> image object
    scannedPages: [],
    domainDelays: new Map(), // Track last request time per domain
    limitConcurrency: pLimit(concurrency)
  };

  let currentDepth = 0;

  // BFS crawl with depth limit
  while (state.toVisit.length > 0 && state.visited.size < actualMaxPages && currentDepth <= depth) {
    const pagesToProcess = [...state.toVisit];
    state.toVisit = [];

    const processPage = async (pageUrl) => {
      if (state.visited.size >= actualMaxPages) {
        return;
      }

      const normalized = urlUtils.normalizeUrl(pageUrl);
      
      if (state.visited.has(normalized)) {
        return;
      }

      state.visited.add(normalized);

      // Apply per-domain delay
      await applyDomainDelay(pageUrl, state.domainDelays);

      try {
        logger.info(`Scanning page (${state.visited.size}/${actualMaxPages}): ${pageUrl}`);
        
        const pageResult = await fetcher.fetchPage(pageUrl, timeoutMs);
        
        if (pageResult.status !== 200) {
          logger.warn(`Page returned status ${pageResult.status}: ${pageUrl}`);
          return;
        }

        // Extract images and links from page
        const extractResult = extractFromPage(pageResult.html, pageUrl);
        
        // Add images to collection
        extractResult.images.forEach((img) => {
          const existing = state.images.get(img.url);
          if (existing) {
            // Add page URL if not already there
            if (!existing.pageUrls.includes(pageUrl)) {
              existing.pageUrls.push(pageUrl);
            }
          } else {
            img.pageUrls = [pageUrl];
            state.images.set(img.url, img);
          }
        });

        // Track scanned page
        state.scannedPages.push({
          url: pageUrl,
          status: pageResult.status,
          links: extractResult.links,
          sitemapLinks: extractResult.sitemapLinks
        });

        // Add discoverable links for next depth level
        if (currentDepth < depth) {
          extractResult.links.forEach((link) => {
            const normalized = urlUtils.normalizeUrl(link);
            if (!state.visited.has(normalized)) {
              const sameDomain = urlUtils.isSameDomain(link, normalizedSeedUrl);
              if (sameDomain || allowExternal) {
                state.toVisit.push(link);
              }
            }
          });
        }
      } catch (err) {
        logger.warn(`Error processing page ${pageUrl}:`, err.message);
        
        state.scannedPages.push({
          url: pageUrl,
          status: 0,
          error: err.message,
          links: [],
          sitemapLinks: []
        });
      }
    };

    // Process all pages at current depth in parallel
    await Promise.all(pagesToProcess.map(pageUrl => 
      state.limitConcurrency(() => processPage(pageUrl))
    ));

    currentDepth++;
  }

  // Process images to get metadata
  logger.info(`Processing ${state.images.size} unique images...`);
  const imageProcessingLimit = pLimit(concurrency);
  const imageProbes = Array.from(state.images.values()).map(img =>
    imageProcessingLimit(async () => {
      try {
        const probe = await imageProcessor.probeImage(img.url, timeoutMs);
        img.status = probe.status;
        img.contentType = probe.contentType;
        img.contentLength = probe.contentLength;
        img.width = probe.width;
        img.height = probe.height;

        // Optionally download image
        if (downloadImages && probe.status === 200) {
          try {
            const download = await fetcher.downloadImage(img.url, 5242880, timeoutMs);
            img.buffer = download.buffer;
          } catch (err) {
            logger.debug(`Could not download image ${img.url}:`, err.message);
          }
        }
      } catch (err) {
        logger.debug(`Error probing image ${img.url}:`, err.message);
        img.status = 0;
      }
    })
  );

  await Promise.all(imageProbes);

  // Build final images array
  const finalImages = Array.from(state.images.values());

  const durationMs = Date.now() - startTime;

  return {
    scannedPages: state.scannedPages,
    images: finalImages,
    stats: {
      pagesVisited: state.visited.size,
      imagesFound: finalImages.length,
      uniqueImages: finalImages.length,
      durationMs: durationMs
    }
  };
};

/**
 * Extract images and links from HTML
 */
const extractFromPage = (html, pageUrl) => {
  const images = [];
  const links = new Set();
  const sitemapLinks = [];

  try {
    const $ = cheerio.load(html);

    // Extract from <img> tags
    $('img').each((_, elem) => {
      const src = $(elem).attr('src');
      const srcset = $(elem).attr('srcset');
      const alt = $(elem).attr('alt') || '';

      if (src) {
        const resolved = urlUtils.resolveUrl(pageUrl, src);
        if (resolved) {
          images.push({
            url: resolved,
            alt: alt,
            tag: 'img'
          });
        }
      }

      if (srcset) {
        const srcsetUrls = urlUtils.parseSrcset(srcset, pageUrl);
        srcsetUrls.forEach(imgUrl => {
          images.push({
            url: imgUrl,
            alt: alt,
            tag: 'img-srcset'
          });
        });
      }
    });

    // Extract from <picture> tags
    $('picture').each((_, elem) => {
      const $picture = $(elem);
      const alt = $picture.find('img').attr('alt') || '';

      $picture.find('source').each((_, source) => {
        const srcset = $(source).attr('srcset');
        if (srcset) {
          const srcsetUrls = urlUtils.parseSrcset(srcset, pageUrl);
          srcsetUrls.forEach(imgUrl => {
            images.push({
              url: imgUrl,
              alt: alt,
              tag: 'picture-source'
            });
          });
        }
      });
    });

    // Extract from inline styles
    $('[style*="background-image"]').each((_, elem) => {
      const style = $(elem).attr('style');
      const urlMatch = style.match(/url\(['"]?([^'")]+)['"]?\)/);
      if (urlMatch && urlMatch[1]) {
        const resolved = urlUtils.resolveUrl(pageUrl, urlMatch[1]);
        if (resolved) {
          images.push({
            url: resolved,
            alt: '',
            tag: 'inline-style'
          });
        }
      }
    });

    // Extract from linked stylesheets
    $('link[rel="stylesheet"]').each((_, elem) => {
      const href = $(elem).attr('href');
      if (href) {
        const resolved = urlUtils.resolveUrl(pageUrl, href);
        if (resolved) {
          links.add(resolved);
        }
      }
    });

    // Extract URLs from <style> tags
    $('style').each((_, elem) => {
      const cssText = $(elem).text();
      const cssUrls = cssUtils.parseCssForUrls(cssText, pageUrl);
      cssUrls.forEach(imgUrl => {
        images.push({
          url: imgUrl,
          alt: '',
          tag: 'style-tag'
        });
      });
    });

    // Extract links from <a> tags
    $('a[href]').each((_, elem) => {
      const href = $(elem).attr('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        const resolved = urlUtils.resolveUrl(pageUrl, href);
        if (resolved) {
          links.add(resolved);
        }
      }
    });

    // Extract sitemap links (look for .sitemap selector or structured data)
    $('.sitemap a[href]').each((_, elem) => {
      const href = $(elem).attr('href');
      if (href) {
        const resolved = urlUtils.resolveUrl(pageUrl, href);
        if (resolved) {
          sitemapLinks.push(resolved);
        }
      }
    });
  } catch (err) {
    logger.warn(`Error parsing HTML from ${pageUrl}:`, err.message);
  }

  return {
    images: images,
    links: Array.from(links),
    sitemapLinks: sitemapLinks
  };
};

/**
 * Apply per-domain delay for politeness
 */
const applyDomainDelay = async (pageUrl, domainDelays) => {
  const domain = urlUtils.getDomain(pageUrl);
  if (!domain) return;

  const lastDelay = domainDelays.get(domain);
  if (lastDelay) {
    const elapsed = Date.now() - lastDelay;
    const delay = config.PER_DOMAIN_DELAY_MS - elapsed;
    
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  domainDelays.set(domain, Date.now());
};

module.exports = {
  scanWebsite
};
