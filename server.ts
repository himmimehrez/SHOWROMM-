import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Permettre la transmission de gros payloads (documents KYC en Base64)
app.use(express.json({ limit: '50mb' }));

// Stockage central en mémoire avec persistance de session
let serverSequence = 100;
const processedIdempotencyKeys = new Map<string, { timestamp: number; result: any }>();
const cloudDocumentsStore = new Map<string, { id: string; clientId: string; type: string; sha256: string; data: string; mimeType: string }>();

// Base de données centrale simulée pour l'arbitrage
interface CentralVehicle {
  id: string;
  vin: string;
  statut: string;
  version_seq: number;
  lastUpdated: number;
  assignedSaleId?: string;
}

const centralVehicles = new Map<string, CentralVehicle>([
  ['v-hilux-01', { id: 'v-hilux-01', vin: 'AHTFZ29G800123456', statut: 'en_stock', version_seq: 1, lastUpdated: Date.now() }],
  ['v-tucson-02', { id: 'v-tucson-02', vin: 'KMHJ881BBPU234567', statut: 'en_stock', version_seq: 1, lastUpdated: Date.now() }],
  ['v-coolray-03', { id: 'v-coolray-03', vin: 'LB37525A4P0345678', statut: 'en_stock', version_seq: 1, lastUpdated: Date.now() }],
  ['v-tiggo-04', { id: 'v-tiggo-04', vin: 'LVVDA21B5PD456789', statut: 'reserve', version_seq: 2, lastUpdated: Date.now(), assignedSaleId: 'vte-2026-0001' }],
  ['v-stepway-05', { id: 'v-stepway-05', vin: 'VF15DJ20571567890', statut: 'en_stock', version_seq: 1, lastUpdated: Date.now() }],
  ['v-fiat-06', { id: 'v-fiat-06', vin: 'ZFA3340000P678901', statut: 'en_stock', version_seq: 1, lastUpdated: Date.now() }],
]);

// 1. Healthcheck & Heartbeat
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    serverTime: Date.now(),
    serverSeq: serverSequence,
    uptimeSeconds: Math.floor(process.uptime()),
    cloudStorageDocsCount: cloudDocumentsStore.size,
  });
});

// 2. Pull : Synchronisation descendante différentielle paginée
app.get('/api/sync/pull', (req: Request, res: Response) => {
  const cursor = parseInt((req.query.cursor as string) || '0', 10);
  const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);

  // Générer les deltas si des mises à jour existent
  const deltas: any[] = [];
  res.json({
    cursor,
    nextCursor: serverSequence,
    hasMore: false,
    deltas,
    serverTimestamp: Date.now(),
  });
});

// 3. Push : Traitement atomique de la file d'attente sortante avec idempotence
app.post('/api/sync/push', (req: Request, res: Response) => {
  const { batch, deviceId } = req.body;

  if (!Array.isArray(batch)) {
    return res.status(400).json({ error: 'Format de lot invalide' });
  }

  const results: any[] = [];

  for (const item of batch) {
    const idempotencyKey = item.idempotencyKey || `${deviceId}_${item.id}`;

    // Vérification de duplication
    if (processedIdempotencyKeys.has(idempotencyKey)) {
      const cached = processedIdempotencyKeys.get(idempotencyKey)!;
      results.push(cached.result);
      continue;
    }

    serverSequence += 1;
    let itemResult: any = {
      opId: item.id,
      entityId: item.entityId,
      status: 'acknowledged',
      serverSeq: serverSequence,
      processedAt: Date.now(),
    };

    // Arbitrage de conflit spécifique aux ventes de véhicules
    if (item.entityType === 'vente' && item.action === 'CREATE') {
      const vehiculeId = item.payload?.vehicule_id;
      const targetVehicle = centralVehicles.get(vehiculeId);

      // Si le véhicule est déjà vendu ou réservé par une autre vente centrale
      if (targetVehicle && (targetVehicle.statut === 'vendu' || (targetVehicle.statut === 'reserve' && targetVehicle.assignedSaleId && targetVehicle.assignedSaleId !== item.entityId))) {
        itemResult = {
          opId: item.id,
          entityId: item.entityId,
          status: 'conflict',
          errorMessage: `Conflit d'allocation : Le véhicule ${targetVehicle.vin} a déjà été alloué par une autre transaction centrale.`,
          serverSeq: serverSequence,
          processedAt: Date.now(),
        };
      } else {
        // Enregistrement de l'affectation centrale
        if (targetVehicle) {
          targetVehicle.statut = 'vendu';
          targetVehicle.assignedSaleId = item.entityId;
          targetVehicle.version_seq += 1;
          targetVehicle.lastUpdated = Date.now();
        }
        itemResult.officialNumber = `FAC-2026-${String(serverSequence).padStart(4, '0')}`;
        itemResult.officialBonSortie = `BS-2026-${String(serverSequence).padStart(4, '0')}`;
      }
    }

    // Mise à jour de stock ou statut véhicule
    if (item.entityType === 'vehicule' && item.action === 'UPDATE') {
      const v = centralVehicles.get(item.entityId);
      if (v) {
        Object.assign(v, item.payload);
        v.version_seq += 1;
        v.lastUpdated = Date.now();
      }
    }

    // Mémoriser l'idempotence
    processedIdempotencyKeys.set(idempotencyKey, {
      timestamp: Date.now(),
      result: itemResult,
    });

    results.push(itemResult);
  }

  res.json({
    status: 'success',
    processedCount: results.length,
    results,
    currentServerSeq: serverSequence,
  });
});

// 4. Upload de document KYC vérifié par empreinte SHA-256
app.post('/api/sync/upload', (req: Request, res: Response) => {
  const { documentId, clientId, typeDoc, dataBlob, clientSha256, mimeType } = req.body;

  if (!documentId || !dataBlob) {
    return res.status(400).json({ error: 'Données document incomplètes' });
  }

  // Calcul du SHA-256 côté serveur
  const serverHash = crypto.createHash('sha256').update(dataBlob).digest('hex');

  // Si le client a envoyé son hash, on valide la cohérence
  if (clientSha256 && clientSha256 !== serverHash) {
    return res.status(422).json({
      error: 'Échec de vérification d intégrité : checksum SHA-256 discordant.',
      clientSha256,
      serverSha256: serverHash,
    });
  }

  // Stocker dans le cloud
  cloudDocumentsStore.set(documentId, {
    id: documentId,
    clientId,
    type: typeDoc,
    sha256: serverHash,
    data: dataBlob,
    mimeType: mimeType || 'image/jpeg',
  });

  res.status(201).json({
    status: 'synced',
    documentId,
    serverSha256: serverHash,
    serverUrl: `/api/documents/${documentId}`,
    storedAt: Date.now(),
  });
});

// 5. Récupération de document stocké
app.get('/api/documents/:id', (req: Request, res: Response) => {
  const doc = cloudDocumentsStore.get(req.params.id);
  if (!doc) {
    return res.status(404).json({ error: 'Document non trouvé dans le stockage cloud' });
  }
  res.json(doc);
});

// 6. Télémétrie et état de la synchronisation cloud
app.get('/api/sync/stats', (_req: Request, res: Response) => {
  res.json({
    serverSequence,
    totalIdempotencyKeys: processedIdempotencyKeys.size,
    cloudDocsCount: cloudDocumentsStore.size,
    centralVehiclesCount: centralVehicles.size,
    vehiclesOverview: Array.from(centralVehicles.values()),
  });
});

// Montage Vite en développement ou distribution statique en production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`[AutoGestion DZ Server] En écoute sur le port ${PORT}`);
  });
}

startServer();
