import React, { useEffect, useState, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useVideoCall } from '../../context/VideoCallContext';
import { useNavigate } from 'react-router-dom';

/**
 * Global overlay — appears anywhere in the app when an incoming call arrives.
 * Fixed bottom-right card with Accept / Decline buttons and a ringing animation.
 */
const IncomingCallOverlay: React.FC = () => {
  const { callStatus, remoteParticipant, acceptCall, rejectCall } = useVideoCall();
  const navigate = useNavigate();
  const [dots, setDots] = useState('');
  const [ring, setRing] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animated ellipsis
  useEffect(() => {
    if (callStatus !== 'incoming') return;
    const id = setInterval(() => setDots(d => (d.length >= 3 ? '' : d + '.')), 500);
    return () => clearInterval(id);
  }, [callStatus]);

  // Pulse ring animation trigger
  useEffect(() => {
    if (callStatus === 'incoming') {
      setRing(true);
      // Simple beep using Web Audio API — no external file needed
      const beep = () => {
        try {
          const ctx = new AudioContext();
          audioCtxRef.current = ctx;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 520;
          osc.type = 'sine';
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.4);
        } catch {
          // Audio not available — silent fallback
        }
      };
      beep();
      ringIntervalRef.current = setInterval(beep, 2000);
    } else {
      setRing(false);
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
      }
      audioCtxRef.current?.close().catch(() => {});
    }
    return () => {
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
    };
  }, [callStatus]);

  if (callStatus !== 'incoming' || !remoteParticipant) return null;

  const callerName = remoteParticipant.role === 'doctor'
    ? `Dr. ${remoteParticipant.name}`
    : remoteParticipant.name;

  const handleAccept = () => {
    acceptCall();
    navigate('/video-call', { replace: true });
  };

  const handleDecline = () => {
    rejectCall();
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
      {/* Pulsing ring behind the card */}
      {ring && (
        <span className="absolute inset-0 rounded-2xl ring-4 ring-blue-400 animate-ping opacity-30 pointer-events-none" />
      )}

      {/* Blue header */}
      <div className="bg-blue-600 px-4 py-3 flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
            <Video className="w-5 h-5 text-white" />
          </div>
          {/* Green online dot */}
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-blue-600 rounded-full" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-blue-200 font-medium uppercase tracking-wide">
            Incoming Video Call
          </p>
          <p className="text-white font-semibold truncate">{callerName}</p>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-4">
        <p className="text-sm text-gray-500 mb-4 text-center">
          {callerName} is calling{dots}
        </p>

        <div className="flex gap-3">
          {/* Decline */}
          <button
            onClick={handleDecline}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-medium text-sm transition-colors border border-red-200"
          >
            <PhoneOff className="w-4 h-4" />
            Decline
          </button>

          {/* Accept */}
          <button
            onClick={handleAccept}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium text-sm transition-colors shadow-sm"
          >
            <Phone className="w-4 h-4" />
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallOverlay;
