-- ════════════════════════════════════════════════════════════════════════════
-- Showroom Manager DZ — schéma de base (Supabase / PostgreSQL)
--
-- Principes :
--  * Montants en dinars (DA), entiers (bigint). Taux de TVA en pourcentage.
--  * Lecture : politiques RLS par rôle et par dépôt.
--  * Écriture : AUCUN droit direct sur les tables. Toute écriture passe par les
--    fonctions serveur (migration « fonctions »), qui contrôlent les droits,
--    s'exécutent en transaction, numérotent et journalisent.
--  * Les coûts (prix d'achat, coût de revient) sont dans des tables séparées,
--    lisibles uniquement par les rôles autorisés.
-- ════════════════════════════════════════════════════════════════════════════

-- gen_random_uuid() est natif depuis PostgreSQL 13 : aucune extension requise.

create schema if not exists app;   -- fonctions internes, non exposées par l'API

-- ───────────────────────────── Utilisateurs et droits ─────────────────────────────

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null default '',
  nom         text not null default '',
  role        text not null default 'commercial'
              check (role in ('admin', 'gerant', 'commercial', 'caissier', 'agent_stock', 'audit')),
  actif       boolean not null default false,
  tous_depots boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.role_permissions (
  role text not null,
  perm text not null,
  primary key (role, perm)
);

insert into public.role_permissions (role, perm)
select r, p from (values
  -- administrateur : tout
  ('admin', 'couts.voir'), ('admin', 'vehicules.gerer'), ('admin', 'vehicules.prix'), ('admin', 'stock.transferer'),
  ('admin', 'stock.receptionner'), ('admin', 'clients.gerer'), ('admin', 'ventes.creer'), ('admin', 'ventes.remise'),
  ('admin', 'ventes.annuler'), ('admin', 'ventes.livrer'), ('admin', 'ventes.facturer'), ('admin', 'livraison.accord'),
  ('admin', 'paiements.encaisser'), ('admin', 'paiements.valider'), ('admin', 'paiements.rembourser'),
  ('admin', 'especes.depasser'), ('admin', 'caisse.voir'), ('admin', 'caisse.operer'), ('admin', 'depenses.voir'),
  ('admin', 'depenses.gerer'), ('admin', 'depenses.annuler'), ('admin', 'achats.voir'), ('admin', 'achats.gerer'),
  ('admin', 'fournisseurs.gerer'), ('admin', 'rapports.voir'), ('admin', 'audit.voir'), ('admin', 'utilisateurs.gerer'),
  ('admin', 'parametres.gerer'),
  -- gérant : tout sauf la gestion des comptes
  ('gerant', 'couts.voir'), ('gerant', 'vehicules.gerer'), ('gerant', 'vehicules.prix'), ('gerant', 'stock.transferer'),
  ('gerant', 'stock.receptionner'), ('gerant', 'clients.gerer'), ('gerant', 'ventes.creer'), ('gerant', 'ventes.remise'),
  ('gerant', 'ventes.annuler'), ('gerant', 'ventes.livrer'), ('gerant', 'ventes.facturer'), ('gerant', 'livraison.accord'),
  ('gerant', 'paiements.encaisser'), ('gerant', 'paiements.valider'), ('gerant', 'paiements.rembourser'),
  ('gerant', 'especes.depasser'), ('gerant', 'caisse.voir'), ('gerant', 'caisse.operer'), ('gerant', 'depenses.voir'),
  ('gerant', 'depenses.gerer'), ('gerant', 'depenses.annuler'), ('gerant', 'achats.voir'), ('gerant', 'achats.gerer'),
  ('gerant', 'fournisseurs.gerer'), ('gerant', 'rapports.voir'), ('gerant', 'audit.voir'), ('gerant', 'parametres.gerer'),
  -- commercial
  ('commercial', 'clients.gerer'), ('commercial', 'ventes.creer'), ('commercial', 'ventes.livrer'),
  -- caissier
  ('caissier', 'clients.gerer'), ('caissier', 'paiements.encaisser'), ('caissier', 'paiements.valider'),
  ('caissier', 'caisse.voir'), ('caissier', 'caisse.operer'), ('caissier', 'depenses.voir'), ('caissier', 'depenses.gerer'),
  ('caissier', 'ventes.facturer'),
  -- agent de stock
  ('agent_stock', 'stock.transferer'), ('agent_stock', 'stock.receptionner'), ('agent_stock', 'vehicules.gerer'),
  ('agent_stock', 'achats.voir'),
  -- consultation / audit : lecture seule
  ('audit', 'couts.voir'), ('audit', 'caisse.voir'), ('audit', 'depenses.voir'), ('audit', 'achats.voir'),
  ('audit', 'rapports.voir'), ('audit', 'audit.voir')
) as t (r, p);

create table public.depots (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  nom         text not null,
  adresse     text not null default '',
  responsable text not null default '',
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Dépôt créé d'office, pour pouvoir saisir des véhicules dès le premier jour
insert into public.depots (code, nom) values ('SHW', 'Showroom principal');

create table public.profile_depots (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  depot_id   uuid not null references public.depots (id) on delete cascade,
  primary key (profile_id, depot_id)
);

-- Paramètres du showroom (une seule ligne), y compris les règles fiscales modifiables
create table public.settings (
  id   int primary key default 1 check (id = 1),
  data jsonb not null
);

insert into public.settings (id, data) values (1, jsonb_build_object(
  'nom', 'Mon showroom',
  'forme_juridique', '', 'capital', '', 'activite', 'Vente de véhicules neufs et d''occasion',
  'adresse', '', 'telephone', '', 'email', '',
  'rc', '', 'nif', '', 'nis', '', 'article_imposition', '',
  'mentions', '',
  'categories_depenses', jsonb_build_array('Transport', 'Préparation', 'Réparation', 'Formalités', 'Loyer',
                                            'Électricité', 'Internet', 'Publicité', 'Fournitures', 'Divers'),
  'remise_max_commercial', 50000,
  'taux_tva', jsonb_build_array(0, 9, 19),
  'plafond_especes', 500000,
  'timbre', jsonb_build_object(
    'exonere_jusqua', 300,
    'minimum', 5,
    'tranches', jsonb_build_array(
      jsonb_build_object('jusqua', 30000, 'par_100', 1),
      jsonb_build_object('jusqua', 100000, 'par_100', 1.5),
      jsonb_build_object('jusqua', null, 'par_100', 2)
    )
  )
));

create table public.sequences (
  key   text primary key,
  value bigint not null
);

create table public.audit_logs (
  id       bigserial primary key,
  date     timestamptz not null default now(),
  user_id  uuid,
  user_nom text not null default '',
  action   text not null,
  objet    text not null default '',
  ref      text not null default '',
  details  text not null default ''
);
create index on public.audit_logs (date desc);

-- ───────────────────────────── Parc ─────────────────────────────

create table public.fournisseurs (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null,
  telephone  text not null default '',
  adresse    text not null default '',
  nif_rc     text not null default '',
  notes      text not null default '',
  actif      boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.vehicules (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique,
  vin             text not null default '',
  immatriculation text not null default '',
  marque          text not null,
  modele          text not null,
  finition        text not null default '',
  categorie       text not null default '',
  annee           int  not null,
  couleur         text not null default '',
  carburant       text not null default 'essence' check (carburant in ('essence', 'diesel', 'hybride', 'electrique', 'gpl')),
  boite           text not null default 'manuelle' check (boite in ('manuelle', 'automatique')),
  puissance       text not null default '',
  kilometrage     int  not null default 0 check (kilometrage >= 0),
  etat            text not null default 'neuf'
                  check (etat in ('neuf', 'occasion', 'en_preparation', 'en_reparation', 'endommage')),
  statut          text not null default 'disponible'
                  check (statut in ('disponible', 'reserve', 'vendu', 'livre', 'bloque', 'en_transit')),
  depot_id        uuid not null references public.depots (id),
  fournisseur_id  uuid references public.fournisseurs (id),
  achat_id        uuid,
  prix_vente_ht   bigint not null default 0 check (prix_vente_ht >= 0),
  notes           text not null default '',
  demo            boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index vehicules_vin_unique on public.vehicules (vin) where vin <> '';
create index on public.vehicules (statut);
create index on public.vehicules (depot_id);

-- Coûts : séparés pour que les rôles sans « couts.voir » ne puissent pas les lire
create table public.vehicule_couts (
  vehicule_id uuid primary key references public.vehicules (id) on delete cascade,
  prix_achat  bigint not null default 0 check (prix_achat >= 0)
);

create table public.mouvements (
  id          uuid primary key default gen_random_uuid(),
  vehicule_id uuid not null references public.vehicules (id),
  type        text not null check (type in ('entree_achat', 'entree_manuelle', 'transfert', 'vente', 'annulation_vente',
                                            'livraison', 'blocage', 'deblocage')),
  depot_from  uuid references public.depots (id),
  depot_to    uuid references public.depots (id),
  motif       text not null default '',
  ref         text not null default '',
  user_id     uuid,
  user_nom    text not null default '',
  date        timestamptz not null default now()
);
create index on public.mouvements (vehicule_id);
create index on public.mouvements (date desc);

-- ───────────────────────────── Achats ─────────────────────────────

create table public.achats (
  id             uuid primary key default gen_random_uuid(),
  numero         text not null unique,
  fournisseur_id uuid not null references public.fournisseurs (id),
  date           timestamptz not null default now(),
  statut         text not null default 'commande' check (statut in ('commande', 'partiel', 'recu', 'annule')),
  montant_total  bigint not null default 0,
  notes          text not null default '',
  user_nom       text not null default '',
  created_at     timestamptz not null default now()
);

alter table public.vehicules
  add constraint vehicules_achat_fk foreign key (achat_id) references public.achats (id);

create table public.achat_lignes (
  id          uuid primary key default gen_random_uuid(),
  achat_id    uuid not null references public.achats (id) on delete cascade,
  position    int  not null,
  marque      text not null,
  modele      text not null,
  finition    text not null default '',
  annee       int  not null,
  couleur     text not null default '',
  vin         text not null default '',
  prix_achat  bigint not null check (prix_achat > 0),
  recu        boolean not null default false,
  vehicule_id uuid references public.vehicules (id)
);
create index on public.achat_lignes (achat_id);

create table public.paiements_fournisseurs (
  id             uuid primary key default gen_random_uuid(),
  numero         text not null unique,
  achat_id       uuid not null references public.achats (id),
  fournisseur_id uuid not null references public.fournisseurs (id),
  montant        bigint not null check (montant > 0),
  mode           text not null check (mode in ('especes', 'cheque', 'virement', 'traite')),
  reference      text not null default '',
  session_id     uuid,
  user_nom       text not null default '',
  date           timestamptz not null default now()
);

-- ───────────────────────────── Clients ─────────────────────────────

create table public.clients (
  id                 uuid primary key default gen_random_uuid(),
  type               text not null default 'particulier' check (type in ('particulier', 'entreprise')),
  nom                text not null,
  telephone          text not null default '',
  email              text not null default '',
  wilaya             text not null default '',
  adresse            text not null default '',
  piece_type         text not null default '' check (piece_type in ('', 'cni', 'passeport', 'permis')),
  piece_numero       text not null default '',
  rc                 text not null default '',
  nif                text not null default '',
  nis                text not null default '',
  statut             text not null default 'nouveau'
                     check (statut in ('nouveau', 'contacte', 'interesse', 'rendez_vous', 'negociation', 'converti', 'perdu')),
  source             text not null default 'visite'
                     check (source in ('visite', 'telephone', 'facebook', 'whatsapp', 'site_web', 'recommandation', 'autre')),
  vehicule_recherche text not null default '',
  notes              text not null default '',
  demo               boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on public.clients (nom);
create index on public.clients (telephone);

create table public.interactions (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients (id) on delete cascade,
  type             text not null check (type in ('appel', 'visite', 'whatsapp', 'email', 'note')),
  resume           text not null,
  prochaine_action text not null default '',
  user_nom         text not null default '',
  date             timestamptz not null default now()
);
create index on public.interactions (client_id);

-- ───────────────────────────── Ventes et paiements ─────────────────────────────

create table public.ventes (
  id                   uuid primary key default gen_random_uuid(),
  numero               text not null unique,
  date                 timestamptz not null default now(),
  client_id            uuid not null references public.clients (id),
  vehicule_id          uuid not null references public.vehicules (id),
  depot_id             uuid not null references public.depots (id),
  -- instantané du véhicule au moment de la vente
  vehicule_libelle     text not null,
  vehicule_vin         text not null default '',
  -- prix et TVA
  mode_prix            text not null check (mode_prix in ('taux_ht', 'taux_ttc', 'montants', 'direct')),
  taux_tva             numeric(5, 2),           -- null pour « montants » et « direct »
  prix_catalogue_ht    bigint not null,
  remise_ht            bigint not null default 0 check (remise_ht >= 0),
  montant_ht           bigint not null check (montant_ht >= 0),
  montant_tva          bigint not null check (montant_tva >= 0),
  montant_ttc          bigint not null check (montant_ttc >= montant_ht),
  -- cycle de vie
  statut               text not null default 'confirmee' check (statut in ('confirmee', 'livree', 'annulee')),
  commercial_id        uuid,
  commercial_nom       text not null default '',
  notes                text not null default '',
  facture_numero       text unique,
  facture_date         timestamptz,
  bon_sortie_numero    text unique,
  date_livraison       timestamptz,
  livraison_accord_par text not null default '',
  annulation_motif     text not null default '',
  annulation_par       text not null default '',
  annulation_date      timestamptz,
  created_at           timestamptz not null default now()
);
create index on public.ventes (client_id);
create index on public.ventes (vehicule_id);
create index on public.ventes (date desc);
-- un véhicule ne peut avoir qu'une vente active
create unique index ventes_un_vehicule_actif on public.ventes (vehicule_id) where statut <> 'annulee';

create table public.vente_couts (
  vente_id     uuid primary key references public.ventes (id) on delete cascade,
  cout_revient bigint not null default 0
);

-- Paiements clients : encaissements et remboursements, tous moyens confondus.
-- Seuls les statuts « confirme », « encaisse » et « payee » comptent comme argent reçu.
create table public.paiements (
  id               uuid primary key default gen_random_uuid(),
  numero           text not null unique,
  vente_id         uuid not null references public.ventes (id),
  client_id        uuid not null references public.clients (id),
  sens             text not null check (sens in ('encaissement', 'remboursement')),
  mode             text not null check (mode in ('especes', 'cheque', 'cheque_certifie', 'virement', 'tpe', 'traite')),
  montant          bigint not null check (montant > 0),
  droit_timbre     bigint not null default 0 check (droit_timbre >= 0),
  statut           text not null check (statut in ('confirme', 'en_attente', 'encaisse', 'rejete',
                                                    'en_portefeuille', 'payee', 'impayee', 'annule')),
  banque           text not null default '',
  reference        text not null default '',
  tireur           text not null default '',   -- titulaire du chèque / débiteur de la traite
  date_emission    date,
  echeance         date,                       -- traites
  motif            text not null default '',
  session_id       uuid,
  user_nom         text not null default '',
  date             timestamptz not null default now(),
  statut_par       text not null default '',
  statut_date      timestamptz
);
create index on public.paiements (vente_id);
create index on public.paiements (statut);
create index on public.paiements (echeance) where mode = 'traite';

-- ───────────────────────────── Trésorerie ─────────────────────────────

create table public.caisse_sessions (
  id           uuid primary key default gen_random_uuid(),
  numero       text not null unique,
  statut       text not null default 'ouverte' check (statut in ('ouverte', 'cloturee')),
  fonds_initial bigint not null default 0 check (fonds_initial >= 0),
  ouverte_par  text not null default '',
  ouverture    timestamptz not null default now(),
  cloturee_par text not null default '',
  cloture      timestamptz,
  theorique    bigint,
  compte       bigint,
  ecart        bigint,
  notes        text not null default ''
);
-- une seule caisse ouverte à la fois
create unique index caisse_une_ouverte on public.caisse_sessions (statut) where statut = 'ouverte';

create table public.caisse_mouvements (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.caisse_sessions (id),
  type       text not null check (type in ('encaissement', 'timbre', 'remboursement', 'depense', 'annulation_depense',
                                           'paiement_fournisseur', 'apport', 'retrait')),
  sens       text not null check (sens in ('in', 'out')),
  montant    bigint not null check (montant > 0),
  motif      text not null default '',
  ref        text not null default '',
  user_nom   text not null default '',
  date       timestamptz not null default now()
);
create index on public.caisse_mouvements (session_id);

create table public.depenses (
  id               uuid primary key default gen_random_uuid(),
  numero           text not null unique,
  categorie        text not null,
  libelle          text not null,
  montant          bigint not null check (montant > 0),
  date             date not null,
  mode             text not null check (mode in ('especes', 'cheque', 'virement', 'tpe')),
  beneficiaire     text not null default '',
  vehicule_id      uuid references public.vehicules (id),
  session_id       uuid,
  annulee          boolean not null default false,
  annulation_motif text not null default '',
  user_nom         text not null default '',
  created_at       timestamptz not null default now()
);
create index on public.depenses (vehicule_id);
create index on public.depenses (date);

-- ───────────────────────────── Pièces jointes (métadonnées) ─────────────────────────────
-- Les fichiers eux-mêmes vont dans le bucket privé Supabase Storage « documents ».
create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  objet_type   text not null check (objet_type in ('vehicule', 'client', 'achat', 'fournisseur', 'vente', 'depense')),
  objet_id     uuid not null,
  categorie    text not null,
  nom_fichier  text not null,
  mime         text not null,
  taille       bigint not null,
  storage_path text not null unique,
  confidentiel boolean not null default false,
  archive      boolean not null default false,
  user_nom     text not null default '',
  date         timestamptz not null default now()
);
create index on public.documents (objet_type, objet_id);

-- ═════════════════════════════ Fonctions d'accès ═════════════════════════════

create or replace function app.me() returns public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles where id = auth.uid() and actif
$$;

create or replace function app.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and actif)
$$;

create or replace function app.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles pr
    join public.role_permissions rp on rp.role = pr.role
    where pr.id = auth.uid() and pr.actif and rp.perm = p
  )
$$;

create or replace function app.can_depot(d uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.actif
      and (pr.role in ('admin', 'gerant', 'audit') or pr.tous_depots
           or exists (select 1 from public.profile_depots pd where pd.profile_id = pr.id and pd.depot_id = d))
  )
$$;

-- Création automatique du profil à l'inscription :
-- le tout premier compte devient administrateur actif, les suivants attendent l'activation par un administrateur.
create or replace function app.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  premier boolean;
begin
  perform pg_advisory_xact_lock(424242);
  premier := not exists (select 1 from public.profiles);
  insert into public.profiles (id, email, nom, role, actif)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'nom', ''),
          case when premier then 'admin' else 'commercial' end, premier);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.on_auth_user_created();

