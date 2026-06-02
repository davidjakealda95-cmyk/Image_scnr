// State
const appState = {
  scanResults: null,
  currentView: 'grid',
  sitemapLinks: []
};

// DOM Elements
const urlInput = document.getElementById('url');
const depthInput = document.getElementById('depth');
const maxPagesInput = document.getElementById('maxPages');
const concurrencyInput = document.getElementById('concurrency');
const timeoutInput = document.getElementById('timeout');
const allowExternalInput = document.getElementById('allowExternal');
const scanBtn = document.getElementById('scanBtn');
const scanZipBtn = document.getElementById('scanZipBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const loadingText = document.getElementById('loadingText');
const resultsSection = document.getElementById('resultsSection');
const errorSection = document.getElementById('errorSection');
const errorText = document.getElementById('errorText');
const closeErrorBtn = document.getElementById('closeErrorBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const validateSitemapBtn = document.getElementById('validateSitemapBtn');
const refreshResultsBtn = document.getElementById('refreshResultsBtn');
const viewGridBtn = document.getElementById('viewGridBtn');
const viewTableBtn = document.getElementById('viewTableBtn');
const gridView = document.getElementById('gridView');
const tableView = document.getElementById('tableView');
const resultsGrid = document.getElementById('resultsGrid');
const resultsTable = document.getElementById('resultsTable');
const statPages = document.getElementById('statPages');
const statImages = document.getElementById('statImages');
const statTime = document.getElementById('statTime');

// Event Listeners
scanBtn.addEventListener('click', handleScan);
scanZipBtn.addEventListener('click', handleScanZip);
exportCsvBtn.addEventListener('click', handleExportCsv);
validateSitemapBtn.addEventListener('click', handleValidateSitemap);
refreshResultsBtn.addEventListener('click', resetUI);
closeErrorBtn.addEventListener('click', hideError);
viewGridBtn.addEventListener('click', () => switchView('grid'));
viewTableBtn.addEventListener('click', () => switchView('table'));

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    handleScan();
  }
});

/**
 * Handle scan button click
 */
async function handleScan() {
  if (!validateInputs()) return;

  const options = getFormData();
  await performScan(options, false);
}

/**
 * Handle scan & zip button click
 */
async function handleScanZip() {
  if (!validateInputs()) return;

  const options = getFormData();
  await performScan(options, true);
}

/**
 * Perform scan operation
 */
