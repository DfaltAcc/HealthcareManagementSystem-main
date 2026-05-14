import React, { useEffect, useRef, useState } from 'react';
import { User, Save, X, Stethoscope, Trash2, Camera, Upload, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Sidebar from '../components/layout/Sidebar';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { useAuth } from '../context/AuthContext';
import ConfirmationModal from '../components/ui/ConfirmationModal';

// ─── Avatar picker modal ──────────────────────────────────────────────────────

interface AvatarPickerProps {
  currentAvatar: string | null;
  userName: string;
  onSave: (dataUrl: string) => Promise<void>;
  onClose: () => void;
}

const AvatarPicker: React.FC<AvatarPickerProps> = ({ currentAvatar, userName, onSave, onClose }) => {
  const [mode, setMode] = useState<'choose' | 'camera'>('choose');
  // preview starts null — user must pick a NEW image before Save is enabled
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Start camera
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      setCameraStream(stream);
      setMode('camera');
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 100);
    } catch {
      setCameraError('Could not access camera. Please allow camera permission and try again.');
    }
  };

  // Stop camera on unmount or mode change
  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach(t => t.stop());
    };
  }, [cameraStream]);

  const stopCamera = () => {
    cameraStream?.getTracks().forEach(t => t.stop());
    setCameraStream(null);
    setMode('choose');
  };

  // Capture photo from webcam
  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const size = 300;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Draw circular crop
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    // Mirror the image (selfie style)
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, size, size);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setPreview(dataUrl);
    stopCamera();
    setMode('choose');
  };

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const img = new Image();
      img.onload = () => {
        // Resize + crop to 300×300 circle
        const canvas = document.createElement('canvas');
        const size = 300;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();

        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);

        setPreview(canvas.toDataURL('image/jpeg', 0.85));
        setMode('choose');
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!preview) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(preview);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save photo. Please try again.');
      setIsSaving(false);
    }
  };

  const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Profile Photo</h2>
          <button onClick={onClose} disabled={isSaving} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Preview — shows new image or current avatar or initials */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-32 h-32 rounded-full overflow-hidden bg-blue-100 flex items-center justify-center border-4 border-blue-50 shadow-md">
              {preview
                ? <img src={preview} alt="New photo preview" className="w-full h-full object-cover" />
                : currentAvatar
                ? <img src={currentAvatar} alt="Current photo" className="w-full h-full object-cover" />
                : <span className="text-blue-600 text-3xl font-semibold">{initials}</span>
              }
            </div>
            {preview && (
              <p className="text-xs text-green-600 font-medium">New photo ready to save</p>
            )}
            {!preview && currentAvatar && (
              <p className="text-xs text-gray-400">Current photo — pick a new one below</p>
            )}
            {!preview && !currentAvatar && (
              <p className="text-xs text-gray-400">No photo yet — pick one below</p>
            )}
          </div>

          {/* Camera mode */}
          {mode === 'camera' && (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-gray-900 aspect-square">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 rounded-full border-2 border-white/60" />
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex gap-2">
                <button onClick={stopCamera}
                  className="flex-1 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button onClick={capturePhoto}
                  className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center gap-2">
                  <Camera className="w-4 h-4" /> Capture
                </button>
              </div>
            </div>
          )}

          {/* Choose mode */}
          {mode === 'choose' && (
            <div className="space-y-3">
              {cameraError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {cameraError}
                </p>
              )}
              {saveError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {saveError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button onClick={startCamera}
                  className="flex flex-col items-center gap-2 py-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors group">
                  <Camera className="w-6 h-6 text-gray-400 group-hover:text-blue-500" />
                  <span className="text-xs font-medium text-gray-500 group-hover:text-blue-600">Take Photo</span>
                </button>

                <button onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center gap-2 py-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors group">
                  <Upload className="w-6 h-6 text-gray-400 group-hover:text-blue-500" />
                  <span className="text-xs font-medium text-gray-500 group-hover:text-blue-600">Upload Photo</span>
                </button>
              </div>

              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

              {preview && (
                <button onClick={() => setPreview(null)}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs text-gray-500 hover:text-red-600 transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" /> Choose a different photo
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} disabled={isSaving}
            className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!preview || isSaving}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {isSaving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Photo</>}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Profile page ─────────────────────────────────────────────────────────────

const ProfilePage: React.FC = () => {
  const { user, updateProfile, deleteProfile, logout } = useAuth();
  const navigate = useNavigate();

  const [lastSavedData, setLastSavedData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    doctorId: user?.doctorId || '',
    idNumber: user?.idNumber || '',
    contactNumber: user?.contactNumber || '',
  });

  const [formData, setFormData] = useState(lastSavedData);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatar ?? null);

  useEffect(() => {
    if (user) {
      const newData = {
        name: user.name || '',
        email: user.email || '',
        doctorId: user.doctorId || '',
        idNumber: user.idNumber || '',
        contactNumber: user.contactNumber || '',
      };
      setLastSavedData(newData);
      setFormData(newData);
      setAvatarUrl(user.avatar ?? null);
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (user) {
        const res = await fetch('http://localhost:5000/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...user,
            name: formData.name,
            email: formData.email,
            doctorId: user.role === 'doctor' ? formData.doctorId : null,
            idNumber: formData.idNumber,
            contactNumber: formData.contactNumber,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          const updatedData = {
            name: data.name || formData.name,
            email: data.email || formData.email,
            doctorId: data.doctorId || formData.doctorId,
            idNumber: data.idNumber || formData.idNumber,
            contactNumber: data.contactNumber || formData.contactNumber,
          };
          setLastSavedData(updatedData);
          updateProfile({ ...user, ...updatedData });
          setIsEditing(false);
        } else if (data.message?.toLowerCase().includes('email')) {
          alert('Update failed: The email address is already in use.');
        } else {
          alert(`Update failed: ${data.message || 'Unknown error'}`);
        }
      }
    } catch {
      alert('Something went wrong while updating your profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAvatar = async (dataUrl: string): Promise<void> => {
    if (!user?.id) return;
    const res = await fetch(`http://localhost:5000/api/profile/${user.id}/avatar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar: dataUrl }),
    });

    // Safely parse response — server might return HTML on unexpected errors
    let data: any = {};
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      if (!res.ok) {
        if (res.status === 413) {
          throw new Error('Image is too large. Please use a smaller image (under 2 MB).');
        }
        throw new Error(`Server error (${res.status}). Make sure the server is running and restarted.`);
      }
    }

    if (res.ok) {
      setAvatarUrl(dataUrl);
      updateProfile({ ...user, avatar: dataUrl });
      setShowAvatarPicker(false);
    } else {
      throw new Error(data.message || `Failed to save photo (${res.status}).`);
    }
  };

  const handleDeleteProfile = async () => {
    try {
      await deleteProfile();
      logout();
      navigate('/');
    } catch {
      console.error('Failed to delete profile');
    }
  };

  const initials = (formData.name || '')
    .split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 2);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="flex">
        <Sidebar />

        <main className="flex-1 p-8">
          <div className="max-w-4xl mx-auto">
            {/* Page header */}
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                {user?.role === 'doctor'
                  ? <Stethoscope className="h-8 w-8 text-blue-600" />
                  : <User className="h-8 w-8 text-blue-600" />
                }
                <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
              </div>
              {!isEditing && (
                <div className="flex gap-2">
                  <Button onClick={() => setIsEditing(true)}>Edit Profile</Button>
                  <Button variant="danger" onClick={() => setShowDeleteModal(true)} leftIcon={<Trash2 className="h-4 w-4" />}>
                    Delete Profile
                  </Button>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="p-6">

                {/* Avatar section — always visible */}
                <div className="flex items-center gap-6 mb-8 pb-6 border-b border-gray-100">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full overflow-hidden bg-blue-100 flex items-center justify-center border-4 border-blue-50 shadow">
                      {avatarUrl
                        ? <img src={avatarUrl} alt={formData.name} className="w-full h-full object-cover" />
                        : <span className="text-blue-600 text-2xl font-semibold">{initials}</span>
                      }
                    </div>
                    {/* Camera overlay button */}
                    <button
                      onClick={() => setShowAvatarPicker(true)}
                      className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Change photo"
                    >
                      <Camera className="w-6 h-6 text-white" />
                    </button>
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {user?.role === 'doctor' ? 'Dr. ' : ''}{formData.name}
                    </h2>
                    <p className="text-gray-500 capitalize text-sm">{user?.role}</p>
                    <button
                      onClick={() => setShowAvatarPicker(true)}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {avatarUrl ? 'Change photo' : 'Add photo'}
                    </button>
                  </div>
                </div>

                {/* Edit form */}
                {isEditing ? (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 gap-6">
                      <Input
                        label="Full Name"
                        value={formData.name}
                        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        required
                      />

                      {user?.role === 'doctor' && (
                        <Input
                          label="Doctor ID"
                          value={formData.doctorId}
                          onChange={e => setFormData(prev => ({ ...prev, doctorId: e.target.value }))}
                          required
                        />
                      )}

                      <Input
                        label="Email"
                        type="email"
                        value={formData.email}
                        onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        required
                      />

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ID Number</label>
                        <div className="flex items-center px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm cursor-not-allowed select-none">
                          {formData.idNumber}
                          <span className="ml-auto text-xs text-gray-400">Cannot be changed</span>
                        </div>
                      </div>

                      <Input
                        label="Contact Number"
                        value={formData.contactNumber}
                        onChange={e => {
                          const value = e.target.value.replace(/\D/g, '');
                          setFormData(prev => ({ ...prev, contactNumber: value }));
                        }}
                        maxLength={10}
                        placeholder="10 digit number"
                        required
                      />
                    </div>

                    <div className="flex justify-end space-x-4">
                      <Button type="button" variant="outline"
                        onClick={() => { setFormData(lastSavedData); setIsEditing(false); }}
                        leftIcon={<X className="h-4 w-4" />}>
                        Cancel
                      </Button>
                      <Button type="submit" isLoading={isSaving} leftIcon={<Save className="h-4 w-4" />}>
                        Save Changes
                      </Button>
                    </div>
                  </form>
                ) : (
                  /* View mode */
                  <div className="grid grid-cols-1 gap-6">
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Full Name</h3>
                      <p className="mt-1 text-sm text-gray-900">{formData.name}</p>
                    </div>
                    {user?.role === 'doctor' && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Doctor ID</h3>
                        <p className="mt-1 text-sm text-gray-900">{formData.doctorId}</p>
                      </div>
                    )}
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Email</h3>
                      <p className="mt-1 text-sm text-gray-900">{formData.email}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">ID Number</h3>
                      <p className="mt-1 text-sm text-gray-900">{formData.idNumber}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Contact Number</h3>
                      <p className="mt-1 text-sm text-gray-900">{formData.contactNumber}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <ConfirmationModal
            isOpen={showDeleteModal}
            onClose={() => setShowDeleteModal(false)}
            onConfirm={handleDeleteProfile}
            title="Delete Profile"
            message="Are you sure you want to permanently delete your profile? This action cannot be undone."
            confirmText="Delete Profile"
            confirmVariant="danger"
          />
        </main>
      </div>

      {/* Avatar picker modal */}
      {showAvatarPicker && (
        <AvatarPicker
          currentAvatar={avatarUrl}
          userName={formData.name}
          onSave={handleSaveAvatar}
          onClose={() => setShowAvatarPicker(false)}
        />
      )}
    </div>
  );
};

export default ProfilePage;
