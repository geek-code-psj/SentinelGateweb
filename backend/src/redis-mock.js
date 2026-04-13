// Mock Redis client for development
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
  
  async set(key, value, options) {
    console.log(`[MOCK REDIS] SET ${key}`);
    this.store.set(key, value);
    if (options?.EX) {
      setTimeout(() => this.store.delete(key), options.EX * 1000);
    }
    return 'OK';
  }
  
  async ping() {
    return 'PONG';
  }
}

module.exports = new MockRedis();
