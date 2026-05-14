import type { AIAssessment, AnalyzeResponse, AIStats } from '../types';

const API_BASE_URL = 'http://localhost:5000/api';

export const analyzeSymptoms = async (
  message: string,
  sessionId: string,
  userId: number,
  imageData?: string | null,       // base64 data URL (optional)
  imageMimeType?: string | null    // e.g. 'image/jpeg'
): Promise<AnalyzeResponse> => {
  const response = await fetch(`${API_BASE_URL}/symcheck/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      sessionId,
      userId,
      ...(imageData ? { imageData, imageMimeType: imageMimeType ?? 'image/jpeg' } : {}),
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to analyze symptoms');
  }
  return response.json();
};

export const fetchAssessmentHistory = async (userId: number): Promise<AIAssessment[]> => {
  const response = await fetch(`${API_BASE_URL}/symcheck/history?userId=${userId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch assessment history');
  }
  return response.json();
};

export const fetchAssessment = async (id: number, userId: number): Promise<AIAssessment> => {
  const response = await fetch(`${API_BASE_URL}/symcheck/history/${id}?userId=${userId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch assessment');
  }
  return response.json();
};

export const downloadReport = async (id: number, userId: number): Promise<Blob> => {
  const response = await fetch(`${API_BASE_URL}/symcheck/report/${id}?userId=${userId}`);
  if (!response.ok) {
    throw new Error('Failed to download report');
  }
  return response.blob();
};

export const fetchAIStats = async (userId: number): Promise<AIStats> => {
  const response = await fetch(`${API_BASE_URL}/symcheck/stats?userId=${userId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch AI stats');
  }
  return response.json();
};
