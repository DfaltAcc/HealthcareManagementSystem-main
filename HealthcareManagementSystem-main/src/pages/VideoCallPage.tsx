import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff,
  Users, Maximize2, Minimize2, Monitor, MonitorOff,
} from 'lucide-react';
import { useVideoCall } from '../context/VideoCallContext';
import { useAuth } from '../context/AuthContext';

// ─── Video element ────────────────────────────────────────────────────────────

interface VideoElProps {
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  className?: string;
}

const VideoEl: React.FC<VideoElProps> = ({ stream, muted = false, mirror = false, className = '' }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`${className} ${mirror ? 'scale-x-[-1]' : ''}`}
    />
  );
};

// ─── Avatar ───────────────────────────────────────────────────────────────────

const Avatar: React.FC<{ name: string; size?: 'sm' | 'lg' }> = ({ name, size = 'lg' }) => {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div className={`rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0
      ${size === 'lg' ? 'w-28 h-28' : 'w-10 h-10'}`}>
      <span className={`text-white font-semibold ${size === 'lg' ? 'text-3xl' : 'text-sm'}`}>
        {initials}
      </span>
    </div>
  );
};

// ─── Control button ───────────────────────────────────────────────────────────

interface CtrlBtnProps {
  onClick: () => void;
  label: string;
  danger?: boolean;
  active?: boolean;   // highlighted active state (e.g. screen sharing)
  off?: boolean;      // dimmed off state (muted / camera off)
  disabled?: boolean;
  children: React.ReactNode;
}

const CtrlBtn: React.FC<CtrlBtnProps> = ({ onClick, label, danger, active, off, disabled, children }) => (
  <button
    onClick={onClick}
    title={label}
    disabled={disabled}
    className="flex flex-col items-center gap-1.5 group focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
  >
    <span className={`
      w-14 h-14 rounded-full flex items-center justify-center transition-all duration-150
      ${danger
        ? 'bg-red-600 hover:bg-red-500 text-white'
        : active
        ? 'bg-blue-500 hover:bg-blue-400 text-white'
        : off
        ? 'bg-white/20 hover:bg-white/30 text-white'
        : 'bg-white/10 hover:bg-white/20 text-white'}
    `}>
      {children}
    </span>
    <span className="text-xs text-white/60 group-hover:text-white/90 transition-colors select-none">
      {label}
    </span>
  </button>
);

// ─── Main page ────────────────────────────────────────────────────────────────

const VideoCallPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    callStatus, localStream, remoteStream, remoteParticipant,
    isMuted, isCameraOff, endCall, toggleMute, toggleCamera,
    acceptCall, rejectCall,
  } = useVideoCall();

  const [callDuration, setCallDuration]   = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen]   = useState(false);
  const [isSharing, setIsSharing]         = useState(false);
  const [shareStream, setShareStream]     = useState<MediaStream | null>(null);

  const containerRef  = useRef<HTMLDivElement>(null);
  const hideTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Keep a ref to localStream so screen-share restore can access it
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

  const participantName = remoteParticipant
    ? (remoteParticipant.role === 'doctor' ? `Dr. ${remoteParticipant.name}` : remoteParticipant.name)
    : 'Unknown';

  // ── Auto-enter fullscreen when connected ─────────────────────────────────
  useEffect(() => {
    if (callStatus === 'connected' && !document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    }
  }, [callStatus]);

  // ── Exit fullscreen when call ends ────────────────────────────────────────
  useEffect(() => {
    if ((callStatus === 'ended' || callStatus === 'idle') && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, [callStatus]);

  // ── Track fullscreen changes (e.g. user presses Esc) ─────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── Redirect when idle ────────────────────────────────────────────────────
  useEffect(() => {
    if (callStatus === 'idle') {
      const t = setTimeout(() => navigate('/video-conference', { replace: true }), 800);
      return () => clearTimeout(t);
    }
  }, [callStatus, navigate]);

  // ── Call duration timer ───────────────────────────────────────────────────
  useEffect(() => {
    if (callStatus !== 'connected') return;
    const id = setInterval(() => setCallDuration(d => d + 1), 1000);
    return () => clearInterval(id);
  }, [callStatus]);

  // ── Stop screen share when call ends ─────────────────────────────────────
  useEffect(() => {
    if (callStatus !== 'connected' && isSharing) {
      stopScreenShare();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callStatus]);

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ── Auto-hide controls ────────────────────────────────────────────────────
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  useEffect(() => {
    if (callStatus !== 'connected') return;
    showControls();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [callStatus, showControls]);

  // ── Fullscreen toggle ─────────────────────────────────────────────────────
  const toggleFs = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // ── Screen share ──────────────────────────────────────────────────────────
  const startScreenShare = async () => {
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      setShareStream(screen);
      setIsSharing(true);

      // When the user stops sharing via the browser's built-in stop button
      screen.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch (err: any) {
      // User cancelled or permission denied — not an error worth surfacing
      if (err?.name !== 'NotAllowedError') {
        console.error('Screen share failed:', err);
      }
    }
  };

  const stopScreenShare = () => {
    if (shareStream) {
      shareStream.getTracks().forEach(t => t.stop());
      setShareStream(null);
    }
    setIsSharing(false);
  };

  const toggleScreenShare = () => {
    if (isSharing) {
      stopScreenShare();
    } else {
      startScreenShare();
    }
  };

  // ── End call ──────────────────────────────────────────────────────────────
  const handleEndCall = () => {
    if (isSharing) stopScreenShare();
    endCall();
    navigate('/video-conference', { replace: true });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // What to show in the local PiP: screen share takes priority over camera
  const localPipStream = isSharing && shareStream ? shareStream : localStream;
  const localPipMirror = !isSharing; // mirror camera, not screen share

  return (
    <div
      ref={containerRef}
      onMouseMove={callStatus === 'connected' ? showControls : undefined}
      onTouchStart={callStatus === 'connected' ? showControls : undefined}
      className="fixed inset-0 bg-gray-950 flex flex-col overflow-hidden select-none"
      style={{ cursor: callStatus === 'connected' && !controlsVisible ? 'none' : 'default' }}
    >

      {/* ══════════════════════════════════════════════════════════════════
          RINGING — incoming call
      ══════════════════════════════════════════════════════════════════ */}
      {callStatus === 'incoming' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-10 bg-gradient-to-b from-gray-900 to-gray-950">
          <div className="flex flex-col items-center gap-5">
            <div className="relative">
              <Avatar name={participantName} size="lg" />
              <span className="absolute inset-0 rounded-full ring-4 ring-blue-400/40 animate-ping" />
            </div>
            <div className="text-center">
              <p className="text-white text-3xl font-semibold">{participantName}</p>
              <p className="text-gray-400 mt-2">Incoming video call…</p>
            </div>
          </div>
          <div className="flex gap-12">
            <button onClick={() => { rejectCall(); navigate('/video-conference', { replace: true }); }}
              className="flex flex-col items-center gap-3">
              <span className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors">
                <PhoneOff className="w-7 h-7 text-white" />
              </span>
              <span className="text-gray-400 text-sm">Decline</span>
            </button>
            <button onClick={acceptCall} className="flex flex-col items-center gap-3">
              <span className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-500 flex items-center justify-center transition-colors shadow-lg shadow-green-900/50">
                <Video className="w-7 h-7 text-white" />
              </span>
              <span className="text-gray-400 text-sm">Accept</span>
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          CALLING — waiting for answer
      ══════════════════════════════════════════════════════════════════ */}
      {callStatus === 'calling' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-gray-900 to-gray-950">
          {localStream && (
            <div className="w-52 h-40 rounded-2xl overflow-hidden border border-white/10 shadow-xl">
              {isCameraOff
                ? <div className="w-full h-full bg-gray-800 flex items-center justify-center"><Avatar name={user?.name ?? 'You'} size="sm" /></div>
                : <VideoEl stream={localStream} muted mirror className="w-full h-full object-cover" />
              }
            </div>
          )}
          <div className="flex flex-col items-center gap-4">
            <Avatar name={participantName} size="lg" />
            <p className="text-white text-2xl font-semibold">{participantName}</p>
            <p className="text-blue-400 text-sm animate-pulse">Calling…</p>
          </div>
          <button onClick={handleEndCall} className="flex flex-col items-center gap-3 mt-4">
            <span className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors">
              <PhoneOff className="w-6 h-6 text-white" />
            </span>
            <span className="text-gray-400 text-sm">Cancel</span>
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          CONNECTED — Teams-style full-screen
      ══════════════════════════════════════════════════════════════════ */}
      {callStatus === 'connected' && (
        <>
          {/* Remote video fills screen */}
          <div className="absolute inset-0 bg-gray-900">
            {remoteStream
              ? <VideoEl stream={remoteStream} className="w-full h-full object-cover" />
              : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                  <Avatar name={participantName} size="lg" />
                  <p className="text-gray-400 text-sm">Camera off</p>
                </div>
              )
            }
          </div>

          {/* Local PiP — bottom right */}
          <div className="absolute bottom-24 right-5 w-48 h-36 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl z-10 bg-gray-800">
            {(!localPipStream || (isCameraOff && !isSharing))
              ? (
                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                  <Avatar name={user?.name ?? 'You'} size="sm" />
                </div>
              )
              : <VideoEl stream={localPipStream} muted mirror={localPipMirror} className="w-full h-full object-cover" />
            }
            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
              {isSharing ? 'Sharing' : 'You'}
            </div>
          </div>

          {/* Screen share banner */}
          {isSharing && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-blue-600/90 backdrop-blur-sm text-white text-xs font-medium px-4 py-1.5 rounded-full flex items-center gap-2">
              <Monitor className="w-3.5 h-3.5" />
              You are sharing your screen
              <button onClick={stopScreenShare} className="ml-1 underline hover:no-underline">Stop</button>
            </div>
          )}

          {/* Top bar */}
          <div className={`absolute top-0 inset-x-0 z-20 px-6 py-4 flex items-center justify-between
            bg-gradient-to-b from-black/70 to-transparent
            transition-opacity duration-500 ${controlsVisible ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                <Video className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm leading-none">{participantName}</p>
                <p className="text-green-400 text-xs font-mono mt-0.5">{fmt(callDuration)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isMuted && (
                <span className="flex items-center gap-1 bg-red-600/80 text-white text-xs px-2 py-1 rounded-full">
                  <MicOff className="w-3 h-3" /> Muted
                </span>
              )}
              {isCameraOff && (
                <span className="flex items-center gap-1 bg-gray-600/80 text-white text-xs px-2 py-1 rounded-full">
                  <VideoOff className="w-3 h-3" /> Camera off
                </span>
              )}
            </div>
          </div>

          {/* Bottom controls */}
          <div className={`absolute bottom-0 inset-x-0 z-20 pb-8 pt-6
            bg-gradient-to-t from-black/80 to-transparent
            transition-opacity duration-500 ${controlsVisible ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex items-center justify-center gap-5">

              {/* Mute */}
              <CtrlBtn
                onClick={toggleMute}
                off={isMuted}
                label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </CtrlBtn>

              {/* Camera */}
              <CtrlBtn
                onClick={toggleCamera}
                off={isCameraOff}
                label={isCameraOff ? 'Start Video' : 'Stop Video'}
              >
                {isCameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
              </CtrlBtn>

              {/* End call — centre, larger */}
              <button
                onClick={handleEndCall}
                title="End Call"
                className="flex flex-col items-center gap-1.5 group"
              >
                <span className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-all shadow-lg shadow-red-900/50">
                  <PhoneOff className="w-7 h-7 text-white" />
                </span>
                <span className="text-xs text-white/60 group-hover:text-white/90">End Call</span>
              </button>

              {/* Screen share */}
              <CtrlBtn
                onClick={toggleScreenShare}
                active={isSharing}
                label={isSharing ? 'Stop Share' : 'Share Screen'}
              >
                {isSharing ? <MonitorOff className="w-6 h-6" /> : <Monitor className="w-6 h-6" />}
              </CtrlBtn>

              {/* Fullscreen */}
              <CtrlBtn
                onClick={toggleFs}
                label={isFullscreen ? 'Exit Full' : 'Full Screen'}
              >
                {isFullscreen ? <Minimize2 className="w-6 h-6" /> : <Maximize2 className="w-6 h-6" />}
              </CtrlBtn>

            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          CALL ENDED
      ══════════════════════════════════════════════════════════════════ */}
      {callStatus === 'ended' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 bg-gray-950">
          <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center">
            <PhoneOff className="w-10 h-10 text-gray-500" />
          </div>
          <p className="text-white text-2xl font-semibold">Call Ended</p>
          <p className="text-gray-400 text-sm">Duration: {fmt(callDuration)}</p>
          <button
            onClick={() => navigate('/video-conference', { replace: true })}
            className="mt-4 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium text-sm transition-colors"
          >
            Back to Video Conference
          </button>
        </div>
      )}

    </div>
  );
};

export default VideoCallPage;
