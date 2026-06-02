const postcss = require('postcss');
const valueParser = require('postcss-value-parser');
const { resolveUrl } = require('./urlUtils');

/**
 * Extract all url() values from CSS text
 */
const parseCssForUrls = (cssText, baseUrl) => {
  const urls = [];

  if (!cssText) {
    return urls;
  }

  try {
    const ast = postcss.parse(cssText);

    ast.walkDecls((decl) => {
      const parsed = valueParser(decl.value);

      parsed.walk((node) => {
        if (node.type === 'function' && node.value === 'url') {
          const url = extractUrlFromFunction(node);
          if (url) {
            const resolved = resolveUrl(baseUrl, url);
            if (resolved && !urls.includes(resolved)) {
              urls.push(resolved);
            }
          }
        }
      });
    });
  } catch (err) {
    // Fallback: simple regex parsing if postcss fails
    const regex = /url\(['"]?([^'")]+)['"]?\)/g;
    let match;
    while ((match = regex.exec(cssText)) !== null) {
      const url = match[1];
      if (url) {
        const resolved = resolveUrl(baseUrl, url);
        if (resolved && !urls.includes(resolved)) {
          urls.push(resolved);
        }
      }
    }
  }

  return urls;
};

/**
 * Extract URL from CSS function node
 */
const extractUrlFromFunction = (node) => {
  if (!node.nodes || node.nodes.length === 0) {
    return null;
  }

  let url = '';
  for (const child of node.nodes) {
    if (child.type === 'word') {
      url += child.value;
    } else if (child.type === 'string') {
      url = child.value;
      break;
    }
  }

  return url.trim();
};

module.exports = {
  parseCssForUrls
};
