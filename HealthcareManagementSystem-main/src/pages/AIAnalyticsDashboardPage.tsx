import React, { useState, useEffect } from 'react';
import { BarChart2, Brain, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import Navbar from '../components/layout/Navbar';
import Sidebar from '../components/layout/Sidebar';
import StatsCard from '../components/dashboard/StatsCard';
import { useAuth } from '../context/AuthContext';
import { fetchAIStats } from '../api/symcheckApi';
import type { AIStats } from '../types';

const AIAnalyticsDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<AIStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      if (!user?.id) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchAIStats(Number(user.id));
        setStats(data);
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load AI analytics data.');
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, [user?.id]);

  const hasData = stats !== null && stats.totalAssessments > 0;

  const urgencyPieData = [
    { name: 'Emergency', value: stats?.urgencyCounts.EMERGENCY ?? 0 },
    { name: 'Urgent', value: stats?.urgencyCounts.URGENT ?? 0 },
    { name: 'Non-Urgent', value: stats?.urgencyCounts.NON_URGENT ?? 0 },
  ];

  const PIE_COLORS = ['#dc2626', '#d97706', '#16a34a'];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="flex">
        <Sidebar />

        <main className="flex-1 overflow-y-auto">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">

              {/* Page header */}
              <div className="flex items-center gap-3">
                <BarChart2 className="h-8 w-8 text-blue-600" />
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">AI Analytics</h1>
                  <p className="text-gray-600 mt-1">
                    Monitor AI symptom checker usage and trends.
                  </p>
                </div>
              </div>

              {/* Error banner */}
              {error && (
                <div className="mt-6 flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Loading state */}
              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
                </div>
              ) : (
                <>
                  {/* Stats row */}
                  <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    <StatsCard
                      title="Total Assessments"
                      value={stats?.totalAssessments ?? 0}
                      icon={<Brain className="h-6 w-6" />}
                      color="blue"
                    />
                    <StatsCard
                      title="Emergency"
                      value={stats?.urgencyCounts.EMERGENCY ?? 0}
                      icon={<AlertTriangle className="h-6 w-6" />}
                      color="red"
                    />
                    <StatsCard
                      title="Urgent"
                      value={stats?.urgencyCounts.URGENT ?? 0}
                      icon={<Clock className="h-6 w-6" />}
                      color="amber"
                    />
                    <StatsCard
                      title="Non-Urgent"
                      value={stats?.urgencyCounts.NON_URGENT ?? 0}
                      icon={<CheckCircle className="h-6 w-6" />}
                      color="green"
                    />
                  </div>

                  {/* Charts row */}
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 mt-8">

                    {/* Urgency Breakdown chart */}
                    <div className="bg-white rounded-xl shadow-md overflow-hidden p-6">
                      <h2 className="text-base font-semibold text-gray-900 mb-4">
                        Urgency Breakdown
                      </h2>
                      {hasData ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={urgencyPieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={100}
                              dataKey="value"
                            >
                              {urgencyPieData.map((_entry, index) => (
                                <Cell key={`cell-${index}`} fill={PIE_COLORS[index]} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                          No data available
                        </div>
                      )}
                    </div>

                    {/* Confidence Trend chart */}
                    <div className="bg-white rounded-xl shadow-md overflow-hidden p-6">
                      <h2 className="text-base font-semibold text-gray-900 mb-4">
                        Confidence Trend
                      </h2>
                      {hasData ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={stats!.confidenceTrend}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                            <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                            <Line
                              type="monotone"
                              dataKey="confidence"
                              stroke="#2563eb"
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                          No data available
                        </div>
                      )}
                    </div>

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

export default AIAnalyticsDashboardPage;
