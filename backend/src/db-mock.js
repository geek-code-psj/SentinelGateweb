// Mock PostgreSQL pool for development (no actual DB connection)
class MockPool {
  constructor() {
    this.gates = {
      'G-01': { id: 'G-01', name: 'Gate 1', geofence_id: 'HOSTEL_A', totp_secret_enc: 'JBSWY3DPEHPK3PXP', status: 'ACTIVE', mfa_mode: 'FULL', current_rho: 0.45, current_lambda: 5, mu_capacity: 12, updated_at: new Date() },
      'G-02': { id: 'G-02', name: 'Gate 2', geofence_id: 'HOSTEL_B', totp_secret_enc: 'JBSWY3DPEHPK3PXQ', status: 'ACTIVE', mfa_mode: 'FULL', current_rho: 0.28, current_lambda: 3, mu_capacity: 12, updated_at: new Date() }
    };
    this.geofences = {
      'HOSTEL_A': { id: 'HOSTEL_A', name: 'Hostel A', center_lat: 23.5204, center_lng: 77.8038, radius_meters: 80 },
      'HOSTEL_B': { id: 'HOSTEL_B', name: 'Hostel B', center_lat: 23.5210, center_lng: 77.8050, radius_meters: 80 }
    };
  }

  async query(text, params) {
    try {
      console.log(`[MOCK DB] Query: ${text.substring(0, 80)}... | Params: ${JSON.stringify(params)}`);
      
      // SELECT FROM sentinel.gates
      if (text.includes('FROM sentinel.gates')) {
        if (text.includes('WHERE id = $1')) {
          const gateId = params?.[0];
          const gate = this.gates[gateId];
          return gate ? { rows: [gate], rowCount: 1 } : { rows: [], rowCount: 0 };
        }
        return { rows: Object.values(this.gates), rowCount: Object.keys(this.gates).length };
      }

      // SELECT FROM sentinel.geofence_zones
      if (text.includes('FROM sentinel.geofence_zones')) {
        if (text.includes('WHERE id = $1')) {
          const gfId = params?.[0];
          const gf = this.geofences[gfId];
          return gf ? { rows: [gf], rowCount: 1 } : { rows: [], rowCount: 0 };
        }
        return { rows: Object.values(this.geofences), rowCount: Object.keys(this.geofences).length };
      }

      // SELECT FROM sentinel.auth_events (empty, no real events in mock)
      if (text.includes('FROM sentinel.auth_events')) {
        return { rows: [], rowCount: 0 };
      }

      // SELECT FROM sentinel.leave_requests
      if (text.includes('FROM sentinel.leave_requests')) {
        return { rows: [], rowCount: 0 };
      }

      // SELECT FROM sentinel.users
      if (text.includes('FROM sentinel.users')) {
        return { rows: [], rowCount: 0 };
      }

      // INSERT queries
      if (text.includes('INSERT INTO')) {
        return { rows: [{ id: `mock-${Date.now()}` }], rowCount: 1 };
      }

      // UPDATE queries
      if (text.includes('UPDATE')) {
        return { rowCount: 1 };
      }
      
      // Default: return empty result
      return { rows: [], rowCount: 0 };
    } catch (err) {
      console.error(`[MOCK DB ERROR]`, err.message);
      throw err;
    }
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
