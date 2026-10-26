import React, { useEffect, useState } from 'react';
import {
  FileText,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Printer,
  ShieldAlert,
  Car,
  User,
  CreditCard,
  X,
  RotateCw,
  Ban,
  BadgeAlert,
  ArrowRight,
} from 'lucide-react';
import { db } from '../services/db';
import { syncEngine } from '../services/syncEngine';
import { getOrCreateDeviceId } from '../services/crypto';
import type { Vente, Vehicule, Client, PaymentMode, TransactionCaisse, SyncStats } from '../types';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';

interface VentesViewProps {
  syncStats: SyncStats;
  lang: Language;
}

export const VentesView: React.FC<VentesViewProps> = ({ syncStats, lang }) => {
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isNewVenteModalOpen, setIsNewVenteModalOpen] = useState(false);
  const [activeDocumentVente, setActiveDocumentVente] = useState<Vente | null>(null);
  const [documentTypeToPrint, setDocumentTypeToPrint] = useState<'contrat' | 'recu' | 'bon_sortie'>('contrat');
  const [reassignModalVente, setReassignModalVente] = useState<Vente | null>(null);

  // Formulaire de nouvelle vente
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedVehiculeId, setSelectedVehiculeId] = useState('');
  const [formRemise, setFormRemise] = useState(0);
  const [formMontantPaye, setFormMontantPaye] = useState(0);
  const [formModePaiement, setFormModePaiement] = useState<PaymentMode>('especes');
  const [formRefBancaire, setFormRefBancaire] = useState('');
  const [formBanque, setFormBanque] = useState('BNA');

  const t = translations[lang];
  const isEffectivelyOnline = syncStats.isOnline && !syncStats.isSimulatedOffline;

  useEffect(() => {
    loadAllData();
  }, [syncStats]);

  const loadAllData = async () => {
    const vList = await db.ventes.reverse().sortBy('created_at');
    const vehList = await db.vehicules.toArray();
    const cList = await db.clients.toArray();
    setVentes(vList);
    setVehicules(vehList);
    setClients(cList);
  };

  const formatDzd = (amount: number) => {
    return new Intl.NumberFormat(lang === 'ar' ? 'ar-DZ' : 'fr-DZ', {
      maximumFractionDigits: 0,
    }).format(amount) + ' ' + t.currencyDzd;
  };

  // Convertit un nombre en lettres (Dinars Algériens) pour le reçu officiel
  const convertToDzdLetters = (amount: number) => {
    if (amount <= 0) return 'Zéro Dinar Algérien';
    if (amount >= 1000000) {
      const millions = Math.floor(amount / 1000000);
      const reste = amount % 1000000;
      return `${millions} Million(s) ${reste > 0 ? 'et ' + reste : ''} Dinars Algériens`;
    }
    return `${amount} Dinars Algériens`;
  };

  const handleCreateVente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId || !selectedVehiculeId) {
      alert('Veuillez sélectionner un client et un véhicule.');
      return;
    }

    const vehicule = vehicules.find(v => v.id === selectedVehiculeId);
    if (!vehicule) return;

    const { deviceId } = getOrCreateDeviceId();
    const id = `vte-${Date.now()}`;
    const seq = Math.floor(1000 + Math.random() * 9000);
    const numeroContrat = isEffectivelyOnline
      ? `CTR-2026-${seq}`
      : `CTR-PROV-${deviceId}-2026-${seq}`;

    const prixVente = vehicule.prix_vente_dzd;
    const totalNet = Math.max(0, prixVente - Number(formRemise));
    const montantPaye = Number(formMontantPaye);
    const soldeRestant = Math.max(0, totalNet - montantPaye);

    // Règle du bon de sortie : autorisé UNIQUEMENT si solde = 0
    const bonSortieAutorise = soldeRestant === 0;

    const newVente: Vente = {
      id,
      numero_contrat: numeroContrat,
      numero_facture: isEffectivelyOnline ? `FAC-2026-${seq}` : undefined,
      client_id: selectedClientId,
      vehicule_id: selectedVehiculeId,
      date_vente: Date.now(),
      prix_vente_dzd: prixVente,
      remise_dzd: Number(formRemise),
      total_net_dzd: totalNet,
      montant_encaisse_dzd: montantPaye,
      solde_restant_dzd: soldeRestant,
      statut_validation: isEffectivelyOnline ? 'confirme_central' : 'provisoire_local',
      statut_paiement: soldeRestant === 0 ? 'solde' : montantPaye > 0 ? 'acompte' : 'impaye',
      bon_sortie_autorise: bonSortieAutorise,
      bon_sortie_numero: bonSortieAutorise ? `BS-2026-${seq}` : undefined,
      device_id: deviceId,
      created_offline: !isEffectivelyOnline,
      updated_at: Date.now(),
      created_at: Date.now(),
    };

    // 1. Enregistrer la vente dans IndexedDB
    await db.ventes.add(newVente);

    // 2. Mettre à jour le statut du véhicule (Réservé si provisoire, Vendu si solde)
    await db.vehicules.update(vehicule.id, {
      statut: soldeRestant === 0 ? 'vendu' : 'reserve',
      updated_at: Date.now(),
    });

    // 3. Enregistrer l'encaissement de caisse si montant versé > 0
    if (montantPaye > 0) {
      const recuId = `tr-${Date.now()}`;
      const newTransaction: TransactionCaisse = {
        id: recuId,
        numero_recu: `REC-${deviceId}-2026-${seq}`,
        vente_id: id,
        client_id: selectedClientId,
        type: soldeRestant === 0 ? 'recette_vente' : 'acompte_reservation',
        mode_paiement: formModePaiement,
        montant_dzd: montantPaye,
        reference_bancaire: formRefBancaire || undefined,
        banque: formBanque,
        date_transaction: Date.now(),
        motif: `Règlement vente ${vehicule.marque} ${vehicule.modele} (${vehicule.vin})`,
        encaisse_par: 'Commercial Showroom',
        device_id: deviceId,
        created_at: Date.now(),
      };
      await db.transactions_caisse.add(newTransaction);
      await syncEngine.enqueueOperation('caisse', recuId, 'CREATE', newTransaction);
    }

    // 4. Enfilement de la vente dans la file d'attente Outbox
    await syncEngine.enqueueOperation('vente', id, 'CREATE', newVente);

    setIsNewVenteModalOpen(false);
    resetForm();
    await loadAllData();
  };

  const resetForm = () => {
    setSelectedClientId('');
    setSelectedVehiculeId('');
    setFormRemise(0);
    setFormMontantPaye(0);
    setFormRefBancaire('');
  };

  // Simuler un conflit d'allocation pour tester la résilience requise
  const handleSimulateConflict = async (vente: Vente) => {
    const updatedVente: Vente = {
      ...vente,
      statut_validation: 'conflit_allocation',
      conflit_detail: 'Conflit d\'allocation : Ce véhicule (VIN) a été alloué par une vente prioritaire sur le serveur central.',
      updated_at: Date.now(),
    };
    await db.ventes.update(vente.id, updatedVente);
    await loadAllData();
  };

  // Réaffecter un autre véhicule en cas de conflit sans perdre le client ni les acomptes
  const handleExecuteReassignment = async (newVehiculeId: string) => {
    if (!reassignModalVente) return;

    const oldVehiculeId = reassignModalVente.vehicule_id;
    const newVeh = vehicules.find(v => v.id === newVehiculeId);
    if (!newVeh) return;

    // Libérer l'ancien véhicule si besoin
    await db.vehicules.update(oldVehiculeId, { statut: 'en_stock', updated_at: Date.now() });

    // Affecter le nouveau véhicule
    await db.vehicules.update(newVehiculeId, { statut: 'reserve', updated_at: Date.now() });

    const totalNet = Math.max(0, newVeh.prix_vente_dzd - reassignModalVente.remise_dzd);
    const soldeRestant = Math.max(0, totalNet - reassignModalVente.montant_encaisse_dzd);

    await db.ventes.update(reassignModalVente.id, {
      vehicule_id: newVehiculeId,
      prix_vente_dzd: newVeh.prix_vente_dzd,
      total_net_dzd: totalNet,
      solde_restant_dzd: soldeRestant,
      statut_validation: isEffectivelyOnline ? 'confirme_central' : 'provisoire_local',
      conflit_detail: undefined,
      bon_sortie_autorise: soldeRestant === 0,
      updated_at: Date.now(),
    });

    setReassignModalVente(null);
    await loadAllData();
  };

  // Véhicules disponibles pour la vente
  const availableVehicles = vehicules.filter(v => v.statut === 'en_stock');
  const selectedVehiculeObj = vehicules.find(v => v.id === selectedVehiculeId);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {lang === 'ar' ? 'إدارة المبيعات، العقود وأذونات الخروج' : 'Ventes, Contrats & Bons de Sortie'}
          </h1>
          <p className="text-xs text-slate-400">
            {lang === 'ar'
              ? 'إصدار عقود وفواتير بالدينار الجزائري مع حماية خروج المركبات حتى سداد كامل الرصيد'
              : 'Génération de contrats provisoires hors-ligne, contrôle de solde et traçabilité DZD'}
          </p>
        </div>

        <button
          onClick={() => setIsNewVenteModalOpen(true)}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'ar' ? 'تسجيل بيع جديد' : 'Nouvelle Vente'}</span>
        </button>
      </div>

      {/* Sales List Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4 font-semibold">N° Document</th>
                <th className="py-3.5 px-4 font-semibold">Client & Téléphone</th>
                <th className="py-3.5 px-4 font-semibold">Véhicule (VIN)</th>
                <th className="py-3.5 px-4 font-semibold text-right">Net à Payer</th>
                <th className="py-3.5 px-4 font-semibold text-right">Encaissé</th>
                <th className="py-3.5 px-4 font-semibold text-right">Solde Dû</th>
                <th className="py-3.5 px-4 font-semibold text-center">Validation</th>
                <th className="py-3.5 px-4 font-semibold text-center">Bon de Sortie</th>
                <th className="py-3.5 px-4 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {ventes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>{lang === 'ar' ? 'لا توجد مبيعات مسجلة حتى الآن.' : 'Aucune vente enregistrée pour le moment.'}</p>
                  </td>
                </tr>
              ) : (
                ventes.map((vente) => {
                  const clientObj = clients.find(c => c.id === vente.client_id);
                  const vehiculeObj = vehicules.find(v => v.id === vente.vehicule_id);

                  return (
                    <tr
                      key={vente.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        vente.statut_validation === 'conflit_allocation' ? 'bg-red-950/20' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-white text-xs">
                          {vente.numero_contrat}
                        </div>
                        {vente.numero_facture ? (
                          <div className="text-[10px] text-emerald-400 font-mono">
                            {vente.numero_facture}
                          </div>
                        ) : (
                          <div className="text-[10px] text-amber-400">
                            {lang === 'ar' ? 'رقم مؤقت' : 'Provisoire (Hors Ligne)'}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">
                          {clientObj ? clientObj.nom_complet : 'Client non référencé'}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {clientObj?.telephone}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-200">
                          {vehiculeObj ? `${vehiculeObj.marque} ${vehiculeObj.modele}` : 'Véhicule'}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {vehiculeObj?.vin}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white tabular-nums">
                        {formatDzd(vente.total_net_dzd)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-emerald-400 tabular-nums">
                        {formatDzd(vente.montant_encaisse_dzd)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        {vente.solde_restant_dzd > 0 ? (
                          <span className="font-bold text-amber-400">
                            {formatDzd(vente.solde_restant_dzd)}
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-semibold">Soldé</span>
                        )}
                      </td>

                      {/* Statut de validation */}
                      <td className="py-3.5 px-4 text-center">
                        {vente.statut_validation === 'confirme_central' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" /> Validé
                          </span>
                        )}
                        {vente.statut_validation === 'provisoire_local' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800" title="En attente de réconciliation avec le serveur">
                            <Clock className="w-3 h-3" /> Provisoire
                          </span>
                        )}
                        {vente.statut_validation === 'conflit_allocation' && (
                          <button
                            onClick={() => setReassignModalVente(vente)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-700 hover:bg-red-900 transition-colors"
                          >
                            <AlertTriangle className="w-3 h-3 text-red-400" />
                            <span>Conflit (Réaffecter)</span>
                          </button>
                        )}
                      </td>

                      {/* Bon de Sortie (Règle stricte de sécurité) */}
                      <td className="py-3.5 px-4 text-center">
                        {vente.bon_sortie_autorise ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" /> {lang === 'ar' ? 'مسموح' : 'Autorisé'}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-950/80 text-red-400 border border-red-800/80 cursor-help"
                            title={t.exitPassWarning}
                          >
                            <Ban className="w-3 h-3 text-red-400" /> {lang === 'ar' ? 'محظور (يوجد رصيد)' : 'Bloqué (Solde)'}
                          </span>
                        )}
                      </td>

                      {/* Actions d'impression & documents */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              setActiveDocumentVente(vente);
                              setDocumentTypeToPrint('contrat');
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                            title="Aperçu / Imprimer Contrat de Vente"
                          >
                            <FileText className="w-3.5 h-3.5 text-blue-400" />
                          </button>
                          <button
                            onClick={() => {
                              setActiveDocumentVente(vente);
                              setDocumentTypeToPrint('recu');
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                            title="Aperçu / Imprimer Reçu de Caisse"
                          >
                            <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                          </button>
                          {vente.bon_sortie_autorise && (
                            <button
                              onClick={() => {
                                setActiveDocumentVente(vente);
                                setDocumentTypeToPrint('bon_sortie');
                              }}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                              title="Aperçu / Imprimer Bon de Sortie"
                            >
                              <Printer className="w-3.5 h-3.5 text-purple-400" />
                            </button>
                          )}
                          {vente.statut_validation !== 'conflit_allocation' && (
                            <button
                              onClick={() => handleSimulateConflict(vente)}
                              className="p-1 rounded bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-300 transition-colors"
                              title="Simuler un conflit d'allocation serveur pour test"
                            >
                              <BadgeAlert className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nouvelle Vente */}
      {isNewVenteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col text-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                <h2 className="text-base font-bold text-white">
                  {lang === 'ar' ? 'تسجيل عقد بيع جديد' : 'Établir une Vente & Contrat'}
                </h2>
              </div>
              <button
                onClick={() => setIsNewVenteModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateVente} className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Note de mode hors-ligne si déconnecté */}
              {!isEffectivelyOnline && (
                <div className="p-3 bg-amber-950/40 border border-amber-800 rounded-lg text-amber-200 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    {lang === 'ar'
                      ? 'أنت تعمل بدون إنترنت: سيتم تسجيل العقد كـ "مؤقت محلياً" وترحيله تلقائياً للسحابة فور عودة الشبكة.'
                      : 'Mode Hors-Ligne : Cette vente recevra un numéro provisoire unique et sera réconciliée dès la reconnexion.'}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Choix Client */}
                <div>
                  <label className="block text-slate-400 mb-1">Sélectionner le Client *</label>
                  <select
                    required
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Choisir un client --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom_complet} ({c.telephone})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Choix Véhicule */}
                <div>
                  <label className="block text-slate-400 mb-1">Sélectionner le Véhicule (En stock) *</label>
                  <select
                    required
                    value={selectedVehiculeId}
                    onChange={(e) => setSelectedVehiculeId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Choisir un véhicule --</option>
                    {availableVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.marque} {v.modele} - {formatDzd(v.prix_vente_dzd)} ({v.vin})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Détails Financiers */}
              {selectedVehiculeObj && (
                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Prix catalogue affiché :</span>
                    <span className="font-mono font-bold text-white tabular-nums">
                      {formatDzd(selectedVehiculeObj.prix_vente_dzd)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-400 mb-1">Remise commerciale accordée (DZD)</label>
                      <input
                        type="number"
                        min={0}
                        step={10000}
                        value={formRemise}
                        onChange={(e) => setFormRemise(Number(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Montant versé immédiatement (Acompte ou Solde)</label>
                      <input
                        type="number"
                        min={0}
                        step={50000}
                        value={formMontantPaye}
                        onChange={(e) => setFormMontantPaye(Number(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-emerald-400 font-mono font-bold focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Solde restant calculé en direct */}
                  <div className="pt-2 border-t border-slate-700/80 flex items-center justify-between">
                    <span className="font-semibold text-slate-200">Solde Restant Dû :</span>
                    <span className="font-mono font-bold text-amber-400 text-sm tabular-nums">
                      {formatDzd(Math.max(0, selectedVehiculeObj.prix_vente_dzd - formRemise - formMontantPaye))}
                    </span>
                  </div>

                  {formMontantPaye < (selectedVehiculeObj.prix_vente_dzd - formRemise) && (
                    <div className="text-[11px] text-amber-300/90 flex items-center gap-1.5 pt-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Rappel sécurité : Le Bon de Sortie restera bloqué jusqu'au règlement complet.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Mode de règlement de l'acompte/solde */}
              {formMontantPaye > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div>
                    <label className="block text-slate-400 mb-1">Mode de Règlement *</label>
                    <select
                      value={formModePaiement}
                      onChange={(e) => setFormModePaiement(e.target.value as PaymentMode)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none"
                    >
                      <option value="especes">Espèces (Caisse)</option>
                      <option value="cheque">Chèque Certifié</option>
                      <option value="virement">Virement Bancaire</option>
                      <option value="traite">Traite / Effet</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Référence (N° Chèque / Virement)</label>
                    <input
                      type="text"
                      value={formRefBancaire}
                      onChange={(e) => setFormRefBancaire(e.target.value)}
                      placeholder="Ex: CHQ-994821"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Banque Émettrice</label>
                    <select
                      value={formBanque}
                      onChange={(e) => setFormBanque(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none"
                    >
                      <option value="BNA">BNA (Banque Nationale d'Algérie)</option>
                      <option value="CPA">CPA (Crédit Populaire d'Algérie)</option>
                      <option value="BEA">BEA (Banque Extérieure d'Algérie)</option>
                      <option value="BDL">BDL (Banque de Développement Local)</option>
                      <option value="BADR">BADR</option>
                      <option value="Autre">Autre banque agréée</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsNewVenteModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  {t.actionCancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-sm"
                >
                  {lang === 'ar' ? 'تأكيد وحفظ العقد' : 'Émettre la vente & le reçu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal d'Aperçu & Impression de Documents */}
      {activeDocumentVente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col text-slate-100 overflow-hidden">
            {/* Modal Controls Bar */}
            <div className="px-6 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDocumentTypeToPrint('contrat')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    documentTypeToPrint === 'contrat' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Contrat de Vente
                </button>
                <button
                  onClick={() => setDocumentTypeToPrint('recu')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    documentTypeToPrint === 'recu' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Reçu de Caisse
                </button>
                {activeDocumentVente.bon_sortie_autorise && (
                  <button
                    onClick={() => setDocumentTypeToPrint('bon_sortie')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      documentTypeToPrint === 'bon_sortie' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Bon de Sortie
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimer</span>
                </button>
                <button
                  onClick={() => setActiveDocumentVente(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Document Content Viewport (Printable Sheet) */}
            <div className="p-8 overflow-y-auto flex-1 bg-white text-slate-900 font-sans print:p-0">
              {/* Document Header */}
              <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-start">
                <div>
                  <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                    SHOWROOM AUTOMOBILE VAL D'HYDRA
                  </h1>
                  <p className="text-xs text-slate-600 mt-0.5">
                    12 Boulevard des Martyrs, Hydra, Alger · Algérie
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    RC: 16/00-0987654B22 · NIF: 002216098765432 · NIS: 0022160987
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-sm font-bold uppercase tracking-wider text-slate-700">
                    {documentTypeToPrint === 'contrat'
                      ? 'CONTRAT DE VENTE VÉHICULE'
                      : documentTypeToPrint === 'recu'
                      ? 'REÇU D\'ENCAISSEMENT OFFICIEL'
                      : 'BON DE SORTIE DE PARC'}
                  </div>
                  <div className="text-base font-mono font-bold text-blue-900 mt-1">
                    {documentTypeToPrint === 'contrat'
                      ? activeDocumentVente.numero_contrat
                      : documentTypeToPrint === 'recu'
                      ? `REC-${activeDocumentVente.numero_contrat.slice(-8)}`
                      : activeDocumentVente.bon_sortie_numero || 'BS-PROV'}
                  </div>
                  <div className="text-xs text-slate-500">
                    Date: {new Date(activeDocumentVente.date_vente).toLocaleDateString('fr-DZ')}
                  </div>
                </div>
              </div>

              {/* Watermark if offline or provisional */}
              {activeDocumentVente.statut_validation === 'provisoire_local' && (
                <div className="p-2 mb-4 bg-amber-50 border border-amber-300 rounded text-center text-amber-800 text-xs font-bold uppercase tracking-wider">
                  ⚠️ DOCUMENT PROVISOIRE ÉMIS EN MODE HORS-LIGNE — EN ATTENTE DE VALIDATION CENTRALE
                </div>
              )}

              {/* Document Body depending on type */}
              {documentTypeToPrint === 'contrat' && (
                <div className="space-y-6 text-xs text-slate-800">
                  {/* Parties */}
                  <div className="grid grid-cols-2 gap-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    <div>
                      <div className="font-bold text-slate-900 uppercase mb-1">Le Vendeur :</div>
                      <div>SARL AUTO GESTION ALGERIE</div>
                      <div>Showroom Principal Val d'Hydra</div>
                      <div>Tél : 023 45 67 89 / 0550 00 11 22</div>
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 uppercase mb-1">L'Acquéreur :</div>
                      <div className="font-bold">
                        {clients.find(c => c.id === activeDocumentVente.client_id)?.nom_complet}
                      </div>
                      <div>Tél : {clients.find(c => c.id === activeDocumentVente.client_id)?.telephone}</div>
                      <div>
                        CNI N° : {clients.find(c => c.id === activeDocumentVente.client_id)?.piece_identite_numero}
                      </div>
                      <div>
                        Adresse : {clients.find(c => c.id === activeDocumentVente.client_id)?.adresse},{' '}
                        {clients.find(c => c.id === activeDocumentVente.client_id)?.wilaya}
                      </div>
                    </div>
                  </div>

                  {/* Vehicle Details */}
                  {(() => {
                    const veh = vehicules.find(v => v.id === activeDocumentVente.vehicule_id);
                    return (
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-slate-100 text-slate-700">
                            <tr>
                              <th className="py-2 px-3">Désignation Véhicule</th>
                              <th className="py-2 px-3">N° Châssis (VIN)</th>
                              <th className="py-2 px-3">Année</th>
                              <th className="py-2 px-3">Carburant</th>
                              <th className="py-2 px-3 text-right">Prix Net TTC</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="py-3 px-3 font-bold">
                                {veh?.marque} {veh?.modele} {veh?.version || ''} ({veh?.couleur})
                              </td>
                              <td className="py-3 px-3 font-mono">{veh?.vin}</td>
                              <td className="py-3 px-3">{veh?.annee}</td>
                              <td className="py-3 px-3 capitalize">{veh?.carburant}</td>
                              <td className="py-3 px-3 text-right font-mono font-bold">
                                {formatDzd(activeDocumentVente.total_net_dzd)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}

                  {/* Financial Summary */}
                  <div className="flex justify-end">
                    <div className="w-64 space-y-1.5 p-3 bg-slate-50 border border-slate-200 rounded-lg text-right">
                      <div className="flex justify-between">
                        <span>Total Net Convenu :</span>
                        <span className="font-mono font-bold">{formatDzd(activeDocumentVente.total_net_dzd)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700">
                        <span>Montant Reçu :</span>
                        <span className="font-mono font-bold">{formatDzd(activeDocumentVente.montant_encaisse_dzd)}</span>
                      </div>
                      <div className="flex justify-between text-slate-900 border-t border-slate-300 pt-1 font-bold">
                        <span>Solde Restant Dû :</span>
                        <span className="font-mono">{formatDzd(activeDocumentVente.solde_restant_dzd)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Signatures */}
                  <div className="pt-12 grid grid-cols-2 gap-12 text-center text-xs">
                    <div>
                      <div className="font-bold uppercase text-slate-900 mb-16">Signature du Client & Mention "Lu et Approuvé"</div>
                      <div className="border-t border-slate-400 w-48 mx-auto"></div>
                    </div>
                    <div>
                      <div className="font-bold uppercase text-slate-900 mb-16">Cachet et Signature de la Direction Commerciale</div>
                      <div className="border-t border-slate-400 w-48 mx-auto"></div>
                    </div>
                  </div>
                </div>
              )}

              {documentTypeToPrint === 'recu' && (
                <div className="space-y-6 text-xs text-slate-800">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="text-sm font-bold text-slate-900 mb-2">
                      Reçu de : {clients.find(c => c.id === activeDocumentVente.client_id)?.nom_complet}
                    </div>
                    <div className="text-sm font-semibold text-emerald-800 mb-1">
                      La somme de : {formatDzd(activeDocumentVente.montant_encaisse_dzd)}
                    </div>
                    <div className="text-xs text-slate-600 italic">
                      En toutes lettres : {convertToDzdLetters(activeDocumentVente.montant_encaisse_dzd)}
                    </div>
                  </div>

                  <div className="text-right pt-8">
                    <div className="font-bold uppercase mb-16">Signature et Cachet du Caissier</div>
                    <div className="border-t border-slate-400 w-48 ml-auto"></div>
                  </div>
                </div>
              )}

              {documentTypeToPrint === 'bon_sortie' && (
                <div className="space-y-6 text-xs text-slate-800">
                  <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-900 font-semibold">
                    AUTORISATION DE SORTIE DE PARC N° {activeDocumentVente.bon_sortie_numero}
                    <div className="text-xs font-normal text-emerald-800 mt-1">
                      Le solde du véhicule a été certifié intégralement soldé. La garde physique peut être transférée au client.
                    </div>
                  </div>

                  {(() => {
                    const veh = vehicules.find(v => v.id === activeDocumentVente.vehicule_id);
                    return (
                      <div className="p-4 border border-slate-200 rounded-lg space-y-1">
                        <div><span className="font-bold">Véhicule :</span> {veh?.marque} {veh?.modele}</div>
                        <div><span className="font-bold">VIN (Châssis) :</span> {veh?.vin}</div>
                        <div><span className="font-bold">Couleur :</span> {veh?.couleur}</div>
                        <div><span className="font-bold">Client Destinataire :</span> {clients.find(c => c.id === activeDocumentVente.client_id)?.nom_complet}</div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 gap-12 pt-8 text-center">
                    <div>
                      <div className="font-bold uppercase mb-16">Visa Chef de Parc & Contrôle Sortie</div>
                      <div className="border-t border-slate-400 w-48 mx-auto"></div>
                    </div>
                    <div>
                      <div className="font-bold uppercase mb-16">Émargement Réception Client</div>
                      <div className="border-t border-slate-400 w-48 mx-auto"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Réaffectation en cas de Conflit */}
      {reassignModalVente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-red-700 rounded-xl shadow-2xl w-full max-w-lg p-6 text-slate-100">
            <div className="flex items-center gap-3 mb-4 text-red-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-base text-white">
                Résolution de Conflit d'Allocation
              </h3>
            </div>

            <p className="text-xs text-slate-300 mb-4">
              Ce dossier client et les acomptes versés sont protégés. Veuillez sélectionner un autre véhicule équivalent disponible en stock :
            </p>

            <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
              {availableVehicles.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-xs">
                  Aucun autre véhicule disponible en stock actuellement.
                </div>
              ) : (
                availableVehicles.map((veh) => (
                  <button
                    key={veh.id}
                    onClick={() => handleExecuteReassignment(veh.id)}
                    className="w-full p-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left text-xs flex items-center justify-between transition-colors"
                  >
                    <div>
                      <div className="font-bold text-white">{veh.marque} {veh.modele}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{veh.vin} · {veh.couleur}</div>
                    </div>
                    <div className="font-mono text-emerald-400 font-bold">
                      {formatDzd(veh.prix_vente_dzd)}
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setReassignModalVente(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold"
              >
                {t.actionCancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
