import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  token: localStorage.getItem('access_token') || null,
  isAuthenticated: !!localStorage.getItem('access_token'),

  setToken: (token) => {
    if (token) {
      localStorage.setItem('access_token', token);
    } else {
      localStorage.removeItem('access_token');
    }
    set({ token, isAuthenticated: !!token });
  },

  logout: () => {
    localStorage.removeItem('access_token');
    set({ token: null, isAuthenticated: false });
  },
}));

export const useSubmissionStore = create((set) => ({
  submissions: [],
  currentSubmission: null,
  loading: false,
  error: null,

  setSubmissions: (submissions) => set({ submissions }),
  setCurrentSubmission: (submission) => set({ currentSubmission: submission }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  addSubmission: (submission) =>
    set((state) => ({
      submissions: [submission, ...state.submissions],
    })),

  updateSubmission: (id, updates) =>
    set((state) => ({
      submissions: state.submissions.map((sub) =>
        sub.id === id ? { ...sub, ...updates } : sub
      ),
    })),
}));
