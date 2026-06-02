const archiver = require('archiver');
const { Writable } = require('stream');
const { buildCsv } = require('./csvBuilder');
const { getFilenameFromUrl } = require('./urlUtils');
const logger = require('../logger');

/**
 * Build ZIP stream with CSV and optional images
 */
const buildZipStream = (images, includeImages = false) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    
    // Create a writable stream to capture zip data
    const writeStream = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(chunk);
        callback();
      }
    });

    const archive = archiver('zip', {
      zlib: { level: 6 }
    });

    // Collect error from archive
    archive.on('error', (err) => {
      logger.error('Archive error:', err);
      reject(err);
    });

    writeStream.on('error', (err) => {
      logger.error('Write stream error:', err);
      reject(err);
    });

    writeStream.on('finish', () => {
      const buffer = Buffer.concat(chunks);
      resolve(buffer);
    });

    // Pipe archive to write stream
    archive.pipe(writeStream);

    // Add CSV
    const csv = buildCsv(images);
    archive.append(csv, { name: 'results/images.csv' });

    // Add images if requested
    if (includeImages && Array.isArray(images)) {
      const processedNames = new Set();

      images.forEach((image) => {
        if (image.buffer && Buffer.isBuffer(image.buffer)) {
          // Generate safe filename
          let filename = getFilenameFromUrl(image.url);
          
          // Handle duplicates
          let counter = 1;
          let baseName = filename;
          while (processedNames.has(filename)) {
            const parts = baseName.split('.');
            const ext = parts.pop();
            const name = parts.join('.');
            filename = `${name}_${counter}.${ext}`;
            counter++;
          }
          
          processedNames.add(filename);
          archive.append(image.buffer, { name: `images/${filename}` });
        }
      });
    }

    // Finalize archive
    archive.finalize().catch((err) => {
      logger.error('Archive finalize error:', err);
      reject(err);
    });
  });
};

module.exports = {
  buildZipStream
};
