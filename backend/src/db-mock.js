// Mock PostgreSQL pool for development (no actual DB connection)
class MockPool {
  async query(text, params) {
    console.log(`[MOCK DB] Query: ${text.substring(0, 50)}...`);
    
    // Mock responses for specific queries
    if (text.includes('SELECT * FROM sentinel.gates')) {
      return { rows: [
        { id: 'G-01', totp_secret_enc: 'MOCK_SECRET_1', status: 'ACTIVE', mfa_mode: 'FULL', current_rho: 0.5, current_lambda: 6, mu_capacity: 12 },
        { id: 'G-02', totp_secret_enc: 'MOCK_SECRET_2', status: 'ACTIVE', mfa_mode: 'FULL', current_rho: 0.3, current_lambda: 4, mu_capacity: 12 }
      ]};
    }
    if (text.includes('SELECT * FROM sentinel.geofence_zones')) {
      return { rows: [
        { id: 'HOSTEL_A', name: 'Hostel A', center_lat: 23.5204, center_lng: 77.8038, radius_meters: 80 },
        { id: 'HOSTEL_B', name: 'Hostel B', center_lat: 23.5210, center_lng: 77.8050, radius_meters: 80 }
      ]};
    }
    if (text.includes('INSERT INTO sentinel.auth_events')) {
      return { rows: [{ id: 'mock-event-id' }] };
    }
    if (text.includes('INSERT INTO sentinel.users')) {
      return { rows: [{ id: 'mock-user-id' }] };
    }
    return { rows: [] };
  }
  
  async connect() {
    console.log('[MOCK DB] Connected (mock)');
  }
  
  async end() {
    console.log('[MOCK DB] Disconnected');
  }
}

module.exports = {
  pool: new MockPool(),
  queryWithRole: async (userId, userRole, text, params) => {
    console.log(`[MOCK RLS] Role: ${userRole}, User: ${userId}`);
    return await this.pool.query(text, params);
  }
};
