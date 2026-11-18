import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_RULES = [
  '1. O que foi decidido aqui não volta à mesa de discussão.',
  '2. Palavra dada vale mais que explicação tardia.',
  '3. Disciplina não negocia com cansaço nem com humor.',
  '4. Quem quebra a própria regra perde o direito de cobrar a dos outros.',
  '5. Silêncio absoluto antes da execução; resultado fala depois.',
].join('\n');

const DATA_DIR = path.resolve(__dirname, '.data');
const DATA_FILE = path.join(DATA_DIR, 'regras.json');

interface RulesRecord {
  text: string;
  updatedAt: string;
  storageMode: 'supabase' | 'server';
}

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_KEY || '').trim();
  const table = (process.env.SUPABASE_TABLE || 'regras_absolutas').trim();
  const docId = (process.env.RULES_DOC_ID || 'unico').trim();

  if (!url || !key) {
    return null;
  }

  return {url, key, table, docId};
}

async function readLocalServerRules(): Promise<RulesRecord> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as {text?: unknown; updatedAt?: unknown};
    if (typeof parsed.text === 'string' && typeof parsed.updatedAt === 'string') {
      return {
        text: parsed.text,
        updatedAt: parsed.updatedAt,
        storageMode: 'server',
      };
    }
  } catch {
    // Initialize local server storage file on first run
  }

  const initial: RulesRecord = {
    text: DEFAULT_RULES,
    updatedAt: new Date().toISOString(),
    storageMode: 'server',
  };
  await writeLocalServerRules(initial.text, initial.updatedAt);
  return initial;
}

async function writeLocalServerRules(text: string, updatedAt: string): Promise<RulesRecord> {
  await fs.mkdir(DATA_DIR, {recursive: true});
  const tmpFile = `${DATA_FILE}.${process.pid}.tmp`;
  const payload = JSON.stringify({text, updatedAt}, null, 2);
  await fs.writeFile(tmpFile, payload, 'utf-8');
  await fs.rename(tmpFile, DATA_FILE);
  return {
    text,
    updatedAt,
    storageMode: 'server',
  };
}

async function readSupabaseRules(): Promise<RulesRecord> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    throw new Error('Supabase não configurado.');
  }

  const endpoint = `${cfg.url}/rest/v1/${encodeURIComponent(cfg.table)}?id=eq.${encodeURIComponent(cfg.docId)}&select=id,content,updated_at`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Supabase GET falhou (${response.status}): ${errBody}`);
  }

  const rows = (await response.json()) as Array<{
    id?: string;
    content?: string;
    updated_at?: string;
  }>;

  if (!Array.isArray(rows) || rows.length === 0) {
    return writeSupabaseRules(DEFAULT_RULES);
  }

  const row = rows[0];
  return {
    text: typeof row.content === 'string' ? row.content : '',
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
    storageMode: 'supabase',
  };
}

async function writeSupabaseRules(text: string): Promise<RulesRecord> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    throw new Error('Supabase não configurado.');
  }

  const nowIso = new Date().toISOString();
  const endpoint = `${cfg.url}/rest/v1/${encodeURIComponent(cfg.table)}?on_conflict=id`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify([
      {
        id: cfg.docId,
        content: text,
        updated_at: nowIso,
      },
    ]),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Supabase upsert falhou (${response.status}): ${errBody}`);
  }

  const rows = (await response.json()) as Array<{
    content?: string;
    updated_at?: string;
  }>;
  const saved = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

  return {
    text: typeof saved?.content === 'string' ? saved.content : text,
    updatedAt: typeof saved?.updated_at === 'string' ? saved.updated_at : nowIso,
    storageMode: 'supabase',
  };
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({limit: '1mb'}));

  app.get('/api/health', (_req, res) => {
    const supabaseActive = getSupabaseConfig() !== null;
    res.json({
      ok: true,
      storageMode: supabaseActive ? 'supabase' : 'server',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/rules', async (_req, res) => {
    try {
      const record = getSupabaseConfig()
        ? await readSupabaseRules()
        : await readLocalServerRules();
      res.setHeader('Cache-Control', 'no-store');
      res.json(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar regras.';
      console.error('[GET /api/rules]', message);
      res.status(502).json({error: message});
    }
  });

  app.put('/api/rules', async (req, res) => {
    const body = req.body as {text?: unknown} | undefined;
    if (!body || typeof body.text !== 'string') {
      res.status(400).json({error: 'Campo "text" obrigatório e deve ser string.'});
      return;
    }

    try {
      const nowIso = new Date().toISOString();
      const record = getSupabaseConfig()
        ? await writeSupabaseRules(body.text)
        : await writeLocalServerRules(body.text, nowIso);
      res.setHeader('Cache-Control', 'no-store');
      res.json(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar regras.';
      console.error('[PUT /api/rules]', message);
      res.status(502).json({error: message});
    }
  });

  if (!isProd) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    const mode = getSupabaseConfig() ? 'supabase' : 'server';
    console.log(`REGRAS ABSOLUTAS ativo em http://0.0.0.0:${port} (armazenamento: ${mode})`);
  });
}

startServer().catch((err) => {
  console.error('Falha ao iniciar servidor:', err);
  process.exit(1);
});
