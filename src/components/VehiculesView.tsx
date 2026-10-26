import React, { useEffect, useState } from 'react';
import {
  Car,
  Search,
  Filter,
  Plus,
  ArrowRightLeft,
  Warehouse,
  Check,
  X,
  Tag,
  AlertCircle,
  Eye,
  Receipt,
  TrendingUp,
  Percent,
  Trash2,
} from 'lucide-react';
import { db } from '../services/db';
import { syncEngine } from '../services/syncEngine';
import type {
  Vehicule,
  Depot,
  FuelType,
  TransmissionType,
  VehicleStatus,
  VehicleCondition,
  DepotId,
  FraisVehicule,
  FraisCategorie,
} from '../types';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';

interface VehiculesViewProps {
  lang: Language;
}

export const VehiculesView: React.FC<VehiculesViewProps> = ({ lang }) => {
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [fraisList, setFraisList] = useState<FraisVehicule[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepot, setSelectedDepot] = useState<string>('all');
  const [selectedStatut, setSelectedStatut] = useState<string>('all');
  const [selectedCondition, setSelectedCondition] = useState<string>('all');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [transferVehicle, setTransferVehicle] = useState<Vehicule | null>(null);
  const [activeExpensesVehicle, setActiveExpensesVehicle] = useState<Vehicule | null>(null);

  // Formulaire d'ajout véhicule
  const [formVin, setFormVin] = useState('');
  const [formMarque, setFormMarque] = useState('Toyota');
  const [formModele, setFormModele] = useState('');
  const [formVersion, setFormVersion] = useState('');
  const [formAnnee, setFormAnnee] = useState(2025);
  const [formCouleur, setFormCouleur] = useState('');
  const [formKm, setFormKm] = useState(0);
  const [formCarburant, setFormCarburant] = useState<FuelType>('essence');
  const [formBoite, setFormBoite] = useState<TransmissionType>('automatique');
  const [formCondition, setFormCondition] = useState<VehicleCondition>('neuf');
  const [formPrixAchat, setFormPrixAchat] = useState<number>(5000000);
  const [formPrixVente, setFormPrixVente] = useState<number>(5700000);
  const [formDepot, setFormDepot] = useState<DepotId>('showroom');
  const [formNotes, setFormNotes] = useState('');

  // Formulaire d'ajout de frais annexe
  const [formFraisCat, setFormFraisCat] = useState<FraisCategorie>('transport');
  const [formFraisMontant, setFormFraisMontant] = useState<number>(30000);
  const [formFraisDesc, setFormFraisDesc] = useState('');
  const [formFraisFournisseur, setFormFraisFournisseur] = useState('');

  const t = translations[lang];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const vList = await db.vehicules.reverse().sortBy('created_at');
    const dList = await db.depots.toArray();
    const fList = await db.frais_vehicules.toArray();
    setVehicules(vList);
    setDepots(dList);
    setFraisList(fList);

    // Mettre à jour le véhicule sélectionné pour les frais si ouvert
    if (activeExpensesVehicle) {
      const refreshed = vList.find(v => v.id === activeExpensesVehicle.id);
      if (refreshed) setActiveExpensesVehicle(refreshed);
    }
  };

  const formatDzd = (amount: number) => {
    return new Intl.NumberFormat(lang === 'ar' ? 'ar-DZ' : 'fr-DZ', {
      maximumFractionDigits: 0,
    }).format(amount) + ' ' + t.currencyDzd;
  };

  const handleCreateVehicule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formVin || !formMarque || !formModele) {
      alert(lang === 'ar' ? 'يرجى ملء جميع الحقول الإلزامية' : 'Veuillez remplir les champs obligatoires.');
      return;
    }

    const id = `v-${Date.now()}`;
    const prixAchat = Number(formPrixAchat);
    const prixVente = Number(formPrixVente);
    const margeInitiale = prixVente - prixAchat;

    const newVehicule: Vehicule = {
      id,
      vin: formVin.toUpperCase().trim(),
      marque: formMarque,
      modele: formModele,
      version: formVersion,
      annee: Number(formAnnee),
      couleur: formCouleur,
      kilometrage: Number(formKm),
      carburant: formCarburant,
      boite: formBoite,
      etat_physique: formCondition,
      prix_achat_dzd: prixAchat,
      prix_vente_dzd: prixVente,
      total_frais_annexes_dzd: 0,
      marge_estimee_dzd: margeInitiale,
      statut: 'en_stock',
      depot_actuel: formDepot,
      notes: formNotes,
      version_seq: 1,
      updated_at: Date.now(),
      created_at: Date.now(),
    };

    await db.vehicules.add(newVehicule);
    await syncEngine.enqueueOperation('vehicule', id, 'CREATE', newVehicule);

    setIsAddModalOpen(false);
    resetForm();
    await loadData();
  };

  const handleExecuteTransfer = async (targetDepot: DepotId) => {
    if (!transferVehicle) return;

    const updatedVehicle: Vehicule = {
      ...transferVehicle,
      depot_actuel: targetDepot,
      version_seq: transferVehicle.version_seq + 1,
      updated_at: Date.now(),
    };

    await db.vehicules.put(updatedVehicle);
    await syncEngine.enqueueOperation('vehicule', transferVehicle.id, 'UPDATE', {
      depot_actuel: targetDepot,
      version_seq: updatedVehicle.version_seq,
      updated_at: updatedVehicle.updated_at,
    });

    setTransferVehicle(null);
    await loadData();
  };

  const handleAddFrais = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeExpensesVehicle || !formFraisMontant || !formFraisDesc) return;

    const fraisId = `fr-${Date.now()}`;
    const newFrais: FraisVehicule = {
      id: fraisId,
      vehicule_id: activeExpensesVehicle.id,
      categorie: formFraisCat,
      montant_dzd: Number(formFraisMontant),
      description: formFraisDesc,
      fournisseur_beneficiaire: formFraisFournisseur || undefined,
      date_frais: Date.now(),
      cree_par: 'Gérant Showroom',
      created_at: Date.now(),
    };

    // 1. Sauvegarder le frais dans Dexie
    await db.frais_vehicules.add(newFrais);

    // 2. Recalculer le total des frais et la marge nette du véhicule
    const existingFrais = await db.frais_vehicules.where('vehicule_id').equals(activeExpensesVehicle.id).toArray();
    const totalFrais = existingFrais.reduce((sum, f) => sum + f.montant_dzd, 0);
    const coutTotal = activeExpensesVehicle.prix_achat_dzd + totalFrais;
    const nouvelleMarge = activeExpensesVehicle.prix_vente_dzd - coutTotal;

    const updatedVehicule: Vehicule = {
      ...activeExpensesVehicle,
      total_frais_annexes_dzd: totalFrais,
      marge_estimee_dzd: nouvelleMarge,
      updated_at: Date.now(),
    };

    await db.vehicules.put(updatedVehicule);
    await syncEngine.enqueueOperation('frais', fraisId, 'CREATE', newFrais);
    await syncEngine.enqueueOperation('vehicule', activeExpensesVehicle.id, 'UPDATE', {
      total_frais_annexes_dzd: totalFrais,
      marge_estimee_dzd: nouvelleMarge,
      updated_at: Date.now(),
    });

    setFormFraisDesc('');
    setFormFraisFournisseur('');
    await loadData();
    setActiveExpensesVehicle(updatedVehicule);
  };

  const handleDeleteFrais = async (fraisId: string) => {
    if (!activeExpensesVehicle) return;

    await db.frais_vehicules.delete(fraisId);

    const remainingFrais = await db.frais_vehicules.where('vehicule_id').equals(activeExpensesVehicle.id).toArray();
    const totalFrais = remainingFrais.reduce((sum, f) => sum + f.montant_dzd, 0);
    const coutTotal = activeExpensesVehicle.prix_achat_dzd + totalFrais;
    const nouvelleMarge = activeExpensesVehicle.prix_vente_dzd - coutTotal;

    const updatedVehicule: Vehicule = {
      ...activeExpensesVehicle,
      total_frais_annexes_dzd: totalFrais,
      marge_estimee_dzd: nouvelleMarge,
      updated_at: Date.now(),
    };

    await db.vehicules.put(updatedVehicule);
    await syncEngine.enqueueOperation('frais', fraisId, 'DELETE', { vehicule_id: activeExpensesVehicle.id });

    await loadData();
    setActiveExpensesVehicle(updatedVehicule);
  };

  const resetForm = () => {
    setFormVin('');
    setFormModele('');
    setFormVersion('');
    setFormCouleur('');
    setFormKm(0);
    setFormNotes('');
  };

  // Filtrage multicritères
  const filteredVehicules = vehicules.filter((v) => {
    const matchesSearch =
      v.marque.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.modele.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.vin.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.version && v.version.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesDepot = selectedDepot === 'all' || v.depot_actuel === selectedDepot;
    const matchesStatut = selectedStatut === 'all' || v.statut === selectedStatut;
    const matchesCondition = selectedCondition === 'all' || v.etat_physique === selectedCondition;

    return matchesSearch && matchesDepot && matchesStatut && matchesCondition;
  });

  const getConditionLabel = (cond: VehicleCondition) => {
    switch (cond) {
      case 'neuf': return t.condNew;
      case 'occasion': return t.condUsed;
      case 'en_preparation': return t.condPrep;
      case 'en_reparation': return t.condRepair;
      case 'endommage': return t.condDamaged;
      default: return cond;
    }
  };

  const getFraisCatLabel = (cat: FraisCategorie) => {
    switch (cat) {
      case 'transport': return t.expTransport;
      case 'preparation': return t.expPrep;
      case 'reparation': return t.expRepair;
      case 'formalites': return t.expAdmin;
      case 'autre': return t.expOther;
      default: return cat;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {lang === 'ar' ? 'إدارة كتالوج السيارات، المصاريف والهامش' : 'Catalogue des Véhicules, Frais & Marges'}
          </h1>
          <p className="text-xs text-slate-400">
            {lang === 'ar'
              ? 'تتبع أسعار الشراء، المصاريف الإضافية المفصلة وحساب هامش الربح الصافي بدقة'
              : 'Prix d\'achat retenus en DZD, imputation des frais annexes et marge nette par véhicule'}
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'ar' ? 'إضافة سيارة جديدة' : 'Nouveau Véhicule'}</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col md:flex-row items-center gap-4 text-xs">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={lang === 'ar' ? 'بحث بالماركة، الموديل، أو رقم الشاسيه VIN...' : 'Recherche marque, modèle, VIN 17 caractères...'}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Condition Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-slate-400 whitespace-nowrap">{t.condition}:</span>
          <select
            value={selectedCondition}
            onChange={(e) => setSelectedCondition(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
          >
            <option value="all">{lang === 'ar' ? 'جميع الحالات' : 'Tous les états'}</option>
            <option value="neuf">{t.condNew}</option>
            <option value="occasion">{t.condUsed}</option>
            <option value="en_preparation">{t.condPrep}</option>
            <option value="en_reparation">{t.condRepair}</option>
          </select>
        </div>

        {/* Depot Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-slate-400 whitespace-nowrap">{t.location}:</span>
          <select
            value={selectedDepot}
            onChange={(e) => setSelectedDepot(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
          >
            <option value="all">{lang === 'ar' ? 'جميع الحظائر' : 'Tous les parcs'}</option>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {lang === 'ar' ? d.nom_ar : d.nom}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-slate-400 whitespace-nowrap">{t.status}:</span>
          <select
            value={selectedStatut}
            onChange={(e) => setSelectedStatut(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
          >
            <option value="all">{lang === 'ar' ? 'جميع الحالات' : 'Tous les statuts'}</option>
            <option value="en_stock">{t.statusInStock}</option>
            <option value="reserve">{t.statusReserved}</option>
            <option value="vendu">{t.statusSold}</option>
          </select>
        </div>
      </div>

      {/* Vehicles Table with Margin and Expenses Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4 font-semibold">{t.brand} & {t.model}</th>
                <th className="py-3.5 px-4 font-semibold">{t.vin}</th>
                <th className="py-3.5 px-4 font-semibold">{t.location}</th>
                <th className="py-3.5 px-4 font-semibold text-right">{t.purchasePriceRetained}</th>
                <th className="py-3.5 px-4 font-semibold text-right">{t.expensesDetails}</th>
                <th className="py-3.5 px-4 font-semibold text-right">{t.salePrice}</th>
                <th className="py-3.5 px-4 font-semibold text-right">{t.estimatedMargin}</th>
                <th className="py-3.5 px-4 font-semibold text-center">{t.status}</th>
                <th className="py-3.5 px-4 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredVehicules.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <Car className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>{lang === 'ar' ? 'لا توجد سيارات مطابقة لشروط البحث.' : 'Aucun véhicule ne correspond aux critères.'}</p>
                  </td>
                </tr>
              ) : (
                filteredVehicules.map((vehicule) => {
                  const depotObj = depots.find(d => d.id === vehicule.depot_actuel);
                  const totalFrais = vehicule.total_frais_annexes_dzd || 0;
                  const coutTotal = vehicule.prix_achat_dzd + totalFrais;
                  const marge = vehicule.marge_estimee_dzd ?? (vehicule.prix_vente_dzd - coutTotal);
                  const tauxMarge = vehicule.prix_vente_dzd > 0 ? ((marge / vehicule.prix_vente_dzd) * 100).toFixed(1) : '0';

                  return (
                    <tr key={vehicule.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">
                            {vehicule.marque} {vehicule.modele}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                            {getConditionLabel(vehicule.etat_physique || 'neuf')}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {vehicule.version || ''} · {vehicule.annee} · {vehicule.couleur} · {vehicule.kilometrage === 0 ? '0 km (Neuf)' : `${vehicule.kilometrage} km`}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {vehicule.vin}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="text-slate-300 flex items-center gap-1.5">
                          <Warehouse className="w-3.5 h-3.5 text-blue-400" />
                          {depotObj ? (lang === 'ar' ? depotObj.nom_ar : depotObj.nom) : vehicule.depot_actuel}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-slate-300 tabular-nums">
                        {formatDzd(vehicule.prix_achat_dzd)}
                      </td>

                      {/* Frais Annexes Détaillés */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setActiveExpensesVehicle(vehicule)}
                          className="font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline tabular-nums inline-flex items-center gap-1"
                          title="Gérer les frais annexes (transport, préparation, formalités)"
                        >
                          <Receipt className="w-3 h-3 text-blue-400" />
                          <span>{totalFrais > 0 ? `+${formatDzd(totalFrais)}` : '0 DZD (Ajouter)'}</span>
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white tabular-nums">
                        {formatDzd(vehicule.prix_vente_dzd)}
                      </td>

                      {/* Marge Nette Estimée & Taux */}
                      <td className="py-3.5 px-4 text-right">
                        <div className={`font-mono font-bold tabular-nums ${marge >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {marge >= 0 ? `+${formatDzd(marge)}` : formatDzd(marge)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {tauxMarge}% marge
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${
                          vehicule.statut === 'en_stock'
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80'
                            : vehicule.statut === 'reserve'
                            ? 'bg-amber-950/80 text-amber-300 border border-amber-800/80'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          {vehicule.statut === 'en_stock'
                            ? t.statusInStock
                            : vehicule.statut === 'reserve'
                            ? t.statusReserved
                            : t.statusSold}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setActiveExpensesVehicle(vehicule)}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 transition-colors border border-slate-700"
                            title="Frais annexes et marge nette"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setTransferVehicle(vehicule)}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700"
                            title="Transférer vers un autre parc"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5 text-blue-400" />
                          </button>
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

      {/* Modal Détails & Imputation des Frais Annexes */}
      {activeExpensesVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col text-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-400" />
                <div>
                  <h2 className="text-base font-bold text-white">
                    {lang === 'ar' ? 'المصاريف الإضافية وهامش الربح' : 'Frais Annexes & Calcul de Marge Nette'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {activeExpensesVehicle.marque} {activeExpensesVehicle.modele} ({activeExpensesVehicle.vin})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveExpensesVehicle(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              {/* Financial Recap Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                  <div className="text-slate-400 text-[11px] mb-1">{t.purchasePriceRetained}</div>
                  <div className="font-mono font-bold text-slate-200">
                    {formatDzd(activeExpensesVehicle.prix_achat_dzd)}
                  </div>
                </div>

                <div className="p-3 bg-blue-950/30 border border-blue-800/60 rounded-lg">
                  <div className="text-blue-300 text-[11px] mb-1">{t.expensesDetails}</div>
                  <div className="font-mono font-bold text-blue-400">
                    +{formatDzd(activeExpensesVehicle.total_frais_annexes_dzd || 0)}
                  </div>
                </div>

                <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                  <div className="text-slate-400 text-[11px] mb-1">{t.totalCost}</div>
                  <div className="font-mono font-bold text-white">
                    {formatDzd(activeExpensesVehicle.prix_achat_dzd + (activeExpensesVehicle.total_frais_annexes_dzd || 0))}
                  </div>
                </div>

                <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-lg">
                  <div className="text-emerald-300 text-[11px] mb-1">{t.estimatedMargin}</div>
                  <div className="font-mono font-bold text-emerald-400 text-sm">
                    {formatDzd(activeExpensesVehicle.marge_estimee_dzd ?? (activeExpensesVehicle.prix_vente_dzd - activeExpensesVehicle.prix_achat_dzd - (activeExpensesVehicle.total_frais_annexes_dzd || 0)))}
                  </div>
                </div>
              </div>

              {/* Formulaire d'ajout de frais */}
              <form onSubmit={handleAddFrais} className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-blue-400" />
                  <span>{t.addExpense}</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Catégorie de Frais *</label>
                    <select
                      value={formFraisCat}
                      onChange={(e) => setFormFraisCat(e.target.value as FraisCategorie)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
                    >
                      <option value="transport">{t.expTransport}</option>
                      <option value="preparation">{t.expPrep}</option>
                      <option value="reparation">{t.expRepair}</option>
                      <option value="formalites">{t.expAdmin}</option>
                      <option value="autre">{t.expOther}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Montant en Dinars (DZD) *</label>
                    <input
                      type="number"
                      required
                      step={5000}
                      value={formFraisMontant}
                      onChange={(e) => setFormFraisMontant(Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono font-bold focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Fournisseur / Prestataire</label>
                    <input
                      type="text"
                      value={formFraisFournisseur}
                      onChange={(e) => setFormFraisFournisseur(e.target.value)}
                      placeholder="Ex: TransAuto DZ, Garage..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Description / Justification du frais *</label>
                  <input
                    type="text"
                    required
                    value={formFraisDesc}
                    onChange={(e) => setFormFraisDesc(e.target.value)}
                    placeholder="Ex: Transport porte-voiture Port d'Alger vers Showroom Val d'Hydra..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-sm transition-colors"
                  >
                    {lang === 'ar' ? 'إضافة المصروف وتحديث الهامش' : 'Imputer le frais et recalculer la marge'}
                  </button>
                </div>
              </form>

              {/* Liste des frais enregistrés */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Historique des Frais Affectés ({fraisList.filter(f => f.vehicule_id === activeExpensesVehicle.id).length})
                </h3>

                {fraisList.filter(f => f.vehicule_id === activeExpensesVehicle.id).length === 0 ? (
                  <div className="py-6 text-center text-slate-500 border border-dashed border-slate-800 rounded-lg">
                    Aucun frais annexe imputé à ce véhicule.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {fraisList
                      .filter(f => f.vehicule_id === activeExpensesVehicle.id)
                      .map((frais) => (
                        <div
                          key={frais.id}
                          className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-lg flex items-center justify-between"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white">
                                {getFraisCatLabel(frais.categorie)}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(frais.date_frais).toLocaleDateString('fr-DZ')}
                              </span>
                              {frais.fournisseur_beneficiaire && (
                                <span className="text-[10px] text-blue-400">
                                  ({frais.fournisseur_beneficiaire})
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-300">
                              {frais.description}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Enregistré par {frais.cree_par}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-white text-xs tabular-nums">
                              {formatDzd(frais.montant_dzd)}
                            </span>
                            <button
                              onClick={() => handleDeleteFrais(frais.id)}
                              className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700 transition-colors"
                              title="Supprimer ce frais"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'ajout de véhicule */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col text-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <Car className="w-5 h-5 text-blue-400" />
                <h2 className="text-base font-bold text-white">
                  {lang === 'ar' ? 'إدخال سيارة جديدة في المخزون' : 'Ajouter un Véhicule en Stock'}
                </h2>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateVehicule} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">{t.vin} * (17 caractères)</label>
                  <input
                    type="text"
                    required
                    maxLength={17}
                    value={formVin}
                    onChange={(e) => setFormVin(e.target.value.toUpperCase())}
                    placeholder="Ex: AHTFZ29G800123456"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-blue-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{t.brand} *</label>
                  <select
                    value={formMarque}
                    onChange={(e) => setFormMarque(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="Toyota">Toyota</option>
                    <option value="Hyundai">Hyundai</option>
                    <option value="Geely">Geely</option>
                    <option value="Chery">Chery</option>
                    <option value="Dacia">Dacia</option>
                    <option value="Fiat">Fiat</option>
                    <option value="Renault">Renault</option>
                    <option value="Kia">Kia</option>
                    <option value="Volkswagen">Volkswagen</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{t.model} *</label>
                  <input
                    type="text"
                    required
                    value={formModele}
                    onChange={(e) => setFormModele(e.target.value)}
                    placeholder="Ex: Hilux, Tucson, Coolray..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{t.version}</label>
                  <input
                    type="text"
                    value={formVersion}
                    onChange={(e) => setFormVersion(e.target.value)}
                    placeholder="Ex: Adventure 4x4 BVA"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{t.condition} *</label>
                  <select
                    value={formCondition}
                    onChange={(e) => setFormCondition(e.target.value as VehicleCondition)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="neuf">{t.condNew}</option>
                    <option value="occasion">{t.condUsed}</option>
                    <option value="en_preparation">{t.condPrep}</option>
                    <option value="en_reparation">{t.condRepair}</option>
                    <option value="endommage">{t.condDamaged}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{t.year}</label>
                  <input
                    type="number"
                    min={2020}
                    max={2027}
                    value={formAnnee}
                    onChange={(e) => setFormAnnee(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{t.color}</label>
                  <input
                    type="text"
                    value={formCouleur}
                    onChange={(e) => setFormCouleur(e.target.value)}
                    placeholder="Ex: Blanc Nacré, Noir..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{t.fuel}</label>
                  <select
                    value={formCarburant}
                    onChange={(e) => setFormCarburant(e.target.value as FuelType)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="essence">{t.fuelPetrol}</option>
                    <option value="diesel">{t.fuelDiesel}</option>
                    <option value="hybride">{t.fuelHybrid}</option>
                    <option value="electrique">{t.fuelElectric}</option>
                    <option value="gpl">{t.fuelGpl}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{t.transmission}</label>
                  <select
                    value={formBoite}
                    onChange={(e) => setFormBoite(e.target.value as TransmissionType)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="automatique">{t.transAuto}</option>
                    <option value="manuelle">{t.transManual}</option>
                  </select>
                </div>

                {/* Saisie directe du prix d'achat retenu (DZD) */}
                <div className="p-3 bg-blue-950/30 border border-blue-800/60 rounded-lg">
                  <label className="block text-blue-300 font-semibold mb-1">
                    {t.purchasePriceRetained} *
                  </label>
                  <input
                    type="number"
                    step="50000"
                    required
                    value={formPrixAchat}
                    onChange={(e) => setFormPrixAchat(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-blue-400"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {lang === 'ar' ? 'سعر التكلفة الإجمالي المعتمد شاملاً مصاريف الشراء' : 'Prix de revient net retenu par le concessionnaire'}
                  </span>
                </div>

                {/* Prix de vente catalogue (DZD) */}
                <div className="p-3 bg-emerald-950/30 border border-emerald-800/60 rounded-lg">
                  <label className="block text-emerald-300 font-semibold mb-1">
                    {t.salePrice} *
                  </label>
                  <input
                    type="number"
                    step="50000"
                    required
                    value={formPrixVente}
                    onChange={(e) => setFormPrixVente(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-emerald-400"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {lang === 'ar' ? 'سعر العرض للزبون بالدينار الجزائري' : 'Prix catalogue affiché au client'}
                  </span>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{t.location} *</label>
                  <select
                    value={formDepot}
                    onChange={(e) => setFormDepot(e.target.value as DepotId)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    {depots.map((d) => (
                      <option key={d.id} value={d.id}>
                        {lang === 'ar' ? d.nom_ar : d.nom}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">{t.mileage} (km)</label>
                  <input
                    type="number"
                    min={0}
                    value={formKm}
                    onChange={(e) => setFormKm(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Notes & Options spécifiques</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Équipements particuliers, garantie concessionnaire..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
                >
                  {t.actionCancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-sm transition-colors"
                >
                  {lang === 'ar' ? 'تسجيل في المخزون المحلي' : 'Enregistrer dans le stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de transfert inter-dépôts */}
      {transferVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6 text-slate-100">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-blue-400" />
              <span>{lang === 'ar' ? 'تحويل موقع المركبة' : 'Transfert Physique de Parc'}</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {transferVehicle.marque} {transferVehicle.modele} ({transferVehicle.vin})
            </p>

            <div className="space-y-2 mb-6">
              {depots.map((d) => (
                <button
                  key={d.id}
                  disabled={d.id === transferVehicle.depot_actuel}
                  onClick={() => handleExecuteTransfer(d.id)}
                  className={`w-full p-3 rounded-lg border text-left text-xs font-semibold flex items-center justify-between transition-colors ${
                    d.id === transferVehicle.depot_actuel
                      ? 'bg-slate-800/40 border-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Warehouse className="w-4 h-4 text-blue-400" />
                    <span>{lang === 'ar' ? d.nom_ar : d.nom}</span>
                  </div>
                  {d.id === transferVehicle.depot_actuel ? (
                    <span className="text-[10px] text-slate-500">{lang === 'ar' ? 'الموقع الحالي' : 'Emplacement actuel'}</span>
                  ) : (
                    <span className="text-blue-400">{lang === 'ar' ? 'تحويل هنا' : 'Transférer ici'}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setTransferVehicle(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
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
