/**
 * Comptes utilisateurs locaux. Mots de passe hachés PBKDF2-SHA256 (210 000 itérations, sel aléatoire).
 * Limite connue : tant que les données restent dans le navigateur, une personne qui a accès au poste
 * et aux outils développeur peut lire la base. Le cloisonnement réel arrivera avec le backend.
 */
import { db, uid } from './db';
import { assertCan } from './permissions';
import { audit, saveDepot, DEFAULT_SETTINGS, ValidationError } from './services';
import type { Role, SessionUser, User } from './types';

const ITERATIONS = 210_000;
const SESSION_KEY = 'smdz_session_user';

function toB64(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

async function hash(password: string, saltB64: string): Promise<string> {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return toB64(bits);
}

function checkPassword(pwd: string) {
  if (pwd.length < 8) throw new ValidationError('Le mot de passe doit contenir au moins 8 caractères.');
  if (!/[0-9]/.test(pwd) || !/[A-Za-z]/.test(pwd)) throw new ValidationError('Le mot de passe doit contenir des lettres et des chiffres.');
}

function checkLogin(login: string) {
  const l = login.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(l)) throw new ValidationError("L'identifiant doit faire 3 à 30 caractères (lettres, chiffres, . _ -).");
  return l;
}

function toSession(u: User): SessionUser {
  return { id: u.id, nom: u.nom, login: u.login, role: u.role };
}

export async function hasAnyUser(): Promise<boolean> {
  return (await db.users.count()) > 0;
}

/** Premier lancement : crée l'administrateur, les paramètres et le dépôt principal. */
export async function setupFirstAdmin(input: { nom: string; login: string; password: string; shop: string }) {
  if (await hasAnyUser()) throw new ValidationError("L'application est déjà initialisée.");
  const login = checkLogin(input.login);
  checkPassword(input.password);
  if (!input.nom.trim()) throw new ValidationError('Le nom est obligatoire.');
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const user: User = {
    id: uid(), login, nom: input.nom.trim(), role: 'admin', pwdHash: await hash(input.password, salt), salt,
    actif: true, created_at: Date.now(),
  };
  await db.users.add(user);
  await db.settings.put({ key: 'shop', value: { ...DEFAULT_SETTINGS, nom: input.shop.trim() || DEFAULT_SETTINGS.nom } });
  const session = toSession(user);
  await saveDepot(session, { code: 'SHW', nom: 'Showroom principal', adresse: '', responsable: user.nom, actif: true });
  await audit(session, 'Initialisation', 'application', '', 'Création du compte administrateur');
  sessionStorage.setItem(SESSION_KEY, user.id);
  return session;
}

const attempts = new Map<string, { count: number; until: number }>();

export async function login(loginName: string, password: string): Promise<SessionUser> {
  const l = loginName.trim().toLowerCase();
  const a = attempts.get(l);
  if (a && a.until > Date.now()) {
    const s = Math.ceil((a.until - Date.now()) / 1000);
    throw new ValidationError(`Trop de tentatives. Réessayez dans ${s} s.`);
  }
  const user = await db.users.where('login').equals(l).first();
  const ok = user && user.actif && (await hash(password, user.salt)) === user.pwdHash;
  if (!ok) {
    const count = (a?.count ?? 0) + 1;
    attempts.set(l, { count, until: count >= 5 ? Date.now() + 60_000 : 0 });
    if (user && !user.actif) throw new ValidationError('Ce compte est désactivé. Contactez un administrateur.');
    throw new ValidationError('Identifiant ou mot de passe incorrect.');
  }
  attempts.delete(l);
  sessionStorage.setItem(SESSION_KEY, user.id);
  const session = toSession(user);
  await audit(session, 'Connexion', 'utilisateur', user.login);
  return session;
}

export async function restoreSession(): Promise<SessionUser | null> {
  const id = sessionStorage.getItem(SESSION_KEY);
  if (!id) return null;
  const user = await db.users.get(id);
  if (!user || !user.actif) {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
  return toSession(user);
}

export async function logout(user: SessionUser | null, reason = 'Déconnexion') {
  sessionStorage.removeItem(SESSION_KEY);
  if (user) await audit(user, reason, 'utilisateur', user.login);
}

export async function createUser(admin: SessionUser, input: { nom: string; login: string; password: string; role: Role }) {
  assertCan(admin, 'utilisateurs.gerer');
  const login = checkLogin(input.login);
  checkPassword(input.password);
  if (!input.nom.trim()) throw new ValidationError('Le nom est obligatoire.');
  if (await db.users.where('login').equals(login).first()) throw new ValidationError('Cet identifiant est déjà utilisé.');
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const pwdHash = await hash(input.password, salt);
  await db.users.add({ id: uid(), login, nom: input.nom.trim(), role: input.role, pwdHash, salt, actif: true, created_at: Date.now() });
  await audit(admin, 'Utilisateur créé', 'utilisateur', login, input.role);
}

export async function updateUser(admin: SessionUser, id: string, patch: { nom?: string; role?: Role; actif?: boolean; password?: string }) {
  assertCan(admin, 'utilisateurs.gerer');
  const user = await db.users.get(id);
  if (!user) throw new ValidationError('Utilisateur introuvable.');
  if (id === admin.id && (patch.actif === false || (patch.role && patch.role !== 'admin'))) {
    throw new ValidationError('Vous ne pouvez pas désactiver ou rétrograder votre propre compte.');
  }
  if ((patch.actif === false || (patch.role && patch.role !== 'admin')) && user.role === 'admin') {
    const admins = await db.users.where('role').equals('admin').filter((u) => u.actif).count();
    if (admins <= 1) throw new ValidationError('Il doit rester au moins un administrateur actif.');
  }
  const changes: Partial<User> = {};
  if (patch.nom !== undefined) changes.nom = patch.nom.trim();
  if (patch.role) changes.role = patch.role;
  if (patch.actif !== undefined) changes.actif = patch.actif;
  if (patch.password) {
    checkPassword(patch.password);
    changes.salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
    changes.pwdHash = await hash(patch.password, changes.salt);
  }
  await db.users.update(id, changes);
  const what = [patch.role && `rôle ${patch.role}`, patch.actif === false && 'désactivé', patch.actif === true && 'réactivé', patch.password && 'mot de passe réinitialisé'].filter(Boolean).join(', ');
  await audit(admin, 'Utilisateur modifié', 'utilisateur', user.login, what);
}
