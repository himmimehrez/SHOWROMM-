import React, { useEffect, useState } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Building,
  FileCheck,
  X,
} from 'lucide-react';
import { db } from '../services/db';
import { syncEngine } from '../services/syncEngine';
import { getOrCreateDeviceId } from '../services/crypto';
import type { TransactionCaisse, Echeance, Vente, Client, PaymentMode, CaisseType, SyncStats } from '../types';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';

interface CaisseViewProps {
  syncStats: SyncStats;
  lang: Language;
}

export const CaisseView: React.FC<CaisseViewProps> = ({ syncStats, lang }) => {
  const [transactions, setTransactions] = useState<TransactionCaisse[]>([]);
  const [echeances, setEcheances] = useState<Echeance[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isAddTxModalOpen, setIsAddTxModalOpen] = useState(false);
  const [payEcheanceItem, setPayEcheanceItem] = useState<{ echeance: Echeance; vente: Vente; client?: Client } | null>(null);

  // Formulaire nouvelle transaction
  const [formType, setFormType] = useState<CaisseType>('recette_vente');
  const [formMode, setFormMode] = useState<PaymentMode>('especes');
  const [formMontant, setFormMontant] = useState(100000);
  const [formRefBancaire, setFormRefBancaire] = useState('');
  const [formBanque, setFormBanque] = useState('BNA');
  const [formMotif, setFormMotif] = useState('');

  const t = translations[lang];

  useEffect(() => {
    loadCaisseData();
  }, [syncStats]);

  const loadCaisseData = async () => {
    const tList = await db.transactions_caisse.reverse().sortBy('date_transaction');
    const eList = await db.echeances.toArray();
    const vList = await db.ventes.toArray();
    const cList = await db.clients.toArray();

    setTransactions(tList);
    setEcheances(eList);
    setVentes(vList);
    setClients(cList);
  };

  const formatDzd = (amount: number) => {
    return new Intl.NumberFormat(lang === 'ar' ? 'ar-DZ' : 'fr-DZ', {
      maximumFractionDigits: 0,
    }).format(amount) + ' ' + t.currencyDzd;
  };

  // Calculs totaux
  const totalRecettes = transactions
    .filter(t => t.type === 'recette_vente' || t.type === 'acompte_reservation')
    .reduce((sum, t) => sum + t.montant_dzd, 0);

  const totalDepenses = transactions
    .filter(t => t.type === 'depense_generale' || t.type === 'remboursement_annulation')
    .reduce((sum, t) => sum + t.montant_dzd, 0);

  const soldeNetCaisse = totalRecettes - totalDepenses;

  // Répartition par mode
  const especesTotal = transactions
    .filter(t => t.mode_paiement === 'especes')
    .reduce((sum, t) => sum + (t.type.startsWith('recette') || t.type.startsWith('acompte') ? t.montant_dzd : -t.montant_dzd), 0);

  const chequesTotal = transactions
    .filter(t => t.mode_paiement === 'cheque' && (t.type === 'recette_vente' || t.type === 'acompte_reservation'))
    .reduce((sum, t) => sum + t.montant_dzd, 0);

  const virementsTotal = transactions
    .filter(t => t.mode_paiement === 'virement' && (t.type === 'recette_vente' || t.type === 'acompte_reservation'))
    .reduce((sum, t) => sum + t.montant_dzd, 0);

  const traitesTotal = transactions
    .filter(t => t.mode_paiement === 'traite' && (t.type === 'recette_vente' || t.type === 'acompte_reservation'))
    .reduce((sum, t) => sum + t.montant_dzd, 0);

  const handleCreateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMontant || !formMotif) return;

    const { deviceId } = getOrCreateDeviceId();
    const id = `tr-${Date.now()}`;
    const seq = Math.floor(1000 + Math.random() * 9000);

    const newTx: TransactionCaisse = {
      id,
      numero_recu: `REC-${deviceId}-2026-${seq}`,
      type: formType,
      mode_paiement: formMode,
      montant_dzd: Number(formMontant),
      reference_bancaire: formRefBancaire || undefined,
      banque: formBanque,
      date_transaction: Date.now(),
      motif: formMotif,
      encaisse_par: 'Caissier Showroom',
      device_id: deviceId,
      created_at: Date.now(),
    };

    await db.transactions_caisse.add(newTx);
    await syncEngine.enqueueOperation('caisse', id, 'CREATE', newTx);

    setIsAddTxModalOpen(false);
    setFormMotif('');
    setFormRefBancaire('');
    await loadCaisseData();
  };

  const handleSettleEcheance = async () => {
    if (!payEcheanceItem) return;

    const { echeance, vente } = payEcheanceItem;
    const { deviceId } = getOrCreateDeviceId();

    // 1. Mettre à jour l'échéance
    await db.echeances.update(echeance.id, {
      statut: 'paye',
      montant_paye_dzd: echeance.montant_prevu_dzd,
      updated_at: Date.now(),
    });

    // 2. Mettre à jour la vente (solde = 0 -> bon de sortie autorise !)
    const nouveauSolde = Math.max(0, vente.solde_restant_dzd - echeance.montant_prevu_dzd);
    await db.ventes.update(vente.id, {
      montant_encaisse_dzd: vente.montant_encaisse_dzd + echeance.montant_prevu_dzd,
      solde_restant_dzd: nouveauSolde,
      statut_paiement: nouveauSolde === 0 ? 'solde' : 'acompte',
      bon_sortie_autorise: nouveauSolde === 0,
      bon_sortie_numero: nouveauSolde === 0 ? `BS-2026-${Math.floor(1000 + Math.random() * 9000)}` : vente.bon_sortie_numero,
      updated_at: Date.now(),
    });

    // 3. Ajouter l'encaissement en caisse
    const txId = `tr-${Date.now()}`;
    const newTx: TransactionCaisse = {
      id: txId,
      numero_recu: `REC-${deviceId}-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      vente_id: vente.id,
      client_id: vente.client_id,
      type: 'recette_vente',
      mode_paiement: 'especes',
      montant_dzd: echeance.montant_prevu_dzd,
      date_transaction: Date.now(),
      motif: `Règlement échéance solde contrat ${vente.numero_contrat}`,
      encaisse_par: 'Caissier Showroom',
      device_id: deviceId,
      created_at: Date.now(),
    };
    await db.transactions_caisse.add(newTx);
    await syncEngine.enqueueOperation('caisse', txId, 'CREATE', newTx);

    setPayEcheanceItem(null);
    await loadCaisseData();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {lang === 'ar' ? 'إدارة الصندوق، المقبوضات والديون' : 'Journal de Caisse & Créances DZD'}
          </h1>
          <p className="text-xs text-slate-400">
            {lang === 'ar'
              ? 'متابعة حركات السيولة، الشيكات المصرفية، التحويلات وجداول الأقساط'
              : 'Flux financiers, pointage des encaissements et échéancier des créances'}
          </p>
        </div>

        <button
          onClick={() => setIsAddTxModalOpen(true)}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'ar' ? 'تسجيل حركة صندوق' : 'Nouvelle Opération Caisse'}</span>
        </button>
      </div>

      {/* Primary Financial Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {lang === 'ar' ? 'صافي رصيد الصندوق' : 'Solde Net Caisse'}
            </span>
            <div className="p-2 rounded-lg bg-emerald-950/60 text-emerald-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-400 tabular-nums">
            {formatDzd(soldeNetCaisse)}
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center gap-2">
            <span className="text-emerald-400">+{formatDzd(totalRecettes)}</span>
            <span>·</span>
            <span className="text-red-400">-{formatDzd(totalDepenses)}</span>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {t.paymentCash}
            </span>
            <div className="p-2 rounded-lg bg-blue-950/60 text-blue-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tabular-nums">
            {formatDzd(especesTotal)}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Liquidités physiques en coffre
          </div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {t.paymentCheque}
            </span>
            <div className="p-2 rounded-lg bg-purple-950/60 text-purple-400">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-300 tabular-nums">
            {formatDzd(chequesTotal)}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Chèques certifiés en portefeuille
          </div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {lang === 'ar' ? 'التحويلات والكمبيالات' : 'Virements & Traites'}
            </span>
            <div className="p-2 rounded-lg bg-amber-950/60 text-amber-400">
              <Building className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-300 tabular-nums">
            {formatDzd(virementsTotal + traitesTotal)}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Virements BNA, CPA, BEA + Traites
          </div>
        </div>
      </div>

      {/* Main split: Transactions Ledger on Left, Debt Receivables on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Transactions Ledger */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              {lang === 'ar' ? 'سجل حركات الصندوق اليومي' : 'Journal des Mouvements de Caisse'}
            </h2>
            <span className="text-xs text-slate-400">
              {transactions.length} opérations enregistrées
            </span>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="py-3 px-4 font-semibold">Date & N° Reçu</th>
                  <th className="py-3 px-4 font-semibold">Motif / Désignation</th>
                  <th className="py-3 px-4 font-semibold">Mode & Banque</th>
                  <th className="py-3 px-4 font-semibold text-right">Montant (DZD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-500">
                      Aucune transaction enregistrée.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const isCredit = tx.type === 'recette_vente' || tx.type === 'acompte_reservation';
                    return (
                      <tr key={tx.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-mono text-white font-semibold">
                            {tx.numero_recu}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(tx.date_transaction).toLocaleString('fr-DZ', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="text-slate-200 font-medium">{tx.motif}</div>
                          <div className="text-[10px] text-slate-400">
                            Agent: {tx.encaisse_par}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span className="capitalize text-slate-300 font-medium">
                            {tx.mode_paiement}
                          </span>
                          {tx.banque && (
                            <div className="text-[10px] text-slate-400">
                              {tx.banque} {tx.reference_bancaire ? `· ${tx.reference_bancaire}` : ''}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                          <span className={isCredit ? 'text-emerald-400' : 'text-red-400'}>
                            {isCredit ? '+' : '-'}{formatDzd(tx.montant_dzd)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Debt & Receivables Tracking */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span>{lang === 'ar' ? 'إدارة الأقساط والديون' : 'Échéancier & Créances'}</span>
              </h2>
              <span className="text-xs text-amber-400 font-bold tabular-nums">
                {echeances.filter(e => e.statut !== 'paye').length} {lang === 'ar' ? 'متبقية' : 'en attente'}
              </span>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              {lang === 'ar'
                ? 'تسوية مبالغ الأقساط تفتح تلقائياً ترخيص إصدار إذن خروج المركبة.'
                : 'L\'encaissement d\'un solde débloque immédiatement l\'émission du Bon de Sortie.'}
            </p>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {echeances.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  Aucune créance en cours.
                </div>
              ) : (
                echeances.map((ech) => {
                  const vente = ventes.find(v => v.id === ech.vente_id);
                  const client = clients.find(c => c.id === ech.client_id);

                  return (
                    <div
                      key={ech.id}
                      className="p-3.5 rounded-lg bg-slate-800/40 border border-slate-700/60 space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-white">
                            {client ? client.nom_complet : 'Client'}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Contrat: {vente?.numero_contrat}
                          </div>
                        </div>

                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          ech.statut === 'paye'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}>
                          {ech.statut === 'paye' ? 'Soldé' : 'À Recouvrer'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Échéance: {ech.date_echeance}</span>
                        <span className="font-mono font-bold text-amber-400 tabular-nums">
                          {formatDzd(ech.montant_prevu_dzd)}
                        </span>
                      </div>

                      {ech.statut !== 'paye' && vente && (
                        <button
                          onClick={() => setPayEcheanceItem({ echeance: ech, vente, client })}
                          className="w-full mt-2 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                        >
                          <FileCheck className="w-3.5 h-3.5" />
                          <span>{lang === 'ar' ? 'تحصيل الرصيد وتحرير إذن الخروج' : 'Encaisser & Débloquer Bon Sortie'}</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800 text-[11px] text-slate-500">
            Tous les flux financiers sont audités et signés avec clé locale d'appareil.
          </div>
        </div>
      </div>

      {/* Modal Ajout Transaction */}
      {isAddTxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg p-6 text-slate-100">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white">
                Enregistrer une Opération de Caisse
              </h3>
              <button
                onClick={() => setIsAddTxModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTx} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Type d'Opération *</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as CaisseType)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none"
                >
                  <option value="recette_vente">Recette Vente Véhicule (+)</option>
                  <option value="acompte_reservation">Acompte Réservation (+)</option>
                  <option value="depense_generale">Dépense Générale Showroom (-)</option>
                  <option value="remboursement_annulation">Remboursement Annulation (-)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Montant en Dinars Algériens (DZD) *</label>
                <input
                  type="number"
                  step={1000}
                  required
                  value={formMontant}
                  onChange={(e) => setFormMontant(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-emerald-400 font-mono font-bold text-sm focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Mode de Paiement *</label>
                  <select
                    value={formMode}
                    onChange={(e) => setFormMode(e.target.value as PaymentMode)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none"
                  >
                    <option value="especes">Espèces</option>
                    <option value="cheque">Chèque</option>
                    <option value="virement">Virement</option>
                    <option value="traite">Traite</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Banque</label>
                  <select
                    value={formBanque}
                    onChange={(e) => setFormBanque(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none"
                  >
                    <option value="BNA">BNA</option>
                    <option value="CPA">CPA</option>
                    <option value="BEA">BEA</option>
                    <option value="BDL">BDL</option>
                    <option value="BADR">BADR</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Motif / Justification *</label>
                <input
                  type="text"
                  required
                  value={formMotif}
                  onChange={(e) => setFormMotif(e.target.value)}
                  placeholder="Ex: Frais gardiennage, acompte client..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddTxModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded font-medium"
                >
                  {t.actionCancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-semibold"
                >
                  Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmation Paiement Échéance */}
      {payEcheanceItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-emerald-700 rounded-xl shadow-2xl w-full max-w-md p-6 text-slate-100">
            <h3 className="font-bold text-base text-white mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>Confirmer l'Encaissement du Solde</span>
            </h3>

            <p className="text-xs text-slate-300 mb-4">
              Voulez-vous enregistrer le règlement de{' '}
              <strong className="text-emerald-400 font-mono">
                {formatDzd(payEcheanceItem.echeance.montant_prevu_dzd)}
              </strong>{' '}
              pour le client <strong className="text-white">{payEcheanceItem.client?.nom_complet}</strong> ?
            </p>

            <div className="p-3 bg-emerald-950/40 border border-emerald-800 rounded-lg text-emerald-200 text-xs mb-6">
              Cette action soldera intégralement le dossier et <strong>autorisera automatiquement l'impression du Bon de Sortie</strong> du véhicule.
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPayEcheanceItem(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded text-xs font-semibold"
              >
                {t.actionCancel}
              </button>
              <button
                onClick={handleSettleEcheance}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold shadow-sm"
              >
                Encaisser & Autoriser Sortie
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
