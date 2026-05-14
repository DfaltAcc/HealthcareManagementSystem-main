import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useWebSocket } from './WebSocketContext';
import { useAuth } from './AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CallParticipant {
  id: string;
  name: string;
  role: string;
}

export type CallStatus =
  | 'idle'
  | 'calling'
  | 'incoming'
  | 'connected'
  | 'ended';

interface PendingOffer {
  from: CallParticipant;
  offer: RTCSessionDescriptionInit;
}

interface VideoCallContextType {
  callStatus: CallStatus;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteParticipant: CallParticipant | null;
  isMuted: boolean;
  isCameraOff: boolean;
  initiateCall: (recipient: CallParticipant) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
}

const VideoCallContext = createContext<VideoCallContextType>({
  callStatus: 'idle',
  localStream: null,
  remoteStream: null,
  remoteParticipant: null,
  isMuted: false,
  isCameraOff: false,
  initiateCall: () => {},
  acceptCall: () => {},
  rejectCall: () => {},
  endCall: () => {},
  toggleMute: () => {},
  toggleCamera: () => {},
});

export const useVideoCall = () => useContext(VideoCallContext);

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// ─── Provider ─────────────────────────────────────────────────────────────────

export const VideoCallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket } = useWebSocket();
  const { user } = useAuth();

  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteParticipant, setRemoteParticipant] = useState<CallParticipant | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  // Use a ref for the remote participant ID so ICE handlers always have the latest value
  const remoteIdRef = useRef<string | null>(null);
  // Store pending offer in a ref — not on the socket object
  const pendingOfferRef = useRef<PendingOffer | null>(null);
  // Buffer ICE candidates that arrive before remote description is set
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSet = useRef(false);

  // ── Register with signalling server whenever socket connects ─────────────
  useEffect(() => {
    if (!socket || !user?.id) return;
    const register = () => {
      socket.emit('video:register', {
        userId: String(user.id),
        name: user.name,
        role: user.role,
      });
    };
    register();
    // Re-register on reconnect
    socket.on('connect', register);
    return () => { socket.off('connect', register); };
  }, [socket, user?.id, user?.name, user?.role]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.onicecandidate = null;
      peerRef.current.ontrack = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteParticipant(null);
    setIsMuted(false);
    setIsCameraOff(false);
    remoteIdRef.current = null;
    pendingOfferRef.current = null;
    pendingCandidates.current = [];
    remoteDescSet.current = false;
  }, []);

  // ── Build RTCPeerConnection ───────────────────────────────────────────────
  // targetId is passed explicitly so we never rely on stale state
  const buildPeer = useCallback((stream: MediaStream, targetId: string): RTCPeerConnection => {
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    stream.getTracks().forEach(track => peer.addTrack(track, stream));

    peer.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit('video:ice-candidate', {
          candidate: e.candidate.toJSON(),
          to: targetId,
        });
      }
    };

    peer.ontrack = (e) => {
      if (e.streams && e.streams[0]) {
        setRemoteStream(e.streams[0]);
      }
    };

    peer.onconnectionstatechange = () => {
      if (
        peer.connectionState === 'disconnected' ||
        peer.connectionState === 'failed' ||
        peer.connectionState === 'closed'
      ) {
        setCallStatus('ended');
        cleanup();
        setTimeout(() => setCallStatus('idle'), 1500);
      }
    };

    return peer;
  }, [socket, cleanup]);

  // ── Get camera + mic ──────────────────────────────────────────────────────
  const getLocalMedia = useCallback(async (): Promise<MediaStream> => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  // ── Initiate outgoing call ────────────────────────────────────────────────
  const initiateCall = useCallback(async (recipient: CallParticipant) => {
    if (!socket || !user) return;
    try {
      const stream = await getLocalMedia();

      // Set both state and ref before building peer
      setRemoteParticipant(recipient);
      remoteIdRef.current = recipient.id;
      setCallStatus('calling');

      const peer = buildPeer(stream, recipient.id);
      peerRef.current = peer;

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      socket.emit('video:call', {
        to: recipient.id,
        from: { id: String(user.id), name: user.name, role: user.role },
        offer: peer.localDescription,
      });
    } catch (err) {
      console.error('VideoCall: initiateCall failed', err);
      cleanup();
      setCallStatus('idle');
    }
  }, [socket, user, getLocalMedia, buildPeer, cleanup]);

  // ── Accept incoming call ──────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    const pending = pendingOfferRef.current;
    if (!socket || !user || !pending) return;

    try {
      const stream = await getLocalMedia();

      // Set both state and ref before building peer
      setRemoteParticipant(pending.from);
      remoteIdRef.current = pending.from.id;

      const peer = buildPeer(stream, pending.from.id);
      peerRef.current = peer;

      await peer.setRemoteDescription(new RTCSessionDescription(pending.offer));
      remoteDescSet.current = true;

      // Flush any ICE candidates that arrived before we set remote description
      for (const c of pendingCandidates.current) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(c));
        } catch (e) {
          console.warn('VideoCall: buffered ICE candidate error', e);
        }
      }
      pendingCandidates.current = [];

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit('video:answer', {
        to: pending.from.id,
        answer: peer.localDescription,
      });

      pendingOfferRef.current = null;
      setCallStatus('connected');
    } catch (err) {
      console.error('VideoCall: acceptCall failed', err);
      cleanup();
      setCallStatus('idle');
    }
  }, [socket, user, getLocalMedia, buildPeer, cleanup]);

  // ── Reject incoming call ──────────────────────────────────────────────────
  const rejectCall = useCallback(() => {
    const pending = pendingOfferRef.current;
    if (socket && pending) {
      socket.emit('video:reject', { to: pending.from.id });
    }
    pendingOfferRef.current = null;
    cleanup();
    setCallStatus('idle');
  }, [socket, cleanup]);

  // ── End active call ───────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    if (socket && remoteIdRef.current) {
      socket.emit('video:end', { to: remoteIdRef.current });
    }
    cleanup();
    setCallStatus('ended');
    setTimeout(() => setCallStatus('idle'), 1500);
  }, [socket, cleanup]);

  // ── Toggle mute ───────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    if (audioTracks.length === 0) return;
    // enabled=true means currently unmuted → we want to mute → set enabled=false
    const currentlyEnabled = audioTracks[0].enabled;
    audioTracks.forEach(t => { t.enabled = !currentlyEnabled; });
    setIsMuted(currentlyEnabled); // if was enabled, now muted = true
  }, []);

  // ── Toggle camera ─────────────────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTracks = localStreamRef.current.getVideoTracks();
    if (videoTracks.length === 0) return;
    const currentlyEnabled = videoTracks[0].enabled;
    videoTracks.forEach(t => { t.enabled = !currentlyEnabled; });
    setIsCameraOff(currentlyEnabled); // if was enabled, now camera off = true
  }, []);

  // ── Socket event listeners ────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onIncomingCall = (data: { from: CallParticipant; offer: RTCSessionDescriptionInit }) => {
      pendingOfferRef.current = data;
      setRemoteParticipant(data.from);
      remoteIdRef.current = data.from.id;
      setCallStatus('incoming');
    };

    const onCallAnswered = async (data: { answer: RTCSessionDescriptionInit }) => {
      const peer = peerRef.current;
      if (!peer) {
        console.error('VideoCall: onCallAnswered — peerRef is null, cannot set remote description');
        return;
      }
      try {
        if (peer.signalingState !== 'have-local-offer') {
          console.warn('VideoCall: onCallAnswered — unexpected signalingState:', peer.signalingState);
          return;
        }
        await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
        remoteDescSet.current = true;
        setCallStatus('connected');

        for (const c of pendingCandidates.current) {
          try {
            await peer.addIceCandidate(new RTCIceCandidate(c));
          } catch (e) {
            console.warn('VideoCall: buffered ICE candidate error', e);
          }
        }
        pendingCandidates.current = [];
      } catch (err) {
        console.error('VideoCall: onCallAnswered failed', err);
      }
    };

    const onIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
      if (!data.candidate) return;
      if (!peerRef.current || !remoteDescSet.current) {
        pendingCandidates.current.push(data.candidate);
        return;
      }
      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.warn('VideoCall: ICE candidate error', e);
      }
    };

    const onCallRejected = () => {
      cleanup();
      setCallStatus('ended');
      setTimeout(() => setCallStatus('idle'), 1500);
    };

    const onCallFailed = (data: { reason: string }) => {
      console.warn('VideoCall: call failed —', data.reason);
      cleanup();
      setCallStatus('ended');
      setTimeout(() => setCallStatus('idle'), 1500);
    };

    const onCallEnded = () => {
      cleanup();
      setCallStatus('ended');
      setTimeout(() => setCallStatus('idle'), 1500);
    };

    socket.on('video:incoming-call', onIncomingCall);
    socket.on('video:call-answered', onCallAnswered);
    socket.on('video:ice-candidate', onIceCandidate);
    socket.on('video:call-rejected', onCallRejected);
    socket.on('video:call-ended', onCallEnded);
    socket.on('video:call-failed', onCallFailed);

    return () => {
      socket.off('video:incoming-call', onIncomingCall);
      socket.off('video:call-answered', onCallAnswered);
      socket.off('video:ice-candidate', onIceCandidate);
      socket.off('video:call-rejected', onCallRejected);
      socket.off('video:call-ended', onCallEnded);
      socket.off('video:call-failed', onCallFailed);
    };
  }, [socket, cleanup]);

  return (
    <VideoCallContext.Provider value={{
      callStatus,
      localStream,
      remoteStream,
      remoteParticipant,
      isMuted,
      isCameraOff,
      initiateCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
      toggleCamera,
    }}>
      {children}
    </VideoCallContext.Provider>
  );
};
