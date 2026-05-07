import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus,
  RefreshCw,
  Eye,
  Download,
  Trash2,
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
} from 'lucide-react';

import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { submissionAPI } from '../services/api';
import { useSubmissionStore } from '../stores';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const { submissions, setSubmissions } = useSubmissionStore();

  useEffect(() => {
    fetchSubmissions(true); // Silent initial load
    // Auto-refresh every 3 seconds to show new uploads in real-time (silent)
    const interval = setInterval(() => fetchSubmissions(true), 3000);
    return () => clearInterval(interval);
  }, [currentPage]);

  const fetchSubmissions = async (silent = false) => {
    setLoading(true);
    try {
      const response = await submissionAPI.listSubmissions(currentPage, 10);
      const { submissions: data, pages } = response.data;
      setSubmissions(data);
      setTotalPages(pages);
      if (!silent) toast.success('Submissions loaded');
    } catch (error) {
      if (!silent) toast.error('Failed to fetch submissions');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    // Normalize old status formats to new ones
    let normalizedStatus = status;
    if (status === 'pass') normalizedStatus = 'completed';
    if (status === 'fail') normalizedStatus = 'failed';
    
    const statusConfig = {
      completed: { icon: CheckCircle, color: 'bg-green-100 text-green-800', label: 'Completed' },
      processing: { icon: Clock, color: 'bg-blue-100 text-blue-800', label: 'Processing' },
      failed: { icon: AlertCircle, color: 'bg-red-100 text-red-800', label: 'Failed' },
      pending: { icon: Clock, color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
      uploaded: { icon: Clock, color: 'bg-gray-100 text-gray-800', label: 'Uploaded' },
    };

    const config = statusConfig[normalizedStatus] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <span className={`badge ${config.color}`}>
        <Icon className="w-3 h-3 inline mr-1" />
        {config.label}
      </span>
    );
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      <Helmet>
        <title>Dashboard - SwasthyaAI Regulator</title>
      </Helmet>

      <div className="flex h-screen bg-gray-100">
        <Sidebar isOpen={sidebarOpen} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {/* Page Header */}
              <div className="mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-3xl font-bold text-gray-900">Submissions</h2>
                    <p className="text-gray-600 mt-2">
                      Manage and track your regulatory document submissions
                    </p>
                  </div>

                  <div className="flex items-center space-x-4 mt-4 sm:mt-0">
                    <button
                      onClick={fetchSubmissions}
                      className="btn-secondary flex items-center space-x-2"
                      disabled={loading}
                    >
                      <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>

                    <button
                      onClick={() => navigate('/upload')}
                      className="btn-primary flex items-center space-x-2"
                    >
                      <Plus className="w-5 h-5" />
                      <span>New Submission</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                {[
                  { label: 'Total', value: submissions.length, icon: FileText, color: 'bg-blue-50' },
                  {
                    label: 'Processing',
                    value: submissions.filter((s) => s.status === 'processing').length,
                    icon: Clock,
                    color: 'bg-yellow-50',
                  },
                  {
                    label: 'Completed',
                    value: submissions.filter((s) => s.status === 'completed').length,
                    icon: CheckCircle,
                    color: 'bg-green-50',
                  },
                  {
                    label: 'Failed',
                    value: submissions.filter((s) => s.status === 'failed').length,
                    icon: AlertCircle,
                    color: 'bg-red-50',
                  },
                ].map((stat, idx) => {
                  const Icon = stat.icon;
                  return (
                    <div key={idx} className={`card ${stat.color}`}>
                      <div className="card-body">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-600">{stat.label}</p>
                            <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                          </div>
                          <div className="p-3 bg-white bg-opacity-50 rounded-lg">
                            <Icon className="w-6 h-6 text-gray-600" />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Submissions Table */}
              <div className="card">
                <div className="card-header">
                  <h3 className="text-lg font-semibold text-gray-900">Recent Submissions</h3>
                </div>

                {/* Table */}
                {loading ? (
                  <div className="card-body text-center py-12">
                    <div className="animate-spin inline-block">⏳</div>
                    <p className="text-gray-600 mt-4">Loading submissions...</p>
                  </div>
                ) : submissions.length === 0 ? (
                  <div className="card-body text-center py-12">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No submissions yet</p>
                    <button
                      onClick={() => navigate('/upload')}
                      className="btn-primary mt-4 inline-block"
                    >
                      Create Your First Submission
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-t border-gray-200">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900">
                            Filename
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900">
                            Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900">
                            Uploaded
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900">
                            Duration
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {submissions.map((submission) => (
                          <tr
                            key={submission.id}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                              {submission.filename}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              {getStatusBadge(submission.status)}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {submission.submission_type || 'form_44'}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {formatDate(submission.created_at)}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {submission.processing_duration
                                ? `${submission.processing_duration.toFixed(1)}s`
                                : '-'}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <div className="flex items-center space-x-2">
                                {(submission.status === 'completed' || submission.status === 'pass') && (
                                  <>
                                    <button
                                      onClick={() => navigate(`/submission/${submission.id}/results`)}
                                      className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                                      title="View Results"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => navigate(`/submission/${submission.id}/compliance`)}
                                      className="p-2 hover:bg-green-100 text-green-600 rounded-lg transition-colors"
                                      title="View Compliance"
                                    >
                                      <Download className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                                {(submission.status === 'processing' || submission.status === 'uploaded') && (
                                  <button
                                    onClick={() => navigate(`/submission/${submission.id}/status`)}
                                    className="p-2 hover:bg-yellow-100 text-yellow-600 rounded-lg transition-colors animate-pulse"
                                    title="View Status"
                                  >
                                    <Clock className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="card-footer flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
                    </p>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="btn-secondary text-sm"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="btn-secondary text-sm"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