async function performScan(options, includeZip = false) {
  try {
    showLoading('Scanning website...');
    hideError();

    const endpoint = includeZip ? '/api/scan/zip' : '/api/scan';
    const payload = {
      url: options.url,
      depth: options.depth,
      concurrency: options.concurrency,
      timeoutMs: options.timeoutMs,
      maxPages: options.maxPages,
      allowExternal: options.allowExternal,
      includeImages: includeZip
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status} ${response.statusText}`;

      try {
        const errorData = await response.json();
        if (errorData && errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (_) {
        // Ignore parse failures for non-JSON error responses
      }

      throw new Error(errorMessage);
    }

    if (includeZip) {
      // Handle ZIP download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'image-scan-results.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      hideLoading();
      showMessage('ZIP file downloaded successfully!', 'success');
    } else {
      // Handle JSON results
      const data = await response.json();
      appState.scanResults = data;
      
      // Collect sitemap links
      appState.sitemapLinks = [];
      data.scannedPages.forEach(page => {
        if (page.sitemapLinks && Array.isArray(page.sitemapLinks)) {
          appState.sitemapLinks.push(...page.sitemapLinks);
        }
      });

      hideLoading();
      displayResults(data);
      scrollToResults();
    }
  } catch (err) {
    hideLoading();
    showError(`Scan failed: ${err.message}`);
    console.error('Scan error:', err);
  }
}

/**
 * Validate form inputs
 */
function validateInputs() {
  const url = urlInput.value.trim();

  if (!url) {
    showError('Please enter a website URL');
    return false;
  }

  try {
    new URL(url);
  } catch (err) {
    showError('Please enter a valid URL (e.g., https://example.com)');
    return false;
  }

  return true;
}

/**
 * Get form data
 */
function getFormData() {
  return {
    url: urlInput.value.trim(),
    depth: Math.max(0, Math.min(5, parseInt(depthInput.value) || 0)),
    maxPages: Math.max(1, Math.min(200, parseInt(maxPagesInput.value) || 20)),
    concurrency: Math.max(1, Math.min(20, parseInt(concurrencyInput.value) || 6)),
    timeoutMs: Math.max(1, Math.min(60, parseInt(timeoutInput.value) || 8)) * 1000,
    allowExternal: allowExternalInput.checked
  };
}

/**
 * Display scan results
 */
function displayResults(data) {
  if (!data.images || data.images.length === 0) {
    resultsGrid.innerHTML = '<div class="empty-state">No images found</div>';
    resultsTable.querySelector('tbody').innerHTML = '<tr><td colspan="6">No images found</td></tr>';
  }

  // Update stats
  statPages.textContent = data.stats.pagesVisited;
  statImages.textContent = data.stats.uniqueImages;
  statTime.textContent = `${data.stats.durationMs}ms`;

  // Update sitemap button visibility
  if (appState.sitemapLinks.length > 0) {
    validateSitemapBtn.classList.remove('hidden');
  } else {
    validateSitemapBtn.classList.add('hidden');
  }

  // Render grid view
  renderGridView(data.images);

  // Render table view
  renderTableView(data.images);

  // Show results section
  resultsSection.classList.remove('hidden');
}

/**
 * Render grid view
 */
function renderGridView(images) {
  resultsGrid.innerHTML = '';

  images.forEach((image) => {
    const card = document.createElement('div');
    card.className = 'image-card';

    const thumbDiv = document.createElement('div');
    thumbDiv.className = 'results-thumb';

    if (image.url && isValidImageUrl(image.url)) {
      const img = document.createElement('img');
      img.src = image.url;
      img.alt = image.alt || 'Image';
      img.onerror = () => {
        thumbDiv.innerHTML = '<div class="results-thumb-placeholder">Unable to load image</div>';
      };
      thumbDiv.appendChild(img);
    } else {
      thumbDiv.innerHTML = '<div class="results-thumb-placeholder">Invalid image URL</div>';
    }

    const infoDiv = document.createElement('div');
    infoDiv.className = 'image-info';

    const urlDiv = document.createElement('div');
    urlDiv.className = 'image-url';
    const urlLink = document.createElement('a');
    urlLink.href = image.url;
    urlLink.target = '_blank';
    urlLink.rel = 'noopener noreferrer';
    urlLink.title = image.url;
    urlLink.textContent = image.url;
    urlDiv.appendChild(urlLink);

    const metaDiv = document.createElement('div');
    metaDiv.className = 'image-meta';

    const items = [];

    if (image.width && image.height) {
      items.push(`📐 ${image.width}×${image.height}px`);
    }

    if (image.contentLength) {
      items.push(`📦 ${formatBytes(image.contentLength)}`);
    }

    if (image.contentType) {
      items.push(`🏷️ ${image.contentType}`);
    }

    if (image.status) {
      items.push(`✓ HTTP ${image.status}`);
    }

    metaDiv.innerHTML = items.map(item => `<div class="image-meta-item">${item}</div>`).join('');

    const altDiv = document.createElement('div');
    altDiv.className = 'image-alt';
    altDiv.innerHTML = `<strong>Alt:</strong> ${image.alt || '(none)'}`;

    infoDiv.appendChild(urlDiv);
    infoDiv.appendChild(metaDiv);
    infoDiv.appendChild(altDiv);

    card.appendChild(thumbDiv);
    card.appendChild(infoDiv);

    resultsGrid.appendChild(card);
  });
}

/**
 * Render table view
 */
function renderTableView(images) {
  const tbody = resultsTable.querySelector('tbody');
  tbody.innerHTML = '';

  images.forEach((image) => {
    const row = document.createElement('tr');

    const urlCell = document.createElement('td');
    urlCell.className = 'table-url';
    const urlLink = document.createElement('a');
    urlLink.href = image.url;
    urlLink.target = '_blank';
    urlLink.rel = 'noopener noreferrer';
    urlLink.textContent = image.url;
    urlCell.appendChild(urlLink);

    const altCell = document.createElement('td');
    altCell.textContent = image.alt || '(none)';
    altCell.title = image.alt;

    const dimensionsCell = document.createElement('td');
    if (image.width && image.height) {
      dimensionsCell.textContent = `${image.width}×${image.height}`;
    } else {
      dimensionsCell.textContent = '-';
    }

    const sizeCell = document.createElement('td');
    if (image.contentLength) {
      sizeCell.textContent = formatBytes(image.contentLength);
    } else {
      sizeCell.textContent = '-';
    }

    const typeCell = document.createElement('td');
    typeCell.textContent = image.contentType || '-';

    const pagesCell = document.createElement('td');
    if (image.pageUrls && image.pageUrls.length > 0) {
      pagesCell.textContent = image.pageUrls.length;
      pagesCell.title = image.pageUrls.join('\n');
    } else {
      pagesCell.textContent = '-';
    }

    row.appendChild(urlCell);
    row.appendChild(altCell);
    row.appendChild(dimensionsCell);
    row.appendChild(sizeCell);
    row.appendChild(typeCell);
    row.appendChild(pagesCell);

    tbody.appendChild(row);
  });
}

/**
 * Handle export CSV
 */
function handleExportCsv() {
  if (!appState.scanResults) return;

  const csv = buildCsvContent(appState.scanResults.images);
  downloadCsv(csv, 'image-scan-results.csv');
}

/**
 * Build CSV content
 */
function buildCsvContent(images) {
  const headers = ['Image URL', 'Alt Text', 'Tag Type', 'Found On Pages', 'Content Type', 'File Size (bytes)', 'Width (px)', 'Height (px)', 'HTTP Status'];

  let csv = headers.map(escapeCSV).join(',') + '\n';

  images.forEach((image) => {
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

    csv += row.map(escapeCSV).join(',') + '\n';
  });

  return csv;
}

/**
 * Escape CSV value
 */
function escapeCSV(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Download CSV file
 */
function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Handle validate sitemap
 */
function handleValidateSitemap() {
  if (!appState.sitemapLinks || appState.sitemapLinks.length === 0) {
    showError('No sitemap links found');
    return;
  }

  const uniqueLinks = [...new Set(appState.sitemapLinks)];
  const validatorWindows = [];

  uniqueLinks.forEach((link) => {
    try {
      const encodedUrl = encodeURIComponent(link);
      const htmlValidatorUrl = `https://validator.w3.org/nu/?showsource=yes&doc=${encodedUrl}`;
      const cssValidatorUrl = `http://jigsaw.w3.org/css-validator/validator?uri=${encodedUrl}`;

      // Open both validators in new tabs
      setTimeout(() => {
        window.open(htmlValidatorUrl, '_blank');
      }, 500);

      setTimeout(() => {
        window.open(cssValidatorUrl, '_blank');
      }, 1000);
    } catch (err) {
      console.error('Error opening validator for:', link, err);
    }
  });

  showMessage(`Opened validators for ${uniqueLinks.length} sitemap link(s)`, 'success');
}

