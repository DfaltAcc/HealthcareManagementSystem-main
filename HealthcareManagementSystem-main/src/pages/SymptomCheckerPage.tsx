import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Brain, Send, RefreshCw, AlertTriangle, CheckCircle, Plus, Paperclip, X, Image } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Sidebar from '../components/layout/Sidebar';
import { useAuth } from '../context/AuthContext';
import { analyzeSymptoms } from '../api/symcheckApi';
import type { AnalyzeResponse, EmergencyResponse } from '../types';

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
    <span className={`inline-flex px-2 text-xs leading-5 font-semibold rounded-full ${cls}`}>
      {urgency}
    </span>
  );
};

// ─── Sub-component: TypingIndicator ─────────────────────────────────────────

const TypingIndicator: React.FC = () => (
  <div className="flex items-center space-x-1 px-4 py-3">
    <span className="text-xs text-gray-500 mr-2">AI is thinking</span>
    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
  </div>
);

// ─── Sub-component: AssessmentCard ──────────────────────────────────────────

interface AssessmentResult {
  diagnosis: string;
  urgency: string;
  confidence: number;
  homeRemedies: string[];
  recommendedActions: string[];
  assessmentId?: number;
}

interface AssessmentCardProps {
  assessment: AssessmentResult;
  onSave: () => void;
  isSaved: boolean;
}

const AssessmentCard: React.FC<AssessmentCardProps> = ({ assessment, onSave, isSaved }) => (
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-2 max-w-lg">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-gray-900">AI Assessment</h3>
      <UrgencyBadge urgency={assessment.urgency} />
    </div>

    <div className="mb-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Diagnosis</p>
      <p className="text-sm text-gray-800">{assessment.diagnosis}</p>
    </div>

    <div className="mb-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
        Confidence: {assessment.confidence}%
      </p>
      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div
          className="bg-blue-600 h-1.5 rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, assessment.confidence))}%` }}
        />
      </div>
    </div>

    {assessment.homeRemedies.length > 0 && (
      <div className="mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Home Care</p>
        <ul className="list-disc list-inside space-y-0.5">
          {assessment.homeRemedies.map((remedy, i) => (
            <li key={i} className="text-sm text-gray-700">{remedy}</li>
          ))}
        </ul>
      </div>
    )}

    {assessment.recommendedActions.length > 0 && (
      <div className="mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
          Recommended Actions
        </p>
        <ul className="list-disc list-inside space-y-0.5">
          {assessment.recommendedActions.map((action, i) => (
            <li key={i} className="text-sm text-gray-700">{action}</li>
          ))}
        </ul>
      </div>
    )}

    {/* Disclaimer — always shown */}
    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-3">
      ⚠ NOT MEDICAL ADVICE — FOR INFORMATIONAL PURPOSES ONLY. Always consult a healthcare
      professional for medical concerns.
    </p>

    {/* Save button */}
    <div className="mt-3">
      {isSaved ? (
        <span className="inline-flex items-center text-xs text-green-700">
          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Assessment saved
        </span>
      ) : (
        <button
          onClick={onSave}
          className="text-xs text-blue-600 hover:text-blue-800 underline"
        >
          Save Assessment
        </button>
      )}
    </div>
  </div>
);

// ─── Sub-component: EmergencyModal ──────────────────────────────────────────

interface EmergencyModalProps {
  emergencyData: EmergencyResponse;
  onAcknowledge: () => void;
}