-- ═════════════════════════════ Sécurité par ligne (RLS) ═════════════════════════════

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'role_permissions', 'depots', 'profile_depots', 'settings', 'sequences', 'audit_logs', 'fournisseurs',
    'vehicules', 'vehicule_couts', 'mouvements', 'achats', 'achat_lignes', 'paiements_fournisseurs', 'clients',
    'interactions', 'ventes', 'vente_couts', 'paiements', 'caisse_sessions', 'caisse_mouvements', 'depenses', 'documents'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Lecture seule pour les utilisateurs connectés ; aucune écriture directe.
grant select on public.profiles, public.role_permissions, public.depots, public.profile_depots, public.settings,
  public.audit_logs, public.fournisseurs, public.vehicules, public.vehicule_couts, public.mouvements, public.achats,
  public.achat_lignes, public.paiements_fournisseurs, public.clients, public.interactions, public.ventes,
  public.vente_couts, public.paiements, public.caisse_sessions, public.caisse_mouvements, public.depenses,
  public.documents
to authenticated;

create policy lecture on public.profiles for select to authenticated
  using (id = auth.uid() or app.has_perm('utilisateurs.gerer'));
create policy lecture on public.role_permissions for select to authenticated using (app.is_active());
create policy lecture on public.depots for select to authenticated using (app.is_active());
create policy lecture on public.profile_depots for select to authenticated
  using (profile_id = auth.uid() or app.has_perm('utilisateurs.gerer'));
