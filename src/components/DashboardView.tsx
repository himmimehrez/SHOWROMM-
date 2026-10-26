import React, { useEffect, useState } from 'react';
import {
  Car,
  TrendingUp,
  Warehouse,
  Wallet,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldAlert,
  PlusCircle,
  FileText,
  Users,
  CheckCircle2,
} from 'lucide-react';
import { db } from '../services/db';
import type { Vehicule, Vente, TransactionCaisse, Depot, SyncStats, FraisVehicule, Client } from '../types';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';

interface DashboardViewProps {
  onNavigate: (view: string) => void;
  syncStats: SyncStats;
  lang: Language;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  syncStats,
  lang,
}) => {
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [transactions, setTransactions] = useState<TransactionCaisse[]>([]);
  const [frais, setFrais] = useState<FraisVehicule[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const t = translations[lang];

  useEffect(() => {
    loadDashboardData();
  }, [syncStats]);

  const loadDashboardData = async () => {
    const vList = await db.vehicules.toArray();
    const sList = await db.ventes.toArray();
    const dList = await db.depots.toArray();
    const tList = await db.transactions_caisse.toArray();
    const fList = await db.frais_vehicules.toArray();
    const cList = await db.clients.toArray();

    setVehicules(vList);
    setVentes(sList);
    setDepots(dList);
    setTransactions(tList);
    setFrais(fList);
    setClients(cList);
  };

  // Calculs financiers
  const activeVehicles = vehicules.filter(v => v.statut === 'en_stock' || v.statut === 'reserve');
  const activeVehicleIds = new Set(activeVehicles.map(v => v.id));

  const totalStockAchatDzd = activeVehicles.reduce((sum, v) => sum + (v.prix_achat_dzd || 0), 0);
  const totalFraisDzd = frais
    .filter(f => activeVehicleIds.has(f.vehicule_id))
    .reduce((sum, f) => sum + (f.montant_dzd || 0), 0);
  const totalCoutStockDzd = totalStockAchatDzd + totalFraisDzd;

  const totalStockVenteDzd = activeVehicles.reduce((sum, v) => sum + (v.prix_vente_dzd || 0), 0);
  const totalMargeEstimeeDzd = totalStockVenteDzd - totalCoutStockDzd;
  const margePercent = totalCoutStockDzd > 0 ? ((totalMargeEstimeeDzd / totalCoutStockDzd) * 100).toFixed(1) : '0';

  const prospectsActifs = clients.filter(c => c.statut_prospect && c.statut_prospect !== 'perdu' && c.statut_prospect !== 'converti').length;
  const prospectsChauds = clients.filter(c => c.statut_prospect === 'negociation' || c.statut_prospect === 'rendez_vous').length;

  const vehiclesInStock = vehicules.filter(v => v.statut === 'en_stock').length;
  const vehiclesReserved = vehicules.filter(v => v.statut === 'reserve').length;
  const vehiclesSold = vehicules.filter(v => v.statut === 'vendu').length;

  const totalCaisseDzd = transactions.reduce((sum, tr) => {
    if (tr.type === 'recette_vente' || tr.type === 'acompte_reservation') return sum + tr.montant_dzd;
    if (tr.type === 'depense_generale' || tr.type === 'remboursement_annulation') return sum - tr.montant_dzd;
    return sum;
  }, 0);

  const totalCreancesDzd = ventes.reduce((sum, v) => sum + (v.solde_restant_dzd || 0), 0);

  const isEffectivelyOnline = syncStats.isOnline && !syncStats.isSimulatedOffline;

  // Format DZD monétaire
  const formatDzd = (amount: number) => {
    return new Intl.NumberFormat(lang === 'ar' ? 'ar-DZ' : 'fr-DZ', {
      maximumFractionDigits: 0,
    }).format(amount) + ' ' + t.currencyDzd;
  };

  return (
    <div className="space-y-6">
      {/* Offline Alert Banner (if offline or simulated) */}
      {!isEffectivelyOnline && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-900/60 text-amber-300">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-sm">
                {lang === 'ar'
                  ? 'النظام يعمل حالياً في وضع عدم الاتصال (أوفلاين)'
                  : 'Mode Hors-Ligne Actif — Continuité locale totale'}
              </div>
              <div className="text-xs text-amber-300/80 mt-0.5">
                {lang === 'ar'
                  ? `يمكنك تسجيل المبيعات، معاينة الزبائن وإصدار العقود المؤقتة. لديك ${syncStats.pendingCount} عمليات محفوظة محلياً.`
                  : `Toutes les opérations (ventes, encaissements, scans KYC) sont enregistrées immédiatement dans IndexedDB (${syncStats.pendingCount} en attente de réconciliation cloud).`}
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate('ventes')}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold whitespace-nowrap transition-colors"
          >
            {lang === 'ar' ? 'متابعة المبيعات' : 'Saisir une vente'}
          </button>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 : Stock Véhicules */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {lang === 'ar' ? 'مخزون السيارات' : 'Stock Véhicules'}
            </span>
            <div className="p-2 rounded-lg bg-blue-950/60 text-blue-400">
              <Car className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tabular-nums">
            {vehiclesInStock + vehiclesReserved} <span className="text-sm font-normal text-slate-400">{lang === 'ar' ? 'مركبة' : 'unités'}</span>
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center gap-2">
            <span className="text-emerald-400 font-medium">{vehiclesInStock} {t.statusInStock}</span>
            <span>·</span>
            <span className="text-amber-400 font-medium">{vehiclesReserved} {t.statusReserved}</span>
          </div>
        </div>

        {/* KPI 2 : Coût de Revient Total & Marge Estimée */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {lang === 'ar' ? 'التكلفة الإجمالية للمخزون' : 'Coût Total du Stock'}
            </span>
            <div className="p-2 rounded-lg bg-emerald-950/60 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tabular-nums">
            {formatDzd(totalCoutStockDzd)}
          </div>
          <div className="text-xs text-slate-400 mt-2 space-y-1">
            <div className="flex items-center justify-between">
              <span>{lang === 'ar' ? 'شراء معتمد:' : 'Achat retenu:'} {formatDzd(totalStockAchatDzd)}</span>
              {totalFraisDzd > 0 && (
                <span className="text-amber-400 font-mono">+{formatDzd(totalFraisDzd)} {lang === 'ar' ? 'مصاريف' : 'frais'}</span>
              )}
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
              <span className="text-slate-400">{lang === 'ar' ? 'الهامش التقديري:' : 'Marge estimée:'}</span>
              <span className="text-emerald-400 font-semibold tabular-nums">
                {formatDzd(totalMargeEstimeeDzd)} ({margePercent}%)
              </span>
            </div>
          </div>
        </div>

        {/* KPI 3 : Caisse du Jour & Recettes */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {lang === 'ar' ? 'سيولة الصندوق والتحصيلات' : 'Solde Caisse & Encaissements'}
            </span>
            <div className="p-2 rounded-lg bg-purple-950/60 text-purple-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-300 tabular-nums">
            {formatDzd(totalCaisseDzd)}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            {transactions.length} {lang === 'ar' ? 'حركات مسجلة' : 'transactions validées'}
          </div>
        </div>

        {/* KPI 4 : Créances Clients & Pipeline CRM */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {lang === 'ar' ? 'الديون المتبقية والعملاء المحتملون' : 'Créances & Pipeline CRM'}
            </span>
            <div className="p-2 rounded-lg bg-amber-950/60 text-amber-400">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-400 tabular-nums">
            {formatDzd(totalCreancesDzd)}
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>{ventes.filter(v => v.solde_restant_dzd > 0).length} {lang === 'ar' ? 'ملفات بانتظار التسوية' : 'dossiers débiteurs'}</span>
            <span className="text-blue-400 font-medium">
              {prospectsActifs} {lang === 'ar' ? 'زبون محتمل' : 'prospects'} ({prospectsChauds} {lang === 'ar' ? 'ساخن' : 'chauds'})
            </span>
          </div>
        </div>
      </div>

      {/* Dépôts & Stock Location Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {lang === 'ar' ? 'توزيع المخزون حسب الحظائر والمستودعات' : 'Répartition du Stock par Dépôt'}
              </h2>
              <p className="text-xs text-slate-400">
                {lang === 'ar' ? 'متابعة الطاقة الاستيعابية والسيارات المتواجدة' : 'Suivi physique des parcs et transferts autorisés'}
              </p>
            </div>
            <button
              onClick={() => onNavigate('vehicules')}
              className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <span>{lang === 'ar' ? 'عرض الكتالوج' : 'Voir catalogue'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-4">
            {depots.map((depot) => {
              const count = vehicules.filter(v => v.depot_actuel === depot.id && v.statut !== 'vendu').length;
              const percent = Math.min(Math.round((count / depot.capacite) * 100), 100);

              return (
                <div key={depot.id} className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/60">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Warehouse className="w-4 h-4 text-blue-400" />
                      <span className="font-semibold text-sm text-white">
                        {lang === 'ar' ? depot.nom_ar : depot.nom}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">({depot.code})</span>
                    </div>
                    <div className="text-xs font-medium tabular-nums text-slate-300">
                      <span className="font-bold text-white">{count}</span> / {depot.capacite} {lang === 'ar' ? 'سيارة' : 'véhicules'} ({percent}%)
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        percent > 85 ? 'bg-amber-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
                    <span>{depot.wilaya} · Resp: {depot.responsable}</span>
                    <button
                      onClick={() => onNavigate('vehicules')}
                      className="text-blue-400 hover:underline"
                    >
                      {lang === 'ar' ? 'تصفية حسب هذا المستودع' : 'Filtrer ce parc'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Actions & Offline Status Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight mb-1">
              {lang === 'ar' ? 'الإجراءات السريعة' : 'Actions Immédiates'}
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              {lang === 'ar' ? 'عمليات جاهزة للعمل دون اتصال بالإنترنت' : 'Opérations optimisées pour saisie rapide'}
            </p>

            <div className="space-y-2.5">
              <button
                onClick={() => onNavigate('vehicules')}
                className="w-full py-2.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-between transition-colors shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <PlusCircle className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'إدخال سيارة جديدة (سعر مباشر)' : 'Ajouter un véhicule (prix direct)'}</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => onNavigate('ventes')}
                className="w-full py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-semibold flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>{lang === 'ar' ? 'تسجيل عقد بيع / دفعة' : 'Émettre vente & acompte DZD'}</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => onNavigate('clients')}
                className="w-full py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-semibold flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span>{lang === 'ar' ? 'تسجيل زبون ومسح بطاقة الهوية' : 'Client & Scan KYC Caméra'}</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>{lang === 'ar' ? 'محرك التخزين المحلي:' : 'Moteur de stockage:'}</span>
              <span className="font-mono text-emerald-400 font-semibold">IndexedDB (Dexie)</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{lang === 'ar' ? 'الأمان والخصوصية:' : 'Sécurité pièces KYC:'}</span>
              <span className="text-slate-300 font-semibold">Web Crypto AES-GCM</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
