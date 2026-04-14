// Mock Redis client for development (ioredis-compatible API)
class MockRedis {
  constructor() {
    this.store = new Map();
  }
  
  async connect() {
    console.log('[MOCK REDIS] Connected (mock)');
  }
  
  async get(key) {
    console.log(`[MOCK REDIS] GET ${key}`);
    return this.store.get(key) || null;
  }
  
  async set(key, value, ...args) {
    // Handle: set(key, value, 'EX', ttl, 'NX') style args used by ioredis
    console.log(`[MOCK REDIS] SET ${key} = ${value}`);
    
    let expireMs = null;
    let nx = false;
    
    for (let i = 0; i < args.length; i++) {
      if (args[i] === 'EX' && i + 1 < args.length) {
        expireMs = parseInt(args[i + 1]) * 1000;
        i++; // skip next arg
      } else if (args[i] === 'NX') {
        nx = true;
      }
    }
    
    // NX means only set if key doesn't exist
    if (nx && this.store.has(key)) {
      return null;
    }
    
    this.store.set(key, value);
    
    if (expireMs) {
      setTimeout(() => this.store.delete(key), expireMs);
    }
    
    return 'OK';
  }
  
  async ping() {
    return 'PONG';
  }
  
  on(event, handler) {
    // Mock event handler for ioredis compatibility
    return this;
  }
}

module.exports = new MockRedis();