create policy lecture on public.settings for select to authenticated using (app.is_active());
create policy lecture on public.audit_logs for select to authenticated using (app.has_perm('audit.voir'));
create policy lecture on public.fournisseurs for select to authenticated
  using (app.has_perm('achats.voir') or app.has_perm('fournisseurs.gerer'));
create policy lecture on public.vehicules for select to authenticated using (app.can_depot(depot_id));
create policy lecture on public.vehicule_couts for select to authenticated using (app.has_perm('couts.voir'));
create policy lecture on public.mouvements for select to authenticated
  using (exists (select 1 from public.vehicules v where v.id = vehicule_id and app.can_depot(v.depot_id)));
create policy lecture on public.achats for select to authenticated using (app.has_perm('achats.voir'));
create policy lecture on public.achat_lignes for select to authenticated using (app.has_perm('achats.voir'));
create policy lecture on public.paiements_fournisseurs for select to authenticated using (app.has_perm('achats.voir'));
create policy lecture on public.clients for select to authenticated using (app.is_active());
create policy lecture on public.interactions for select to authenticated using (app.is_active());
create policy lecture on public.ventes for select to authenticated using (app.can_depot(depot_id));
create policy lecture on public.vente_couts for select to authenticated using (app.has_perm('couts.voir'));
create policy lecture on public.paiements for select to authenticated
  using (exists (select 1 from public.ventes v where v.id = vente_id and app.can_depot(v.depot_id)));
