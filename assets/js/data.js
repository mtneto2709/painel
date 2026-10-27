// Camada de dados: carrega as competências geradas por scripts/sigtap_build.py,
// normaliza procedimentos e oferece busca, filtros e consultas reversas.

export const COMPLEXIDADE = {
  0: 'Não se aplica',
  1: 'Atenção Básica',
  2: 'Média Complexidade',
  3: 'Alta Complexidade',
};

export const SEXO = { M: 'Masculino', F: 'Feminino', I: 'Ambos', N: 'Não se aplica' };

export const TIPO_COMPAT = { 1: 'Compatível', 2: 'Incompatível / excludente', 3: 'Concomitante' };

export const AGRAVO = { 0: 'Sem agravo', 1: 'Agravo de notificação', 2: 'Agravo de bloqueio' };

const BASE_URL = new URL('../../data/', import.meta.url);

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const digits = (s) => String(s ?? '').replace(/\D/g, '');

/** 0301010072 -> 03.01.01.007-2 */
export function fmtCode(co) {
  const c = digits(co);
  if (c.length !== 10) return co;
  return `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
}

/** A000 -> A00.0 */
export function fmtCid(c) {
  c = String(c).trim();
  return c.length > 3 ? `${c.slice(0, 3)}.${c.slice(3)}` : c;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (cents) => brl.format((cents || 0) / 100);
export const num = (n) => new Intl.NumberFormat('pt-BR').format(n ?? 0);

export function fmtIdade(meses) {
  if (meses === null || meses === undefined) return null;
  if (meses < 12) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const a = Math.floor(meses / 12);
  const m = meses % 12;
  const anos = `${a} ${a === 1 ? 'ano' : 'anos'}`;
  return m ? `${anos} e ${m} ${m === 1 ? 'mês' : 'meses'}` : anos;
}

async function getJSON(path) {
  const res = await fetch(new URL(path, BASE_URL));
  if (!res.ok) throw new Error(`Falha ao carregar ${path} (${res.status})`);
  return res.json();
}

class Competencia {
  constructor(raw) {
    const { cols, procedimentos, meta, ...tables } = raw;
    this.meta = meta;
    this.t = tables;
    const ix = Object.fromEntries(cols.map((c, i) => [c, i]));
    this.procs = procedimentos.map((r) => {
      const p = {};
      for (const c of cols) p[c] = r[ix[c]];
      p.g = p.co.slice(0, 2);
      p.sg = p.co.slice(0, 4);
      p.fo = p.co.slice(0, 6);
      p.totAmb = p.sa;
      p.totHosp = p.sh + p.sp;
      p.n = norm(p.no);
      return p;
    });
    this.byCode = new Map(this.procs.map((p) => [p.co, p]));
    this.shards = new Map();
    this.reverseCache = new Map();
    this.cid = null;
  }

  get id() {
    return this.meta.competencia;
  }
  get completo() {
    return !!this.meta.completo;
  }

  get(co) {
    return this.byCode.get(digits(co)) || null;
  }

  nome(table, key) {
    return this.t[table]?.[key] ?? null;
  }

  async loadCid() {
    if (!this.cid) {
      try {
        const raw = await getJSON(`${this.id}/cid.json`);
        this.cid = Object.entries(raw).map(([co, [no, sx, ag]]) => ({ co, no, sx, ag, n: norm(no) }));
        this.cidMap = new Map(this.cid.map((c) => [c.co, c]));
      } catch {
        this.cid = [];
        this.cidMap = new Map();
      }
    }
    return this.cid;
  }

  /** Relacionamentos de um procedimento (CID, CBO, habilitações...). */
  async rel(co) {
    const g = co.slice(0, 2);
    if (!this.meta.shards?.includes(g)) return null;
    if (!this.shards.has(g)) this.shards.set(g, getJSON(`${this.id}/rel/${g}.json`));
    const shard = await this.shards.get(g);
    return shard[co] || {};
  }

  async loadAllShards(onProgress) {
    const list = this.meta.shards || [];
    let done = 0;
    await Promise.all(
      list.map(async (g) => {
        await this.rel(`${g}00000000`);
        onProgress?.(++done / list.length);
      }),
    );
    const all = {};
    for (const g of list) Object.assign(all, await this.shards.get(g));
    return all;
  }

  /**
   * Índice reverso: campo do relacionamento -> chave -> [códigos de procedimento].
   * Ex.: reverse('cid') -> Map('A150' => ['0301010072', ...]).
   */
  async reverse(field, onProgress) {
    if (this.reverseCache.has(field)) return this.reverseCache.get(field);
    const all = await this.loadAllShards(onProgress);
    const idx = new Map();
    for (const [co, r] of Object.entries(all)) {
      for (const item of r[field] || []) {
        const key = Array.isArray(item) ? item[0] : item;
        if (!idx.has(key)) idx.set(key, []);
        idx.get(key).push(co);
      }
    }
    this.reverseCache.set(field, idx);
    return idx;
  }

  /** Busca textual por código (com ou sem pontuação) ou nome, sem acentos. */
  search(query, list = this.procs) {
    const q = norm(query).trim();
    if (!q) return list;
    const d = digits(q);
    const codeLike = d.length >= 2 && /^[\d.\-\s]+$/.test(q);
    if (codeLike) return list.filter((p) => p.co.startsWith(d));
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored = [];
    for (const p of list) {
      if (!tokens.every((t) => p.n.includes(t) || p.co.includes(t))) continue;
      let s = 0;
      if (p.n.startsWith(q)) s += 100;
      else if (p.n.includes(q)) s += 50;
      for (const t of tokens) if (new RegExp(`(^|\\W)${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(p.n)) s += 10;
      s -= p.n.length / 100;
      scored.push([s, p]);
    }
    return scored.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  }

  filter(f) {
    let list = this.procs;
    const pre = f.fo || f.sg || f.g;
    if (pre) list = list.filter((p) => p.co.startsWith(pre));
    if (f.cx) list = list.filter((p) => p.cx === f.cx);
    if (f.fin) list = list.filter((p) => p.fin === f.fin);
    if (f.rub) list = list.filter((p) => p.rub === f.rub);
    if (f.mod) list = list.filter((p) => p.mod.includes(f.mod));
    if (f.reg) list = list.filter((p) => p.reg.includes(f.reg));
    if (f.sx) list = list.filter((p) => p.sx === f.sx);
    if (f.valor === 'amb') list = list.filter((p) => p.sa > 0);
    if (f.valor === 'hosp') list = list.filter((p) => p.sh + p.sp > 0);
    if (f.valor === 'zero') list = list.filter((p) => !p.sa && !p.sh && !p.sp);
    if (f.min) list = list.filter((p) => Math.max(p.totAmb, p.totHosp) >= Number(f.min) * 100);
    if (f.max) list = list.filter((p) => Math.max(p.totAmb, p.totHosp) <= Number(f.max) * 100);
    if (f.codes) list = list.filter((p) => f.codes.has(p.co));
    return f.q ? this.search(f.q, list) : list;
  }
}

class Store {
  constructor() {
    this.cache = new Map();
    this.manifest = null;
    this.current = null;
  }

  async init() {
    this.manifest = await getJSON('manifest.json');
    let id = prefs.get('comp', null);
    if (!this.manifest.competencias.some((c) => c.id === id)) id = this.manifest.atual;
    await this.use(id);
  }

  async load(id) {
    if (!this.cache.has(id)) this.cache.set(id, getJSON(`${id}/base.json`).then((raw) => new Competencia(raw)));
    return this.cache.get(id);
  }

  async use(id) {
    this.current = await this.load(id);
    prefs.set('comp', id);
    return this.current;
  }
}

export const store = new Store();

// ---------------------------------------------------------------------------
// Preferências locais (favoritos, histórico, cesta do simulador, tema)

export const prefs = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`sigtap.${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`sigtap.${key}`, JSON.stringify(value));
    } catch {
      /* armazenamento indisponível */
    }
  },
};
