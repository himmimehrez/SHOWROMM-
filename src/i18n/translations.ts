export type Language = 'fr' | 'ar';

export interface Translations {
  appName: string;
  appTagline: string;
  langName: string;
  toggleLang: string;

  // Nav
  navDashboard: string;
  navVehicules: string;
  navDepots: string;
  navClients: string;
  navVentes: string;
  navCaisse: string;
  navSync: string;

  // Sync bar
  statusOnline: string;
  statusOffline: string;
  statusSyncing: string;
  simulatedOfflineTag: string;
  toggleSimulateOffline: string;
  pendingOps: string;
  syncNow: string;
  lastSync: string;
  latency: string;
  deviceInfo: string;

  // Actions
  actionAdd: string;
  actionEdit: string;
  actionDelete: string;
  actionCancel: string;
  actionSave: string;
  actionSearch: string;
  actionFilter: string;
  actionPrint: string;
  actionScan: string;
  actionUpload: string;
  actionTransfer: string;
  actionPay: string;
  actionValidate: string;

  // Currencies & units
  currencyDzd: string;
  kmUnit: string;

  // Vehicle
  vin: string;
  brand: string;
  model: string;
  version: string;
  year: string;
  color: string;
  mileage: string;
  fuel: string;
  transmission: string;
  condition: string;
  purchasePriceRetained: string;
  salePrice: string;
  totalCost: string;
  estimatedMargin: string;
  marginRate: string;
  expensesDetails: string;
  addExpense: string;
  status: string;
  location: string;

  // Conditions
  condNew: string;
  condUsed: string;
  condPrep: string;
  condRepair: string;
  condDamaged: string;

  // Expense Categories
  expTransport: string;
  expPrep: string;
  expRepair: string;
  expAdmin: string;
  expOther: string;

  // Statuses
  statusInStock: string;
  statusReserved: string;
  statusSold: string;
  statusDelivered: string;

  // Fuels
  fuelPetrol: string;
  fuelDiesel: string;
  fuelHybrid: string;
  fuelElectric: string;
  fuelGpl: string;

  // Transmissions
  transManual: string;
  transAuto: string;

  // CRM
  crmProspectStatus: string;
  crmSource: string;
  crmInteractions: string;
  crmAddInteraction: string;
  crmNew: string;
  crmContacted: string;
  crmInterested: string;
  crmMeeting: string;
  crmNegotiation: string;
  crmConverted: string;
  crmLost: string;

  crmSrcShowroom: string;
  crmSrcPhone: string;
  crmSrcFacebook: string;
  crmSrcWhatsapp: string;
  crmSrcWeb: string;
  crmSrcRecommendation: string;

  // Sales & Documents
  provisionalContract: string;
  officialInvoice: string;
  paymentReceipt: string;
  exitPass: string;
  exitPassAuthorized: string;
  exitPassBlocked: string;
  exitPassWarning: string;
  provisionalWarning: string;
  conflictDetected: string;
  reassignVehicle: string;

  // Payments
  paymentCash: string;
  paymentCheque: string;
  paymentTransfer: string;
  paymentPromissory: string;
  totalNet: string;
  amountPaid: string;
  balanceRemaining: string;
}

