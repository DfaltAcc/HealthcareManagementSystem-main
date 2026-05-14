import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Phone, Search, Users, Wifi, WifiOff } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Sidebar from '../components/layout/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useVideoCall } from '../context/VideoCallContext';
import { useWebSocket } from '../context/WebSocketContext';
import { getUsersByRole } from '../api/usersApi';
import type { User } from '../api/usersApi';

const VideoConferencePage: React.FC = () => {
  const { user } = useAuth();
  const { isConnected } = useWebSocket();
  const { callStatus, initiateCall } = useVideoCall();
  const navigate = useNavigate();

  const [contacts, setContacts] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Redirect to call page if a call is active — replace so back button doesn't loop
  useEffect(() => {
    if (callStatus === 'connected' || callStatus === 'calling' || callStatus === 'incoming') {
      navigate('/video-call', { replace: true });
    }
  }, [callStatus, navigate]);

  // Load contacts based on role
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        let users: User[] = [];
        if (user.role === 'patient') {
          users = await getUsersByRole('doctor');
        } else if (user.role === 'doctor') {
          const [patients, doctors] = await Promise.all([
            getUsersByRole('patient'),
            getUsersByRole('doctor'),
          ]);
          // Exclude self
          users = [...patients, ...doctors.filter(d => String(d.id) !== String(user.id))];
        } else if (user.role === 'admin') {
          const [patients, doctors] = await Promise.all([
            getUsersByRole('patient'),
            getUsersByRole('doctor'),
          ]);
          users = [...doctors, ...patients];
        }
        setContacts(users);
      } catch {
        setError('Failed to load contacts. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [user]);

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCall = (contact: User) => {
    initiateCall({ id: String(contact.id), name: contact.name, role: contact.role });
    // Navigation is driven by callStatus change in the useEffect above — do NOT navigate here
  };

  const getRoleLabel = (role: string) => {
    if (role === 'doctor') return 'Doctor';
    if (role === 'patient') return 'Patient';
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const getRoleBadgeStyle = (role: string) => {
    if (role === 'doctor') return 'bg-blue-100 text-blue-700';
    if (role === 'patient') return 'bg-green-100 text-green-700';
    return 'bg-gray-100 text-gray-700';
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="flex">
        <Sidebar />

        <main className="flex-1 overflow-y-auto">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">

              {/* ── Page header ─────────────────────────────────────────── */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Video className="h-8 w-8 text-blue-600" />
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900">Video Conference</h1>
                    <p className="text-gray-600 mt-1">
                      Start a secure video consultation with your {user?.role === 'patient' ? 'doctor' : 'patients or colleagues'}.
                    </p>
                  </div>
                </div>

                {/* Connection status */}
                <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full font-medium ${
                  isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {isConnected
                    ? <><Wifi className="w-3.5 h-3.5" /> Connected</>
                    : <><WifiOff className="w-3.5 h-3.5" /> Disconnected</>
                  }
                </div>
              </div>

              {/* ── Info banner ──────────────────────────────────────────── */}
              <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-3">
                <Video className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <strong>Secure peer-to-peer video.</strong> Your video and audio are transmitted directly between participants — no recording, no third-party servers.
                  {!isConnected && (
                    <span className="block mt-1 text-red-700 font-medium">
                      You are currently offline. Please ensure the HMS server is running to make calls.
                    </span>
                  )}
                </div>
              </div>

              {/* ── Search ───────────────────────────────────────────────── */}
              <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={`Search ${user?.role === 'patient' ? 'doctors' : 'contacts'}…`}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                />
              </div>

              {/* ── Contacts grid ────────────────────────────────────────── */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 mb-4">
                  {error}
                </div>
              )}

              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="bg-white shadow sm:rounded-lg px-6 py-16 text-center">
                  <Users className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                  <p className="text-gray-500 text-sm">
                    {searchTerm ? 'No contacts match your search.' : 'No contacts available.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map(contact => (
                    <div
                      key={contact.id}
                      className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow"
                    >
                      <div className="p-5">
                        <div className="flex items-center gap-4">
                          {/* Avatar */}
                          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-blue-700 font-semibold text-sm">
                              {getInitials(contact.name)}
                            </span>
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {contact.role === 'doctor' ? `Dr. ${contact.name}` : contact.name}
                            </p>
                            <span className={`inline-flex mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeStyle(contact.role)}`}>
                              {getRoleLabel(contact.role)}
                            </span>
                          </div>
                        </div>

                        {/* Call button */}
                        <button
                          onClick={() => handleCall(contact)}
                          disabled={!isConnected || callStatus !== 'idle'}
                          className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          <Phone className="w-4 h-4" />
                          {callStatus !== 'idle' ? 'Call in progress…' : 'Start Video Call'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default VideoConferencePage;
