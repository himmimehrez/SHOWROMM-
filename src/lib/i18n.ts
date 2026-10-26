// Libellés de navigation et d'interface commune. Le français est la langue de référence :
// une clé absente en arabe retombe sur le français. Les pages métier sont en français pour l'instant.
export type Lang = 'fr' | 'ar';

const fr = {
  'nav.pilotage': 'Pilotage',
  'nav.parc': 'Parc',
  'nav.commercial': 'Commercial',
  'nav.tresorerie': 'Trésorerie',
  'nav.admin': 'Administration',
  'nav.dashboard': 'Tableau de bord',
  'nav.rapports': 'Rapports',
  'nav.vehicules': 'Véhicules',
  'nav.mouvements': 'Mouvements de parc',
  'nav.achats': 'Achats et réceptions',
  'nav.fournisseurs': 'Fournisseurs',
  'nav.ventes': 'Ventes',
  'nav.clients': 'Clients et créances',
  'nav.caisse': 'Caisse',
  'nav.depenses': 'Dépenses',
  'nav.utilisateurs': 'Utilisateurs',
  'nav.parametres': 'Paramètres',
  'nav.audit': "Journal d'audit",
  'top.search': 'Véhicule, VIN, client, n° de vente…',
  'top.newSale': 'Nouvelle vente',
  'top.alerts': 'Alertes',
  'top.noAlerts': 'Aucune alerte pour le moment.',
  'top.logout': 'Se déconnecter',
  'top.theme': 'Thème sombre',
  'top.lang': 'العربية',
  'top.cashOpen': 'Caisse ouverte',
  'top.cashClosed': 'Caisse fermée',
  'demo.banner': 'Données de démonstration chargées : ce ne sont pas des opérations réelles. Effacez-les dans Paramètres avant la mise en service.',
};

const ar: Partial<Record<keyof typeof fr, string>> = {
  'nav.pilotage': 'القيادة',
  'nav.parc': 'الحظيرة',
  'nav.commercial': 'التجاري',
  'nav.tresorerie': 'الخزينة',
  'nav.admin': 'الإدارة',
  'nav.dashboard': 'لوحة القيادة',
  'nav.rapports': 'التقارير',
  'nav.vehicules': 'السيارات',
  'nav.mouvements': 'حركات الحظيرة',
  'nav.achats': 'المشتريات والاستلام',
  'nav.fournisseurs': 'الموردون',
  'nav.ventes': 'المبيعات',
  'nav.clients': 'الزبائن والديون',
  'nav.caisse': 'الصندوق',
  'nav.depenses': 'المصاريف',
  'nav.utilisateurs': 'المستخدمون',
  'nav.parametres': 'الإعدادات',
  'nav.audit': 'سجل العمليات',
  'top.search': 'سيارة، رقم الهيكل، زبون، رقم البيع…',
  'top.newSale': 'بيع جديد',
  'top.alerts': 'التنبيهات',
  'top.noAlerts': 'لا توجد تنبيهات حاليا.',
  'top.logout': 'تسجيل الخروج',
  'top.theme': 'الوضع الداكن',
  'top.lang': 'Français',
  'top.cashOpen': 'الصندوق مفتوح',
  'top.cashClosed': 'الصندوق مغلق',
  'demo.banner': 'تم تحميل بيانات تجريبية: ليست عمليات حقيقية. احذفها من الإعدادات قبل بدء الاستعمال.',
};

export type I18nKey = keyof typeof fr;

export function translate(lang: Lang, key: I18nKey): string {
  return (lang === 'ar' ? ar[key] : undefined) ?? fr[key];
}
