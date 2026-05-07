import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Download,
  FileText,
  BarChart3,
  Shield,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Loader,
  TrendingUp,
} from 'lucide-react';

import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { submissionAPI } from '../services/api';

export default function ResultsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [results, setResults] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary');
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    fetchStatus();
    const pollInterval = setInterval(() => {
      fetchStatus();
    }, 2000);
    return () => clearInterval(pollInterval);
  }, [id]);

  useEffect(() => {
    if ((status?.status === 'completed' || status?.status === 'failed') && !results) {
      fetchResults();
    }
  }, [status?.status]);

  const fetchStatus = async () => {
    try {
      const res = await submissionAPI.getStatus(id);
      setStatus(res.data);
      setLoading(false);

      // Fetch results immediately if already completed or failed
      if ((res.data.status === 'completed' || res.data.status === 'failed') && !results) {
        fetchResults();
      }
    } catch (error) {
      console.error('Error fetching status:', error);
      setLoading(false);
    }
  };

  const fetchResults = async () => {
    try {
      const res = await submissionAPI.getResults(id);
      setResults(res.data);
    } catch (error) {
      if (error.response?.status === 404) {
        toast.error('Results not found');
        navigate('/');
      } else {
        toast.error('Failed to fetch results');
      }
    }
  };

  const downloadResults = async () => {
    try {
      const content = generateResultsDocument();
      const element = document.createElement('a');
      const file = new Blob([content], { type: 'text/plain' });
      element.href = URL.createObjectURL(file);
      element.download = `validation-report-${id}-${Date.now()}.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      toast.success('Results downloaded');
    } catch (error) {
      toast.error('Failed to download results');
    }
  };

  const generateResultsDocument = () => {
    return `
SWASTHAAI REGULATOR - VALIDATION REPORT
========================================

SUBMISSION INFORMATION
---------------------
ID: ${results?.submission_id}
Filename: ${results?.filename}
Status: ${results?.status}
Overall: ${results?.overall_status}

VALIDATION RESULTS
------------------
Total Checks: ${results?.total_checks}
Passed: ${results?.checks_passed}
Failed: ${results?.checks_failed}
Skipped: ${results?.checks_skipped}

FORM COMPLETENESS
-----------------
Score: ${Math.round(results?.form_completeness || 0)}%

KEY FINDINGS
-----------
${(results?.key_findings || []).map((f, i) => `${i + 1}. ${f}`).join('\n')}

DETAILED FINDINGS
-----------------
${(results?.findings || []).join('\n')}

RECOMMENDATIONS
----------------
${(results?.recommendations || []).join('\n')}

COMPREHENSIVE SUMMARY
---------------------
${results?.summary || 'No summary available'}

Generated: ${new Date().toLocaleString()}
`;
  };

  if (loading) {
    return (
      <>
        <Helmet>
          <title>Results - SwasthyaAI Regulator</title>
        </Helmet>
        <div className="flex h-screen bg-gray-100">
          <Sidebar isOpen={sidebarOpen} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
            <main className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader className="animate-spin inline-block text-4xl mb-4 text-primary-500" style={{fontSize: '50px'}} />
                <p className="text-gray-600">Loading results...</p>
              </div>
            </main>
          </div>
        </div>
      </>
    );
  }

  // Wait for both status and results
  if (!status || !results) {
    return (
      <>
        <Helmet>
          <title>Processing - SwasthyaAI Regulator</title>
        </Helmet>
        <div className="flex h-screen bg-gray-100">
          <Sidebar isOpen={sidebarOpen} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
            <main className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto p-6 h-full flex items-center justify-center">
                <div className="bg-white rounded-lg shadow-lg p-12 text-center max-w-md w-full">
                  <Loader className="animate-spin text-6xl mx-auto mb-6 text-primary-500" style={{fontSize: '60px'}} />
                  <h2 className="text-2xl font-bold mb-4">Loading Results</h2>
                  <p className="text-gray-600 mb-4">
                    Status: <span className="font-semibold capitalize">{status?.status || 'processing'}</span>
                  </p>
                </div>
              </div>
            </main>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Results - SwasthyaAI Regulator</title>
      </Helmet>
      <div className="flex h-screen bg-gray-100">
        <Sidebar isOpen={sidebarOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-8 pb-6 border-b-2 border-gray-200">
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    <ArrowLeft className="w-6 h-6 text-gray-700" />
                  </button>
                  <div>
                    <h1 className="text-4xl font-black text-gray-900 mb-1">{results?.filename}</h1>
                    <p className="text-sm text-gray-600 font-mono">
                      Submission ID: <span className="text-blue-600 font-bold">{id}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={downloadResults}
                  className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl font-bold whitespace-nowrap"
                >
                  <Download className="w-5 h-5" />
                  <span>Download Report</span>
                </button>
              </div>

              {/* Status Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                <StatusCard
                  label="Overall Status"
                  value={results?.overall_status === 'PASS' ? '✓ APPROVED' : '✗ FAILED'}
                  icon={results?.overall_status === 'PASS' ? CheckCircle : AlertCircle}
                  color={results?.overall_status === 'PASS' ? 'green' : 'red'}
                />
                <StatusCard
                  label="Checks Passed"
                  value={results?.checks_passed || 0}
                  icon={CheckCircle}
                  color="green"
                />
                <StatusCard
                  label="Form Completeness"
                  value={`${Math.round(results?.form_completeness || 0)}%`}
                  icon={TrendingUp}
                  color={results?.form_completeness >= 70 ? 'green' : 'orange'}
                />
                <StatusCard
                  label="Total Checks"
                  value={results?.total_checks || 0}
                  icon={BarChart3}
                  color="blue"
                />
              </div>

              {/* Tabs */}
              <div className="card mb-6 shadow-lg border-0 overflow-hidden">
                <div className="flex border-b-2 border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                  {[
                    { id: 'summary', label: 'Summary', icon: '📋' },
                    { id: 'validation', label: 'Validation Results', icon: '✓' },
                    { id: 'findings', label: 'Findings & Recommendations', icon: '💡' },
                    { id: 'details', label: 'Details', icon: '⚙️' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 px-6 py-4 font-bold text-sm transition-all duration-200 border-b-4 relative ${
                        activeTab === tab.id
                          ? 'border-b-blue-600 text-blue-700 bg-blue-50'
                          : 'border-b-transparent text-gray-600 hover:text-gray-900 hover:bg-white'
                      }`}
                    >
                      <span className="flex items-center justify-center space-x-2">
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="p-8 bg-white">
                  {activeTab === 'summary' && <SummaryTab results={results} />}
                  {activeTab === 'validation' && <ValidationTab results={results} />}
                  {activeTab === 'findings' && <FindingsTab results={results} />}
                  {activeTab === 'details' && <DetailsTab results={results} />}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

// Summary Tab - Shows comprehensive summary
function SummaryTab({ results }) {
  // Calculate percentages for pie chart
  const total = (results?.checks_passed || 0) + (results?.checks_failed || 0) + (results?.checks_skipped || 0);
  const passedPercent = total > 0 ? Math.round((results?.checks_passed || 0) / total * 100) : 0;
  const failedPercent = total > 0 ? Math.round((results?.checks_failed || 0) / total * 100) : 0;
  const skippedPercent = total > 0 ? Math.round((results?.checks_skipped || 0) / total * 100) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-2xl font-bold text-gray-900 mb-6">Overall Assessment</h3>
        <div className={`rounded-2xl p-8 border-2 shadow-lg ${
          results?.overall_status === 'PASS'
            ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-300'
            : 'bg-gradient-to-br from-red-50 to-red-100 border-red-300'
        }`}>
          <div className="flex items-center space-x-6">
            {results?.overall_status === 'PASS' ? (
              <div className="flex-shrink-0 w-20 h-20 rounded-full bg-green-200 flex items-center justify-center">
                <CheckCircle className="w-12 h-12 text-green-700" />
              </div>
            ) : (
              <div className="flex-shrink-0 w-20 h-20 rounded-full bg-red-200 flex items-center justify-center">
                <AlertCircle className="w-12 h-12 text-red-700" />
              </div>
            )}
            <div>
              <p className={`text-3xl font-black ${
                results?.overall_status === 'PASS' ? 'text-green-900' : 'text-red-900'
              }`}>
                {results?.overall_status === 'PASS'
                  ? '✓ APPROVED FOR REGULATORY REVIEW'
                  : '✗ REQUIRES ATTENTION'}
              </p>
              {results?.form_completeness && (
                <p className="text-base text-gray-700 mt-3 font-semibold">
                  Form Completeness: <span className="text-2xl font-black text-gray-900">{Math.round(results.form_completeness)}%</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-2xl font-bold text-gray-900 mb-6">Validation Summary</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Chart */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative w-48 h-48">
              <svg viewBox="0 0 100 100" className="w-full h-full">
                {/* Pie chart using SVG */}
                <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="15" />
                <circle
                  cx="50" cy="50" r="45"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="15"
                  strokeDasharray={`${passedPercent * 2.83} 283`}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                />
                <circle
                  cx="50" cy="50" r="45"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="15"
                  strokeDasharray={`${failedPercent * 2.83} 283`}
                  strokeDashoffset={`-${passedPercent * 2.83}`}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                />
                <circle
                  cx="50" cy="50" r="45"
                  fill="none"
                  stroke="#eab308"
                  strokeWidth="15"
                  strokeDasharray={`${skippedPercent * 2.83} 283`}
                  strokeDashoffset={`-${(passedPercent + failedPercent) * 2.83}`}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                />
                <text x="50" y="55" textAnchor="middle" fontSize="20" fontWeight="bold" fill="#1f2937">
                  {passedPercent}%
                </text>
              </svg>
            </div>
            <p className="text-center text-gray-600 mt-4 text-sm font-semibold">Pass Rate</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-green-50 rounded-xl p-6 border-2 border-green-200 shadow-md">
              <p className="text-sm font-bold text-green-700 uppercase tracking-wider">Passed</p>
              <p className="text-5xl font-black text-green-900 mt-2">{results?.checks_passed || 0}</p>
              <p className="text-xs text-green-700 mt-2 font-semibold">{passedPercent}% of total checks</p>
            </div>
            <div className="bg-red-50 rounded-xl p-6 border-2 border-red-200 shadow-md">
              <p className="text-sm font-bold text-red-700 uppercase tracking-wider">Failed</p>
              <p className="text-5xl font-black text-red-900 mt-2">{results?.checks_failed || 0}</p>
              <p className="text-xs text-red-700 mt-2 font-semibold">{failedPercent}% of total checks</p>
            </div>
            <div className="bg-yellow-50 rounded-xl p-6 border-2 border-yellow-200 shadow-md">
              <p className="text-sm font-bold text-yellow-700 uppercase tracking-wider">Skipped</p>
              <p className="text-5xl font-black text-yellow-900 mt-2">{results?.checks_skipped || 0}</p>
              <p className="text-xs text-yellow-700 mt-2 font-semibold">{skippedPercent}% of total checks</p>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Check Results */}
      {results?.validation_results && results.validation_results.length > 0 && (
        <div>
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Validation Check Details</h3>
          <div className="space-y-3">
            {results.validation_results.map((check, idx) => (
              <div key={idx} className={`p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                check.status === 'PASS' ? 'bg-green-50 border-green-200' :
                check.status === 'FAIL' ? 'bg-red-50 border-red-200' :
                check.status === 'SKIPPED' ? 'bg-yellow-50 border-yellow-200' :
                'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      {check.status === 'PASS' && <span className="text-2xl">✓</span>}
                      {check.status === 'FAIL' && <span className="text-2xl">✗</span>}
                      {check.status === 'SKIPPED' && <span className="text-2xl">⊘</span>}
                      <p className="font-bold text-gray-900">{check.check_type}</p>
                    </div>
                    <p className={`text-sm mt-2 font-semibold ${
                      check.status === 'PASS'
                        ? 'text-green-700'
                        : check.status === 'FAIL'
                        ? 'text-red-700'
                        : 'text-gray-700'
                    }`}>
                      {check.details?.reason || `Status: ${check.status}`}
                    </p>
                  </div>
                  <span className={`px-4 py-2 rounded-full text-xs font-black whitespace-nowrap ml-4 ${
                    check.status === 'PASS'
                      ? 'bg-green-200 text-green-800'
                      : check.status === 'FAIL'
                      ? 'bg-red-200 text-red-800'
                      : 'bg-yellow-200 text-yellow-800'
                  }`}>
                    {check.status}
                  </span>
                </div>
                {check.details?.completeness && (
                  <div className="mt-4 pt-4 border-t-2 border-gray-300">
                    <p className="text-sm text-gray-700">
                      Completeness: <span className="font-black text-lg">{Math.round(check.details.completeness)}%</span>
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {results?.key_findings && results.key_findings.length > 0 && (
        <div>
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Key Findings</h3>
          <ul className="space-y-3">
            {results.key_findings.map((finding, idx) => (
              <li key={idx} className="flex items-start p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                <CheckCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                <span className="text-gray-800 font-medium">{finding}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Validation Results Tab
function ValidationTab({ results }) {
  return (
    <div className="space-y-4">
      <h3 className="text-2xl font-bold text-gray-900 mb-6">Validation Checks</h3>
      {results?.validation_results && results.validation_results.length > 0 ? (
        results.validation_results.map((check, idx) => (
          <div
            key={idx}
            className={`rounded-xl p-5 border-2 transition-all hover:shadow-lg ${
              check.status === 'PASS'
                ? 'bg-green-50 border-green-300 hover:border-green-400'
                : check.status === 'FAIL'
                ? 'bg-red-50 border-red-300 hover:border-red-400'
                : check.status === 'SKIPPED'
                ? 'bg-yellow-50 border-yellow-300 hover:border-yellow-400'
                : 'bg-gray-50 border-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  {check.status === 'PASS' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-200 flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-green-700" />
                    </div>
                  )}
                  {check.status === 'FAIL' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-200 flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-red-700" />
                    </div>
                  )}
                  {check.status === 'SKIPPED' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-200 flex items-center justify-center text-lg">⊘</div>
                  )}
                  <h4 className="font-bold text-gray-900 text-lg">{check.check_type}</h4>
                </div>
                <p className={`text-sm mt-2 font-semibold ${
                  check.status === 'PASS'
                    ? 'text-green-700'
                    : check.status === 'FAIL'
                    ? 'text-red-700'
                    : 'text-gray-700'
                }`}>
                  {check.details?.reason || `Status: ${check.status}`}
                </p>
              </div>
              <span className={`px-4 py-2 rounded-full text-xs font-black whitespace-nowrap ml-4 ${
                check.status === 'PASS'
                  ? 'bg-green-200 text-green-800'
                  : check.status === 'FAIL'
                  ? 'bg-red-200 text-red-800'
                  : check.status === 'SKIPPED'
                  ? 'bg-yellow-200 text-yellow-800'
                  : 'bg-gray-200 text-gray-800'
              }`}>
                {check.status}
              </span>
            </div>
            {check.details?.completeness && (
              <div className="mt-4 pt-4 border-t-2 border-gray-300">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">Completeness Score</p>
                  <p className="text-lg font-black text-gray-900">{Math.round(check.details.completeness)}%</p>
                </div>
                <div className="mt-2 w-full bg-gray-300 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${check.details.completeness}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        ))
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg font-semibold italic">No validation results available</p>
        </div>
      )}
    </div>
  );
}

// Findings & Recommendations Tab
function FindingsTab({ results }) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-2xl font-bold text-gray-900 mb-6">Detailed Findings</h3>
        <div className="space-y-4">
          {results?.findings && results.findings.length > 0 ? (
            results.findings.map((finding, idx) => (
              <div key={idx} className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-5 border-l-4 border-blue-500 shadow-sm hover:shadow-md transition-all">
                <p className="text-gray-800 font-semibold leading-relaxed">{finding}</p>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg font-semibold italic">No findings available</p>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-2xl font-bold text-gray-900 mb-6">Recommendations</h3>
        <div className="space-y-4">
          {results?.recommendations && results.recommendations.length > 0 ? (
            results.recommendations.map((rec, idx) => {
              const isPositive = rec.includes('✓') || rec.toLowerCase().includes('pass') || rec.toLowerCase().includes('valid');
              const isNegative = rec.includes('✗') || rec.toLowerCase().includes('fail') || rec.toLowerCase().includes('invalid');
              const isWarning = rec.includes('⚠') || rec.toLowerCase().includes('warn') || rec.toLowerCase().includes('attention');

              return (
                <div
                  key={idx}
                  className={`rounded-xl p-5 border-l-4 transition-all hover:shadow-md ${
                    isPositive
                      ? 'bg-green-50 border-l-green-500'
                      : isNegative
                      ? 'bg-red-50 border-l-red-500'
                      : isWarning
                      ? 'bg-yellow-50 border-l-yellow-500'
                      : 'bg-blue-50 border-l-blue-500'
                  }`}
                >
                  <p className={`text-gray-800 font-semibold ${
                    isPositive
                      ? 'text-green-900'
                      : isNegative
                      ? 'text-red-900'
                      : isWarning
                      ? 'text-yellow-900'
                      : 'text-blue-900'
                  }`}>
                    {rec}
                  </p>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg font-semibold italic">No recommendations</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Details Tab
function DetailsTab({ results }) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-2xl font-bold text-gray-900 mb-6">Submission Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border-2 border-blue-200 shadow-md">
            <p className="text-xs text-blue-700 uppercase font-black tracking-wider">Submission ID</p>
            <p className="font-mono text-base text-blue-900 mt-3 break-all font-bold">{results?.submission_id}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-xl border-2 border-purple-200 shadow-md">
            <p className="text-xs text-purple-700 uppercase font-black tracking-wider">Filename</p>
            <p className="font-semibold text-base text-purple-900 mt-3">{results?.filename}</p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl border-2 border-green-200 shadow-md">
            <p className="text-xs text-green-700 uppercase font-black tracking-wider">Status</p>
            <p className="font-semibold text-base text-green-900 mt-3 capitalize">{results?.status}</p>
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-xl border-2 border-orange-200 shadow-md">
            <p className="text-xs text-orange-700 uppercase font-black tracking-wider">Form Completeness</p>
            <p className="font-semibold text-base text-orange-900 mt-3">{Math.round(results?.form_completeness || 0)}%</p>
          </div>
        </div>
      </div>

      {results?.critical_issues && results.critical_issues.length > 0 && (
        <div>
          <h3 className="text-2xl font-bold text-gray-900 mb-6">🚨 Critical Issues</h3>
          <div className="space-y-4">
            {results.critical_issues.map((issue, idx) => (
              <div key={idx} className="bg-gradient-to-r from-red-50 to-red-100 border-l-4 border-l-red-600 p-5 rounded-lg shadow-md">
                <p className="text-red-900 font-bold text-base">{issue}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-2xl font-bold text-gray-900 mb-6">Timestamp</h3>
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl border-2 border-gray-200 shadow-sm">
          <p className="text-gray-700 font-mono text-lg font-bold">
            {results?.timestamp ? new Date(results.timestamp).toLocaleString() : 'N/A'}
          </p>
        </div>
      </div>
    </div>
  );
}

// Status Card Component - Enhanced
function StatusCard({ label, value, icon: Icon, color }) {
  const colorMap = {
    green: {
      bg: 'bg-gradient-to-br from-green-50 to-green-100',
      border: 'border-green-200',
      text: 'text-green-700',
      icon: 'text-green-600',
    },
    red: {
      bg: 'bg-gradient-to-br from-red-50 to-red-100',
      border: 'border-red-200',
      text: 'text-red-700',
      icon: 'text-red-600',
    },
    blue: {
      bg: 'bg-gradient-to-br from-blue-50 to-blue-100',
      border: 'border-blue-200',
      text: 'text-blue-700',
      icon: 'text-blue-600',
    },
    orange: {
      bg: 'bg-gradient-to-br from-orange-50 to-orange-100',
      border: 'border-orange-200',
      text: 'text-orange-700',
      icon: 'text-orange-600',
    },
  };

  const style = colorMap[color] || colorMap.blue;

  return (
    <div className={`${style.bg} rounded-xl p-6 border-2 ${style.border} shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm font-bold uppercase tracking-wider ${style.text}`}>{label}</p>
          <p className="text-4xl font-black mt-3 text-gray-900">{value}</p>
        </div>
        <div className={`flex-shrink-0 w-16 h-16 rounded-full ${style.bg} border-2 ${style.border} flex items-center justify-center`}>
          <Icon className={`w-8 h-8 ${style.icon}`} />
        </div>
      </div>
    </div>
  );
}
