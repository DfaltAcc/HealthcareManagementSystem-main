import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, X, AlertCircle } from 'lucide-react';
import { useWebSocket } from './WebSocketContext';
import { useAuth } from './AuthContext';
import type { Message } from '../api/messagesApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MessageNotificationContextType {
  unreadCount: number;
  markAllRead: () => void;
}

const MessageNotificationContext = createContext<MessageNotificationContextType>({
  unreadCount: 0,
  markAllRead: () => {},
});

export const useMessageNotifications = () => useContext(MessageNotificationContext);

// ─── Helper: mark a single message as read in the DB ─────────────────────────

const markMessageReadInDB = async (messageId: string | number) => {
  try {
    await fetch(`http://localhost:5000/api/messages/${messageId}/read`, {
      method: 'PATCH',
    });
  } catch {
    // Non-critical — badge will still clear locally
  }
};

// ─── Helper: mark all unread messages as read in the DB ──────────────────────

const markAllMessagesReadInDB = async (userId: string | number) => {
  try {
    const res = await fetch(`http://localhost:5000/api/messages`);
    if (!res.ok) return;
    const msgs: Message[] = await res.json();
    const unread = msgs.filter(
      m => String(m.receiverId) === String(userId) && !m.is_read
    );
    await Promise.all(unread.map(m => markMessageReadInDB(m.id)));
  } catch {
    // Non-critical
  }
};

// ─── Toast component ──────────────────────────────────────────────────────────

interface ToastProps {
  message: Message & { senderName?: string };
  onDismiss: () => void;           // just close — message stays unread
  onView: () => void;              // mark read + navigate
}

const MessageToast: React.FC<ToastProps> = ({ message, onDismiss, onView }) => {
  const isUrgent = message.priority === 'urgent';

  // Auto-dismiss after 6 s (does NOT mark as read)
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className={`w-80 bg-white rounded-xl shadow-xl border-l-4 overflow-hidden
        ${isUrgent ? 'border-l-red-500' : 'border-l-blue-500'}`}
      style={{ animation: 'slideInRight 0.3s ease-out forwards' }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center
            ${isUrgent ? 'bg-red-100' : 'bg-blue-100'}`}>
            {isUrgent
              ? <AlertCircle className="w-5 h-5 text-red-600" />
              : <MessageSquare className="w-5 h-5 text-blue-600" />
            }
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {message.senderName ?? 'New message'}
              </p>
              {isUrgent && (
                <span className="flex-shrink-0 px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                  Urgent
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-gray-700 truncate">{message.subject}</p>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{message.content}</p>
          </div>

          {/* Close — dismiss only, does NOT mark as read */}
          <button
            onClick={onDismiss}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          {/* View — marks as read */}
          <button
            onClick={onView}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg text-white transition-colors
              ${isUrgent ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            View &amp; Mark Read
          </button>
          {/* Dismiss — keeps unread */}
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* Auto-dismiss progress bar */}
      <div className={`h-0.5 ${isUrgent ? 'bg-red-100' : 'bg-blue-100'}`}>
        <div
          className={`h-full ${isUrgent ? 'bg-red-500' : 'bg-blue-500'}`}
          style={{ animation: 'shrink 6s linear forwards' }}
        />
      </div>
    </div>
  );
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export const MessageNotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket } = useWebSocket();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [toasts, setToasts] = useState<(Message & { senderName?: string; toastId: string })[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const shownIds = useRef<Set<string>>(new Set());

  // ── Fetch real unread count from DB on mount / user change ────────────────
  useEffect(() => {
    if (!user?.id) return;
    fetch(`http://localhost:5000/api/messages`)
      .then(r => r.json())
      .then((msgs: Message[]) => {
        const unread = msgs.filter(
          m => String(m.receiverId) === String(user.id) && !m.is_read
        ).length;
        setUnreadCount(unread);
      })
      .catch(() => {});
  }, [user?.id]);

  // ── Remove a toast without marking as read ────────────────────────────────
  const dismissToast = useCallback((toastId: string) => {
    setToasts(prev => prev.filter(t => t.toastId !== toastId));
    // Badge stays — message is still unread
  }, []);

  // ── View a message: mark as read in DB, remove toast, decrement badge ─────
  const viewAndMarkRead = useCallback(async (toastId: string, messageId: string | number) => {
    setToasts(prev => prev.filter(t => t.toastId !== toastId));
    setUnreadCount(prev => Math.max(0, prev - 1));
    await markMessageReadInDB(messageId);
    navigate('/messages');
  }, [navigate]);

  // ── Mark ALL unread as read (called when bell icon is clicked) ────────────
  const markAllRead = useCallback(async () => {
    if (!user?.id || unreadCount === 0) return;
    setUnreadCount(0);
    setToasts([]);
    await markAllMessagesReadInDB(user.id);
  }, [user?.id, unreadCount]);

  // ── Listen for real-time incoming messages ────────────────────────────────
  useEffect(() => {
    if (!socket || !user?.id) return;

    const onNewMessage = (msg: Message & { senderName?: string }) => {
      if (String(msg.receiverId) !== String(user.id)) return;
      if (shownIds.current.has(String(msg.id))) return;
      shownIds.current.add(String(msg.id));

      const toastId = `toast-${msg.id}-${Date.now()}`;
      setToasts(prev => [...prev, { ...msg, toastId }]);
      setUnreadCount(prev => prev + 1);
    };

    socket.on('message:new', onNewMessage);
    return () => { socket.off('message:new', onNewMessage); };
  }, [socket, user?.id]);

  return (
    <MessageNotificationContext.Provider value={{ unreadCount, markAllRead }}>
      {children}

      {/* Toast stack — fixed top-right, below navbar */}
      <div className="fixed top-20 right-4 z-50 flex flex-col gap-3 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.toastId} className="pointer-events-auto">
            <MessageToast
              message={toast}
              onDismiss={() => dismissToast(toast.toastId)}
              onView={() => viewAndMarkRead(toast.toastId, toast.id)}
            />
          </div>
        ))}
      </div>
    </MessageNotificationContext.Provider>
  );
};
