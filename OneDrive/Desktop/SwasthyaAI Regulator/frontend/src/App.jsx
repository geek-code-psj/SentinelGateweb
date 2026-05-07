import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';

import { useAuthStore } from './stores';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import Analytics from './pages/Analytics';
import UploadPage from './pages/Upload';
import ProcessingStatusPage from './pages/ProcessingStatus';
import ResultsPage from './pages/Results';
import ComplianceReportPage from './pages/Compliance';
import SettingsPage from './pages/Settings';
import NotFoundPage from './pages/NotFound';
import Anonymiser from './pages/Anonymiser';
import Classifier from './pages/Classifier';
import Summariser from './pages/Summariser';
import CompletenessChecker from './pages/CompletenessChecker';

import './App.css';

const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

function App() {
  const { setToken } = useAuthStore();

  useEffect(() => {
    // Initialize auth from localStorage with correct key
    const token = localStorage.getItem('access_token');
    if (token) {
      setToken(token);
    }
  }, [setToken]);

  return (
    <HelmetProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/upload"
            element={
              <ProtectedRoute>
                <UploadPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/submission/:id/status"
            element={
              <ProtectedRoute>
                <ProcessingStatusPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/submission/:id/results"
            element={
              <ProtectedRoute>
                <ResultsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/submission/:id/compliance"
            element={
              <ProtectedRoute>
                <ComplianceReportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />

          {/* CDSCO Stage 1 Features */}
          <Route
            path="/anonymiser"
            element={
              <ProtectedRoute>
                <Anonymiser />
              </ProtectedRoute>
            }
          />
          <Route
            path="/classifier"
            element={
              <ProtectedRoute>
                <Classifier />
              </ProtectedRoute>
            }
          />
          <Route
            path="/summariser"
            element={
              <ProtectedRoute>
                <Summariser />
              </ProtectedRoute>
            }
          />
          <Route
            path="/completeness-checker"
            element={
              <ProtectedRoute>
                <CompletenessChecker />
              </ProtectedRoute>
            }
          />

          {/* 404 Route */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>

        {/* Toast notifications */}
        <Toaster position="top-right" />
      </Router>
    </HelmetProvider>
  );
}

export default App;