/**
 * Switch view between grid and table
 */
function switchView(view) {
  appState.currentView = view;

  if (view === 'grid') {
    gridView.classList.remove('hidden');
    tableView.classList.add('hidden');
    viewGridBtn.classList.add('active');
    viewTableBtn.classList.remove('active');
  } else {
    gridView.classList.add('hidden');
    tableView.classList.remove('hidden');
    viewGridBtn.classList.remove('active');
    viewTableBtn.classList.add('active');
  }
}

/**
 * Show loading indicator
 */
function showLoading(message = 'Scanning...') {
  loadingText.textContent = message;
  loadingIndicator.classList.remove('hidden');
  scanBtn.disabled = true;
  scanZipBtn.disabled = true;
}

/**
 * Hide loading indicator
 */
function hideLoading() {
  loadingIndicator.classList.add('hidden');
  scanBtn.disabled = false;
  scanZipBtn.disabled = false;
}

/**
 * Show error message
 */
function showError(message) {
  errorText.textContent = message;
  errorSection.classList.remove('hidden');
}

/**
 * Hide error message
 */
function hideError() {
  errorSection.classList.add('hidden');
}

/**
 * Show success message
 */
function showMessage(message, type = 'info') {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message message-${type}`;
  messageDiv.textContent = message;
  messageDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    background-color: ${type === 'success' ? '#27ae60' : '#3498db'};
    color: white;
    border-radius: 6px;
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;

  document.body.appendChild(messageDiv);

  setTimeout(() => {
    messageDiv.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
      document.body.removeChild(messageDiv);
    }, 300);
  }, 3000);
}

/**
 * Reset UI
 */
function resetUI() {
  resultsSection.classList.add('hidden');
  errorSection.classList.add('hidden');
  appState.scanResults = null;
  appState.sitemapLinks = [];
  urlInput.focus();
}

/**
 * Scroll to results
 */
function scrollToResults() {
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Check if URL is valid image URL
 */
function isValidImageUrl(url) {
  try {
    const urlObj = new URL(url);
    return /^https?:\/\//.test(urlObj.href);
  } catch (err) {
    return false;
  }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }

  .empty-state {
    grid-column: 1 / -1;
    text-align: center;
    padding: 40px 20px;
    color: var(--text-secondary);
    font-size: 1.1em;
  }
`;
document.head.appendChild(style);

// Initialize
console.log('Image Scanner loaded');
