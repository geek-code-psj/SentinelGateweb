import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to all requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // For FormData, let axios handle Content-Type automatically
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  
  return config;
});

// Handle errors globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  getToken: (username, password) =>
    apiClient.post('/auth/token', { username, password }),
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
  },
};

export const submissionAPI = {
  uploadFile: (file, type = 'form_44') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    // DO NOT set Content-Type header manually - axios will detect FormData and set it correctly
    return apiClient.post('/submissions/upload', formData);
  },

  extractForm44: (submissionId) =>
    apiClient.post(`/submissions/${submissionId}/extract-form44`),

  getStatus: (submissionId) =>
    apiClient.get(`/submissions/${submissionId}/status`),

  processSubmission: (submissionId, submissionData = {}) =>
    apiClient.post(`/submissions/${submissionId}/process`, { submission_data: submissionData }),

  getResults: (submissionId) =>
    apiClient.get(`/submissions/${submissionId}/results`),

  listSubmissions: (page = 1, perPage = 10) =>
    apiClient.get('/submissions', { params: { page, per_page: perPage } }),

  downloadResults: async (submissionId) => {
    const response = await apiClient.get(`/submissions/${submissionId}/results`);
    return response.data;
  },
};

export const healthAPI = {
  checkHealth: () => apiClient.get('/health'),
};

export default apiClient;
