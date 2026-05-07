import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  RotateCw,
  Zap,
  Shield,
  Award
} from 'lucide-react';

import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { submissionAPI } from '../services/api';

const processingStages = [
  { id: 'uploaded', label: 'Uploaded', icon: Zap, duration: '1-2s' },
  { id: 'validating_duplicates', label: 'Duplicate Detection', icon: Shield, duration: '2-3s' },
  { id: 'validating_consistency', label: 'Consistency Check', icon: CheckCircle, duration: '3-5s' },
  { id: 'validating_form', label: 'Form Validation', icon: Award, duration: '2-3s' },
  { id: 'completed', label: 'Completed', icon: CheckCircle, duration: '1s' },
];

export default function ProcessingStatusPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const processingInitiatedRef = useRef(false); // Prevent duplicate processing attempts
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processAttempted, setProcessAttempted] = useState(false);
  const [extractedFormData, setExtractedFormData] = useState(null);
  const [extracting, setExtracting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await submissionAPI.getStatus(id);
      const data = response.data;
      
      // Normalize status values for backwards compatibility
      // Convert old format (pass/fail) to new format (completed/failed)
      if (data.status === 'pass') {
        data.status = 'completed';
      } else if (data.status === 'fail') {
        data.status = 'failed';
      }
      
      setSubmission(data);

      // Stop auto-refresh when completed or failed
      if (data.status === 'completed' || data.status === 'failed') {
        setAutoRefresh(false);
      }

      setLoading(false);
    } catch (error) {
      toast.error('Failed to fetch status');
      console.error(error);
      setLoading(false);
    }
  }, [id]);

  const extractAndProcess = async () => {
    if (extracting || processing || !submission || submission.status !== 'uploaded') return;
    
    setExtracting(true);
    try {
      // Step 1: Extract Form 44 data from PDF
      console.log('[EXTRACT] Starting form extraction for submission:', id);
      console.log('[EXTRACT] Submission status:', submission.status);
      const extractResponse = await submissionAPI.extractForm44(id);
      
      if (extractResponse.status === 200) {
        const formData = extractResponse.data.form44_data;
        setExtractedFormData(formData);
        console.log('[EXTRACT] ✓ Form 44 data extracted successfully:', formData);
        console.log('[EXTRACT] Extracted field count:', Object.keys(formData).length);
        
        // Step 2: Process with extracted data
        setExtracting(false);
        await triggerProcessingWithData(formData);
      }
    } catch (error) {
      console.warn('[EXTRACT] Form extraction failed:', error.message);
      console.log('[EXTRACT] Error details:', error.response?.status, error.response?.data);
      console.warn('[EXTRACT] Falling back to processing without extracted data');
      setExtracting(false);
      // Fall back to processing without extracted data
      await triggerProcessing();
    }
  };

  const triggerProcessingWithData = async (formData) => {
    if (processing || !submission) return;
    
    setProcessing(true);
    console.log('[PROCESS] Starting processing with extracted data for submission:', id);
    console.log('[PROCESS] Form data keys:', Object.keys(formData).length > 0 ? Object.keys(formData) : 'EMPTY');
    try {
      const response = await submissionAPI.processSubmission(id, { form_data: formData });
      console.log('[PROCESS] ✓ Processing response received:', response.status);
      if (response.status === 200) {
        toast.success('Processing started with extracted Form 44 data!');
        await fetchStatus();
      }
    } catch (error) {
      console.error('[PROCESS] ✗ Processing failed:', error.message);
      console.error('[PROCESS] Error status:', error.response?.status);
      console.error('[PROCESS] Error response:', error.response?.data);
      console.error('[PROCESS] Submission ID:', id);
      const errorMsg = error.response?.data?.error || error.message || 'Failed to process submission';
      toast.error(errorMsg);
      console.error('Processing error:', error);
    } finally {
      setProcessing(false);
    }
  };

  const triggerProcessing = async () => {
    if (processing || !submission || submission.status !== 'uploaded') return;
    
    setProcessing(true);
    console.log('[PROCESS] Starting processing without extracted data for submission:', id);
    try {
      const response = await submissionAPI.processSubmission(id);
      console.log('[PROCESS] ✓ Processing response received:', response.status);
      if (response.status === 200) {
        toast.success('Processing started!');
        // Refresh immediately to see updated status
        await fetchStatus();
      }
    } catch (error) {
      console.error('[PROCESS] ✗ Processing failed:', error.message);
      console.error('[PROCESS] Error status:', error.response?.status);
      console.error('[PROCESS] Error data:', error.response?.data);
      const errorMsg = error.response?.data?.error || error.message || 'Failed to process submission';
      toast.error(errorMsg);
      console.error('Processing error:', error);
    } finally {
      setProcessing(false);
    }
  };

  const getCurrentStage = () => {
    if (!submission) return 0;
    const status = submission.status;
    
    // Map actual statuses to progress
    if (status === 'completed' || status === 'pass') return processingStages.length;
    if (status === 'failed' || status === 'fail') return 0;
    
    const stageIdx = processingStages.findIndex((s) => s.id === status);
    return stageIdx >= 0 ? stageIdx + 1 : 1; // Default to 1 if status not recognized
  };

  const isStageCompleted = (stageId) => {
    if (!submission) return false;
    const status = submission.status;
    
    // When failed, all stages except the final one are "completed", but final stage failed
    if (status === 'failed' || status === 'fail') {
      // All stages before "completed" stage
      if (stageId !== 'completed') {
        return true; // All intermediate stages completed
      }
      return false; // Final stage failed
    }
    
    // When completed, all stages are completed
    if (status === 'completed' || status === 'pass') {
      return true;
    }
    
    // For other statuses (in progress), show stages that have been completed
    const currentIdx = processingStages.findIndex((s) => s.id === status);
    const stageIdx = processingStages.findIndex((s) => s.id === stageId);
    return stageIdx < currentIdx;
  };

  const isStageInProgress = (stageId) => {
    if (!submission) return false;
    return submission.status === stageId;
  };

  const getProgressPercentage = () => {
    if (!submission) return 0;
    const status = submission.status;
    
    if (status === 'completed' || status === 'pass') return 100;
    // Show 80% progress for failed - indicates most checks ran but one failed
    if (status === 'failed' || status === 'fail') return 80;
    
    const stage = getCurrentStage();
    return Math.max(0, (stage - 1) / processingStages.length * 100);
  };

  useEffect(() => {
    fetchStatus();
    const interval = autoRefresh ? setInterval(fetchStatus, 2000) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [id, autoRefresh, fetchStatus]);

  // Reset processing flag when submission ID changes
  useEffect(() => {
    processingInitiatedRef.current = false;
  }, [id]);

  // Auto-trigger extraction and processing when uploaded status is detected
  useEffect(() => {
    // Only start processing once per submission, when status is 'uploaded'
    if (submission?.status === 'uploaded' && !processingInitiatedRef.current && !processing && !extracting) {
      processingInitiatedRef.current = true; // Mark as initiated to prevent re-triggering
      setProcessAttempted(true);
      extractAndProcess();
    }
  }, [submission?.status]); // Minimal deps - only respond to status changes

  if (loading) {
    return (
      <>
        <Helmet>
          <title>Processing Status - SwasthyaAI Regulator</title>
        </Helmet>
        <div className="flex h-screen bg-gray-100">
          <Sidebar isOpen={sidebarOpen} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
            <main className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin inline-block text-4xl mb-4">⏳</div>
                <p className="text-gray-600">Loading processing status...</p>
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
        <title>Processing Status - SwasthyaAI Regulator</title>
      </Helmet>

      <div className="flex h-screen bg-gray-100">
        <Sidebar isOpen={sidebarOpen} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {/* Page Header */}
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-900">Processing Status</h2>
                <p className="text-gray-600 mt-2">Real-time document processing progress</p>
              </div>

              {/* Status Card */}
              <div className="card mb-8 shadow-lg border-0">
                <div className="card-header flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-100">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">{submission?.filename}</h3>
                    <p className="text-sm text-gray-600 mt-1 font-mono">
                      ID: <span className="text-blue-600">{id}</span>
                    </p>
                  </div>
                  <div>
                    {(submission?.status === 'completed' || submission?.status === 'pass') && (
                      <span className="inline-flex items-center space-x-2 px-4 py-2 bg-green-100 text-green-800 rounded-full font-bold text-sm shadow-md">
                        <CheckCircle className="w-5 h-5" />
                        <span>Completed</span>
                      </span>
                    )}
                    {(submission?.status === 'failed' || submission?.status === 'fail') && (
                      <span className="inline-flex items-center space-x-2 px-4 py-2 bg-red-100 text-red-800 rounded-full font-bold text-sm shadow-md">
                        <AlertCircle className="w-5 h-5" />
                        <span>Failed</span>
                      </span>
                    )}
                    {submission?.status !== 'completed' && submission?.status !== 'failed' && submission?.status !== 'pass' && submission?.status !== 'fail' && (
                      <span className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-100 text-blue-800 rounded-full font-bold text-sm animate-pulse shadow-md">
                        <span className="w-2 h-2 bg-blue-600 rounded-full inline-block animate-pulse"></span>
                        <span>Processing</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="card-body space-y-8">
                  {/* Overall Progress */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="font-bold text-gray-900 text-lg">Overall Progress</p>
                        <p className="text-sm text-gray-600 mt-1">Real-time processing metrics</p>
                      </div>
                      <p className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                        {Math.round(getProgressPercentage())}%
                      </p>
                    </div>
                    <div>
                      <div className="w-full bg-gradient-to-r from-gray-100 to-gray-200 rounded-full h-4 shadow-inner relative overflow-hidden">
                        <div
                          className="h-4 rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-blue-400 via-blue-500 to-indigo-600 shadow-lg"
                          style={{ width: `${getProgressPercentage()}%` }}
                        >
                          <div className="h-full w-full relative overflow-hidden">
                            <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-between mt-2">
                        <span className="text-xs font-semibold text-gray-600">Start</span>
                        <span className="text-xs font-semibold text-gray-600">Complete</span>
                      </div>
                    </div>
                  </div>

                  {/* Process Now Button - Show only if uploaded and not processing */}
                  {submission?.status === 'uploaded' && (
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl p-5 flex items-center justify-between shadow-md hover:shadow-lg transition-shadow">
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mt-0.5">
                          <AlertCircle className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                          <p className="font-bold text-amber-950 text-lg">Ready to Process</p>
                          <p className="text-sm text-amber-800 mt-1">Click to extract Form 44 data and begin validation pipeline</p>
                        </div>
                      </div>
                      <button
                        onClick={extractAndProcess}
                        disabled={processing || extracting}
                        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg font-bold flex items-center space-x-2 whitespace-nowrap group"
                      >
                        {processing || extracting ? (
                          <>
                            <span className="inline-block animate-spin">⟳</span>
                            <span className="text-sm">{extracting ? 'Extracting...' : 'Processing...'}</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            <span className="text-sm">Process Now</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Processing Stages */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-6">Processing Pipeline</h3>
                    <div className="space-y-3">
                      {processingStages.map((stage, idx) => {
                        const Icon = stage.icon;
                        const isCompleted = isStageCompleted(stage.id);
                        const isInProgress = isStageInProgress(stage.id);
                        const isUpcoming = !isCompleted && !isInProgress;

                        return (
                          <div
                            key={stage.id}
                            className={`p-5 rounded-xl border-2 transition-all duration-300 hover:shadow-md ${
                              isCompleted
                                ? 'bg-gradient-to-r from-green-50 to-green-100 border-green-300 shadow-sm'
                                : isInProgress
                                ? 'bg-gradient-to-r from-blue-50 to-blue-100 border-blue-400 border-dashed shadow-md'
                                : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-start space-x-4">
                              {/* Stage Icon - Enhanced */}
                              <div
                                className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg transition-all duration-300 ${
                                  isCompleted
                                    ? 'bg-gradient-to-br from-green-400 to-green-600 text-white shadow-lg scale-100'
                                    : isInProgress
                                    ? 'bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-lg animate-pulse'
                                    : 'bg-gray-300 text-gray-600'
                                }`}
                              >
                                {isCompleted ? (
                                  <CheckCircle className="w-7 h-7" />
                                ) : isInProgress ? (
                                  <RotateCw className="w-7 h-7 animate-spin" />
                                ) : (
                                  <span className="text-sm">{idx + 1}</span>
                                )}
                              </div>

                              {/* Stage Info - Enhanced */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-4">
                                  <div>
                                    <p className={`font-bold text-lg ${isCompleted ? 'text-green-900' : isInProgress ? 'text-blue-900' : 'text-gray-700'}`}>
                                      {stage.label}
                                    </p>
                                    <p className="text-xs text-gray-600 mt-1 uppercase tracking-wide">
                                      Duration: {stage.duration}
                                    </p>
                                  </div>
                                  <div className="flex items-center">
                                    {isInProgress && (
                                      <span className="px-3 py-1 bg-blue-200 text-blue-800 text-xs font-bold rounded-full whitespace-nowrap">
                                        ◉ In Progress
                                      </span>
                                    )}
                                    {isCompleted && (
                                      <span className="px-3 py-1 bg-green-200 text-green-800 text-xs font-bold rounded-full whitespace-nowrap">
                                        ✓ Completed
                                      </span>
                                    )}
                                    {isUpcoming && (
                                      <span className="px-3 py-1 bg-gray-200 text-gray-700 text-xs font-bold rounded-full whitespace-nowrap">
                                        ⧗ Upcoming
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Progress Indicator Line (not for last stage) */}
                            {idx < processingStages.length - 1 && (
                              <div className={`ml-6 mt-3 h-2 rounded-full transition-all duration-300 ${
                                isCompleted ? 'bg-green-300' : isInProgress ? 'bg-blue-200' : 'bg-gray-200'
                              }`}></div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Extracted Form Data */}
                  {extractedFormData && Object.keys(extractedFormData).length > 0 && (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 space-y-4 border-2 border-blue-200 shadow-md">
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center">
                          <CheckCircle className="w-6 h-6 text-blue-600" />
                        </div>
                        <h3 className="font-bold text-lg text-gray-900">Extracted Form 44 Data</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                        {Object.entries(extractedFormData).map(([key, value]) => (
                          <div key={key} className="bg-white rounded-lg p-4 border border-blue-100 hover:border-blue-300 hover:shadow-md transition-all">
                            <p className="text-xs text-blue-600 uppercase font-bold tracking-wider">{key.replace(/_/g, ' ')}</p>
                            <p className="font-semibold text-gray-900 mt-2 break-words text-sm">
                              {value ? String(value) : <span className="text-gray-400 italic">—</span>}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Submission Details */}
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6 space-y-4 border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-lg text-gray-900 mb-4">Submission Details</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-colors">
                        <p className="text-xs text-gray-600 uppercase font-bold tracking-wider">Document Type</p>
                        <p className="font-semibold text-gray-900 mt-2 text-sm">
                          {submission?.submission_type || 'Form 44'}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-colors">
                        <p className="text-xs text-gray-600 uppercase font-bold tracking-wider">Elapsed Time</p>
                        <p className="font-semibold text-gray-900 mt-2 text-sm">
                          {submission?.processing_duration
                            ? `${submission.processing_duration.toFixed(1)}s`
                            : 'Calculating...'}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-colors">
                        <p className="text-xs text-gray-600 uppercase font-bold tracking-wider">Status</p>
                        <p className="font-semibold text-gray-900 mt-2 text-sm capitalize">
                          {submission?.status?.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-colors">
                        <p className="text-xs text-gray-600 uppercase font-bold tracking-wider">Uploaded</p>
                        <p className="font-semibold text-gray-900 mt-2 text-sm">
                          {new Date(submission?.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Error Message */}
                  {submission?.status === 'failed' && submission?.error_message && (
                    <div className="bg-gradient-to-r from-red-50 to-red-100 border-2 border-red-300 rounded-xl p-6 flex items-start space-x-4 shadow-md">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mt-0.5">
                        <AlertCircle className="w-6 h-6 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-red-900 text-lg">Processing Failed</h3>
                        <p className="text-sm text-red-800 mt-2 leading-relaxed">{submission.error_message}</p>
                        <button
                          onClick={() => navigate('/')}
                          className="mt-4 inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold text-sm"
                        >
                          <span>Try Again</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="card-footer flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-100 border-t-2 border-gray-200">
                  <button
                    onClick={fetchStatus}
                    className="inline-flex items-center space-x-2 px-5 py-2.5 bg-white text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-semibold shadow-sm hover:shadow-md"
                  >
                    <RotateCw className="w-4 h-4" />
                    <span>Refresh Status</span>
                  </button>

                  {submission?.status === 'completed' && (
                    <button
                      onClick={() => navigate(`/submission/${id}/results`)}
                      className="inline-flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 font-bold shadow-md hover:shadow-lg"
                    >
                      <span>View Results</span>
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  )}

                  {submission?.status === 'failed' && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => navigate('/')}
                        className="inline-flex items-center space-x-2 px-5 py-2.5 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition-all duration-200 font-semibold"
                      >
                        <span>Go Back</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Auto-refresh Status */}
              <div className="mt-6 text-center p-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm">
                {autoRefresh && submission?.status !== 'completed' && submission?.status !== 'failed' ? (
                  <p className="text-sm font-semibold text-blue-700 flex items-center justify-center space-x-2">
                    <span className="w-2 h-2 bg-blue-600 rounded-full inline-block animate-pulse"></span>
                    <span>📡 Auto-refreshing every 2 seconds...</span>
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-gray-600">Status updates paused. Click refresh to update.</p>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
