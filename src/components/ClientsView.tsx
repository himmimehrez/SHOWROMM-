import React, { useEffect, useState, useRef } from 'react';
import {
  Users,
  Search,
  Plus,
  Camera,
  Upload,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Clock,
  X,
  Phone,
  Mail,
  MapPin,
  Eye,
  MessageSquare,
  Calendar,
  DollarSign,
  Car,
  Filter,
} from 'lucide-react';
import { db } from '../services/db';
import { syncEngine } from '../services/syncEngine';
import { calculateSha256 } from '../services/crypto';
import type {
  Client,
  ClientDoc,
  ClientDocType,
  ProspectStatus,
  ProspectSource,
  InteractionClient,
  InteractionType,
} from '../types';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';

interface ClientsViewProps {
  lang: Language;
}

export const ClientsView: React.FC<ClientsViewProps> = ({ lang }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [documents, setDocuments] = useState<ClientDoc[]>([]);
  const [interactions, setInteractions] = useState<InteractionClient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);
  const [isAddInteractionModalOpen, setIsAddInteractionModalOpen] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [docTypeToCapture, setDocTypeToCapture] = useState<ClientDocType>('cni_recto');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ClientDoc | null>(null);

  // Formulaire client
  const [formType, setFormType] = useState<'particulier' | 'entreprise'>('particulier');
  const [formNom, setFormNom] = useState('');
  const [formNomAr, setFormNomAr] = useState('');
  const [formTel, setFormTel] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formWilaya, setFormWilaya] = useState('16 - Alger');
  const [formCommune, setFormCommune] = useState('');
  const [formAdresse, setFormAdresse] = useState('');
  const [formPieceType, setFormPieceType] = useState<'cni' | 'passeport' | 'permis'>('cni');
  const [formPieceNumero, setFormPieceNumero] = useState('');
  const [formPieceExpiration, setFormPieceExpiration] = useState('');
  const [formNifRc, setFormNifRc] = useState('');
  const [formProspectStatus, setFormProspectStatus] = useState<ProspectStatus>('nouveau');
  const [formProspectSource, setFormProspectSource] = useState<ProspectSource>('visite_showroom');
  const [formBudget, setFormBudget] = useState<number>(5000000);
  const [formVehiculeRecherche, setFormVehiculeRecherche] = useState('');

  // Formulaire interaction CRM
  const [formIntType, setFormIntType] = useState<InteractionType>('appel');
  const [formIntResume, setFormIntResume] = useState('');
  const [formIntNextAction, setFormIntNextAction] = useState('');
  const [formIntRappel, setFormIntRappel] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const t = translations[lang];

  useEffect(() => {
    loadClientsAndDocs();
    return () => {
      stopCamera();
    };
  }, []);

  const loadClientsAndDocs = async () => {
    const cList = await db.clients.reverse().sortBy('created_at');
    const dList = await db.documents_kyc.toArray();
    const iList = await db.interactions_clients.reverse().sortBy('date');
    setClients(cList);
    setDocuments(dList);
    setInteractions(iList);

    if (!selectedClient && cList.length > 0) {
      setSelectedClient(cList[0]);
    } else if (selectedClient) {
      const refreshed = cList.find(c => c.id === selectedClient.id);
      if (refreshed) setSelectedClient(refreshed);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNom || !formTel) {
      alert('Veuillez renseigner le nom et le numéro de téléphone.');
      return;
    }

    const id = `c-${Date.now()}`;
    const newClient: Client = {
      id,
      type: formType,
      nom_complet: formNom,
      nom_arabe: formNomAr,
      telephone: formTel,
      email: formEmail,
      wilaya: formWilaya,
      commune: formCommune,
      adresse: formAdresse,
      piece_identite_type: formPieceType,
      piece_identite_numero: formPieceNumero,
      piece_identite_expiration: formPieceExpiration,
      nif_nis_rc: formNifRc,
      statut_prospect: formProspectStatus,
      source_prospect: formProspectSource,
      budget_estime_dzd: Number(formBudget),
      vehicule_recherche: formVehiculeRecherche || undefined,
      documents_ids: [],
      updated_at: Date.now(),
      created_at: Date.now(),
    };

    await db.clients.add(newClient);
    await syncEngine.enqueueOperation('client', id, 'CREATE', newClient);

    setIsAddClientModalOpen(false);
    resetForm();
    await loadClientsAndDocs();
    setSelectedClient(newClient);
  };

  const handleAddInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !formIntResume) return;

    const intId = `int-${Date.now()}`;
    const newInteraction: InteractionClient = {
      id: intId,
      client_id: selectedClient.id,
      type: formIntType,
      date: Date.now(),
      resume: formIntResume,
      auteur: 'Commercial Showroom',
      prochaine_action: formIntNextAction || undefined,
      date_rappel: formIntRappel || undefined,
      created_at: Date.now(),
    };

    await db.interactions_clients.add(newInteraction);
    await syncEngine.enqueueOperation('interaction', intId, 'CREATE', newInteraction);

    setIsAddInteractionModalOpen(false);
    setFormIntResume('');
    setFormIntNextAction('');
    setFormIntRappel('');
    await loadClientsAndDocs();
  };

  const handleUpdateProspectStatus = async (newStatus: ProspectStatus) => {
    if (!selectedClient) return;

    const updated = {
      ...selectedClient,
      statut_prospect: newStatus,
      updated_at: Date.now(),
    };

    await db.clients.put(updated);
    await syncEngine.enqueueOperation('client', selectedClient.id, 'UPDATE', {
      statut_prospect: newStatus,
      updated_at: updated.updated_at,
    });

    setSelectedClient(updated);
    await loadClientsAndDocs();
  };

  const resetForm = () => {
    setFormNom('');
    setFormNomAr('');
    setFormTel('');
    setFormEmail('');
    setFormCommune('');
    setFormAdresse('');
    setFormPieceNumero('');
    setFormPieceExpiration('');
    setFormNifRc('');
    setFormVehiculeRecherche('');
  };

  // Gestion Caméra / Scan KYC
  const startCamera = async () => {
    setCameraError(null);
    setIsCameraActive(true);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } else {
        setCameraError("La caméra n'est pas supportée dans ce navigateur.");
      }
    } catch (err: any) {
      console.warn('Erreur caméra:', err);
      setCameraError('Accès caméra refusé ou indisponible. Vous pouvez importer un fichier photo.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !selectedClient) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    stopCamera();
    await saveCapturedDocument(dataUrl, `Scan_${docTypeToCapture}_${Date.now()}.jpg`, 'image/jpeg');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClient) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      await saveCapturedDocument(dataUrl, file.name, file.type);
    };
    reader.readAsDataURL(file);
  };

  const saveCapturedDocument = async (dataBlob: string, fileName: string, mimeType: string) => {
    if (!selectedClient) return;

    const sha256 = await calculateSha256(dataBlob);
    const docId = `doc-${Date.now()}`;

    const newDoc: ClientDoc = {
      id: docId,
      client_id: selectedClient.id,
      type_doc: docTypeToCapture,
      nom_fichier: fileName,
      taille_octets: Math.round(dataBlob.length * 0.75),
      mime_type: mimeType,
      sha256,
      is_encrypted: false,
      data_blob_base64: dataBlob,
      sync_status: 'pending',
      created_at: Date.now(),
    };

    await db.documents_kyc.add(newDoc);
    const updatedDocIds = [...(selectedClient.documents_ids || []), docId];
    await db.clients.update(selectedClient.id, {
      documents_ids: updatedDocIds,
      updated_at: Date.now(),
    });

    await syncEngine.enqueueOperation('document', docId, 'CREATE', {
      clientId: selectedClient.id,
      typeDoc: docTypeToCapture,
      sha256,
      fileName,
    });

    await loadClientsAndDocs();
  };

  const formatDzd = (amount: number) => {
    return new Intl.NumberFormat(lang === 'ar' ? 'ar-DZ' : 'fr-DZ', {
      maximumFractionDigits: 0,
    }).format(amount) + ' ' + t.currencyDzd;
  };

  const getStatusLabel = (st: ProspectStatus) => {
    switch (st) {
      case 'nouveau': return t.crmNew;
      case 'contacte': return t.crmContacted;
      case 'interesse': return t.crmInterested;
      case 'rendez_vous': return t.crmMeeting;
      case 'negociation': return t.crmNegotiation;
      case 'converti': return t.crmConverted;
      case 'perdu': return t.crmLost;
      default: return st;
    }
  };

  const getSourceLabel = (src: ProspectSource) => {
    switch (src) {
      case 'visite_showroom': return t.crmSrcShowroom;
      case 'telephone': return t.crmSrcPhone;
      case 'facebook': return t.crmSrcFacebook;
      case 'whatsapp': return t.crmSrcWhatsapp;
      case 'site_web': return t.crmSrcWeb;
      case 'recommandation': return t.crmSrcRecommendation;
      default: return src;
    }
  };

  // Filtrage
  const filteredClients = clients.filter(c => {
    const matchesSearch =
      c.nom_complet.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.telephone.includes(searchTerm) ||
      c.piece_identite_numero.includes(searchTerm) ||
      (c.nom_arabe && c.nom_arabe.includes(searchTerm));

    const matchesStatus =
      selectedStatusFilter === 'all' || c.statut_prospect === selectedStatusFilter;

    return matchesSearch && matchesStatus;
  });

  const clientDocs = documents.filter(d => d.client_id === selectedClient?.id);
  const clientInteractions = interactions.filter(i => i.client_id === selectedClient?.id);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {lang === 'ar' ? 'إدارة الزبائن، العلاقات (CRM) والوثائق' : 'Répertoire Clients, Pipeline CRM & KYC'}
          </h1>
          <p className="text-xs text-slate-400">
            {lang === 'ar'
              ? 'متابعة مسار تحويل الزبائن المحتملين، سجل المكالمات وأرشفة بطاقات الهوية'
              : 'Pipeline d\'acquisition prospects, historique des échanges et pièces d\'identité sécurisées'}
          </p>
        </div>

        <button
          onClick={() => setIsAddClientModalOpen(true)}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'ar' ? 'تسجيل زبون / بروسبكت جديد' : 'Nouveau Prospect / Client'}</span>
        </button>
      </div>

      {/* Main split: Client list on left, CRM & KYC Dossier on right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Client List with CRM Pipeline Filter */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col h-[780px]">
          <div className="space-y-2 mb-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={lang === 'ar' ? 'بحث بالاسم أو الهاتف...' : 'Recherche nom, téléphone 05/06/07...'}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Pipeline Stage Filter */}
            <div className="flex items-center gap-2 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 text-xs focus:outline-none"
              >
                <option value="all">Tous les prospects & clients</option>
                <option value="nouveau">Nouveaux</option>
                <option value="interesse">Très intéressés</option>
                <option value="negociation">En négociation</option>
                <option value="converti">Clients Convertis</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredClients.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>{lang === 'ar' ? 'لا يوجد زبائن مطابقين للبحث' : 'Aucun prospect ou client trouvé.'}</p>
              </div>
            ) : (
              filteredClients.map((client) => {
                const isSelected = selectedClient?.id === client.id;
                const docCount = documents.filter(d => d.client_id === client.id).length;
                const intCount = interactions.filter(i => i.client_id === client.id).length;

                return (
                  <button
                    key={client.id}
                    onClick={() => setSelectedClient(client)}
                    className={`w-full p-3 rounded-lg border text-left transition-all text-xs ${
                      isSelected
                        ? 'bg-blue-950/60 border-blue-600 text-white shadow-sm'
                        : 'bg-slate-800/40 hover:bg-slate-800 border-slate-700/60 text-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-sm text-white">
                        {client.nom_complet}
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        client.statut_prospect === 'converti'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : client.statut_prospect === 'negociation'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : client.statut_prospect === 'interesse'
                          ? 'bg-purple-950 text-purple-300 border border-purple-800'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}>
                        {getStatusLabel(client.statut_prospect || 'nouveau')}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-mono">{client.telephone}</span>
                      <span className="text-[10px] text-slate-500">
                        {getSourceLabel(client.source_prospect || 'visite_showroom')}
                      </span>
                    </div>

                    {client.vehicule_recherche && (
                      <div className="mt-1 text-[10px] text-blue-400 truncate flex items-center gap-1">
                        <Car className="w-3 h-3 shrink-0" />
                        <span>Recherche : {client.vehicule_recherche}</span>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: CRM Dossier, Interactions & KYC Docs */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm flex flex-col h-[780px] overflow-y-auto space-y-6">
          {selectedClient ? (
            <>
              {/* Profile Card & Pipeline Stage Selector */}
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">
                        {selectedClient.nom_complet}
                      </h2>
                      {selectedClient.nom_arabe && (
                        <span className="text-sm text-slate-400 font-sans">
                          ({selectedClient.nom_arabe})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="w-3.5 h-3.5 text-blue-400" />
                        {selectedClient.telephone}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                        {selectedClient.wilaya} ({selectedClient.commune})
                      </span>
                      <span className="text-slate-500 font-medium">
                        Canal: {getSourceLabel(selectedClient.source_prospect || 'visite_showroom')}
                      </span>
                    </div>
                  </div>

                  {/* Budget & Target Vehicle */}
                  {selectedClient.budget_estime_dzd && selectedClient.budget_estime_dzd > 0 && (
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-right">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Budget Estimé</div>
                      <div className="font-mono font-bold text-emerald-400">
                        {formatDzd(selectedClient.budget_estime_dzd)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Pipeline Progression Buttons */}
                <div className="pt-3 border-t border-slate-700/60 flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                  <span className="text-slate-400 text-[11px] whitespace-nowrap">Pipeline :</span>
                  {(['nouveau', 'contacte', 'interesse', 'rendez_vous', 'negociation', 'converti', 'perdu'] as ProspectStatus[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => handleUpdateProspectStatus(st)}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold whitespace-nowrap transition-colors ${
                        selectedClient.statut_prospect === st
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                      }`}
                    >
                      {getStatusLabel(st)}
                    </button>
                  ))}
                </div>
              </div>

              {/* CRM Interactions & Communication Log */}
              <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-purple-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      {t.crmInteractions} ({clientInteractions.length})
                    </h3>
                  </div>

                  <button
                    onClick={() => setIsAddInteractionModalOpen(true)}
                    className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t.crmAddInteraction}</span>
                  </button>
                </div>

                {clientInteractions.length === 0 ? (
                  <div className="py-4 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg">
                    Aucun échange consigné pour ce prospect.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {clientInteractions.map((int) => (
                      <div
                        key={int.id}
                        className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between text-slate-400 text-[11px]">
                          <span className="font-semibold text-white uppercase flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                            {int.type.toUpperCase()}
                          </span>
                          <span>{new Date(int.date).toLocaleString('fr-DZ', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                        <p className="text-slate-200 text-xs">{int.resume}</p>
                        {int.prochaine_action && (
                          <div className="pt-1 text-[11px] text-blue-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>Action prévue : {int.prochaine_action} {int.date_rappel ? `(${int.date_rappel})` : ''}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* KYC Document Capture Section */}
              <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Camera className="w-4 h-4 text-blue-400" />
                      <span>Numérisation & Pièces d'Identité ({clientDocs.length})</span>
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={docTypeToCapture}
                      onChange={(e) => setDocTypeToCapture(e.target.value as ClientDocType)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
                    >
                      <option value="cni_recto">CNI Recto (وجه البطاقة)</option>
                      <option value="cni_verso">CNI Verso (ظهر البطاقة)</option>
                      <option value="passeport">Passeport (جواز السفر)</option>
                      <option value="permis">Permis de conduire</option>
                      <option value="residence">Certificat de résidence</option>
                    </select>

                    <button
                      onClick={isCameraActive ? stopCamera : startCamera}
                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      <Camera className="w-3 h-3" />
                      <span>{isCameraActive ? 'Arrêter' : 'Caméra'}</span>
                    </button>

                    <label className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors">
                      <Upload className="w-3 h-3 text-slate-400" />
                      <span>Fichier</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Live Camera Viewport */}
                {isCameraActive && (
                  <div className="relative rounded-lg overflow-hidden border border-blue-500/50 bg-black">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full max-h-72 object-contain mx-auto"
                    />
                    <div className="absolute bottom-4 inset-x-0 flex justify-center gap-3">
                      <button
                        onClick={capturePhoto}
                        className="px-4 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Prendre la photo</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Documents Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {clientDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 flex flex-col justify-between space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-white uppercase text-[11px]">
                            {doc.type_doc.replace('_', ' ')}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[150px]">
                            {doc.nom_fichier}
                          </div>
                        </div>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                          doc.sync_status === 'synced'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}>
                          {doc.sync_status === 'synced' ? 'Synchronisé' : 'Local IndexedDB'}
                        </span>
                      </div>

                      <div
                        onClick={() => setPreviewDoc(doc)}
                        className="relative h-24 bg-slate-900 rounded overflow-hidden cursor-pointer group border border-slate-800"
                      >
                        <img
                          src={doc.data_blob_base64}
                          alt={doc.nom_fichier}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="py-24 text-center text-slate-500">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>Sélectionnez un client à gauche.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Ajout Interaction CRM */}
      {isAddInteractionModalOpen && selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6 text-slate-100">
            <h3 className="font-bold text-base text-white mb-2 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-400" />
              <span>Consigner un Échange avec {selectedClient.nom_complet}</span>
            </h3>

            <form onSubmit={handleAddInteraction} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Type d'Échange *</label>
                <select
                  value={formIntType}
                  onChange={(e) => setFormIntType(e.target.value as InteractionType)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none"
                >
                  <option value="appel">Appel Téléphonique</option>
                  <option value="visite">Visite au Showroom</option>
                  <option value="whatsapp">Échange WhatsApp</option>
                  <option value="email">Courriel / Devis envoyé</option>
                  <option value="note">Note Interne / Renseignement</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Résumé de la discussion *</label>
                <textarea
                  required
                  rows={3}
                  value={formIntResume}
                  onChange={(e) => setFormIntResume(e.target.value)}
                  placeholder="Intérêt pour Hilux blanc, demande de remise de 50 000 DZD..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Prochaine action prévue</label>
                <input
                  type="text"
                  value={formIntNextAction}
                  onChange={(e) => setFormIntNextAction(e.target.value)}
                  placeholder="Ex: Rappeler après réception du devis proforma"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Date de rappel</label>
                <input
                  type="date"
                  value={formIntRappel}
                  onChange={(e) => setFormIntRappel(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddInteractionModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded font-medium"
                >
                  {t.actionCancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold shadow-sm"
                >
                  Enregistrer l'échange
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal d'ajout de client */}
      {isAddClientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col text-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                <h2 className="text-base font-bold text-white">
                  {lang === 'ar' ? 'إضافة ملف زبون / بروسبكت جديد' : 'Créer une Fiche Prospect / Client'}
                </h2>
              </div>
              <button
                onClick={() => setIsAddClientModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="flex gap-4 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="clientType"
                    checked={formType === 'particulier'}
                    onChange={() => setFormType('particulier')}
                    className="text-blue-600 focus:ring-0"
                  />
                  <span>Particulier (فرد)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="clientType"
                    checked={formType === 'entreprise'}
                    onChange={() => setFormType('entreprise')}
                    className="text-blue-600 focus:ring-0"
                  />
                  <span>Société / Entreprise (شركة)</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Nom Complet (Français) *</label>
                  <input
                    type="text"
                    required
                    value={formNom}
                    onChange={(e) => setFormNom(e.target.value)}
                    placeholder="Ex: Mohamed Benali"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">الاسم الكامل (بالعربية)</label>
                  <input
                    type="text"
                    dir="rtl"
                    value={formNomAr}
                    onChange={(e) => setFormNomAr(e.target.value)}
                    placeholder="مثال: محمد بن علي"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none font-sans"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Numéro de Téléphone *</label>
                  <input
                    type="tel"
                    required
                    value={formTel}
                    onChange={(e) => setFormTel(e.target.value)}
                    placeholder="0550 12 34 56"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Canal d'Acquisition (Source)</label>
                  <select
                    value={formProspectSource}
                    onChange={(e) => setFormProspectSource(e.target.value as ProspectSource)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none"
                  >
                    <option value="visite_showroom">Visite Showroom</option>
                    <option value="telephone">Appel Téléphonique</option>
                    <option value="facebook">Facebook / Meta Ads</option>
                    <option value="whatsapp">WhatsApp DZ</option>
                    <option value="site_web">Site Web / Annonce</option>
                    <option value="recommandation">Recommandation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Statut Initial du Prospect</label>
                  <select
                    value={formProspectStatus}
                    onChange={(e) => setFormProspectStatus(e.target.value as ProspectStatus)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none"
                  >
                    <option value="nouveau">Nouveau prospect</option>
                    <option value="contacte">Contacté</option>
                    <option value="interesse">Très intéressé</option>
                    <option value="negociation">En négociation</option>
                    <option value="converti">Converti en client</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Budget Estimé (DZD)</label>
                  <input
                    type="number"
                    step={100000}
                    value={formBudget}
                    onChange={(e) => setFormBudget(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Véhicule Recherché</label>
                  <input
                    type="text"
                    value={formVehiculeRecherche}
                    onChange={(e) => setFormVehiculeRecherche(e.target.value)}
                    placeholder="Ex: Hilux 4x4 ou Tucson"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Wilaya *</label>
                  <select
                    value={formWilaya}
                    onChange={(e) => setFormWilaya(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none"
                  >
                    <option value="16 - Alger">16 - Alger</option>
                    <option value="09 - Blida">09 - Blida</option>
                    <option value="31 - Oran">31 - Oran</option>
                    <option value="19 - Sétif">19 - Sétif</option>
                    <option value="25 - Constantine">25 - Constantine</option>
                    <option value="35 - Boumerdès">35 - Boumerdès</option>
                    <option value="42 - Tipaza">42 - Tipaza</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">N° Pièce d'Identité *</label>
                  <input
                    type="text"
                    required
                    value={formPieceNumero}
                    onChange={(e) => setFormPieceNumero(e.target.value)}
                    placeholder="Numéro CNI ou Passeport"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Commune & Adresse</label>
                  <input
                    type="text"
                    value={formCommune}
                    onChange={(e) => setFormCommune(e.target.value)}
                    placeholder="Commune de résidence"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddClientModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-medium"
                >
                  {t.actionCancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-sm"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal d'agrandissement de document */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full p-6 text-slate-100 flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-white uppercase">
                {previewDoc.type_doc.replace('_', ' ')}
              </h3>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="w-full max-h-[70vh] overflow-auto flex items-center justify-center bg-black/40 rounded-lg p-2">
              <img
                src={previewDoc.data_blob_base64}
                alt={previewDoc.nom_fichier}
                className="max-h-[60vh] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
