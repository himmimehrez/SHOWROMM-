import { db } from './db';
import { getOrCreateDeviceId, calculateSha256 } from './crypto';
import type { SyncQueueItem, SyncEntity, SyncAction, SyncStats, ClientDoc } from '../types';

type SyncListener = (stats: SyncStats) => void;

class SyncEngine {
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isSimulatedOffline = false;
  private isSyncing = false;
  private lastSyncTimestamp = Date.now();
  private lastServerSeq = 0;
  private latencyMs = 0;
  private listeners: Set<SyncListener> = new Set();
  private heartbeatInterval: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notify();
        this.triggerSync();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notify();
      });

      // Heartbeat toutes les 15 secondes
      this.heartbeatInterval = setInterval(() => {
        this.checkHealthAndSync();
      }, 15000);

      // Premier check au lancement
      setTimeout(() => {
        this.checkHealthAndSync();
      }, 1000);
    }
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    this.notifySingle(listener);
    return () => this.listeners.delete(listener);
  }

  private async notify() {
    const stats = await this.getStats();
    this.listeners.forEach(l => l(stats));
  }

  private async notifySingle(listener: SyncListener) {
    const stats = await this.getStats();
    listener(stats);
  }

  public async getStats(): Promise<SyncStats> {
    const pendingCount = await db.sync_queue.where('status').equals('pending').count();
    const conflictCount = await db.sync_queue.where('status').equals('conflict').count();
    const errorCount = await db.sync_queue.where('status').equals('error').count();

    return {
      isOnline: this.isOnline,
      isSimulatedOffline: this.isSimulatedOffline,
      isSyncing: this.isSyncing,
      pendingCount,
      conflictCount,
      errorCount,
      lastSyncTimestamp: this.lastSyncTimestamp,
      lastServerSeq: this.lastServerSeq,
      latencyMs: this.latencyMs,
    };
  }

  public isEffectivelyOnline(): boolean {
    return this.isOnline && !this.isSimulatedOffline;
  }

  // Permet à l'utilisateur de simuler une coupure de connexion pour tester l'Offline
  public setSimulatedOffline(simulated: boolean) {
    this.isSimulatedOffline = simulated;
    this.notify();
    if (!simulated && this.isOnline) {
      this.triggerSync();
    }
  }

  public toggleSimulatedOffline() {
    this.setSimulatedOffline(!this.isSimulatedOffline);
  }

  // Vérifie l'état réel du serveur via un ping léger
  public async checkHealthAndSync() {
    if (!this.isEffectivelyOnline()) {
      this.notify();
      return;
    }

    const start = performance.now();
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        this.latencyMs = Math.round(performance.now() - start);
        this.lastServerSeq = data.serverSeq || this.lastServerSeq;
        this.isOnline = true;
        await this.triggerSync();
      } else {
        this.isOnline = false;
      }
    } catch {
      this.isOnline = false;
    }
    this.notify();
  }

  // Enfilement d'une opération sortante
  public async enqueueOperation(entityType: SyncEntity, entityId: string, action: SyncAction, payload: any): Promise<SyncQueueItem> {
    const { deviceId } = getOrCreateDeviceId();
    const id = `op-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const idempotencyKey = `${deviceId}_${id}`;

    const queueItem: SyncQueueItem = {
      id,
      deviceId,
      idempotencyKey,
      entityType,
      entityId,
      action,
      payload,
      createdAt: Date.now(),
      status: 'pending',
      retryCount: 0,
    };

    await db.sync_queue.add(queueItem);

    // Audit log local
    await db.audit_logs.add({
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      timestamp: Date.now(),
      action: `${action}_${entityType.toUpperCase()}`,
      details: `Enregistrement local sur ${deviceId} (${this.isEffectivelyOnline() ? 'En ligne' : 'Hors ligne'})`,
      user: 'Utilisateur actif',
      device_id: deviceId,
      sync_ref: id,
    });

    this.notify();

    // Déclenchement automatique de synchronisation si en ligne
    if (this.isEffectivelyOnline()) {
      this.triggerSync();
    }

    return queueItem;
  }

  // Processus de synchronisation complet
  public async triggerSync(): Promise<boolean> {
    if (this.isSyncing || !this.isEffectivelyOnline()) {
      return false;
    }

    this.isSyncing = true;
    this.notify();

    try {
      // 1. PUSH des opérations de la file d'attente
      const pendingItems = await db.sync_queue
        .filter(item => item.status === 'pending' || (item.status === 'error' && item.retryCount < 5))
        .toArray();

      if (pendingItems.length > 0) {
        const { deviceId } = getOrCreateDeviceId();
        const batch = pendingItems.slice(0, 50);

        // Marquer en cours
        for (const item of batch) {
          await db.sync_queue.update(item.id, { status: 'syncing' });
        }

        const pushRes = await fetch('/api/sync/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch, deviceId }),
        });

        if (pushRes.ok) {
          const pushData = await pushRes.json();
          this.lastServerSeq = pushData.currentServerSeq || this.lastServerSeq;

          for (const resItem of pushData.results) {
            const originalItem = batch.find(i => i.id === resItem.opId);
            if (!originalItem) continue;

            if (resItem.status === 'acknowledged') {
              await db.sync_queue.update(originalItem.id, {
                status: 'synced',
                lastAttemptAt: Date.now(),
              });

              // Si c'était une vente, valider officiellement
              if (originalItem.entityType === 'vente') {
                await db.ventes.update(originalItem.entityId, {
                  statut_validation: 'confirme_central',
                  numero_facture: resItem.officialNumber,
                  bon_sortie_numero: resItem.officialBonSortie,
                });
              }
            } else if (resItem.status === 'conflict') {
              // Conflit détecté : conserver sans supprimer !
              await db.sync_queue.update(originalItem.id, {
                status: 'conflict',
                errorMessage: resItem.errorMessage,
                lastAttemptAt: Date.now(),
              });

              if (originalItem.entityType === 'vente') {
                await db.ventes.update(originalItem.entityId, {
                  statut_validation: 'conflit_allocation',
                  conflit_detail: resItem.errorMessage,
                });
              }
            }
          }
        } else {
          // Erreur réseau lors du push
          for (const item of batch) {
            await db.sync_queue.update(item.id, {
              status: 'error',
              retryCount: item.retryCount + 1,
              errorMessage: `Erreur serveur HTTP ${pushRes.status}`,
              lastAttemptAt: Date.now(),
            });
          }
        }
      }

      // 2. Synchronisation des documents KYC (Vérification SHA-256)
      await this.syncPendingDocuments();

      // 3. PULL différentiel
      const pullRes = await fetch(`/api/sync/pull?cursor=${this.lastServerSeq}`);
      if (pullRes.ok) {
        const pullData = await pullRes.json();
        this.lastServerSeq = pullData.nextCursor;
      }

      this.lastSyncTimestamp = Date.now();
      return true;
    } catch (err: any) {
      console.warn('[SyncEngine] Erreur pendant la synchronisation:', err);
      return false;
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  // Upload asynchrone vérifié par SHA-256 des documents scannés
  private async syncPendingDocuments() {
    const pendingDocs = await db.documents_kyc
      .filter(doc => doc.sync_status === 'pending' || doc.sync_status === 'error')
      .limit(5)
      .toArray();

    for (const doc of pendingDocs) {
      try {
        await db.documents_kyc.update(doc.id, { sync_status: 'syncing' });

        // Calcul ou vérification du SHA-256
        const sha256 = doc.sha256 || await calculateSha256(doc.data_blob_base64);

        const res = await fetch('/api/sync/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: doc.id,
            clientId: doc.client_id,
            typeDoc: doc.type_doc,
            dataBlob: doc.data_blob_base64,
            clientSha256: sha256,
            mimeType: doc.mime_type,
          }),
        });

        if (res.ok) {
          const resData = await res.json();
          await db.documents_kyc.update(doc.id, {
            sync_status: 'synced',
            serveur_url: resData.serverUrl,
            sha256: resData.serverSha256,
            uploaded_at: Date.now(),
          });
        } else {
          await db.documents_kyc.update(doc.id, { sync_status: 'error' });
        }
      } catch (err) {
        console.warn(`[SyncEngine] Échec upload doc ${doc.id}:`, err);
        await db.documents_kyc.update(doc.id, { sync_status: 'error' });
      }
    }
  }

  // Relancer toutes les erreurs
  public async retryAllErrors() {
    const errorItems = await db.sync_queue.where('status').equals('error').toArray();
    for (const item of errorItems) {
      await db.sync_queue.update(item.id, { status: 'pending', retryCount: 0 });
    }
    return this.triggerSync();
  }
}

export const syncEngine = new SyncEngine();