create policy lecture on public.caisse_sessions for select to authenticated using (app.has_perm('caisse.voir'));
create policy lecture on public.caisse_mouvements for select to authenticated using (app.has_perm('caisse.voir'));
create policy lecture on public.depenses for select to authenticated using (app.has_perm('depenses.voir'));
create policy lecture on public.documents for select to authenticated
  using (app.is_active() and (not confidentiel or app.has_perm('clients.gerer')));

-- ═════════════════════════════ Vues de calcul ═════════════════════════════
-- security_invoker : la vue applique les droits de l'utilisateur qui l'interroge.

create view public.v_ventes_soldes with (security_invoker = true) as
select
  v.id as vente_id,
  v.montant_ttc,
  -- argent réellement reçu, net des remboursements
  (coalesce(sum(p.montant) filter (where p.sens = 'encaissement' and p.statut in ('confirme', 'encaisse', 'payee')), 0)
    - coalesce(sum(p.montant) filter (where p.sens = 'remboursement' and p.statut = 'confirme'), 0))::bigint as encaisse,
  coalesce(sum(p.montant) filter (where p.sens = 'encaissement' and p.statut = 'en_attente'), 0)::bigint as cheques_en_attente,
  coalesce(sum(p.montant) filter (where p.sens = 'encaissement' and p.statut = 'en_portefeuille'), 0)::bigint as traites_en_portefeuille,
  coalesce(sum(p.droit_timbre) filter (where p.sens = 'encaissement' and p.statut = 'confirme'), 0)::bigint as droit_timbre
from public.ventes v
left join public.paiements p on p.vente_id = v.id
group by v.id;

grant select on public.v_ventes_soldes to authenticated;
