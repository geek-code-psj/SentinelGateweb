import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { Lock, AlertCircle, CheckCircle, User } from 'lucide-react';

import { authAPI } from '../services/api';
import { useAuthStore } from '../stores';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setToken } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError('Username and password are required.');
      setLoading(false);
      return;
    }

    try {
      const response = await authAPI.getToken(username.trim(), password.trim());
      const { access_token } = response.data;

      setToken(access_token);
      toast.success('Login successful! Redirecting...');

      setTimeout(() => {
        navigate('/', { replace: true });
      }, 1000);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Invalid credentials. Please try again.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>SwasthyaAI Regulator - Login</title>
        <meta name="description" content="Government healthcare regulatory compliance platform" />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo Section */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">SwasthyaAI</h1>
            <p className="text-gray-600 mt-2">Regulatory Document Compliance Platform</p>
          </div>

          {/* Login Card */}
          <div className="bg-white rounded-lg shadow-lg p-8 card">
            {/* System Status */}
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-green-900">System Ready</h3>
                <p className="text-xs text-green-700 mt-1">All systems operational. Backend API connected.</p>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-red-900">Authentication Error</h3>
                  <p className="text-xs text-red-700 mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Demo credentials hint */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  <span className="font-semibold">Demo credentials:</span>{' '}
                  <code className="bg-blue-100 px-1 rounded">admin</code> /{' '}
                  <code className="bg-blue-100 px-1 rounded">swasthya2024</code>
                </p>
              </div>

              {/* Username field */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    required
                    autoComplete="username"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Password field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    autoComplete="current-password"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-3 font-semibold"
              >
                {loading ? (
                  <>
                    <span className="inline-block animate-spin mr-2">⏳</span>
                    Authenticating...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>

              {/* Additional Info */}
              <div className="text-center text-xs text-gray-600">
                <p>Government &amp; Healthcare Compliance Platform</p>
                <p className="mt-1">DPDP Act 2023 | NDHM | ICMR | CDSCO Compliant</p>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-xs text-gray-600">
            <p>© 2024 SwasthyaAI. All rights reserved.</p>
            <p className="mt-2">
              For support, contact:{' '}
              <span className="font-semibold">support@swastya.ai</span>
            </p>
          </div>

          {/* Features List */}
          <div className="mt-8 grid grid-cols-2 gap-4">
            {[
              { icon: '📄', label: 'Document Upload' },
              { icon: '🔐', label: 'DPDP Compliant' },
              { icon: '🤖', label: 'AI Processing' },
              { icon: '✅', label: '4 Frameworks' },
            ].map((feature, idx) => (
              <div key={idx} className="bg-white rounded-lg p-4 border border-gray-200 text-center">
                <div className="text-2xl mb-2">{feature.icon}</div>
                <p className="text-xs font-medium text-gray-700">{feature.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
