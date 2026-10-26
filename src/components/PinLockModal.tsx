import React, { useState } from 'react';
import { Lock, Unlock, Shield, UserCheck, AlertCircle } from 'lucide-react';
import type { UserSession } from '../types';
import type { Language } from '../i18n/translations';

interface PinLockModalProps {
  isOpen: boolean;
  onUnlock: (pin: string) => boolean;
  currentUser: UserSession;
  onChangeUser: (user: Partial<UserSession>) => void;
  lang: Language;
}

export const PinLockModal: React.FC<PinLockModalProps> = ({
  isOpen,
  onUnlock,
  currentUser,
  onChangeUser,
  lang,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  if (!isOpen) return null;

  const usersList: { nom: string; role: 'gerant' | 'commercial' | 'caissier' | 'chef_parc'; title: string }[] = [
    { nom: 'Karim Hadj', role: 'gerant', title: 'Gérant Showroom' },
    { nom: 'Sofiane Mansouri', role: 'commercial', title: 'Conseiller Commercial' },
    { nom: 'Fatima Zohra', role: 'caissier', title: 'Responsable Caisse' },
    { nom: 'Mustapha Benali', role: 'chef_parc', title: 'Chef de Parc' },
  ];

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      setError(false);
      if (nextPin.length === 4) {
        const success = onUnlock(nextPin);
        if (!success) {
          setError(true);
          setPin('');
        }
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center text-slate-100">
        <div className="w-12 h-12 rounded-full bg-blue-950 border border-blue-800 text-blue-400 mx-auto flex items-center justify-center mb-4 shadow-lg shadow-blue-500/10">
          <Lock className="w-6 h-6" />
        </div>

        <h2 className="text-lg font-bold text-white tracking-tight">
          {lang === 'ar' ? 'جلسة العمل مقفلة' : 'Session Showroom Verrouillée'}
        </h2>
        <p className="text-xs text-slate-400 mt-1 mb-6">
          {lang === 'ar'
            ? 'أدخل رمز PIN لإلغاء القفل (الرمز الافتراضي: 1234)'
            : 'Saisissez votre code PIN (Code par défaut: 1234)'}
        </p>

        {/* User Selector for shared tablet */}
        <div className="mb-6">
          <label className="block text-[11px] text-slate-400 mb-1.5 text-left font-medium">
            Utilisateur actif sur cet appareil :
          </label>
          <select
            value={currentUser.nom}
            onChange={(e) => {
              const u = usersList.find(x => x.nom === e.target.value);
              if (u) onChangeUser({ nom: u.nom, role: u.role });
            }}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            {usersList.map((u) => (
              <option key={u.nom} value={u.nom}>
                {u.nom} ({u.title})
              </option>
            ))}
          </select>
        </div>

        {/* PIN Indicators */}
        <div className="flex justify-center gap-4 mb-6">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-3.5 h-3.5 rounded-full border transition-all ${
                idx < pin.length
                  ? 'bg-blue-500 border-blue-400 scale-110 shadow-sm shadow-blue-500'
                  : 'bg-slate-800 border-slate-700'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="text-xs text-red-400 mb-4 flex items-center justify-center gap-1.5 animate-pulse">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Code PIN incorrect (essayez 1234)</span>
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto mb-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              onClick={() => handleKeyPress(digit)}
              className="w-14 h-14 rounded-full bg-slate-800 hover:bg-slate-700 active:scale-95 text-lg font-bold font-mono text-white transition-all border border-slate-700 flex items-center justify-center mx-auto"
            >
              {digit}
            </button>
          ))}
          <div />
          <button
            onClick={() => handleKeyPress('0')}
            className="w-14 h-14 rounded-full bg-slate-800 hover:bg-slate-700 active:scale-95 text-lg font-bold font-mono text-white transition-all border border-slate-700 flex items-center justify-center mx-auto"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="w-14 h-14 rounded-full bg-slate-800/60 hover:bg-slate-700 text-xs text-slate-400 hover:text-white font-medium transition-all border border-slate-700 flex items-center justify-center mx-auto"
          >
            Effacer
          </button>
        </div>

        <div className="text-[10px] text-slate-500 flex items-center justify-center gap-1">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span>Protection locale du terminal actif</span>
        </div>
      </div>
    </div>
  );
};
