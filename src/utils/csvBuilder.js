/**
 * Build CSV content from images array
 */
const buildCsv = (images) => {
  if (!Array.isArray(images) || images.length === 0) {
    return csvHeader();
  }

  let csv = csvHeader();

  images.forEach((img) => {
    csv += csvRow(img);
  });

  return csv;
};

/**
 * CSV header row
 */
const csvHeader = () => {
  const headers = [
    'Image URL',
    'Alt Text',
    'Tag Type',
    'Found On Pages',
    'Content Type',
    'File Size (bytes)',
    'Width (px)',
    'Height (px)',
    'HTTP Status'
  ];

  return headers.map(escapeCSV).join(',') + '\n';
};

/**
 * CSV row for single image
 */
const csvRow = (image) => {
  const row = [
    image.url || '',
    image.alt || '',
    image.tag || '',
    (image.pageUrls && Array.isArray(image.pageUrls) ? image.pageUrls.join('; ') : ''),
    image.contentType || '',
    image.contentLength || '',
    image.width || '',
    image.height || '',
    image.status || ''
  ];

  return row.map(escapeCSV).join(',') + '\n';
};

/**
 * Escape CSV field value
 */
const escapeCSV = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // If contains comma, newline, or quote, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
};

module.exports = {
  buildCsv
};
