import React, { useEffect, useState } from 'react';
import {
  X,
  RefreshCw,
  Wifi,
  WifiOff,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Server,
  Smartphone,
  ShieldCheck,
  RotateCw,
  ArrowRight,
  Database,
} from 'lucide-react';
import { db } from '../services/db';
import { syncEngine } from '../services/syncEngine';
import { getOrCreateDeviceId } from '../services/crypto';
import type { SyncQueueItem, SyncStats } from '../types';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';

interface SyncMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncStats: SyncStats;
  lang: Language;
}

export const SyncMonitorModal: React.FC<SyncMonitorModalProps> = ({
  isOpen,
  onClose,
  syncStats,
  lang,
}) => {
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [deviceInfo, setDeviceInfo] = useState({ deviceId: '', deviceName: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const t = translations[lang];

  useEffect(() => {
    if (isOpen) {
      setDeviceInfo(getOrCreateDeviceId());
      loadQueue();
    }
  }, [isOpen, syncStats]);

  const loadQueue = async () => {
    const items = await db.sync_queue.reverse().sortBy('createdAt');
    setQueueItems(items);
  };

  const handleManualSync = async () => {
    setIsProcessing(true);
    await syncEngine.triggerSync();
    await loadQueue();
    setIsProcessing(false);
  };

  const handleRetryErrors = async () => {
    setIsProcessing(true);
    await syncEngine.retryAllErrors();
    await loadQueue();
    setIsProcessing(false);
  };

  const handleToggleOffline = () => {
    syncEngine.toggleSimulatedOffline();
  };

  if (!isOpen) return null;

  const isEffectivelyOnline = syncStats.isOnline && !syncStats.isSimulatedOffline;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isEffectivelyOnline ? 'bg-emerald-950/80 text-emerald-400' : 'bg-amber-950/80 text-amber-400'}`}>
              {isEffectivelyOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {lang === 'ar' ? 'مركز مراقبة المزامنة وطابور العمليات' : 'Moniteur de Synchronisation & Outbox Queue'}
              </h2>
              <p className="text-xs text-slate-400">
                {lang === 'ar'
                  ? 'إدارة استمرارية العمل بدون إنترنت والترحيل السحابي التلقائي'
                  : 'Continuité opérationnelle hors-ligne et réconciliation cloud idempotente'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Overview Grid */}
        <div className="p-6 border-b border-slate-800 bg-slate-900/40 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
            <div className="text-slate-400 mb-1 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-blue-400" />
              <span>{lang === 'ar' ? 'حالة السحابة' : 'État Serveur'}</span>
            </div>
            <div className="font-semibold text-sm">
              {isEffectivelyOnline ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> En ligne ({syncStats.latencyMs}ms)
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <WifiOff className="w-3.5 h-3.5" /> Hors-ligne
                </span>
              )}
            </div>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
            <div className="text-slate-400 mb-1 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-blue-400" />
              <span>{lang === 'ar' ? 'معرف الجهاز' : 'Identifiant Poste'}</span>
            </div>
            <div className="font-mono font-semibold text-sm text-slate-200">
              {deviceInfo.deviceId || 'DEV-AUTO'}
            </div>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
            <div className="text-slate-400 mb-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{lang === 'ar' ? 'العمليات المعلقة' : 'En attente Sync'}</span>
            </div>
            <div className="font-mono font-bold text-sm text-amber-400 tabular-nums">
              {syncStats.pendingCount} {lang === 'ar' ? 'عملية' : 'op.'}
            </div>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
            <div className="text-slate-400 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{lang === 'ar' ? 'أمان التخزين' : 'Chiffrement Local'}</span>
            </div>
            <div className="font-semibold text-sm text-emerald-400">
              AES-GCM 256
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleOffline}
              className={`px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
                syncStats.isSimulatedOffline
                  ? 'bg-amber-600 border-amber-500 text-white font-semibold'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              {syncStats.isSimulatedOffline ? <AlertTriangle className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>
                {syncStats.isSimulatedOffline
                  ? (lang === 'ar' ? 'إلغاء محاكاة الانقطاع' : 'Désactiver coupure simulée')
                  : (lang === 'ar' ? 'محاكاة انقطاع الإنترنت' : 'Simuler coupure réseau')}
              </span>
            </button>
            {syncStats.errorCount > 0 && (
              <button
                onClick={handleRetryErrors}
                disabled={isProcessing || !isEffectivelyOnline}
                className="px-3 py-1.5 rounded-lg bg-red-950/60 border border-red-800/80 text-red-300 hover:bg-red-900/60 font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إعادة محاولة الأخطاء' : 'Relancer erreurs'}</span>
              </button>
            )}
          </div>

          <button
            onClick={handleManualSync}
            disabled={isProcessing || !isEffectivelyOnline}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
            <span>{isProcessing ? t.statusSyncing : t.syncNow}</span>
          </button>
        </div>

        {/* Queue Items List */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {lang === 'ar' ? 'قائمة العمليات المسجلة محلياً (Outbox)' : 'Journal des Opérations Locales (Outbox)'}
            </h3>
            <span className="text-[11px] text-slate-500">
              {queueItems.length} {lang === 'ar' ? 'إجمالي السجلات' : 'enregistrements'}
            </span>
          </div>

          {queueItems.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              <Database className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>{lang === 'ar' ? 'لا توجد عمليات معلقة. جميع البيانات متطابقة مع السحابة.' : 'Toutes les données sont synchronisées. Aucune opération locale en attente.'}</p>
            </div>
          ) : (
            queueItems.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-lg border text-xs transition-colors ${
                  item.status === 'conflict'
                    ? 'bg-red-950/30 border-red-800/80'
                    : item.status === 'error'
                    ? 'bg-amber-950/20 border-amber-800/60'
                    : item.status === 'pending'
                    ? 'bg-slate-800/40 border-slate-700/60'
                    : 'bg-slate-900 border-slate-800 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">
                        {item.action} {item.entityType.toUpperCase()}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {item.entityId}
                      </span>
                    </div>

                    <div className="text-slate-400 text-[11px]">
                      {new Date(item.createdAt).toLocaleTimeString()} · Clé: {item.idempotencyKey.slice(0, 18)}...
                    </div>

                    {item.status === 'conflict' && (
                      <div className="mt-2 p-2 bg-red-950/60 border border-red-800 rounded text-red-200 text-xs flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-red-300">
                            {lang === 'ar' ? 'تعارض في التخصيص' : 'Conflit d\'allocation détecté'}
                          </div>
                          <p className="text-[11px] text-red-200/90">{item.errorMessage}</p>
                          <div className="mt-1 text-[10px] text-slate-300">
                            {lang === 'ar' ? 'البيانات والمدفوعات محفوظة. قم بإعادة تخصيص مركبة أخرى من شاشة المبيعات.' : 'Dossier et paiements préservés. Vous pouvez réaffecter un autre véhicule disponible.'}
                          </div>
                        </div>
                      </div>
                    )}

                    {item.status === 'error' && (
                      <div className="text-amber-400 text-[11px] mt-1">
                        Tentative {item.retryCount}/5 : {item.errorMessage}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0">
                    {item.status === 'synced' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950 border border-emerald-800 text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" /> Synchronisé
                      </span>
                    )}
                    {item.status === 'pending' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-950 border border-amber-800 text-amber-300">
                        <Clock className="w-3 h-3" /> En attente
                      </span>
                    )}
                    {item.status === 'syncing' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-950 border border-blue-800 text-blue-300">
                        <RefreshCw className="w-3 h-3 animate-spin" /> En cours
                      </span>
                    )}
                    {item.status === 'conflict' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-900 border border-red-700 text-white">
                        Conflit
                      </span>
                    )}
                    {item.status === 'error' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-950 border border-red-800 text-red-400">
                        Erreur
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 text-[11px] text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              {lang === 'ar'
                ? 'الحماية التلقائية مفعلة: لا يتم حذف أي عملية محلية غير متزامنة.'
                : 'Sécurité garantie : aucune opération locale non synchronisée n\'est purgée.'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors"
          >
            {t.actionCancel}
          </button>
        </div>
      </div>
    </div>
  );
};
