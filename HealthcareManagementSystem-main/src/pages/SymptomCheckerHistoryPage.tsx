import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList,
  ArrowLeft,
  FileText,
  AlertTriangle,
  Brain,
  Clock,
  CheckCircle,
  Activity,
} from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Sidebar from '../components/layout/Sidebar';
import StatsCard from '../components/dashboard/StatsCard';
import { useAuth } from '../context/AuthContext';
import { fetchAssessmentHistory, downloadReport } from '../api/symcheckApi';
import type { AIAssessment } from '../types';

// ─── Sub-component: UrgencyBadge ────────────────────────────────────────────

interface UrgencyBadgeProps {
  urgency: 'EMERGENCY' | 'URGENT' | 'NON-URGENT' | string;
}

const UrgencyBadge: React.FC<UrgencyBadgeProps> = ({ urgency }) => {
  const styles: Record<string, string> = {
    EMERGENCY: 'bg-red-100 text-red-800',
    URGENT: 'bg-amber-100 text-amber-800',
    'NON-URGENT': 'bg-green-100 text-green-800',
  };
  const cls = styles[urgency] ?? 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-flex px-2 py-0.5 text-xs leading-5 font-semibold rounded-full ${cls}`}>
      {urgency}
    </span>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────

const SymptomCheckerHistoryPage: React.FC = () => {
  const { user } = useAuth();

  const [assessments, setAssessments] = useState<AIAssessment[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<AIAssessment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch history on mount
  useEffect(() => {
    if (!user?.id) return;
    const loadHistory = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchAssessmentHistory(Number(user.id));
        setAssessments(data);
      } catch {
        setError('Failed to load assessment history. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    loadHistory();
  }, [user?.id]);

  // Derived stats from the patient's own assessments
  const totalAssessments = assessments.length;
  const emergencyCount = assessments.filter(a => a.urgency === 'EMERGENCY').length;
  const urgentCount = assessments.filter(a => a.urgency === 'URGENT').length;
  const nonUrgentCount = assessments.filter(a => a.urgency === 'NON-URGENT').length;

  const formatDate = (dateStr: string): string => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatTime = (dateStr: string): string => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const truncate = (text: string, max = 100): string =>
    text.length <= max ? text : `${text.slice(0, max)}…`;

  const handleDownloadPdf = useCallback(async (assessment: AIAssessment) => {
    if (!user?.id) return;
    setIsDownloading(true);
    try {
      const blob = await downloadReport(assessment.id, Number(user.id));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `symcheck_report_${assessment.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download the report. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  }, [user?.id]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="flex">
        <Sidebar />

        <main className="flex-1 overflow-y-auto">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">

              {/* ── Page header ─────────────────────────────────────────── */}
              <div className="flex items-center gap-3 mb-6">
                <Brain className="h-8 w-8 text-blue-600" />
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">My Assessments</h1>
                  <p className="text-gray-600 mt-1">
                    Your AI symptom checker history and results.
                  </p>
                </div>
              </div>

              {/* ── Error banner ─────────────────────────────────────────── */}
              {error && (
                <div className="mb-5 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* ── Loading ──────────────────────────────────────────────── */}
              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
                </div>
              ) : selectedAssessment ? (
                /* ── Detail View ──────────────────────────────────────── */
                <div className="bg-white shadow sm:rounded-lg overflow-hidden">
                  {/* Detail header */}
                  <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <button
                      onClick={() => setSelectedAssessment(null)}
                      className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to History
                    </button>

                    <button
                      onClick={() => handleDownloadPdf(selectedAssessment)}
                      disabled={isDownloading}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      {isDownloading ? 'Downloading…' : 'Download PDF'}
                    </button>
                  </div>

                  {/* Detail body */}
                  <div className="px-6 py-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-500">
                        {formatDate(selectedAssessment.createdAt)} at{' '}
                        {formatTime(selectedAssessment.createdAt)}
                      </p>
                      <UrgencyBadge urgency={selectedAssessment.urgency} />
                    </div>

                    <div>
                      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Symptoms</h2>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{selectedAssessment.symptoms}</p>
                    </div>

                    <div>
                      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Diagnosis</h2>
                      <p className="text-sm text-gray-800">{selectedAssessment.diagnosis}</p>
                    </div>

                    <div>
                      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Confidence: {selectedAssessment.confidence}%
                      </h2>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(0, selectedAssessment.confidence))}%` }}
                        />
                      </div>
                    </div>

                    {selectedAssessment.homeRemedies?.length > 0 && (
                      <div>
                        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Home Remedies</h2>
                        <ul className="list-disc list-inside space-y-1">
                          {selectedAssessment.homeRemedies.map((remedy, i) => (
                            <li key={i} className="text-sm text-gray-700">{remedy}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedAssessment.recommendedActions?.length > 0 && (
                      <div>
                        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recommended Actions</h2>
                        <ul className="list-disc list-inside space-y-1">
                          {selectedAssessment.recommendedActions.map((action, i) => (
                            <li key={i} className="text-sm text-gray-700">{action}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
                      ⚠ NOT MEDICAL ADVICE — FOR INFORMATIONAL PURPOSES ONLY. Always consult a
                      healthcare professional for medical concerns.
                    </p>
                  </div>
                </div>
              ) : (
                /* ── List View ────────────────────────────────────────── */
                <>
                  {/* Stats row — mirrors the screenshot cards */}
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                    <StatsCard
                      title="Total Assessments"
                      value={totalAssessments}
                      icon={<Activity className="h-5 w-5" />}
                      description="All time"
                      color="blue"
                    />
                    <StatsCard
                      title="Emergency"
                      value={emergencyCount}
                      icon={<AlertTriangle className="h-5 w-5" />}
                      description="High priority"
                      color="red"
                    />
                    <StatsCard
                      title="Urgent"
                      value={urgentCount}
                      icon={<Clock className="h-5 w-5" />}
                      description="Needs attention"
                      color="amber"
                    />
                    <StatsCard
                      title="Non-Urgent"
                      value={nonUrgentCount}
                      icon={<CheckCircle className="h-5 w-5" />}
                      description="Routine"
                      color="green"
                    />
                  </div>

                  {/* History table */}
                  <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                    <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                      <ClipboardList className="h-5 w-5 text-blue-600" />
                      <h2 className="text-base font-semibold text-gray-900">Medical History</h2>
                    </div>

                    {assessments.length === 0 ? (
                      <div className="px-6 py-16 text-center">
                        <ClipboardList className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                        <p className="text-gray-500 text-sm">No assessments recorded yet.</p>
                        <p className="text-gray-400 text-xs mt-1">
                          Use the Symptom Checker to get your first AI assessment.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Date
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Symptoms
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Diagnosis
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Urgency
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Confidence
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {assessments.map(assessment => (
                              <tr
                                key={assessment.id}
                                className="hover:bg-gray-50 transition-colors cursor-pointer"
                                onClick={() => setSelectedAssessment(assessment)}
                              >
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  <div>{formatDate(assessment.createdAt)}</div>
                                  <div className="text-xs text-gray-400">{formatTime(assessment.createdAt)}</div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                                  {truncate(assessment.symptoms, 80)}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-700 max-w-xs">
                                  {truncate(assessment.diagnosis ?? '', 80)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <UrgencyBadge urgency={assessment.urgency} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                  {assessment.confidence}%
                                </td>
                                <td
                                  className="px-6 py-4 whitespace-nowrap"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => handleDownloadPdf(assessment)}
                                    disabled={isDownloading}
                                    title="Download PDF"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-md transition-colors"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                    PDF
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}

            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default SymptomCheckerHistoryPage;
