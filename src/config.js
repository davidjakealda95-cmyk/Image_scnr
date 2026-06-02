const logger = require('./logger');

const config = {
  PORT: process.env.PORT || 3000,
  HARD_MAX_PAGES: parseInt(process.env.HARD_MAX_PAGES || '200', 10),
  PER_DOMAIN_DELAY_MS: parseInt(process.env.PER_DOMAIN_DELAY_MS || '500', 10),
  DEFAULT_USER_AGENT: process.env.DEFAULT_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  ZIP_INCLUDE_IMAGES_MAX_BYTES: parseInt(process.env.ZIP_INCLUDE_IMAGES_MAX_BYTES || '104857600', 10),
  REQUEST_TIMEOUT_MS: parseInt(process.env.REQUEST_TIMEOUT_MS || '8000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development'
};

// Validate config
if (config.HARD_MAX_PAGES < 1) {
  logger.warn('HARD_MAX_PAGES must be at least 1, defaulting to 200');
  config.HARD_MAX_PAGES = 200;
}

if (config.PER_DOMAIN_DELAY_MS < 0) {
  logger.warn('PER_DOMAIN_DELAY_MS must be >= 0, setting to 0');
  config.PER_DOMAIN_DELAY_MS = 0;
}

module.exports = config;
