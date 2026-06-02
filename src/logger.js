const getTimestamp = () => {
  return new Date().toISOString();
};

const logger = {
  info: (message, data) => {
    const timestamp = getTimestamp();
    console.log(`[${timestamp}] INFO: ${message}`, data || '');
  },
  
  warn: (message, data) => {
    const timestamp = getTimestamp();
    console.warn(`[${timestamp}] WARN: ${message}`, data || '');
  },
  
  error: (message, error) => {
    const timestamp = getTimestamp();
    if (error instanceof Error) {
      console.error(`[${timestamp}] ERROR: ${message}`, {
        message: error.message,
        stack: error.stack
      });
    } else {
      console.error(`[${timestamp}] ERROR: ${message}`, error || '');
    }
  },
  
  debug: (message, data) => {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = getTimestamp();
      console.log(`[${timestamp}] DEBUG: ${message}`, data || '');
    }
  }
};

module.exports = logger;