const EmergencyModal: React.FC<EmergencyModalProps> = ({ emergencyData, onAcknowledge }) => (
  <div className="fixed inset-0 z-50 bg-red-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border-2 border-red-500 overflow-hidden">
      {/* Header */}
      <div className="bg-red-600 px-6 py-4 flex items-center space-x-3">
        <AlertTriangle className="w-7 h-7 text-white flex-shrink-0" />
        <div>
          <h2 className="text-lg font-bold text-white">MEDICAL EMERGENCY DETECTED</h2>
          <UrgencyBadge urgency="EMERGENCY" />
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5">
        <p className="text-base font-semibold text-red-800 mb-4">{emergencyData.diagnosis}</p>

        <p className="text-sm font-medium text-gray-700 mb-2">Immediate actions required:</p>
        <ul className="space-y-2 mb-5">
          {emergencyData.actions.map((action, i) => (
            <li key={i} className="flex items-start space-x-2">
              <span className="flex-shrink-0 w-5 h-5 bg-red-100 text-red-700 rounded-full flex items-center justify-center text-xs font-bold">
                {i + 1}
              </span>
              <span className="text-sm text-gray-800 font-medium">{action}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={onAcknowledge}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
        >
          I Understand — Call 911
        </button>
      </div>
    </div>
  </div>
);

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  content: string;
  timestamp: Date;
  imageUrl?: string;        // base64 data URL of attached image
  isAssessment?: boolean;
  assessment?: AssessmentResult;
  isError?: boolean;
  errorType?: '503' | '504' | 'network';
  retryPayload?: string;
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const SymptomCheckerPage: React.FC = () => {
  const { user } = useAuth();

  const WELCOME_MESSAGE: ChatMessage = {
    id: 'welcome',
    role: 'bot',
    content: "Hello! Describe your symptoms and I'll help assess them.\n\nNOT MEDICAL ADVICE. Always consult a doctor.",
    timestamp: new Date(),
  };

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyData, setEmergencyData] = useState<EmergencyResponse | null>(null);
  const [savedAssessmentId, setSavedAssessmentId] = useState<number | null>(null);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedImageName, setAttachedImageName] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const addMessage = (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages(prev => [
      ...prev,
      { ...msg, id: crypto.randomUUID(), timestamp: new Date() },
    ]);
  };

  // ── Handle image attachment ───────────────────────────────────────────────
  const handleImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }
    if (file.size > 5_000_000) {
      alert('Image must be under 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAttachedImage(ev.target?.result as string);
      setAttachedImageName(file.name);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const removeAttachedImage = () => {
    setAttachedImage(null);
    setAttachedImageName('');
  };

  const handleSubmit = useCallback(
    async (messageText?: string) => {
      const text = (messageText ?? inputText).trim();
      if (!text && !attachedImage || isLoading) return;

      const imageToSend = attachedImage;
      const displayText = text || '(Image attached)';

      // Clear input and attachment
      if (!messageText) {
        setInputText('');
        setAttachedImage(null);
        setAttachedImageName('');
      }

      // Append user message with optional image
      addMessage({ role: 'user', content: displayText, imageUrl: imageToSend ?? undefined });
      setIsLoading(true);

      // Build the text sent to AI — append image note so AI knows an image was shared
      const aiText = imageToSend
        ? `${displayText}\n\n[Patient has attached an image for reference. Please consider this in your assessment.]`
        : displayText;

      try {
        const response: AnalyzeResponse = await analyzeSymptoms(
          aiText,
          sessionId,
          Number(user?.id ?? 0),
          imageToSend,
          imageToSend ? imageToSend.split(';')[0].split(':')[1] : null
        );

        // Emergency path
        if (response.is_emergency && response.emergency_data) {
          setEmergencyData(response.emergency_data);
          setShowEmergencyModal(true);
          // Record the assessment id if returned
          if ((response as any).assessment_id) {
            setSavedAssessmentId((response as any).assessment_id);
          }
          setIsLoading(false);
          return;
        }

        // Assessment ready path
        if (response.assessment_ready) {
          const assessmentResult: AssessmentResult = {
            diagnosis: response.response,
            urgency: response.urgency || 'NON-URGENT',
            confidence: response.confidence ?? 0,
            homeRemedies: (response as any).home_remedies ?? [],
            recommendedActions: (response as any).recommended_actions ?? [],
            assessmentId: (response as any).assessment_id,
          };
          addMessage({
            role: 'bot',
            content: response.response,
            isAssessment: true,
            assessment: assessmentResult,
          });
        } else {
          // Follow-up question path
          addMessage({ role: 'bot', content: response.response });
        }
      } catch (err: any) {
        const status: string = err?.status ?? '';
        let errorType: ChatMessage['errorType'] = 'network';
        let errorContent = 'Unable to connect to the server. Please check your connection and try again.';

        if (status === 503 || err?.message?.includes('503')) {
          errorType = '503';
          errorContent =
            'The AI service is currently unavailable. Please try again in a moment.';
        } else if (status === 504 || err?.message?.includes('504')) {
          errorType = '504';
          errorContent = 'The AI took too long to respond. Please try again.';
        }

        addMessage({
          role: 'bot',
          content: errorContent,
          isError: true,
          errorType,
          retryPayload: displayText,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [inputText, attachedImage, isLoading, sessionId, user?.id]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleStartNewChat = () => {
    setMessages([WELCOME_MESSAGE]);
    setSessionId(crypto.randomUUID());
    setSavedAssessmentId(null);
    setInputText('');
    setAttachedImage(null);
    setAttachedImageName('');
    textareaRef.current?.focus();
  };

  const handleAcknowledgeEmergency = () => {
    setShowEmergencyModal(false);
    if (emergencyData) {
      addMessage({
        role: 'bot',
        content: `Emergency alert acknowledged. ${emergencyData.diagnosis}. Please call 911 immediately.`,
        isAssessment: true,
        assessment: {
          diagnosis: emergencyData.diagnosis,
          urgency: 'EMERGENCY',
          confidence: 100,
          homeRemedies: [],
          recommendedActions: emergencyData.actions,
          assessmentId: savedAssessmentId ?? undefined,
        },
      });
    }
  };

  const handleSaveAssessment = (assessmentId?: number) => {
    if (assessmentId != null) {
      setSavedAssessmentId(assessmentId);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="flex">
        <Sidebar />

        <main className="flex-1 overflow-y-auto">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">

              {/* Page header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Brain className="h-8 w-8 text-blue-600" />
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900">Symptom Checker</h1>
                    <p className="text-gray-600 mt-1">
                      Describe your symptoms and receive an AI-powered assessment.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleStartNewChat}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Start New Chat
                </button>
              </div>

              {/* Disclaimer banner */}
              <div className="mb-5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  <strong>NOT MEDICAL ADVICE — FOR INFORMATIONAL PURPOSES ONLY.</strong> This tool
                  does not replace professional medical advice, diagnosis, or treatment. Always
                  consult a qualified healthcare provider for medical concerns.
                </p>
              </div>

              {/* Chat container */}
              <div className="bg-white rounded-xl shadow-md overflow-hidden">

                {/* Message thread */}
                <div className="h-[480px] overflow-y-auto px-4 py-4 flex flex-col space-y-3">
                  {messages.map(msg => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'user' ? (
                        /* User bubble */
                        <div className="max-w-sm lg:max-w-md">
                          <div className="bg-blue-600 text-white text-sm rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm">
                            {msg.imageUrl && (
                              <img
                                src={msg.imageUrl}
                                alt="Attached"
                                className="rounded-lg mb-2 max-h-48 w-full object-cover cursor-pointer"
                                onClick={() => window.open(msg.imageUrl, '_blank')}
                              />
                            )}
                            {msg.content !== '(Image attached)' && msg.content}
                          </div>
                          <p className="text-xs text-gray-400 mt-1 text-right">
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      ) : msg.isError ? (
                        /* Error bubble with Retry */
                        <div className="max-w-sm lg:max-w-md">
                          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
                            <p>{msg.content}</p>
                            {msg.retryPayload && (
                              <button
                                onClick={() => handleSubmit(msg.retryPayload)}
                                className="mt-2 inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium underline"
                              >
                                <RefreshCw className="w-3 h-3" /> Retry
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      ) : msg.isAssessment && msg.assessment ? (
                        /* Assessment card */
                        <div className="max-w-lg w-full">
                          <AssessmentCard
                            assessment={msg.assessment}
                            onSave={() => handleSaveAssessment(msg.assessment?.assessmentId)}
                            isSaved={
                              savedAssessmentId != null &&
                              savedAssessmentId === msg.assessment.assessmentId
                            }
                          />
                          <p className="text-xs text-gray-400 mt-1">
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      ) : (
                        /* Bot bubble */
                        <div className="max-w-sm lg:max-w-md">
                          <div className="bg-gray-100 text-gray-800 text-sm rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
                            {msg.content}
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Typing indicator */}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 rounded-2xl rounded-tl-sm shadow-sm">
                        <TypingIndicator />
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
                  {/* Image preview strip */}
                  {attachedImage && (
                    <div className="mb-2 flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                      <Image className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <img
                        src={attachedImage}
                        alt="Attached"
                        className="h-10 w-10 rounded object-cover flex-shrink-0"
                      />
                      <span className="text-xs text-gray-600 truncate flex-1">{attachedImageName}</span>
                      <button
                        onClick={removeAttachedImage}
                        className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors"
                        title="Remove image"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    {/* Paperclip / attach button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isLoading}
                      title="Attach an image"
                      className="flex-shrink-0 p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageAttach}
                    />

                    <textarea
                      ref={textareaRef}
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Describe your symptoms… (Press Enter to send, Shift+Enter for new line)"
                      rows={2}
                      disabled={isLoading}
                      className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-100"
                    />
                    <button
                      onClick={() => handleSubmit()}
                      disabled={isLoading || (!inputText.trim() && !attachedImage)}
                      className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg p-2.5 transition-colors"
                      aria-label="Send message"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </main>
      </div>

      {/* Emergency modal — rendered outside the scroll container */}
      {showEmergencyModal && emergencyData && (
        <EmergencyModal
          emergencyData={emergencyData}
          onAcknowledge={handleAcknowledgeEmergency}
        />
      )}
    </div>
  );
};

export default SymptomCheckerPage;
