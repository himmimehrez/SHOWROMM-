-- ════════════════════════════════════════════════════════════════════════════
-- Showroom Manager DZ — fonctions serveur (seul chemin d'écriture)
--
-- Chaque fonction : vérifie le profil actif et la permission, verrouille les
-- lignes concernées (FOR UPDATE) pour empêcher les doubles opérations, refait
-- les contrôles métier, écrit, numérote et journalise. Une erreur annule tout.
-- Les messages d'erreur sont en français et destinés à l'utilisateur.
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────── Outils internes ─────────────────────────────

create or replace function app.fail(msg text) returns void
language plpgsql as $$
begin
  raise exception using message = msg, errcode = 'P0001';
end $$;

-- Profil actif de l'appelant, avec contrôle de permission optionnel
create or replace function app.require(perm text default null) returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare
  me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then perform app.fail('Session expirée : reconnectez-vous.'); end if;
  if not me.actif then perform app.fail('Ce compte est désactivé ou en attente d''activation.'); end if;
  if perm is not null and not app.has_perm(perm) then
    perform app.fail('Action non autorisée pour votre profil.');
  end if;
  return me;
end $$;

create or replace function app.require_depot(d uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.can_depot(d) then perform app.fail('Vous n''avez pas accès à ce dépôt.'); end if;
end $$;

-- Année courante à Alger
create or replace function app.annee() returns int
language sql stable as $$ select extract(year from (now() at time zone 'Africa/Algiers'))::int $$;

-- Numéro séquentiel par préfixe (et par année) : VTE-2026-00001. Sans trou ni doublon.
create or replace function app.next_number(prefix text, yearly boolean default true, pad int default 5) returns text
language plpgsql security definer set search_path = public as $$
declare
  k text := case when yearly then prefix || '-' || app.annee() else prefix end;
  v bigint;
begin
  insert into public.sequences (key, value) values (k, 1)
  on conflict (key) do update set value = public.sequences.value + 1
  returning value into v;
  return k || '-' || lpad(v::text, pad, '0');
end $$;

create or replace function app.audit(me public.profiles, action text, objet text, ref text, details text default '')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (user_id, user_nom, action, objet, ref, details)
  values (me.id, coalesce(nullif(me.nom, ''), me.email), action, objet, coalesce(ref, ''), coalesce(details, ''))
$$;

create or replace function app.nom(me public.profiles) returns text
language sql immutable as $$ select coalesce(nullif(me.nom, ''), me.email) $$;

create or replace function app.setting(k text) returns jsonb
language sql stable security definer set search_path = public as $$
  select data -> k from public.settings where id = 1
$$;

create or replace function app.fmt(n bigint) returns text
language sql immutable as $$ select replace(to_char(n, 'FM999G999G999G990'), ',', ' ') || ' DA' $$;

-- ───────────────────────────── Règles fiscales ─────────────────────────────

-- Droit de timbre sur un paiement en espèces (barème paramétrable, par tranche de 100 DA entamée)
create or replace function public.calcul_droit_timbre(montant bigint) returns bigint
language plpgsql stable security definer set search_path = public as $$
declare
  t jsonb := app.setting('timbre');
  tranche jsonb;
  par_100 numeric;
  droit numeric;
begin
  if montant is null or montant <= coalesce((t ->> 'exonere_jusqua')::bigint, 300) then return 0; end if;
  for tranche in select * from jsonb_array_elements(t -> 'tranches') loop
    if tranche ->> 'jusqua' is null or montant <= (tranche ->> 'jusqua')::bigint then
      par_100 := (tranche ->> 'par_100')::numeric;
      exit;
    end if;
  end loop;
  droit := ceil(montant / 100.0) * coalesce(par_100, 0);
  return greatest(round(droit), coalesce((t ->> 'minimum')::bigint, 0))::bigint;
end $$;

-- Calcul du prix d'une vente selon le mode choisi.
--   taux_ht  : montant = HT avant remise ; TVA = HT net × taux
--   taux_ttc : montant = TTC ; HT = TTC ÷ (1 + taux), puis remise HT
--   montants : montant = HT et montant_ttc = TTC saisis ; TVA = TTC − HT
--   direct   : montant = prix final payé, sans TVA détaillée
create or replace function public.calcul_prix(mode text, montant bigint, montant_ttc bigint default null,
                                              taux numeric default null, remise bigint default 0)
returns table (montant_ht bigint, montant_tva bigint, montant_ttc_calc bigint, taux_tva numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  ht bigint;
  r bigint := coalesce(remise, 0);
begin
  if montant is null or montant < 0 then perform app.fail('Le montant doit être positif.'); end if;
  if r < 0 then perform app.fail('La remise ne peut pas être négative.'); end if;
  if mode in ('taux_ht', 'taux_ttc') then
    if taux is null or not (app.setting('taux_tva') @> to_jsonb(taux) or app.setting('taux_tva') @> to_jsonb(taux::int)) then
      perform app.fail('Choisissez un taux de TVA autorisé (0, 9 ou 19 %).');
    end if;
  end if;
  if mode = 'taux_ht' then
    ht := montant - r;
    if ht < 0 then perform app.fail('La remise dépasse le prix.'); end if;
    return query select ht, round(ht * taux / 100)::bigint, ht + round(ht * taux / 100)::bigint, taux;
  elsif mode = 'taux_ttc' then
    ht := round(montant / (1 + taux / 100))::bigint - r;
    if ht < 0 then perform app.fail('La remise dépasse le prix.'); end if;
    return query select ht, round(ht * taux / 100)::bigint, ht + round(ht * taux / 100)::bigint, taux;
  elsif mode = 'montants' then
    if r <> 0 then perform app.fail('En mode « montants saisis », intégrez la remise dans les montants.'); end if;
    if montant_ttc is null then perform app.fail('Saisissez le montant TTC.'); end if;
    if montant_ttc < montant then perform app.fail('Le montant TTC ne peut pas être inférieur au montant HT.'); end if;
    return query select montant, montant_ttc - montant, montant_ttc, null::numeric;
  elsif mode = 'direct' then
    if r <> 0 then perform app.fail('En mode « prix direct », saisissez directement le prix final.'); end if;
    return query select montant, 0::bigint, montant, null::numeric;
  else
    perform app.fail('Mode de prix inconnu.');
  end if;
end $$;

-- ───────────────────────────── Caisse (outil interne) ─────────────────────────────

create or replace function app.caisse_ouverte() returns public.caisse_sessions
language sql stable security definer set search_path = public as $$
  select * from public.caisse_sessions where statut = 'ouverte' limit 1
$$;

create or replace function public.caisse_solde(p_session uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select (s.fonds_initial + coalesce(sum(case when m.sens = 'in' then m.montant else -m.montant end), 0))::bigint
  from public.caisse_sessions s
  left join public.caisse_mouvements m on m.session_id = s.id
  where s.id = p_session and app.has_perm('caisse.voir')
  group by s.id
$$;

-- Enregistre un mouvement d'espèces dans la caisse ouverte (verrouillée) et renvoie l'id de session
create or replace function app.caisse_mvt(me public.profiles, type text, sens text, montant bigint, motif text, ref text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s public.caisse_sessions;
  dispo bigint;
begin
  select * into s from public.caisse_sessions where statut = 'ouverte' for update;
  if s.id is null then
    perform app.fail('Aucune caisse ouverte : ouvrez une session de caisse avant toute opération en espèces.');
  end if;
  if sens = 'out' then
    select s.fonds_initial + coalesce(sum(case when m.sens = 'in' then m.montant else -m.montant end), 0)
      into dispo from public.caisse_mouvements m where m.session_id = s.id;
    if montant > dispo then
      perform app.fail('Espèces insuffisantes en caisse (disponible : ' || app.fmt(dispo) || ').');
    end if;
  end if;
  insert into public.caisse_mouvements (session_id, type, sens, montant, motif, ref, user_nom)
  values (s.id, type, sens, montant, motif, ref, app.nom(me));
  return s.id;
end $$;

-- ───────────────────────────── Paramètres, dépôts, utilisateurs ─────────────────────────────

create or replace function public.settings_save(p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('parametres.gerer');
begin
  if coalesce(trim(p_data ->> 'nom'), '') = '' then perform app.fail('Le nom du showroom est obligatoire.'); end if;
  if jsonb_typeof(p_data -> 'categories_depenses') <> 'array' or jsonb_array_length(p_data -> 'categories_depenses') = 0 then
    perform app.fail('Gardez au moins une catégorie de dépense.');
  end if;
  update public.settings set data = data || p_data where id = 1;
  perform app.audit(me, 'Paramètres modifiés', 'paramètres', '');
end $$;

create or replace function public.depot_save(p_id uuid, p_code text, p_nom text, p_adresse text default '',
                                             p_responsable text default '', p_actif boolean default true)
returns public.depots language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('parametres.gerer');
  d public.depots;
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if v_code = '' or coalesce(trim(p_nom), '') = '' then perform app.fail('Le code et le nom du dépôt sont obligatoires.'); end if;
  if exists (select 1 from public.depots where depots.code = v_code and id is distinct from p_id) then
    perform app.fail('Le code ' || v_code || ' est déjà utilisé.');
  end if;
  if p_id is not null and not p_actif and exists (
    select 1 from public.vehicules where depot_id = p_id and statut <> 'livre') then
    perform app.fail('Impossible de désactiver : des véhicules sont encore dans ce dépôt.');
  end if;
  if p_id is null then
    insert into public.depots (code, nom, adresse, responsable, actif)
    values (v_code, trim(p_nom), coalesce(p_adresse, ''), coalesce(p_responsable, ''), p_actif) returning * into d;
  else
    update public.depots set code = v_code, nom = trim(p_nom), adresse = coalesce(p_adresse, ''),
      responsable = coalesce(p_responsable, ''), actif = p_actif where id = p_id returning * into d;
  end if;
  perform app.audit(me, case when p_id is null then 'Dépôt créé' else 'Dépôt modifié' end, 'dépôt', v_code);
  return d;
end $$;

create or replace function public.profile_update(p_id uuid, p_nom text, p_role text, p_actif boolean,
                                                 p_tous_depots boolean default true, p_depots uuid[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('utilisateurs.gerer');
  cible public.profiles;
begin
  select * into cible from public.profiles where id = p_id for update;
  if cible.id is null then perform app.fail('Utilisateur introuvable.'); end if;
  if p_id = me.id and (not p_actif or p_role <> 'admin') then
    perform app.fail('Vous ne pouvez pas désactiver ou rétrograder votre propre compte.');
  end if;
  if cible.role = 'admin' and cible.actif and (not p_actif or p_role <> 'admin')
     and (select count(*) from public.profiles where role = 'admin' and actif) <= 1 then
    perform app.fail('Il doit rester au moins un administrateur actif.');
  end if;
  update public.profiles set nom = coalesce(trim(p_nom), nom), role = p_role, actif = p_actif, tous_depots = p_tous_depots
  where id = p_id;
  delete from public.profile_depots where profile_id = p_id;
  insert into public.profile_depots (profile_id, depot_id) select p_id, unnest(coalesce(p_depots, '{}'));
  perform app.audit(me, 'Utilisateur modifié', 'utilisateur', cible.email,
                    'rôle ' || p_role || case when p_actif then ', actif' else ', désactivé' end);
end $$;

-- ───────────────────────────── Véhicules ─────────────────────────────

create or replace function app.check_vin(p_vin text, except_id uuid default null) returns void
language plpgsql stable security definer set search_path = public as $$
declare dup public.vehicules;
begin
  if p_vin = '' then return; end if;
  if length(p_vin) <> 17 then perform app.fail('Le VIN doit comporter 17 caractères.'); end if;
  select * into dup from public.vehicules v where v.vin = p_vin and v.id is distinct from except_id;
  if dup.id is not null then
    perform app.fail('Ce VIN existe déjà (' || dup.reference || ' — ' || dup.marque || ' ' || dup.modele || ').');
  end if;
end $$;

create or replace function app.mouvement(me public.profiles, vehicule uuid, type text, d_from uuid, d_to uuid,
                                         motif text, ref text)
returns void language sql security definer set search_path = public as $$
  insert into public.mouvements (vehicule_id, type, depot_from, depot_to, motif, ref, user_id, user_nom)
  values (vehicule, type, d_from, d_to, coalesce(motif, ''), coalesce(ref, ''), me.id, app.nom(me))
$$;

-- p : { vin, immatriculation, marque, modele, finition, categorie, annee, couleur, carburant, boite, puissance,
--       kilometrage, etat, depot_id, prix_vente_ht, prix_achat, notes, fournisseur_id }
create or replace function public.vehicule_create(p jsonb) returns public.vehicules
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('vehicules.gerer');
  v public.vehicules;
  v_vin text := upper(trim(coalesce(p ->> 'vin', '')));
  depot uuid := (p ->> 'depot_id')::uuid;
begin
  perform app.check_vin(v_vin);
  if not exists (select 1 from public.depots where id = depot and actif) then perform app.fail('Choisissez un dépôt actif.'); end if;
  perform app.require_depot(depot);
  if coalesce(trim(p ->> 'marque'), '') = '' or coalesce(trim(p ->> 'modele'), '') = '' then
    perform app.fail('La marque et le modèle sont obligatoires.');
  end if;
  insert into public.vehicules (reference, vin, immatriculation, marque, modele, finition, categorie, annee, couleur,
    carburant, boite, puissance, kilometrage, etat, depot_id, fournisseur_id, prix_vente_ht, notes, demo)
  values (app.next_number('VH', false), v_vin, upper(trim(coalesce(p ->> 'immatriculation', ''))), trim(p ->> 'marque'),
    trim(p ->> 'modele'), coalesce(p ->> 'finition', ''), coalesce(p ->> 'categorie', ''), (p ->> 'annee')::int,
    coalesce(p ->> 'couleur', ''), coalesce(p ->> 'carburant', 'essence'), coalesce(p ->> 'boite', 'manuelle'),
    coalesce(p ->> 'puissance', ''), coalesce((p ->> 'kilometrage')::int, 0), coalesce(p ->> 'etat', 'neuf'), depot,
    nullif(p ->> 'fournisseur_id', '')::uuid, coalesce((p ->> 'prix_vente_ht')::bigint, 0), coalesce(p ->> 'notes', ''),
    coalesce((p ->> 'demo')::boolean, false))
  returning * into v;
  insert into public.vehicule_couts (vehicule_id, prix_achat)
  values (v.id, case when app.has_perm('couts.voir') then coalesce((p ->> 'prix_achat')::bigint, 0) else 0 end);
  perform app.mouvement(me, v.id, 'entree_manuelle', null, depot, 'Entrée en stock', v.reference);
  perform app.audit(me, 'Véhicule créé', 'véhicule', v.reference, v.marque || ' ' || v.modele);
  return v;
end $$;

create or replace function public.vehicule_update(p_id uuid, p jsonb) returns public.vehicules
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('vehicules.gerer');
  v public.vehicules;
  v_vin text := upper(trim(coalesce(p ->> 'vin', '')));
  nouveau_prix bigint := coalesce((p ->> 'prix_vente_ht')::bigint, 0);
  ancien_achat bigint;
begin
  select * into v from public.vehicules where id = p_id for update;
  if v.id is null then perform app.fail('Véhicule introuvable.'); end if;
  perform app.require_depot(v.depot_id);
  if v.statut = 'livre' then perform app.fail('Un véhicule livré ne peut plus être modifié.'); end if;
  perform app.check_vin(v_vin, p_id);
  if nouveau_prix <> v.prix_vente_ht then
    if not app.has_perm('vehicules.prix') then perform app.fail('Seul un gérant peut modifier le prix de vente.'); end if;
    perform app.audit(me, 'Prix de vente modifié', 'véhicule', v.reference, v.prix_vente_ht || ' → ' || nouveau_prix || ' DA HT');
  end if;
  if p ? 'prix_achat' and app.has_perm('couts.voir') then
    select prix_achat into ancien_achat from public.vehicule_couts where vehicule_id = p_id;
    if ancien_achat is distinct from (p ->> 'prix_achat')::bigint then
      update public.vehicule_couts set prix_achat = (p ->> 'prix_achat')::bigint where vehicule_id = p_id;
      perform app.audit(me, 'Prix d''achat modifié', 'véhicule', v.reference, ancien_achat || ' → ' || (p ->> 'prix_achat') || ' DA');
    end if;
  end if;
  update public.vehicules set vin = v_vin, immatriculation = upper(trim(coalesce(p ->> 'immatriculation', ''))),
    marque = trim(p ->> 'marque'), modele = trim(p ->> 'modele'), finition = coalesce(p ->> 'finition', ''),
    categorie = coalesce(p ->> 'categorie', ''), annee = (p ->> 'annee')::int, couleur = coalesce(p ->> 'couleur', ''),
    carburant = p ->> 'carburant', boite = p ->> 'boite', puissance = coalesce(p ->> 'puissance', ''),
    kilometrage = coalesce((p ->> 'kilometrage')::int, 0), etat = p ->> 'etat', prix_vente_ht = nouveau_prix,
    notes = coalesce(p ->> 'notes', ''), updated_at = now()
  where id = p_id returning * into v;
  perform app.audit(me, 'Véhicule modifié', 'véhicule', v.reference);
  return v;
end $$;

create or replace function public.vehicule_transferer(p_id uuid, p_depot uuid, p_motif text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('stock.transferer');
  v public.vehicules;
begin
  if coalesce(trim(p_motif), '') = '' then perform app.fail('Le motif est obligatoire.'); end if;
  select * into v from public.vehicules where id = p_id for update;
  if v.id is null then perform app.fail('Véhicule introuvable.'); end if;
  perform app.require_depot(v.depot_id);
  perform app.require_depot(p_depot);
  if v.statut = 'livre' then perform app.fail('Ce véhicule est déjà sorti du parc.'); end if;
  if v.depot_id = p_depot then perform app.fail('Le véhicule est déjà dans ce dépôt.'); end if;
  if not exists (select 1 from public.depots where id = p_depot and actif) then
    perform app.fail('Dépôt de destination introuvable ou inactif.');
  end if;
  update public.vehicules set depot_id = p_depot, updated_at = now() where id = p_id;
  perform app.mouvement(me, p_id, 'transfert', v.depot_id, p_depot, p_motif, v.reference);
  perform app.audit(me, 'Transfert de dépôt', 'véhicule', v.reference, p_motif);
end $$;

create or replace function public.vehicule_bloquer(p_id uuid, p_bloquer boolean, p_motif text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('stock.transferer');
  v public.vehicules;
begin
  if coalesce(trim(p_motif), '') = '' then perform app.fail('Le motif est obligatoire.'); end if;
  select * into v from public.vehicules where id = p_id for update;
  if v.id is null then perform app.fail('Véhicule introuvable.'); end if;
  perform app.require_depot(v.depot_id);
  if p_bloquer and v.statut <> 'disponible' then perform app.fail('Seul un véhicule disponible peut être bloqué.'); end if;
  if not p_bloquer and v.statut <> 'bloque' then perform app.fail('Ce véhicule n''est pas bloqué.'); end if;
  update public.vehicules set statut = case when p_bloquer then 'bloque' else 'disponible' end, updated_at = now()
  where id = p_id;
  perform app.mouvement(me, p_id, case when p_bloquer then 'blocage' else 'deblocage' end, v.depot_id, v.depot_id, p_motif, v.reference);
  perform app.audit(me, case when p_bloquer then 'Véhicule bloqué' else 'Véhicule débloqué' end, 'véhicule', v.reference, p_motif);
end $$;

-- ───────────────────────────── Clients ─────────────────────────────

create or replace function public.client_save(p_id uuid, p jsonb) returns public.clients
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('clients.gerer');
  c public.clients;
  tel text := regexp_replace(trim(coalesce(p ->> 'telephone', '')), '\s+', ' ', 'g');
begin
  if coalesce(trim(p ->> 'nom'), '') = '' then perform app.fail('Le nom est obligatoire.'); end if;
  if tel <> '' and tel !~ '^[0-9+ ]{9,16}$' then perform app.fail('Le numéro de téléphone n''est pas valide.'); end if;
  if p_id is null then
    insert into public.clients (type, nom, telephone, email, wilaya, adresse, piece_type, piece_numero, rc, nif, nis,
      statut, source, vehicule_recherche, notes, demo)
    values (coalesce(p ->> 'type', 'particulier'), trim(p ->> 'nom'), tel, coalesce(p ->> 'email', ''),
      coalesce(p ->> 'wilaya', ''), coalesce(p ->> 'adresse', ''), coalesce(p ->> 'piece_type', ''),
      coalesce(p ->> 'piece_numero', ''), coalesce(p ->> 'rc', ''), coalesce(p ->> 'nif', ''), coalesce(p ->> 'nis', ''),
      coalesce(p ->> 'statut', 'nouveau'), coalesce(p ->> 'source', 'visite'), coalesce(p ->> 'vehicule_recherche', ''),
      coalesce(p ->> 'notes', ''), coalesce((p ->> 'demo')::boolean, false))
    returning * into c;
  else
    update public.clients set type = coalesce(p ->> 'type', type), nom = trim(p ->> 'nom'), telephone = tel,
      email = coalesce(p ->> 'email', ''), wilaya = coalesce(p ->> 'wilaya', ''), adresse = coalesce(p ->> 'adresse', ''),
      piece_type = coalesce(p ->> 'piece_type', ''), piece_numero = coalesce(p ->> 'piece_numero', ''),
      rc = coalesce(p ->> 'rc', ''), nif = coalesce(p ->> 'nif', ''), nis = coalesce(p ->> 'nis', ''),
      statut = coalesce(p ->> 'statut', statut), source = coalesce(p ->> 'source', source),
      vehicule_recherche = coalesce(p ->> 'vehicule_recherche', ''), notes = coalesce(p ->> 'notes', ''),
      updated_at = now()
    where id = p_id returning * into c;
    if c.id is null then perform app.fail('Client introuvable.'); end if;
  end if;
  perform app.audit(me, case when p_id is null then 'Client créé' else 'Client modifié' end, 'client', c.nom);
  return c;
end $$;

create or replace function public.interaction_add(p_client uuid, p_type text, p_resume text, p_prochaine_action text default '')
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles := app.require('clients.gerer');
begin
  if coalesce(trim(p_resume), '') = '' then perform app.fail('Le résumé est obligatoire.'); end if;
  insert into public.interactions (client_id, type, resume, prochaine_action, user_nom)
  values (p_client, p_type, trim(p_resume), coalesce(p_prochaine_action, ''), app.nom(me));
end $$;

-- ───────────────────────────── Ventes ─────────────────────────────

-- Totaux de paiement d'une vente (lecture interne, sans RLS)
create or replace function app.vente_totaux(p_vente uuid,
  out encaisse bigint, out en_attente bigint, out portefeuille bigint, out especes bigint)
language sql stable security definer set search_path = public as $$
  select
    coalesce(sum(montant) filter (where sens = 'encaissement' and statut in ('confirme', 'encaisse', 'payee')), 0)
      - coalesce(sum(montant) filter (where sens = 'remboursement' and statut = 'confirme'), 0),
    coalesce(sum(montant) filter (where sens = 'encaissement' and statut = 'en_attente'), 0),
    coalesce(sum(montant) filter (where sens = 'encaissement' and statut = 'en_portefeuille'), 0),
    coalesce(sum(montant) filter (where sens = 'encaissement' and mode = 'especes' and statut = 'confirme'), 0)
  from public.paiements where vente_id = p_vente
$$;

create or replace function public.vente_create(p_client uuid, p_vehicule uuid, p_mode_prix text, p_montant bigint,
  p_montant_ttc bigint default null, p_taux numeric default null, p_remise bigint default 0, p_notes text default '')
returns public.ventes language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('ventes.creer');
  c public.clients;
  v public.vehicules;
  prix record;
  remise_effective bigint;
  plafond bigint := coalesce((app.setting('remise_max_commercial'))::bigint, 0);
  frais bigint;
  achat bigint;
  vte public.ventes;
begin
  select * into c from public.clients where id = p_client;
  if c.id is null then perform app.fail('Sélectionnez un client.'); end if;
  -- verrou : deux ventes simultanées du même véhicule ne peuvent pas passer
  select * into v from public.vehicules where id = p_vehicule for update;
  if v.id is null then perform app.fail('Sélectionnez un véhicule.'); end if;
  perform app.require_depot(v.depot_id);
  if v.statut <> 'disponible' then
    perform app.fail('Le véhicule ' || v.reference || ' n''est plus disponible.');
  end if;
  select * into prix from public.calcul_prix(p_mode_prix, p_montant, p_montant_ttc, p_taux, p_remise);
  if prix.montant_ttc_calc <= 0 then perform app.fail('Le prix de vente doit être supérieur à zéro.'); end if;
  -- remise réelle par rapport au prix affiché HT, quel que soit le mode de saisie
  remise_effective := case when p_mode_prix = 'taux_ht' then coalesce(p_remise, 0)
                           else greatest(coalesce(p_remise, 0), v.prix_vente_ht - prix.montant_ht) end;
  if v.prix_vente_ht > 0 and remise_effective > plafond and not app.has_perm('ventes.remise') then
    perform app.fail('Remise de ' || app.fmt(remise_effective) || ' supérieure au plafond de ' || app.fmt(plafond)
                     || ' : un gérant doit enregistrer cette vente.');
  end if;
  select coalesce(sum(montant), 0) into frais from public.depenses where vehicule_id = v.id and not annulee;
  select coalesce(prix_achat, 0) into achat from public.vehicule_couts where vehicule_id = v.id;
  insert into public.ventes (numero, client_id, vehicule_id, depot_id, vehicule_libelle, vehicule_vin, mode_prix,
    taux_tva, prix_catalogue_ht, remise_ht, montant_ht, montant_tva, montant_ttc, commercial_id, commercial_nom, notes)
  values (app.next_number('VTE'), c.id, v.id, v.depot_id,
    v.marque || ' ' || v.modele || case when v.finition <> '' then ' ' || v.finition else '' end || ' (' || v.annee || ')',
    v.vin, p_mode_prix, prix.taux_tva, v.prix_vente_ht, greatest(remise_effective, 0), prix.montant_ht,
    prix.montant_tva, prix.montant_ttc_calc, me.id, app.nom(me), coalesce(p_notes, ''))
  returning * into vte;
  insert into public.vente_couts (vente_id, cout_revient) values (vte.id, coalesce(achat, 0) + frais);
  update public.vehicules set statut = 'vendu', updated_at = now() where id = v.id;
  perform app.mouvement(me, v.id, 'vente', v.depot_id, v.depot_id, 'Vendu à ' || c.nom, vte.numero);
  update public.clients set statut = 'converti', updated_at = now() where id = c.id and statut <> 'converti';
  perform app.audit(me, 'Vente créée', 'vente', vte.numero, vte.vehicule_libelle || ' — ' || app.fmt(vte.montant_ttc) || ' TTC');
  return vte;
end $$;

-- Paiement client. Statut initial selon le moyen :
--   espèces, virement, carte : confirmé ; chèque / chèque certifié : en attente ; traite : en portefeuille.
create or replace function public.paiement_ajouter(p_vente uuid, p_mode text, p_montant bigint,
  p_reference text default '', p_banque text default '', p_tireur text default '',
  p_date_emission date default null, p_echeance date default null)
returns public.paiements language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('paiements.encaisser');
  vte public.ventes;
  t record;
  reste bigint;
  timbre bigint := 0;
  plafond bigint := coalesce((app.setting('plafond_especes'))::bigint, 0);
  v_statut text;
  num text;
  session uuid;
  p public.paiements;
begin
  if p_montant is null or p_montant <= 0 then perform app.fail('Le montant doit être positif.'); end if;
  select * into vte from public.ventes where id = p_vente for update;
  if vte.id is null then perform app.fail('Vente introuvable.'); end if;
  perform app.require_depot(vte.depot_id);
  if vte.statut = 'annulee' then perform app.fail('Cette vente est annulée.'); end if;
  select * into t from app.vente_totaux(p_vente);
  reste := vte.montant_ttc - t.encaisse - t.en_attente - t.portefeuille;
  if p_montant > reste then
    perform app.fail('Le montant dépasse le reste à couvrir (' || app.fmt(reste) || ').');
  end if;
  case p_mode
    when 'especes', 'virement', 'tpe' then v_statut := 'confirme';
    when 'cheque', 'cheque_certifie' then v_statut := 'en_attente';
    when 'traite' then v_statut := 'en_portefeuille';
    else perform app.fail('Moyen de paiement inconnu.');
  end case;
  if p_mode in ('cheque', 'cheque_certifie') and (coalesce(trim(p_banque), '') = '' or coalesce(trim(p_reference), '') = '') then
    perform app.fail('Indiquez la banque et le numéro du chèque.');
  end if;
  if p_mode = 'cheque_certifie' and p_date_emission is null then
    perform app.fail('Indiquez la date d''émission du chèque certifié.');
  end if;
  if p_mode = 'traite' and (coalesce(trim(p_reference), '') = '' or p_echeance is null or coalesce(trim(p_tireur), '') = '') then
    perform app.fail('Indiquez la référence, le débiteur et l''échéance de la traite.');
  end if;
  if p_mode = 'virement' and coalesce(trim(p_reference), '') = '' then
    perform app.fail('Indiquez la référence du virement.');
  end if;
  num := app.next_number('REC');
  if p_mode = 'especes' then
    if plafond > 0 and t.especes + p_montant > plafond and not app.has_perm('especes.depasser') then
      perform app.fail('Paiement en espèces au-delà du plafond de ' || app.fmt(plafond)
                       || ' : l''accord d''un gérant est nécessaire.');
    end if;
    timbre := public.calcul_droit_timbre(p_montant);
    session := app.caisse_mvt(me, 'encaissement', 'in', p_montant, 'Règlement ' || vte.numero, num);
    if timbre > 0 then
      perform app.caisse_mvt(me, 'timbre', 'in', timbre, 'Droit de timbre ' || vte.numero, num);
    end if;
    if plafond > 0 and t.especes + p_montant > plafond then
      perform app.audit(me, 'Dépassement du plafond espèces', 'vente', vte.numero, app.fmt(t.especes + p_montant));
    end if;
  end if;
  insert into public.paiements (numero, vente_id, client_id, sens, mode, montant, droit_timbre, statut, banque, reference,
    tireur, date_emission, echeance, session_id, user_nom)
  values (num, vte.id, vte.client_id, 'encaissement', p_mode, p_montant, timbre, v_statut, coalesce(p_banque, ''),
    coalesce(trim(p_reference), ''), coalesce(p_tireur, ''), p_date_emission, p_echeance, session, app.nom(me))
  returning * into p;
  perform app.audit(me, 'Paiement enregistré', 'vente', vte.numero, num || ' — ' || app.fmt(p_montant) || ' (' || p_mode || ', ' || v_statut || ')');
  return p;
end $$;

-- Changement de statut d'un chèque ou d'une traite
create or replace function public.paiement_statut(p_id uuid, p_statut text, p_motif text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('paiements.valider');
  p public.paiements;
  vte public.ventes;
begin
  select * into p from public.paiements where id = p_id for update;
  if p.id is null then perform app.fail('Paiement introuvable.'); end if;
  select * into vte from public.ventes where id = p.vente_id;
  perform app.require_depot(vte.depot_id);
  if not (
    (p.mode in ('cheque', 'cheque_certifie') and p.statut = 'en_attente' and p_statut in ('encaisse', 'rejete', 'annule')) or
    (p.mode = 'traite' and p.statut = 'en_portefeuille' and p_statut in ('payee', 'impayee', 'annule'))
  ) then
    perform app.fail('Changement de statut impossible depuis « ' || p.statut || ' ».');
  end if;
  if p_statut in ('rejete', 'impayee', 'annule') and coalesce(trim(p_motif), '') = '' then
    perform app.fail('Le motif est obligatoire.');
  end if;
  update public.paiements set statut = p_statut, motif = coalesce(p_motif, ''), statut_par = app.nom(me), statut_date = now()
  where id = p_id;
  perform app.audit(me, 'Statut de paiement modifié', 'vente', vte.numero, p.numero || ' : ' || p.statut || ' → ' || p_statut
                    || case when coalesce(p_motif, '') <> '' then ' — ' || p_motif else '' end);
end $$;

create or replace function public.paiement_rembourser(p_vente uuid, p_montant bigint, p_mode text, p_motif text,
                                                      p_reference text default '')
returns public.paiements language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('paiements.rembourser');
  vte public.ventes;
  t record;
  num text;
  session uuid;
  p public.paiements;
begin
  if coalesce(trim(p_motif), '') = '' then perform app.fail('Le motif du remboursement est obligatoire.'); end if;
  if p_montant is null or p_montant <= 0 then perform app.fail('Le montant doit être positif.'); end if;
  if p_mode not in ('especes', 'cheque', 'virement') then perform app.fail('Remboursement possible en espèces, chèque ou virement.'); end if;
  select * into vte from public.ventes where id = p_vente for update;
  if vte.id is null then perform app.fail('Vente introuvable.'); end if;
  perform app.require_depot(vte.depot_id);
  if vte.statut = 'livree' then perform app.fail('Véhicule déjà livré : un retour doit être traité avant tout remboursement.'); end if;
  select * into t from app.vente_totaux(p_vente);
  if p_montant > t.encaisse then
    perform app.fail('Le remboursement dépasse le montant réellement encaissé (' || app.fmt(t.encaisse) || ').');
  end if;
  num := app.next_number('RMB');
  if p_mode = 'especes' then
    session := app.caisse_mvt(me, 'remboursement', 'out', p_montant, 'Remboursement ' || vte.numero, num);
  end if;
  insert into public.paiements (numero, vente_id, client_id, sens, mode, montant, statut, reference, motif, session_id, user_nom)
  values (num, vte.id, vte.client_id, 'remboursement', p_mode, p_montant, 'confirme', coalesce(p_reference, ''),
          trim(p_motif), session, app.nom(me))
  returning * into p;
  perform app.audit(me, 'Remboursement', 'vente', vte.numero, num || ' — ' || app.fmt(p_montant) || ' — ' || p_motif);
  return p;
end $$;

-- Livraison : solde réellement encaissé, ou complété par des traites en portefeuille avec accord d'un gérant
create or replace function public.vente_livrer(p_vente uuid, p_accord_traite boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('ventes.livrer');
  vte public.ventes;
  t record;
  manque bigint;
  accord text := '';
  num text;
  v public.vehicules;
begin
  select * into vte from public.ventes where id = p_vente for update;
  if vte.id is null then perform app.fail('Vente introuvable.'); end if;
  perform app.require_depot(vte.depot_id);
  if vte.statut <> 'confirmee' then perform app.fail('Seule une vente confirmée peut être livrée.'); end if;
  select * into t from app.vente_totaux(p_vente);
  manque := vte.montant_ttc - t.encaisse;
  if manque > 0 then
    if t.en_attente > 0 then
      perform app.fail('Livraison bloquée : ' || app.fmt(t.en_attente) || ' en chèque(s) attendent la confirmation de la banque.');
    end if;
    if t.portefeuille >= manque then
      if not p_accord_traite then
        perform app.fail('Le solde est couvert par des traites non échues : l''accord d''un gérant est nécessaire pour livrer.');
      end if;
      if not app.has_perm('livraison.accord') then
        perform app.fail('Seul un gérant peut autoriser une livraison couverte par des traites.');
      end if;
      accord := app.nom(me);
    else
      perform app.fail('Livraison bloquée : il reste ' || app.fmt(manque - t.portefeuille) || ' à payer.');
    end if;
  end if;
  num := app.next_number('BS');
  update public.ventes set statut = 'livree', bon_sortie_numero = num, date_livraison = now(), livraison_accord_par = accord
  where id = p_vente;
  select * into v from public.vehicules where id = vte.vehicule_id for update;
  update public.vehicules set statut = 'livre', updated_at = now() where id = v.id;
  perform app.mouvement(me, v.id, 'livraison', v.depot_id, null, 'Sortie du parc — livraison client', num);
  perform app.audit(me, 'Véhicule livré', 'vente', vte.numero,
                    'Bon de sortie ' || num || case when accord <> '' then ' — accord traite : ' || accord else '' end);
  return num;
end $$;

create or replace function public.vente_annuler(p_vente uuid, p_motif text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('ventes.annuler');
  vte public.ventes;
  t record;
  v public.vehicules;
begin
  if coalesce(trim(p_motif), '') = '' then perform app.fail('Le motif d''annulation est obligatoire.'); end if;
  select * into vte from public.ventes where id = p_vente for update;
  if vte.id is null then perform app.fail('Vente introuvable.'); end if;
  perform app.require_depot(vte.depot_id);
  if vte.statut <> 'confirmee' then perform app.fail('Seule une vente confirmée (non livrée) peut être annulée.'); end if;
  select * into t from app.vente_totaux(p_vente);
  if t.encaisse > 0 then
    perform app.fail('Remboursez d''abord les ' || app.fmt(t.encaisse) || ' encaissés avant d''annuler.');
  end if;
  if t.en_attente > 0 or t.portefeuille > 0 then
    perform app.fail('Des chèques ou traites sont encore en cours : annulez-les ou rendez-les d''abord.');
  end if;
  update public.ventes set statut = 'annulee', annulation_motif = trim(p_motif), annulation_par = app.nom(me),
    annulation_date = now() where id = p_vente;
  select * into v from public.vehicules where id = vte.vehicule_id for update;
  update public.vehicules set statut = 'disponible', updated_at = now() where id = v.id;
  perform app.mouvement(me, v.id, 'annulation_vente', v.depot_id, v.depot_id, p_motif, vte.numero);
  perform app.audit(me, 'Vente annulée', 'vente', vte.numero, p_motif);
end $$;

-- Attribution du numéro de facture (une seule fois par vente)
create or replace function public.vente_facturer(p_vente uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('ventes.facturer');
  vte public.ventes;
  num text;
begin
  select * into vte from public.ventes where id = p_vente for update;
  if vte.id is null then perform app.fail('Vente introuvable.'); end if;
  perform app.require_depot(vte.depot_id);
  if vte.statut = 'annulee' then perform app.fail('Une vente annulée ne peut pas être facturée.'); end if;
  if vte.facture_numero is not null then return vte.facture_numero; end if;
  num := app.next_number('FAC');
  update public.ventes set facture_numero = num, facture_date = now() where id = p_vente;
  perform app.audit(me, 'Facture émise', 'vente', vte.numero, num);
  return num;
end $$;

-- ───────────────────────────── Caisse ─────────────────────────────

create or replace function public.caisse_ouvrir(p_fonds bigint) returns public.caisse_sessions
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('caisse.operer');
  s public.caisse_sessions;
begin
  if p_fonds is null or p_fonds < 0 then perform app.fail('Le fonds de caisse ne peut pas être négatif.'); end if;
  perform pg_advisory_xact_lock(777001);
  if exists (select 1 from public.caisse_sessions where statut = 'ouverte') then
    perform app.fail('Une session de caisse est déjà ouverte.');
  end if;
  insert into public.caisse_sessions (numero, fonds_initial, ouverte_par)
  values (app.next_number('CAI'), p_fonds, app.nom(me)) returning * into s;
  perform app.audit(me, 'Caisse ouverte', 'caisse', s.numero, 'Fonds initial ' || app.fmt(p_fonds));
  return s;
end $$;

create or replace function public.caisse_apport_retrait(p_type text, p_montant bigint, p_motif text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('caisse.operer');
begin
  if p_type not in ('apport', 'retrait') then perform app.fail('Opération inconnue.'); end if;
  if p_montant is null or p_montant <= 0 then perform app.fail('Le montant doit être positif.'); end if;
  if coalesce(trim(p_motif), '') = '' then perform app.fail('Le motif est obligatoire.'); end if;
  perform app.caisse_mvt(me, p_type, case when p_type = 'apport' then 'in' else 'out' end, p_montant, trim(p_motif), '');
  perform app.audit(me, case when p_type = 'apport' then 'Apport en caisse' else 'Retrait de caisse' end, 'caisse', '',
                    app.fmt(p_montant) || ' — ' || p_motif);
end $$;

create or replace function public.caisse_cloturer(p_compte bigint, p_notes text default '')
returns table (theorique bigint, compte bigint, ecart bigint)
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('caisse.operer');
  s public.caisse_sessions;
  th bigint;
begin
  if p_compte is null or p_compte < 0 then perform app.fail('Le montant compté ne peut pas être négatif.'); end if;
  select * into s from public.caisse_sessions where statut = 'ouverte' for update;
  if s.id is null then perform app.fail('Aucune caisse ouverte.'); end if;
  select s.fonds_initial + coalesce(sum(case when m.sens = 'in' then m.montant else -m.montant end), 0)
    into th from public.caisse_mouvements m where m.session_id = s.id;
  if p_compte <> th and coalesce(trim(p_notes), '') = '' then
    perform app.fail('Expliquez l''écart de caisse avant de clôturer.');
  end if;
  update public.caisse_sessions set statut = 'cloturee', cloturee_par = app.nom(me), cloture = now(), theorique = th,
    compte = p_compte, ecart = p_compte - th, notes = coalesce(trim(p_notes), '')
  where id = s.id;
  perform app.audit(me, 'Caisse clôturée', 'caisse', s.numero,
                    'Théorique ' || app.fmt(th) || ', compté ' || app.fmt(p_compte) || ', écart ' || app.fmt(p_compte - th));
  return query select th, p_compte, p_compte - th;
end $$;

-- ───────────────────────────── Dépenses ─────────────────────────────

create or replace function public.depense_creer(p_categorie text, p_libelle text, p_montant bigint, p_date date,
  p_mode text, p_beneficiaire text default '', p_vehicule uuid default null)
returns public.depenses language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('depenses.gerer');
  d public.depenses;
  num text;
  session uuid;
  v public.vehicules;
begin
  if coalesce(trim(p_categorie), '') = '' or coalesce(trim(p_libelle), '') = '' then
    perform app.fail('La catégorie et le libellé sont obligatoires.');
  end if;
  if p_montant is null or p_montant <= 0 then perform app.fail('Le montant doit être positif.'); end if;
  if p_vehicule is not null then
    select * into v from public.vehicules where id = p_vehicule;
    if v.id is null then perform app.fail('Véhicule introuvable.'); end if;
    if v.statut = 'livre' then perform app.fail('Ce véhicule est déjà livré : ses frais ne peuvent plus être modifiés.'); end if;
  end if;
  num := app.next_number('DEP');
  if p_mode = 'especes' then
    session := app.caisse_mvt(me, 'depense', 'out', p_montant, trim(p_categorie) || ' — ' || trim(p_libelle), num);
  end if;
  insert into public.depenses (numero, categorie, libelle, montant, date, mode, beneficiaire, vehicule_id, session_id, user_nom)
  values (num, trim(p_categorie), trim(p_libelle), p_montant, coalesce(p_date, current_date), p_mode,
          coalesce(p_beneficiaire, ''), p_vehicule, session, app.nom(me))
  returning * into d;
  perform app.audit(me, 'Dépense enregistrée', 'dépense', num, app.fmt(p_montant) || ' — ' || p_libelle);
  return d;
end $$;

create or replace function public.depense_annuler(p_id uuid, p_motif text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('depenses.annuler');
  d public.depenses;
begin
  if coalesce(trim(p_motif), '') = '' then perform app.fail('Le motif d''annulation est obligatoire.'); end if;
  select * into d from public.depenses where id = p_id for update;
  if d.id is null then perform app.fail('Dépense introuvable.'); end if;
  if d.annulee then perform app.fail('Cette dépense est déjà annulée.'); end if;
  if d.mode = 'especes' then
    perform app.caisse_mvt(me, 'annulation_depense', 'in', d.montant, 'Annulation ' || d.numero, d.numero);
  end if;
  update public.depenses set annulee = true, annulation_motif = trim(p_motif) where id = p_id;
  perform app.audit(me, 'Dépense annulée', 'dépense', d.numero, p_motif);
end $$;

-- ───────────────────────────── Fournisseurs et achats ─────────────────────────────

create or replace function public.fournisseur_save(p_id uuid, p jsonb) returns public.fournisseurs
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('fournisseurs.gerer');
  f public.fournisseurs;
begin
  if coalesce(trim(p ->> 'nom'), '') = '' then perform app.fail('Le nom du fournisseur est obligatoire.'); end if;
  if p_id is null then
    insert into public.fournisseurs (nom, telephone, adresse, nif_rc, notes)
    values (trim(p ->> 'nom'), coalesce(p ->> 'telephone', ''), coalesce(p ->> 'adresse', ''),
            coalesce(p ->> 'nif_rc', ''), coalesce(p ->> 'notes', ''))
    returning * into f;
  else
    update public.fournisseurs set nom = trim(p ->> 'nom'), telephone = coalesce(p ->> 'telephone', ''),
      adresse = coalesce(p ->> 'adresse', ''), nif_rc = coalesce(p ->> 'nif_rc', ''), notes = coalesce(p ->> 'notes', ''),
      actif = coalesce((p ->> 'actif')::boolean, actif)
    where id = p_id returning * into f;
    if f.id is null then perform app.fail('Fournisseur introuvable.'); end if;
  end if;
  perform app.audit(me, case when p_id is null then 'Fournisseur créé' else 'Fournisseur modifié' end, 'fournisseur', f.nom);
  return f;
end $$;

-- p_lignes : [{ marque, modele, finition, annee, couleur, vin, prix_achat }]
create or replace function public.achat_creer(p_fournisseur uuid, p_lignes jsonb, p_notes text default '')
returns public.achats language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('achats.gerer');
  a public.achats;
  l jsonb;
  i int := 0;
  v_vin text;
  vins text[] := '{}';
begin
  if not exists (select 1 from public.fournisseurs where id = p_fournisseur and actif) then
    perform app.fail('Sélectionnez un fournisseur actif.');
  end if;
  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    perform app.fail('Ajoutez au moins un véhicule à la commande.');
  end if;
  insert into public.achats (numero, fournisseur_id, notes, user_nom)
  values (app.next_number('ACH'), p_fournisseur, coalesce(p_notes, ''), app.nom(me)) returning * into a;
  for l in select * from jsonb_array_elements(p_lignes) loop
    i := i + 1;
    if coalesce(trim(l ->> 'marque'), '') = '' or coalesce(trim(l ->> 'modele'), '') = '' then
      perform app.fail('Ligne ' || i || ' : la marque et le modèle sont obligatoires.');
    end if;
    if coalesce((l ->> 'prix_achat')::bigint, 0) <= 0 then
      perform app.fail('Ligne ' || i || ' : le prix d''achat doit être positif.');
    end if;
    v_vin := upper(trim(coalesce(l ->> 'vin', '')));
    if v_vin <> '' then
      if v_vin = any (vins) then perform app.fail('Le même VIN apparaît deux fois dans la commande.'); end if;
      perform app.check_vin(v_vin);
      vins := vins || v_vin;
    end if;
    insert into public.achat_lignes (achat_id, position, marque, modele, finition, annee, couleur, vin, prix_achat)
    values (a.id, i, trim(l ->> 'marque'), trim(l ->> 'modele'), coalesce(l ->> 'finition', ''),
            coalesce((l ->> 'annee')::int, app.annee()), coalesce(l ->> 'couleur', ''), v_vin, (l ->> 'prix_achat')::bigint);
  end loop;
  update public.achats set montant_total = (select sum(prix_achat) from public.achat_lignes where achat_id = a.id)
  where id = a.id returning * into a;
  perform app.audit(me, 'Commande d''achat créée', 'achat', a.numero, app.fmt(a.montant_total));
  return a;
end $$;

-- Réception d'une ligne : c'est ici, et seulement ici, que le véhicule entre en stock
-- p : { depot_id, vin, prix_vente_ht, kilometrage, etat, carburant, boite }
create or replace function public.achat_receptionner(p_ligne uuid, p jsonb) returns public.vehicules
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('stock.receptionner');
  l public.achat_lignes;
  a public.achats;
  v public.vehicules;
  depot uuid := (p ->> 'depot_id')::uuid;
  v_vin text;
begin
  select * into l from public.achat_lignes where id = p_ligne for update;
  if l.id is null then perform app.fail('Ligne de commande introuvable.'); end if;
  select * into a from public.achats where id = l.achat_id for update;
  if a.statut = 'annule' then perform app.fail('Cette commande est annulée.'); end if;
  if l.recu then perform app.fail('Ce véhicule a déjà été réceptionné.'); end if;
  if not exists (select 1 from public.depots where id = depot and actif) then perform app.fail('Choisissez un dépôt de réception actif.'); end if;
  perform app.require_depot(depot);
  v_vin := upper(trim(coalesce(nullif(p ->> 'vin', ''), l.vin)));
  perform app.check_vin(v_vin);
  insert into public.vehicules (reference, vin, marque, modele, finition, annee, couleur, carburant, boite, kilometrage, etat,
    depot_id, fournisseur_id, achat_id, prix_vente_ht, demo)
  values (app.next_number('VH', false), v_vin, l.marque, l.modele, l.finition, l.annee, l.couleur,
    coalesce(p ->> 'carburant', 'essence'), coalesce(p ->> 'boite', 'manuelle'), coalesce((p ->> 'kilometrage')::int, 0),
    coalesce(p ->> 'etat', 'neuf'), depot, a.fournisseur_id, a.id, coalesce((p ->> 'prix_vente_ht')::bigint, 0),
    coalesce((p ->> 'demo')::boolean, false))
  returning * into v;
  insert into public.vehicule_couts (vehicule_id, prix_achat) values (v.id, l.prix_achat);
  update public.achat_lignes set recu = true, vin = v_vin, vehicule_id = v.id where id = l.id;
  update public.achats set statut = case when exists (select 1 from public.achat_lignes where achat_id = a.id and not recu)
                                          then 'partiel' else 'recu' end
  where id = a.id;
  perform app.mouvement(me, v.id, 'entree_achat', null, depot, 'Réception ' || a.numero, a.numero);
  perform app.audit(me, 'Réception véhicule', 'achat', a.numero, v.reference || ' — ' || v.marque || ' ' || v.modele);
  return v;
end $$;

create or replace function public.achat_annuler(p_achat uuid, p_motif text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('achats.gerer');
  a public.achats;
begin
  if coalesce(trim(p_motif), '') = '' then perform app.fail('Le motif d''annulation est obligatoire.'); end if;
  select * into a from public.achats where id = p_achat for update;
  if a.id is null then perform app.fail('Commande introuvable.'); end if;
  if a.statut <> 'commande' then perform app.fail('Une commande déjà (partiellement) réceptionnée ne peut pas être annulée.'); end if;
  if exists (select 1 from public.paiements_fournisseurs where achat_id = p_achat) then
    perform app.fail('Des paiements existent sur cette commande : elle ne peut pas être annulée.');
  end if;
  update public.achats set statut = 'annule', notes = trim(notes || E'\nAnnulée : ' || p_motif) where id = p_achat;
  perform app.audit(me, 'Commande annulée', 'achat', a.numero, p_motif);
end $$;

create or replace function public.fournisseur_payer(p_achat uuid, p_montant bigint, p_mode text, p_reference text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := app.require('achats.gerer');
  a public.achats;
  paye bigint;
  num text;
  session uuid;
begin
  if p_montant is null or p_montant <= 0 then perform app.fail('Le montant doit être positif.'); end if;
  select * into a from public.achats where id = p_achat for update;
  if a.id is null then perform app.fail('Commande introuvable.'); end if;
  if a.statut = 'annule' then perform app.fail('Cette commande est annulée.'); end if;
  select coalesce(sum(montant), 0) into paye from public.paiements_fournisseurs where achat_id = p_achat;
  if p_montant > a.montant_total - paye then
    perform app.fail('Le montant dépasse le reste dû (' || app.fmt(a.montant_total - paye) || ').');
  end if;
  num := app.next_number('PFR');
  if p_mode = 'especes' then
    if not app.has_perm('caisse.operer') then perform app.fail('Action non autorisée pour votre profil.'); end if;
    session := app.caisse_mvt(me, 'paiement_fournisseur', 'out', p_montant, 'Paiement ' || a.numero, num);
  end if;
  insert into public.paiements_fournisseurs (numero, achat_id, fournisseur_id, montant, mode, reference, session_id, user_nom)
  values (num, a.id, a.fournisseur_id, p_montant, p_mode, coalesce(p_reference, ''), session, app.nom(me));
  perform app.audit(me, 'Paiement fournisseur', 'achat', a.numero, num || ' — ' || app.fmt(p_montant));
end $$;

-- ───────────────────────────── Droits d'exécution ─────────────────────────────
-- Les fonctions publiques sont appelables uniquement par un utilisateur connecté.
-- Les fonctions internes (schéma app) ne sont pas exposées.

revoke all on all functions in schema app from public, anon, authenticated;
grant usage on schema app to authenticated;
grant execute on function app.has_perm(text), app.can_depot(uuid), app.is_active(), app.me() to authenticated;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