export const translations: Record<Language, Translations> = {
  fr: {
    appName: 'AutoGestion DZ',
    appTagline: 'Gestion de Showroom Automobile en Algérie',
    langName: 'Français',
    toggleLang: 'العربية',

    navDashboard: 'Tableau de bord',
    navVehicules: 'Véhicules & Stock',
    navDepots: 'Dépôts & Parcs',
    navClients: 'Clients & CRM',
    navVentes: 'Ventes & Contrats',
    navCaisse: 'Caisse & Créances',
    navSync: 'File de Synchronisation',

    statusOnline: 'Connecté Cloud',
    statusOffline: 'Mode Hors-Ligne',
    statusSyncing: 'Synchronisation...',
    simulatedOfflineTag: 'Coupure Réseau Simulée',
    toggleSimulateOffline: 'Simuler Hors-Ligne',
    pendingOps: 'opérations en attente',
    syncNow: 'Synchroniser',
    lastSync: 'Dernière synchro',
    latency: 'Latence',
    deviceInfo: 'Poste actif',

    actionAdd: 'Nouveau',
    actionEdit: 'Modifier',
    actionDelete: 'Supprimer',
    actionCancel: 'Annuler',
    actionSave: 'Enregistrer',
    actionSearch: 'Rechercher...',
    actionFilter: 'Filtrer',
    actionPrint: 'Imprimer document',
    actionScan: 'Scanner CNI / Photo',
    actionUpload: 'Importer fichier',
    actionTransfer: 'Transférer parc',
    actionPay: 'Encaisser règlement',
    actionValidate: 'Valider',

    currencyDzd: 'DZD',
    kmUnit: 'km',

    vin: 'N° Châssis (VIN)',
    brand: 'Marque',
    model: 'Modèle',
    version: 'Finition / Version',
    year: 'Année',
    color: 'Couleur',
    mileage: 'Kilométrage',
    fuel: 'Énergie',
    transmission: 'Boîte de vitesses',
    condition: 'État du Véhicule',
    purchasePriceRetained: 'Prix d Achat Retenu (DZD)',
    salePrice: 'Prix de Vente (DZD)',
    totalCost: 'Coût Total de Revient',
    estimatedMargin: 'Marge Nette Estimée',
    marginRate: 'Taux de Marge',
    expensesDetails: 'Frais Annexes Détaillés',
    addExpense: 'Ajouter un frais annexe',
    status: 'Statut Commercial',
    location: 'Dépôt / Emplacement',

    condNew: 'Neuf (0 km)',
    condUsed: 'Occasion',
    condPrep: 'En préparation',
    condRepair: 'En réparation',
    condDamaged: 'Endommagé',

    expTransport: 'Transport & Approche',
    expPrep: 'Nettoyage & Préparation',
    expRepair: 'Réparation & Pièces',
    expAdmin: 'Formalités & Contrôle',
    expOther: 'Autre frais',

    statusInStock: 'En stock',
    statusReserved: 'Réservé',
    statusSold: 'Vendu',
    statusDelivered: 'Livré',

    fuelPetrol: 'Essence',
    fuelDiesel: 'Diesel',
    fuelHybrid: 'Hybride',
    fuelElectric: 'Électrique',
    fuelGpl: 'GPL',

    transManual: 'Manuelle',
    transAuto: 'Automatique',

    crmProspectStatus: 'Statut Prospect',
    crmSource: 'Canal d Acquisition',
    crmInteractions: 'Historique des Échanges',
    crmAddInteraction: 'Consigner un échange',
    crmNew: 'Nouveau prospect',
    crmContacted: 'Contacté',
    crmInterested: 'Très intéressé',
    crmMeeting: 'Rendez-vous planifié',
    crmNegotiation: 'En négociation',
    crmConverted: 'Converti en client',
    crmLost: 'Perdu / Sans suite',

    crmSrcShowroom: 'Visite Showroom',
    crmSrcPhone: 'Appel Téléphonique',
    crmSrcFacebook: 'Facebook / Meta',
    crmSrcWhatsapp: 'WhatsApp DZ',
    crmSrcWeb: 'Site Web / Annonce',
    crmSrcRecommendation: 'Recommandation',

    provisionalContract: 'Contrat Provisoire',
    officialInvoice: 'Facture de Vente',
    paymentReceipt: 'Reçu de Caisse',
    exitPass: 'Bon de Sortie Véhicule',
    exitPassAuthorized: 'Sortie Autorisée',
    exitPassBlocked: 'Sortie Bloquée (Solde restant)',
    exitPassWarning: 'Un véhicule ne peut quitter le parc que si le solde financier est intégralement réglé.',
    provisionalWarning: 'Document émis en mode hors-ligne. En attente de validation centrale.',
    conflictDetected: 'Conflit d Allocation Détecté',
    reassignVehicle: 'Réaffecter un autre véhicule disponible',

    paymentCash: 'Espèces (Caisse)',
    paymentCheque: 'Chèque Bancaire Certifié',
    paymentTransfer: 'Virement Bancaire',
    paymentPromissory: 'Traite / Échéancier',
    totalNet: 'Total Net',
    amountPaid: 'Montant Encaissé',
    balanceRemaining: 'Solde Restant Dû',
  },
  ar: {
    appName: 'أوتو جيستيون الجزائر',
    appTagline: 'النظام المتكامل لإدارة معارض السيارات بالجزائر',
    langName: 'العربية',
    toggleLang: 'Français',

    navDashboard: 'لوحة القيادة',
    navVehicules: 'السيارات والمخزون',
    navDepots: 'المستودعات والحظائر',
    navClients: 'الزبائن وإدارة العلاقات',
    navVentes: 'المبيعات والعقود',
    navCaisse: 'الصندوق والديون',
    navSync: 'طابور المزامنة السحابية',

    statusOnline: 'متصل بالسحابة',
    statusOffline: 'وضع عدم الاتصال (أوفلاين)',
    statusSyncing: 'جاري المزامنة...',
    simulatedOfflineTag: 'محاكاة انقطاع الشبكة',
    toggleSimulateOffline: 'محاكاة الأوفلاين',
    pendingOps: 'عمليات معلقة',
    syncNow: 'مزامنة الآن',
    lastSync: 'آخر مزامنة',
    latency: 'زمن الاستجابة',
    deviceInfo: 'الجهاز الحالي',

    actionAdd: 'إضافة جديد',
    actionEdit: 'تعديل',
    actionDelete: 'حذف',
    actionCancel: 'إلغاء',
    actionSave: 'حفظ',
    actionSearch: 'بحث...',
    actionFilter: 'تصفية',
    actionPrint: 'طباعة الوثيقة',
    actionScan: 'مسح ضوئي / كاميرا',
    actionUpload: 'رفع ملف',
    actionTransfer: 'تحويل بين الحظائر',
    actionPay: 'تحصيل دفعة',
    actionValidate: 'تأكيد',

    currencyDzd: 'دج',
    kmUnit: 'كلم',

    vin: 'رقم الهيكل (VIN)',
    brand: 'العلامة',
    model: 'الموديل',
    version: 'النسخة / الفئة',
    year: 'السنة',
    color: 'اللون',
    mileage: 'المسافة المقطوعة',
    fuel: 'نوع الوقود',
    transmission: 'ناقل الحركة',
    condition: 'حالة المركبة',
    purchasePriceRetained: 'سعر الشراء المعتمد (دج)',
    salePrice: 'سعر البيع المعروض (دج)',
    totalCost: 'التكلفة الإجمالية للمركبة',
    estimatedMargin: 'هامش الربح الصافي المقدر',
    marginRate: 'نسبة الهامش',
    expensesDetails: 'تفاصيل المصاريف الإضافية',
    addExpense: 'إضافة مصروف إضافي',
    status: 'الحالة التجارية',
    location: 'المستودع / الحظيرة',

    condNew: 'جديدة (0 كلم)',
    condUsed: 'مستعملة',
    condPrep: 'قيد التجهيز',
    condRepair: 'قيد الصيانة',
    condDamaged: 'بها أضرار',

    expTransport: 'النقل والشحن',
    expPrep: 'التنظيف والتجهيز',
    expRepair: 'الصيانة وقطع الغيار',
    expAdmin: 'المعاملات الإدارية والمراقبة',
    expOther: 'مصاريف أخرى',

    statusInStock: 'متوفر بالمخزون',
    statusReserved: 'محجوز',
    statusSold: 'تم البيع',
    statusDelivered: 'تم التسليم',

    fuelPetrol: 'بنزين',
    fuelDiesel: 'ديزل / مازوت',
    fuelHybrid: 'هجين',
    fuelElectric: 'كهربائي',
    fuelGpl: 'سيرغاز (GPL)',

    transManual: 'يدوي',
    transAuto: 'أوتوماتيكي',

    crmProspectStatus: 'حالة الزبون المحتمل',
    crmSource: 'مصدر التواصل',
    crmInteractions: 'سجل الاتصالات والملاحظات',
    crmAddInteraction: 'تسجيل اتصال جديد',
    crmNew: 'زبون محتمل جديد',
    crmContacted: 'تم الاتصال به',
    crmInterested: 'مهتم جداً',
    crmMeeting: 'موعد محدد',
    crmNegotiation: 'مرحلة التفاوض',
    crmConverted: 'تحول إلى شراء',
    crmLost: 'غير مهتم / ملغى',

    crmSrcShowroom: 'زيارة المعرض',
    crmSrcPhone: 'مكالمة هاتفية',
    crmSrcFacebook: 'فيسبوك',
    crmSrcWhatsapp: 'واتساب',
    crmSrcWeb: 'الموقع الإلكتروني',
    crmSrcRecommendation: 'توصية',

    provisionalContract: 'عقد بيع مؤقت',
    officialInvoice: 'فاتورة البيع الرسمية',
    paymentReceipt: 'وصل استلام الدفع',
    exitPass: 'إذن خروج المركبة',
    exitPassAuthorized: 'الخروج مسموح به',
    exitPassBlocked: 'الخروج معلق (يوجد رصيد متبقي)',
    exitPassWarning: 'لا يمكن للمركبة مغادرة الحظيرة إلا بعد تسوية كامل المبلغ المتبقي.',
    provisionalWarning: 'وثيقة صادرة بدون اتصال بالإنترنت، بانتظار التأكيد المركزي.',
    conflictDetected: 'تم اكتشاف تعارض في حجز المركبة',
    reassignVehicle: 'إعادة تخصيص مركبة أخرى متوفرة',

    paymentCash: 'نقداً (الصندوق)',
    paymentCheque: 'شيك بنكي مصدق',
    paymentTransfer: 'تحويل بنكي',
    paymentPromissory: 'كمبيالة / أقساط',
    totalNet: 'المجموع الصافي',
    amountPaid: 'المبلغ المدفوع',
    balanceRemaining: 'الرصيد المتبقي',
  },
};
