import {
  store, prefs, norm, digits, fmtCode, fmtCid, money, num, fmtIdade,
  COMPLEXIDADE, SEXO, TIPO_COMPAT, AGRAVO,
} from './data.js';
import { html, raw, esc, icon, mark, toast, copy, downloadCSV, debounce } from './ui.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const main = $('#main');
const C = () => store.current;

// ---------------------------------------------------------------------------
// Navegação

const NAV = [
  ['', 'home', 'Início'],
  {
    title: 'Consulta',
    items: [
      ['procedimentos', 'list', 'Consultar procedimentos'],
      ['navegar', 'tree', 'Navegar por grupos'],
      ['cid', 'cid', 'CID-10'],
      ['cbo', 'cbo', 'Ocupações (CBO)'],
      ['tabelas', 'table', 'Tabelas auxiliares'],
    ],
  },
  {
    title: 'Ferramentas',
    items: [
      ['compatibilidade', 'link', 'Compatibilidades'],
      ['simulador', 'calc', 'Simulador de valores'],
      ['comparar', 'columns', 'Comparar'],
      ['favoritos', 'star', 'Favoritos e histórico'],
    ],
  },
  {
    title: 'Dados e informações',
    items: [
      ['download', 'download', 'Dados e download'],
      ['sobre', 'info', 'Sobre a SIGTAP'],
    ],
  },
];
const NAV_PAGES = NAV.flatMap((n) => n.items || [n]);

// Grupos do menu funcionam como acordeão: só um aberto por vez, para que a
// barra lateral caiba na tela sem rolagem.
let navOpen = null;

function setNavOpen(title) {
  navOpen = title;
  for (const g of $$('#nav .nav-group')) {
    const open = g.dataset.group === navOpen;
    g.classList.toggle('open', open);
    $('.nav-group-btn', g).setAttribute('aria-expanded', open);
  }
}

function renderNav(active) {
  const cesta = prefs.get('cesta', []).length;
  const cmp = prefs.get('cmp', []).length;
  const badge = { simulador: cesta, comparar: cmp };
  const activeGroup = NAV.find((n) => n.items?.some((it) => it[0] === active));
  if (activeGroup) navOpen = activeGroup.title;
  const item = (n) => html`<a href="#/${n[0]}" class="nav-item ${active === n[0] ? 'active' : ''}" ${raw(active === n[0] ? 'aria-current="page"' : '')}>
      ${icon(n[1])}<span>${n[2]}</span>${badge[n[0]] ? html`<b class="badge">${badge[n[0]]}</b>` : ''}
    </a>`;
  $('#nav').innerHTML = String(
    html`${NAV.map((n, i) =>
      n.items
        ? html`<div class="nav-group ${navOpen === n.title ? 'open' : ''} ${n === activeGroup ? 'has-active' : ''}" data-group="${n.title}">
            <button class="nav-group-btn" aria-expanded="${navOpen === n.title}" aria-controls="nav-g${i}">
              <span>${n.title}</span>${n.items.some((it) => badge[it[0]]) ? html`<b class="dot-badge"></b>` : ''}${icon('down', 'chev')}
            </button>
            <div class="nav-group-body" id="nav-g${i}"><div>${n.items.map(item)}</div></div>
          </div>`
        : item(n),
    )}`,
  );
  $('#nav').onclick = (e) => {
    const btn = e.target.closest('.nav-group-btn');
    if (!btn) return;
    const title = btn.parentElement.dataset.group;
    setNavOpen(navOpen === title ? null : title);
  };
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = h.split('?');
  return { path: decodeURIComponent(path), params: new URLSearchParams(qs) };
}

function setParams(params) {
  const { path } = parseHash();
  const qs = params.toString();
  history.replaceState(null, '', `#/${path}${qs ? `?${qs}` : ''}`);
}

const ROUTES = [
  [/^$/, viewHome, ''],
  [/^procedimentos$/, viewConsulta, 'procedimentos'],
  [/^procedimento\/(\d{10})$/, viewDetalhe, 'procedimentos'],
  [/^navegar$/, viewArvore, 'navegar'],
  [/^cid$/, viewCidLista, 'cid'],
  [/^cid\/([A-Z0-9]+)$/i, viewCidDetalhe, 'cid'],
  [/^cbo$/, viewCboLista, 'cbo'],
  [/^cbo\/([A-Z0-9]+)$/i, viewCboDetalhe, 'cbo'],
  [/^tabelas$/, viewTabelas, 'tabelas'],
  [/^tabelas\/(\w+)$/, viewTabela, 'tabelas'],
  [/^tabelas\/(\w+)\/(.+)$/, viewTabelaItem, 'tabelas'],
  [/^compatibilidade$/, viewCompat, 'compatibilidade'],
  [/^simulador$/, viewSimulador, 'simulador'],
  [/^comparar$/, viewComparar, 'comparar'],
  [/^favoritos$/, viewFavoritos, 'favoritos'],
  [/^download$/, viewDownload, 'download'],
  [/^sobre$/, viewSobre, 'sobre'],
];

let renderToken = 0;
async function route() {
  const token = ++renderToken;
  const { path, params } = parseHash();
  closeSidebar();
  for (const [re, view, nav] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    renderNav(nav);
    try {
      await view({ params, args: m.slice(1), token });
    } catch (err) {
      console.error(err);
      main.innerHTML = String(errorBlock(err.message));
    }
    if (token === renderToken && !params.has('keep')) {
      main.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    }
    return;
  }
  renderNav('');
  main.innerHTML = String(html`<div class="page">${emptyState('Página não encontrada', 'Verifique o endereço ou volte ao início.', html`<a class="btn primary" href="#/">Ir para o início</a>`)}</div>`);
}

const stale = (token) => token !== renderToken;

// ---------------------------------------------------------------------------
// Componentes compartilhados

function pageHead(title, subtitle = '', actions = '', crumbs = null) {
  return html`<header class="page-head">
    ${crumbs ? html`<nav class="crumbs" aria-label="Trilha">${crumbs}</nav>` : ''}
    <div class="page-head-row">
      <div><h1>${title}</h1>${subtitle ? html`<p class="lead">${subtitle}</p>` : ''}</div>
      ${actions ? html`<div class="head-actions">${actions}</div>` : ''}
    </div>
  </header>`;
}

function emptyState(title, text, action = '') {
  return html`<div class="empty"><div class="empty-art">${icon('search')}</div><h3>${title}</h3><p>${text}</p>${action}</div>`;
}

function errorBlock(msg) {
  return html`<div class="page"><div class="notice danger">${icon('alert')}<div><strong>Não foi possível carregar.</strong><p>${msg}</p></div></div></div>`;
}

function incompleteNotice(what = 'Este recurso') {
  return html`<div class="notice warn">${icon('alert')}<div>
    <strong>${what} depende dos relacionamentos da Tabela Unificada.</strong>
    <p>A competência ${C().meta.rotulo} disponível neste site contém procedimentos, valores e tabelas auxiliares, mas não os
    relacionamentos (CID, CBO, habilitações, compatibilidades…). Gere a carga completa com
    <code>python3 scripts/sigtap_build.py oficial</code> ou pelo workflow mensal do repositório.</p>
    <a href="#/download">Saiba como atualizar →</a></div></div>`;
}

function loadingBlock(text = 'Carregando…') {
  return html`<div class="loading-inline"><div class="spinner sm"></div><span class="lt">${text}</span><div class="bar"><i></i></div></div>`;
}

function progress(el) {
  return (f) => {
    const bar = el && $('.bar i', el);
    if (bar) bar.style.width = `${Math.round(f * 100)}%`;
  };
}

const cxLabel = (cx) => COMPLEXIDADE[cx] ?? '—';
const cxChip = (cx) => (cx == null ? '' : html`<span class="chip cx-${cx}">${cxLabel(cx)}</span>`);
const finName = (code) => C().nome('financiamentos', code) || '—';

function procLink(co, q) {
  const p = C().get(co);
  if (!p) return html`<span class="code">${fmtCode(co)}</span> <span class="muted">(não consta nesta competência)</span>`;
  return html`<a class="proc-link" href="#/procedimento/${p.co}"><span class="code">${fmtCode(p.co)}</span> <span>${raw(mark(p.no, q))}</span></a>`;
}

const isFav = (co) => prefs.get('fav', []).includes(co);
function favBtn(co, big = false) {
  const on = isFav(co);
  return html`<button class="${big ? 'btn' : 'icon-btn ghost'} fav ${on ? 'on' : ''}" data-fav="${co}" aria-pressed="${on}" title="${on ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
    ${icon(on ? 'star-fill' : 'star')}${big ? html`<span>${on ? 'Favorito' : 'Favoritar'}</span>` : ''}</button>`;
}

function pushHistory(co) {
  const h = prefs.get('hist', []).filter((x) => x !== co);
  h.unshift(co);
  prefs.set('hist', h.slice(0, 30));
}

function addCesta(co, qt = 1) {
  const cesta = prefs.get('cesta', []);
  const item = cesta.find((x) => x.co === co);
  if (item) item.qt += qt;
  else cesta.push({ co, qt });
  prefs.set('cesta', cesta);
  renderNav(currentNav());
  toast(`${fmtCode(co)} adicionado ao simulador`);
}

function addCmp(co) {
  const cmp = prefs.get('cmp', []);
  if (cmp.includes(co)) return toast('Procedimento já está na comparação', 'warn');
  if (cmp.length >= 4) return toast('Compare até 4 procedimentos por vez', 'warn');
  cmp.push(co);
  prefs.set('cmp', cmp);
  renderNav(currentNav());
  toast(`${fmtCode(co)} adicionado à comparação`);
}

function currentNav() {
  const { path } = parseHash();
  return ROUTES.find(([re]) => re.test(path))?.[2] ?? '';
}

/** Tabela de resultados com ordenação, paginação incremental e exportação. */
function resultsTable(host, list, opts = {}) {
  const st = { sort: opts.sort || (opts.query ? 'rel' : 'co'), dir: 1, shown: 50 };
  const sorters = {
    rel: null,
    co: (a, b) => a.co.localeCompare(b.co),
    no: (a, b) => a.n.localeCompare(b.n),
    sa: (a, b) => a.sa - b.sa,
    hosp: (a, b) => a.totHosp - b.totHosp,
  };
  const sorted = () => {
    const fn = sorters[st.sort];
    if (!fn) return list;
    return [...list].sort((a, b) => fn(a, b) * st.dir);
  };
  const th = (key, label, cls = '') =>
    html`<th class="${cls}"><button class="th-sort ${st.sort === key ? 'on' : ''}" data-sort="${key}">${label}${st.sort === key ? icon(st.dir > 0 ? 'down' : 'down', st.dir > 0 ? '' : 'flip') : ''}</button></th>`;

  function draw() {
    const rows = sorted();
    const view = rows.slice(0, st.shown);
    host.innerHTML = String(html`
      <div class="results-bar">
        <p class="count"><strong>${num(rows.length)}</strong> ${rows.length === 1 ? 'procedimento' : 'procedimentos'}${opts.caption ? html` <span class="muted">· ${opts.caption}</span>` : ''}</p>
        <div class="results-actions">
          <label class="sel-inline">Ordenar
            <select data-sort-select>
              ${opts.query ? html`<option value="rel" ${st.sort === 'rel' ? 'selected' : ''}>Relevância</option>` : ''}
              <option value="co" ${st.sort === 'co' ? 'selected' : ''}>Código</option>
              <option value="no" ${st.sort === 'no' ? 'selected' : ''}>Nome</option>
              <option value="sa" ${st.sort === 'sa' ? 'selected' : ''}>Valor ambulatorial</option>
              <option value="hosp" ${st.sort === 'hosp' ? 'selected' : ''}>Valor hospitalar</option>
            </select>
          </label>
          <button class="btn sm" data-export ${rows.length ? '' : 'disabled'}>${icon('csv')}<span>Exportar CSV</span></button>
          <button class="btn sm" data-print>${icon('print')}<span>Imprimir</span></button>
        </div>
      </div>
      ${rows.length === 0
        ? emptyState('Nenhum procedimento encontrado', opts.emptyText || 'Tente outros termos ou remova alguns filtros.')
        : html`<div class="table-wrap"><table class="results">
          <thead><tr>
            ${th('co', 'Código', 'c-code')}${th('no', 'Procedimento')}
            <th class="c-hide">Complexidade</th>
            ${th('sa', 'Ambulatorial', 'num')}${th('hosp', 'Hospitalar', 'num')}<th class="c-act"><span class="sr">Ações</span></th>
          </tr></thead>
          <tbody>${view.map(
            (p) => html`<tr data-href="#/procedimento/${p.co}">
              <td class="c-code"><span class="code">${fmtCode(p.co)}</span></td>
              <td class="c-name"><a href="#/procedimento/${p.co}">${raw(mark(p.no, opts.query))}</a>
                <span class="sub">${C().nome('formas', p.fo) || ''}</span></td>
              <td class="c-hide">${cxChip(p.cx)}</td>
              <td class="num" data-label="Ambulatorial">${p.sa ? money(p.sa) : html`<span class="muted">—</span>`}</td>
              <td class="num" data-label="Hospitalar" title="SH ${money(p.sh)} + SP ${money(p.sp)}">${p.totHosp ? money(p.totHosp) : html`<span class="muted">—</span>`}</td>
              <td class="c-act">${favBtn(p.co)}<button class="icon-btn ghost" data-cesta="${p.co}" title="Adicionar ao simulador">${icon('plus')}</button></td>
            </tr>`,
          )}</tbody></table></div>
          ${rows.length > st.shown
            ? html`<div class="more"><button class="btn" data-more>Mostrar mais ${num(Math.min(100, rows.length - st.shown))}</button>
                <span class="muted">Exibindo ${num(st.shown)} de ${num(rows.length)}</span></div>`
            : ''}`}
    `);
  }

  host.onclick = (e) => {
    const s = e.target.closest('[data-sort]');
    if (s) {
      const k = s.dataset.sort;
      st.dir = st.sort === k ? -st.dir : 1;
      st.sort = k;
      return draw();
    }
    if (e.target.closest('[data-more]')) {
      st.shown += 100;
      return draw();
    }
    if (e.target.closest('[data-export]')) {
      const rows = sorted();
      return downloadCSV(
        `${opts.exportName || 'sigtap'}_${C().id}.csv`,
        ['Código', 'Procedimento', 'Grupo', 'Subgrupo', 'Forma de organização', 'Complexidade', 'Financiamento', 'SA (R$)', 'SH (R$)', 'SP (R$)', 'Total hospitalar (R$)'],
        rows.map((p) => [fmtCode(p.co), p.no, C().nome('grupos', p.g), C().nome('subgrupos', p.sg), C().nome('formas', p.fo), cxLabel(p.cx), finName(p.fin), p.sa / 100, p.sh / 100, p.sp / 100, p.totHosp / 100]),
      );
    }
    if (e.target.closest('[data-print]')) return window.print();
    const tr = e.target.closest('tr[data-href]');
    if (tr && !e.target.closest('a,button')) location.hash = tr.dataset.href;
  };
  host.onchange = (e) => {
    if (e.target.matches('[data-sort-select]')) {
      st.sort = e.target.value;
      st.dir = 1;
      draw();
    }
  };
  draw();
}

/** Campo com sugestões de procedimentos. */
function procAutocomplete(input, onPick) {
  const box = document.createElement('div');
  box.className = 'ac-list';
  box.hidden = true;
  input.parentElement.classList.add('ac');
  input.parentElement.appendChild(box);
  let items = [];
  let active = 0;
  const draw = () => {
    box.innerHTML = String(html`${items.map(
      (p, i) => html`<button type="button" class="ac-item ${i === active ? 'on' : ''}" data-i="${i}"><span class="code">${fmtCode(p.co)}</span><span>${raw(mark(p.no, input.value))}</span></button>`,
    )}`);
    box.hidden = !items.length;
  };
  input.addEventListener('input', debounce(() => {
    items = input.value.trim().length < 2 ? [] : C().search(input.value).slice(0, 8);
    active = 0;
    draw();
  }, 120));
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown') (active = Math.min(items.length - 1, active + 1)), draw(), e.preventDefault();
    else if (e.key === 'ArrowUp') (active = Math.max(0, active - 1)), draw(), e.preventDefault();
    else if (e.key === 'Enter' && items[active]) e.preventDefault(), pick(items[active]);
    else if (e.key === 'Escape') box.hidden = true;
  });
  input.addEventListener('blur', () => setTimeout(() => (box.hidden = true), 150));
  box.addEventListener('mousedown', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) e.preventDefault(), pick(items[+b.dataset.i]);
  });
  function pick(p) {
    box.hidden = true;
    onPick(p);
  }
}

// ---------------------------------------------------------------------------
// Início

const GROUP_ICONS = { '01': 'shield', '02': 'search', '03': 'cid', '04': 'cbo', '05': 'layers', '06': 'calc', '07': 'tree', '08': 'link', '09': 'columns' };

async function viewHome() {
  const c = C();
  const counts = {};
  for (const p of c.procs) counts[p.g] = (counts[p.g] || 0) + 1;
  const maxCount = Math.max(...Object.values(counts));
  const fav = prefs.get('fav', []).map((co) => c.get(co)).filter(Boolean);
  const hist = prefs.get('hist', []).map((co) => c.get(co)).filter(Boolean).slice(0, 6);
  const t = c.meta.totais;

  main.innerHTML = String(html`
    <section class="hero">
      <div class="hero-inner">
        <span class="eyebrow">${icon('clock')} Competência ${c.meta.rotulo}</span>
        <h1>Tabela de Procedimentos, Medicamentos e OPM do SUS</h1>
        <p>Consulte códigos, valores, atributos e regras da Tabela Unificada (SIGTAP) com busca instantânea, sem acentos e por código parcial.</p>
        <div class="hero-search">
          ${icon('search')}
          <input id="hero-q" type="search" placeholder="Ex.: consulta médica, 0301010072, 03.01.01, ressonância…" autocomplete="off" aria-label="Buscar procedimento" />
          <button class="btn primary" id="hero-go">Buscar</button>
        </div>
        <div class="hero-results" id="hero-results"></div>
        <div class="hero-tags">
          ${['consulta médica', 'hemograma', 'tomografia', 'parto', 'fisioterapia', 'quimioterapia'].map((s) => html`<a class="tag" href="#/procedimentos?q=${encodeURIComponent(s)}">${s}</a>`)}
        </div>
      </div>
    </section>

    <div class="page">
      ${!c.completo ? html`<div class="notice info compact">${icon('info')}<div>Dados de procedimentos e valores da competência <strong>${c.meta.rotulo}</strong>. Relacionamentos (CID, CBO, habilitações, compatibilidades) serão exibidos após a carga completa. <a href="#/download">Detalhes</a></div></div>` : ''}

      <div class="stats">
        ${[
          ['Procedimentos', t.procedimentos, 'procedimentos', 'list'],
          ['Grupos', t.grupos, 'navegar', 'layers'],
          ['Subgrupos', t.subgrupos, 'navegar', 'tree'],
          ['Formas de organização', t.formas, 'navegar', 'table'],
          ['Ocupações (CBO)', t.ocupacoes, 'cbo', 'cbo'],
          ['CID-10', t.cids, 'cid', 'cid'],
        ].map(([l, v, href, ic]) => html`<a class="stat" href="#/${href}">${icon(ic)}<strong>${num(v)}</strong><span>${l}</span></a>`)}
      </div>

      <section class="section">
        <div class="section-head"><h2>Grupos de procedimentos</h2><a href="#/navegar">Ver árvore completa →</a></div>
        <div class="groups">
          ${Object.entries(c.t.grupos).map(([g, name]) => html`
            <a class="group-card g-${g}" href="#/procedimentos?g=${g}">
              <span class="g-code">${g}</span>
              <span class="g-name">${name}</span>
              <span class="g-meta">${num(counts[g] || 0)} procedimentos</span>
              <span class="g-bar"><i style="width:${Math.max(4, ((counts[g] || 0) / maxCount) * 100)}%"></i></span>
            </a>`)}
        </div>
      </section>

      <div class="two-col">
        <section class="section card">
          <div class="section-head"><h2>${icon('clock')} Vistos recentemente</h2>${hist.length ? html`<a href="#/favoritos">Ver tudo</a>` : ''}</div>
          ${hist.length ? html`<ul class="mini-list">${hist.map((p) => html`<li>${procLink(p.co)}</li>`)}</ul>` : html`<p class="muted">Os procedimentos que você abrir aparecem aqui.</p>`}
        </section>
        <section class="section card">
          <div class="section-head"><h2>${icon('star')} Favoritos</h2>${fav.length ? html`<a href="#/favoritos">Gerenciar</a>` : ''}</div>
          ${fav.length ? html`<ul class="mini-list">${fav.slice(0, 6).map((p) => html`<li>${procLink(p.co)}</li>`)}</ul>` : html`<p class="muted">Marque a estrela de um procedimento para acessá-lo rapidamente.</p>`}
        </section>
      </div>

      <section class="section">
        <div class="section-head"><h2>Ferramentas</h2></div>
        <div class="tools">
          ${[
            ['simulador', 'calc', 'Simulador de valores', 'Monte uma cesta e calcule o total ambulatorial (SA) ou hospitalar (SH + SP).'],
            ['compatibilidade', 'link', 'Compatibilidades', 'Verifique se dois procedimentos podem ser registrados juntos.'],
            ['comparar', 'columns', 'Comparar', 'Atributos lado a lado e diferenças entre competências.'],
            ['tabelas', 'table', 'Tabelas auxiliares', 'Financiamentos, instrumentos de registro, serviços e mais.'],
          ].map(([h, ic, t1, d]) => html`<a class="tool" href="#/${h}">${icon(ic)}<strong>${t1}</strong><span>${d}</span></a>`)}
        </div>
      </section>
    </div>`);

  const q = $('#hero-q');
  const res = $('#hero-results');
  const go = () => (location.hash = `#/procedimentos?q=${encodeURIComponent(q.value.trim())}`);
  q.addEventListener('input', debounce(() => {
    const v = q.value.trim();
    if (v.length < 2) return (res.innerHTML = '');
    const r = c.search(v);
    res.innerHTML = String(html`<div class="hr-box">${r.slice(0, 6).map((p) => html`<a class="hr-item" href="#/procedimento/${p.co}"><span class="code">${fmtCode(p.co)}</span><span class="hr-name">${raw(mark(p.no, v))}</span><span class="hr-val">${p.sa ? money(p.sa) : p.totHosp ? money(p.totHosp) : ''}</span></a>`)}
      ${r.length > 6 ? html`<a class="hr-all" href="#/procedimentos?q=${encodeURIComponent(v)}">Ver todos os ${num(r.length)} resultados →</a>` : ''}
      ${!r.length ? html`<p class="hr-none">Nenhum procedimento encontrado para “${v}”.</p>` : ''}</div>`);
  }, 100));
  q.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  $('#hero-go').onclick = go;
  q.focus();
}

// ---------------------------------------------------------------------------
// Consulta de procedimentos

const REL_FIELDS = {
  cid: ['CID', (k) => `${fmtCid(k)} – ${C().cidMap?.get(k)?.no ?? ''}`],
  cbo: ['Ocupação', (k) => `${k} – ${C().nome('ocupacoes', k) ?? ''}`],
  hab: ['Habilitação', (k) => `${k} – ${C().nome('habilitacoes', k) ?? ''}`],
  srv: ['Serviço/Classificação', (k) => `${k} – ${C().nome('servicos', k.split('-')[0]) ?? ''} / ${C().nome('classificacoes', k) ?? ''}`],
  lei: ['Leito', (k) => `${k} – ${C().nome('leitos', k) ?? ''}`],
  rc: ['Regra condicionada', (k) => `${k} – ${C().t.regras?.[k]?.[0] ?? ''}`],
  ren: ['RENASES', (k) => `${k} – ${C().nome('renases', k) ?? ''}`],
  tus: ['TUSS', (k) => `${k} – ${C().nome('tuss', k) ?? ''}`],
  det: ['Detalhe', (k) => `${k} – ${C().t.detalhes?.[k]?.[0] ?? ''}`],
  rede: ['Componente de rede', (k) => `${k} – ${C().nome('componentesRede', k) ?? ''}`],
};

async function viewConsulta({ params, token }) {
  const c = C();
  const f = Object.fromEntries(params);
  const opt = (obj, sel, fmt = (k, v) => `${k} – ${v}`) =>
    Object.entries(obj || {}).map(([k, v]) => html`<option value="${k}" ${sel === k ? 'selected' : ''}>${fmt(k, v)}</option>`);
  const subOf = (g) => Object.entries(c.t.subgrupos).filter(([k]) => k.startsWith(g));
  const formOf = (sg) => Object.entries(c.t.formas).filter(([k]) => k.startsWith(sg));
  const hasMod = c.procs.some((p) => p.mod.length);

  main.innerHTML = String(html`<div class="page">
    ${pageHead('Consultar procedimentos', 'Filtre pela estrutura da tabela (grupo, subgrupo, forma de organização) e por atributos.')}
    <div class="consulta">
      <aside class="filters card" id="filters">
        <div class="filters-head"><h2 id="f-toggle">${icon('filter')} Filtros <span class="f-toggle">${icon('down')}</span></h2><button class="link-btn" id="f-clear">Limpar</button></div>
        <label class="field field-q"><span>Código ou nome</span>
          <div class="input-icon">${icon('search')}<input id="f-q" type="search" value="${f.q || ''}" placeholder="Ex.: 0205 ou ultrassonografia" autocomplete="off" /></div>
        </label>
        <label class="field"><span>Grupo</span><select id="f-g"><option value="">Todos</option>${opt(c.t.grupos, f.g)}</select></label>
        <label class="field"><span>Subgrupo</span><select id="f-sg" ${f.g ? '' : 'disabled'}><option value="">Todos</option>${f.g ? opt(Object.fromEntries(subOf(f.g)), f.sg, (k, v) => `${k.slice(2)} – ${v}`) : ''}</select></label>
        <label class="field"><span>Forma de organização</span><select id="f-fo" ${f.sg ? '' : 'disabled'}><option value="">Todas</option>${f.sg ? opt(Object.fromEntries(formOf(f.sg)), f.fo, (k, v) => `${k.slice(4)} – ${v}`) : ''}</select></label>
        <details class="adv" ${['cx', 'fin', 'rub', 'mod', 'reg', 'sx', 'valor', 'min', 'max'].some((k) => f[k]) ? 'open' : ''}>
          <summary>Atributos ${icon('down')}</summary>
          <label class="field"><span>Complexidade</span><select id="f-cx"><option value="">Todas</option>${opt(COMPLEXIDADE, f.cx, (k, v) => v)}</select></label>
          <label class="field"><span>Financiamento</span><select id="f-fin"><option value="">Todos</option>${opt(c.t.financiamentos, f.fin)}</select></label>
          <label class="field"><span>Rubrica (subtipo FAEC)</span><select id="f-rub"><option value="">Todas</option>${opt(c.t.rubricas, f.rub)}</select></label>
          ${hasMod ? html`
            <label class="field"><span>Modalidade</span><select id="f-mod"><option value="">Todas</option>${opt(c.t.modalidades, f.mod)}</select></label>
            <label class="field"><span>Instrumento de registro</span><select id="f-reg"><option value="">Todos</option>${opt(c.t.registros, f.reg)}</select></label>
            <label class="field"><span>Sexo</span><select id="f-sx"><option value="">Todos</option>${opt(SEXO, f.sx, (k, v) => v)}</select></label>` : ''}
          <label class="field"><span>Valor</span><select id="f-valor">
            <option value="">Qualquer</option>
            <option value="amb" ${f.valor === 'amb' ? 'selected' : ''}>Com valor ambulatorial</option>
            <option value="hosp" ${f.valor === 'hosp' ? 'selected' : ''}>Com valor hospitalar</option>
            <option value="zero" ${f.valor === 'zero' ? 'selected' : ''}>Sem valor (R$ 0,00)</option></select></label>
          <div class="field-row">
            <label class="field"><span>De (R$)</span><input id="f-min" type="number" min="0" step="0.01" value="${f.min || ''}" inputmode="decimal" /></label>
            <label class="field"><span>Até (R$)</span><input id="f-max" type="number" min="0" step="0.01" value="${f.max || ''}" inputmode="decimal" /></label>
          </div>
        </details>
        ${c.completo ? html`<details class="adv" ${f.rel ? 'open' : ''}>
          <summary>Relacionamentos ${icon('down')}</summary>
          <label class="field"><span>Tipo</span><select id="f-relk">${Object.entries(REL_FIELDS).map(([k, [l]]) => html`<option value="${k}" ${f.rel?.startsWith(k + ':') ? 'selected' : ''}>${l}</option>`)}</select></label>
          <label class="field"><span>Código</span><input id="f-relv" value="${f.rel ? f.rel.split(':')[1] : ''}" placeholder="Ex.: A150, 225125, 0101" /></label>
        </details>` : ''}
      </aside>
      <section class="results-col">
        <div class="active-chips" id="chips"></div>
        <div id="results">${loadingBlock()}</div>
      </section>
    </div></div>`);

  const ids = ['q', 'g', 'sg', 'fo', 'cx', 'fin', 'rub', 'mod', 'reg', 'sx', 'valor', 'min', 'max'];
  const read = () => {
    const p = new URLSearchParams();
    for (const k of ids) {
      const el = $(`#f-${k}`);
      if (el && el.value && !el.disabled) p.set(k, el.value.trim());
    }
    const rv = $('#f-relv')?.value.trim();
    if (rv) p.set('rel', `${$('#f-relk').value}:${rv.toUpperCase().replace(/[.\s]/g, '')}`);
    return p;
  };

  async function run() {
    const p = read();
    setParams(p);
    const f2 = Object.fromEntries(p);
    const chips = [];
    const nm = { g: 'grupos', sg: 'subgrupos', fo: 'formas', fin: 'financiamentos', rub: 'rubricas', mod: 'modalidades', reg: 'registros' };
    for (const [k, v] of p) {
      let lbl = v;
      if (nm[k]) lbl = `${c.nome(nm[k], v) ?? v}`;
      if (k === 'cx') lbl = cxLabel(v);
      if (k === 'sx') lbl = SEXO[v];
      if (k === 'q') lbl = `“${v}”`;
      if (k === 'valor') lbl = { amb: 'Com valor ambulatorial', hosp: 'Com valor hospitalar', zero: 'Sem valor' }[v];
      if (k === 'min') lbl = `≥ R$ ${v}`;
      if (k === 'max') lbl = `≤ R$ ${v}`;
      if (k === 'rel') {
        const [rk, rv] = v.split(':');
        lbl = `${REL_FIELDS[rk]?.[0] ?? rk}: ${rv}`;
      }
      chips.push(html`<button class="chip removable" data-rm="${k}">${lbl}${icon('x')}</button>`);
    }
    $('#chips').innerHTML = String(html`${chips}`);
    const host = $('#results');
    if (f2.rel) {
      const [rk, rv] = f2.rel.split(':');
      host.innerHTML = String(loadingBlock('Carregando relacionamentos…'));
      if (rk === 'cid') await c.loadCid();
      const idx = await c.reverse(rk, progress(host));
      if (stale(token)) return;
      f2.codes = new Set(idx.get(rv) || []);
    }
    resultsTable(host, c.filter(f2), { query: f2.q, exportName: 'procedimentos' });
  }

  const deb = debounce(run, 180);
  $('#f-toggle').onclick = () => $('#filters').classList.toggle('open');
  if (['g', 'cx', 'fin', 'rub', 'mod', 'reg', 'sx', 'valor', 'min', 'max', 'rel'].some((k) => f[k])) $('#filters').classList.add('open');
  $('#f-q').addEventListener('input', deb);
  $('#f-g').addEventListener('change', (e) => {
    const g = e.target.value;
    const sg = $('#f-sg');
    sg.innerHTML = String(html`<option value="">Todos</option>${g ? opt(Object.fromEntries(subOf(g)), '', (k, v) => `${k.slice(2)} – ${v}`) : ''}`);
    sg.disabled = !g;
    const fo = $('#f-fo');
    fo.innerHTML = '<option value="">Todas</option>';
    fo.disabled = true;
    run();
  });
  $('#f-sg').addEventListener('change', (e) => {
    const sg = e.target.value;
    const fo = $('#f-fo');
    fo.innerHTML = String(html`<option value="">Todas</option>${sg ? opt(Object.fromEntries(formOf(sg)), '', (k, v) => `${k.slice(4)} – ${v}`) : ''}`);
    fo.disabled = !sg;
    run();
  });
  for (const k of ['fo', 'cx', 'fin', 'rub', 'mod', 'reg', 'sx', 'valor', 'relk']) $(`#f-${k}`)?.addEventListener('change', run);
  for (const k of ['min', 'max', 'relv']) $(`#f-${k}`)?.addEventListener('input', deb);
  $('#f-clear').onclick = () => {
    history.replaceState(null, '', '#/procedimentos');
    viewConsulta({ params: new URLSearchParams(), token });
  };
  $('#chips').onclick = (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    const k = b.dataset.rm;
    const p = read();
    p.delete(k);
    if (k === 'g') p.delete('sg'), p.delete('fo');
    if (k === 'sg') p.delete('fo');
    setParams(p);
    viewConsulta({ params: p, token });
  };
  await run();
  if (!f.q && !f.g) $('#f-q').focus();
}

// ---------------------------------------------------------------------------
// Detalhe do procedimento

const TABS = [
  ['resumo', 'Atributos'],
  ['cid', 'CID'],
  ['cbo', 'CBO'],
  ['hab', 'Habilitações'],
  ['lei', 'Leitos'],
  ['srv', 'Serviço/Classificação'],
  ['cpt', 'Compatíveis'],
  ['rc', 'Regras condicionadas'],
  ['inc', 'Incrementos'],
  ['outros', 'Outros'],
];

async function viewDetalhe({ args: [co], params, token }) {
  const c = C();
  const p = c.get(co);
  if (!p) {
    main.innerHTML = String(html`<div class="page">${emptyState('Procedimento não encontrado', `O código ${fmtCode(co)} não consta na competência ${c.meta.rotulo}.`, html`<a class="btn primary" href="#/procedimentos?q=${co.slice(0, 6)}">Buscar procedimentos semelhantes</a>`)}</div>`);
    return;
  }
  pushHistory(p.co);
  const rel = c.completo ? (await c.rel(p.co)) || {} : null;
  if (stale(token)) return;
  if (rel?.cid?.length) await c.loadCid();
  const tab = params.get('aba') || 'resumo';
  const n = (k) => (rel ? (rel[k] || []).length : null);
  const counts = {
    cid: n('cid'), cbo: n('cbo'), hab: n('hab'), lei: n('lei'), srv: n('srv'), cpt: rel ? n('cpt') + n('exc') : null,
    rc: n('rc'), inc: n('inc'), outros: rel ? n('ren') + n('tus') + n('det') + n('ori') + n('sia') + n('rede') : null,
  };
  const siblings = c.procs.filter((x) => x.fo === p.fo);
  const pos = siblings.indexOf(p);
  const prev = siblings[pos - 1];
  const next = siblings[pos + 1];
  const [mm, aaaa] = [c.id.slice(4), c.id.slice(0, 4)];
  const official = `http://sigtap.datasus.gov.br/tabela-unificada/app/sec/procedimento/exibir/${p.co}/${mm}/${aaaa}`;

  main.innerHTML = String(html`<div class="page detail">
    ${pageHead(
      p.no,
      '',
      '',
      html`<a href="#/procedimentos?g=${p.g}">${p.g} · ${c.nome('grupos', p.g)}</a>${icon('right')}
        <a href="#/procedimentos?g=${p.g}&sg=${p.sg}">${p.sg.slice(2)} · ${c.nome('subgrupos', p.sg)}</a>${icon('right')}
        <a href="#/procedimentos?g=${p.g}&sg=${p.sg}&fo=${p.fo}">${p.fo.slice(4)} · ${c.nome('formas', p.fo)}</a>`,
    )}
    <div class="detail-top">
      <div class="code-big"><span class="code">${fmtCode(p.co)}</span>
        <button class="icon-btn ghost" data-copy="${p.co}" title="Copiar código">${icon('copy')}</button></div>
      <div class="chips">${cxChip(p.cx)}${p.fin ? html`<span class="chip">${finName(p.fin)}</span>` : ''}
        ${p.mod.map((m) => html`<span class="chip soft">${c.nome('modalidades', m)}</span>`)}</div>
      <div class="detail-actions">
        ${favBtn(p.co, true)}
        <button class="btn" data-cesta="${p.co}">${icon('calc')}<span>Simulador</span></button>
        <button class="btn" data-cmp="${p.co}">${icon('columns')}<span>Comparar</span></button>
        <div class="menu-wrap"><button class="btn" id="more-btn" aria-haspopup="true">${icon('share')}<span>Compartilhar</span></button>
          <div class="menu" id="more-menu" hidden>
            <button data-act="link">${icon('link')} Copiar link</button>
            <button data-act="ficha">${icon('copy')} Copiar ficha (texto)</button>
            <button data-act="print">${icon('print')} Imprimir / PDF</button>
            <a href="${official}" target="_blank" rel="noopener">${icon('external')} Abrir no SIGTAP oficial</a>
          </div></div>
      </div>
    </div>

    <div class="values">
      <div class="value-card"><span>Serviço Ambulatorial (SA)</span><strong>${money(p.sa)}</strong></div>
      <div class="value-card"><span>Serviço Hospitalar (SH)</span><strong>${money(p.sh)}</strong></div>
      <div class="value-card"><span>Serviço Profissional (SP)</span><strong>${money(p.sp)}</strong></div>
      <div class="value-card accent"><span>Total Ambulatorial</span><strong>${money(p.totAmb)}</strong></div>
      <div class="value-card accent"><span>Total Hospitalar</span><strong>${money(p.totHosp)}</strong></div>
    </div>

    ${rel?.d ? html`<section class="card desc-card"><h2>Descrição</h2>
      <div class="prose">${descricao(rel.d).map((l) => html`<p>${l}</p>`)}</div></section>` : ''}

    <div class="tabs" role="tablist">
      ${TABS.map(([k, l]) => html`<button role="tab" class="tab ${tab === k ? 'on' : ''}" aria-selected="${tab === k}" data-tab="${k}">${l}${counts[k] != null ? html`<b>${counts[k]}</b>` : ''}</button>`)}
      <label class="tab tab-more" hidden><select aria-label="Mais abas"></select>${icon('down', 'chev')}</label>
    </div>
    <div class="tab-body card" id="tab-body"></div>

    <nav class="pager">
      ${prev ? html`<a class="pager-btn" href="#/procedimento/${prev.co}">${icon('left')}<span><small>Anterior</small>${fmtCode(prev.co)}</span></a>` : html`<span></span>`}
      ${next ? html`<a class="pager-btn right" href="#/procedimento/${next.co}"><span><small>Próximo</small>${fmtCode(next.co)}</span>${icon('right')}</a>` : html`<span></span>`}
    </nav>
  </div>`);

  const body = $('#tab-body');
  const tabs = fitTabs($('.tabs'), (k) => {
    const [, l] = TABS.find((t) => t[0] === k);
    return counts[k] != null ? `${l} (${counts[k]})` : l;
  }, (k) => show(k));
  const show = (k) => {
    $$('.tab[data-tab]').forEach((t) => {
      t.classList.toggle('on', t.dataset.tab === k);
      t.setAttribute('aria-selected', t.dataset.tab === k);
    });
    tabs.setActive(k);
    const q = new URLSearchParams();
    if (k !== 'resumo') q.set('aba', k);
    setParams(q);
    body.innerHTML = String(renderTab(k, p, rel));
    bindTab(k, body);
  };
  $('.tabs').onclick = (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) show(t.dataset.tab);
  };
  show(TABS.some(([k]) => k === tab) ? tab : 'resumo');

  const menu = $('#more-menu');
  $('#more-btn').onclick = (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  };
  document.addEventListener('click', () => (menu.hidden = true), { once: true });
  menu.onclick = (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'link') copy(location.href.split('?')[0], 'Link copiado');
    if (a === 'print') window.print();
    if (a === 'ficha') copy(fichaTexto(p), 'Ficha copiada');
  };
}

// Os textos do DATASUS trazem "||" onde havia quebra de linha no arquivo de
// largura fixa; tratamos como espaço e só quebramos parágrafos em \n.
function descricao(d) {
  return d.split(/\n+/).map((l) => l.replace(/\s*\|\|\s*/g, ' ').trim()).filter(Boolean);
}

// Abas que não cabem na largura disponível saem da linha e passam a ser
// opções do seletor "Mais", que ocupa o lugar da última aba visível.
let tabsObserver = null;
function fitTabs(bar, label, onPick) {
  const btns = $$('.tab[data-tab]', bar);
  const more = $('.tab-more', bar);
  const sel = $('select', more);
  let active = null;
  let hidden = [];
  const fill = () => {
    const isHidden = hidden.includes(active);
    sel.innerHTML = String(html`<option value="" ${raw(isHidden ? '' : 'selected')}>Mais</option>
      ${hidden.map((k) => html`<option value="${k}" ${raw(k === active ? 'selected' : '')}>${label(k)}</option>`)}`);
    more.classList.toggle('on', isHidden);
    // <select> nativo assume a largura da opção mais longa; ajusta à opção atual.
    const ctx = (fitTabs.ctx ??= document.createElement('canvas').getContext('2d'));
    const cs = getComputedStyle(sel);
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    sel.style.width = `${Math.ceil(ctx.measureText(sel.selectedOptions[0].text).width) + 50}px`;
  };
  const layout = () => {
    btns.forEach((b) => (b.hidden = false));
    more.hidden = true;
    hidden = [];
    for (let i = btns.length - 1; i > 0 && bar.scrollWidth > bar.clientWidth; i--) {
      btns[i].hidden = true;
      hidden.unshift(btns[i].dataset.tab);
      more.hidden = false;
      fill();
    }
    if (!hidden.length) fill();
  };
  sel.onchange = () => sel.value && onPick(sel.value);
  tabsObserver?.disconnect();
  tabsObserver = new ResizeObserver(layout);
  tabsObserver.observe(bar);
  return {
    setActive(k) {
      active = k;
      layout();
    },
  };
}

function fichaTexto(p) {
  const c = C();
  return [
    `${fmtCode(p.co)} - ${p.no}`,
    `Competência: ${c.meta.rotulo}`,
    `Grupo: ${p.g} - ${c.nome('grupos', p.g)}`,
    `Subgrupo: ${p.sg} - ${c.nome('subgrupos', p.sg)}`,
    `Forma de organização: ${p.fo} - ${c.nome('formas', p.fo)}`,
    `Complexidade: ${cxLabel(p.cx)}`,
    `Financiamento: ${finName(p.fin)}`,
    `SA: ${money(p.sa)} | SH: ${money(p.sh)} | SP: ${money(p.sp)}`,
    `Total ambulatorial: ${money(p.totAmb)} | Total hospitalar: ${money(p.totHosp)}`,
  ].join('\n');
}

function attr(label, value, hint = '') {
  const empty = value === null || value === undefined || value === '';
  return html`<div class="attr"><dt>${label}${hint ? html`<span class="hint" title="${hint}">${icon('info')}</span>` : ''}</dt><dd class="${empty ? 'muted' : ''}">${empty ? '—' : value}</dd></div>`;
}

function relTable(rows, headers, q = '') {
  if (!rows.length) return html`<p class="muted pad">Nenhum registro para este procedimento.</p>`;
  return html`<div class="tab-tools"><div class="input-icon sm">${icon('search')}<input type="search" placeholder="Filtrar nesta lista…" data-filter value="${q}" /></div>
    <span class="muted">${num(rows.length)} ${rows.length === 1 ? 'registro' : 'registros'}</span></div>
    <div class="table-wrap"><table class="simple"><thead><tr>${headers.map((h) => html`<th>${h}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr data-text="${norm(r.text)}">${r.cells.map((x) => html`<td>${x}</td>`)}</tr>`)}</tbody></table></div>`;
}

function renderTab(k, p, rel) {
  const c = C();
  if (k === 'resumo') {
    return html`<dl class="attrs">
      ${attr('Grupo', `${p.g} – ${c.nome('grupos', p.g)}`)}
      ${attr('Subgrupo', `${p.sg.slice(2)} – ${c.nome('subgrupos', p.sg)}`)}
      ${attr('Forma de organização', `${p.fo.slice(4)} – ${c.nome('formas', p.fo)}`)}
      ${attr('Competência', c.meta.rotulo)}
      ${attr('Modalidade de atendimento', p.mod.map((m) => c.nome('modalidades', m)).join(', ') || (c.completo ? '' : null))}
      ${attr('Instrumento de registro', p.reg.map((r) => c.nome('registros', r)).join(', ') || (c.completo ? '' : null))}
      ${attr('Complexidade', cxLabel(p.cx))}
      ${attr('Tipo de financiamento', p.fin ? `${p.fin} – ${finName(p.fin)}` : null)}
      ${attr('Subtipo de financiamento (rubrica)', p.rub ? `${p.rub} – ${c.nome('rubricas', p.rub) ?? ''}` : null)}
      ${attr('Sexo', SEXO[p.sx] ?? null)}
      ${attr('Idade mínima', fmtIdade(p.idMin), 'Registrada na SIGTAP em meses')}
      ${attr('Idade máxima', fmtIdade(p.idMax), 'Vazio quando não há limite')}
      ${attr('Quantidade máxima', p.qtMax)}
      ${attr('Média de permanência (dias)', p.dias)}
      ${attr('Tempo de permanência', p.tPerm)}
      ${attr('Pontos (rateio SP)', p.pts)}
    </dl>
    ${!c.completo ? html`<p class="muted small pad-t">Sexo, modalidade e instrumento de registro serão exibidos após a carga completa da competência.</p>` : ''}`;
  }
  if (!rel) return incompleteNotice('Esta aba');
  const L = (arr) => arr || [];
  switch (k) {
    case 'cid':
      return relTable(
        L(rel.cid).map(([cid, pri]) => {
          const name = c.cidMap?.get(cid)?.no ?? '';
          return { text: `${cid} ${name}`, cells: [html`<a class="code" href="#/cid/${cid}">${fmtCid(cid)}</a>`, name, pri ? html`<span class="chip ok">Principal</span>` : html`<span class="chip soft">Secundário</span>`] };
        }),
        ['CID', 'Descrição', 'Tipo'],
      );
    case 'cbo':
      return relTable(
        L(rel.cbo).map((o) => ({ text: `${o} ${c.nome('ocupacoes', o)}`, cells: [html`<a class="code" href="#/cbo/${o}">${o}</a>`, c.nome('ocupacoes', o) ?? ''] })),
        ['CBO', 'Ocupação'],
      );
    case 'hab':
      return relTable(
        L(rel.hab).map(([h, g]) => ({ text: `${h} ${c.nome('habilitacoes', h)}`, cells: [html`<a class="code" href="#/tabelas/habilitacao/${h}">${h}</a>`, c.nome('habilitacoes', h) ?? '', g ? `${g} – ${c.nome('gruposHabilitacao', g) ?? ''}` : '—'] })),
        ['Código', 'Habilitação', 'Grupo de habilitação'],
      );
    case 'lei':
      return relTable(L(rel.lei).map((l) => ({ text: `${l} ${c.nome('leitos', l)}`, cells: [html`<span class="code">${l}</span>`, c.nome('leitos', l) ?? ''] })), ['Código', 'Tipo de leito']);
    case 'srv':
      return relTable(
        L(rel.srv).map((k2) => {
          const [s, cl] = k2.split('-');
          return { text: `${k2} ${c.nome('servicos', s)} ${c.nome('classificacoes', k2)}`, cells: [html`<a class="code" href="#/tabelas/servico/${k2}">${s}/${cl}</a>`, c.nome('servicos', s) ?? '', c.nome('classificacoes', k2) ?? ''] };
        }),
        ['Código', 'Serviço', 'Classificação'],
      );
    case 'cpt': {
      const reg = (r) => c.nome('registros', r) ?? r;
      return html`<h3 class="tab-h">Procedimentos compatíveis</h3>
        ${relTable(
          L(rel.cpt).map(([pc, rp, rc2, tp, qt]) => ({
            text: `${pc} ${c.get(pc)?.no ?? ''}`,
            cells: [procLink(pc), reg(rp), reg(rc2), html`<span class="chip ${tp === '1' ? 'ok' : 'danger'}">${TIPO_COMPAT[tp] ?? tp}</span>`, qt ?? '—'],
          })),
          ['Procedimento compatível', 'Registro principal', 'Registro compatível', 'Tipo', 'Qtd.'],
        )}
        ${L(rel.exc).length ? html`<h3 class="tab-h">Exceções de compatibilidade</h3>
          ${relTable(
            L(rel.exc).map(([restr, pc, rp, rc2, tp]) => ({
              text: `${restr} ${pc}`,
              cells: [procLink(restr), procLink(pc), reg(rp), reg(rc2), TIPO_COMPAT[tp] ?? tp],
            })),
            ['Procedimento restrição', 'Compatível', 'Registro principal', 'Registro compatível', 'Tipo'],
          )}` : ''}`;
    }
    case 'rc':
      return L(rel.rc).length
        ? html`<div class="rules">${L(rel.rc).map((r) => {
            const [nome, desc] = c.t.regras?.[r] || ['', ''];
            return html`<article class="rule"><header><span class="code">${r}</span><strong>${nome}</strong></header>${desc ? html`<p>${desc}</p>` : ''}</article>`;
          })}</div>`
        : html`<p class="muted pad">Nenhuma regra condicionada.</p>`;
    case 'inc':
      return relTable(
        L(rel.inc).map(([h, sh, sa, sp]) => ({
          text: `${h} ${c.nome('habilitacoes', h)}`,
          cells: [html`<span class="code">${h}</span>`, c.nome('habilitacoes', h) ?? '', `${num(sh)}%`, `${num(sa)}%`, `${num(sp)}%`],
        })),
        ['Habilitação', 'Descrição', '% SH', '% SA', '% SP'],
      );
    case 'outros': {
      const sec = (title, rows) => html`<section class="sub-sec"><h3 class="tab-h">${title}</h3>${rows.length ? html`<ul class="kv-list">${rows}</ul>` : html`<p class="muted">Nenhum registro.</p>`}</section>`;
      return html`
        ${sec('RENASES', L(rel.ren).map((r) => html`<li><span class="code">${r}</span>${c.nome('renases', r) ?? ''}</li>`))}
        ${sec('Terminologia TUSS', L(rel.tus).map((r) => html`<li><span class="code">${r}</span>${c.nome('tuss', r) ?? ''}</li>`))}
        ${sec('Detalhes', L(rel.det).map((r) => html`<li><span class="code">${r}</span><div><strong>${c.t.detalhes?.[r]?.[0] ?? ''}</strong>${c.t.detalhes?.[r]?.[1] ? html`<p class="muted small">${c.t.detalhes[r][1]}</p>` : ''}</div></li>`))}
        ${sec('Procedimento de origem', L(rel.ori).map((r) => html`<li>${procLink(r)}</li>`))}
        ${sec('Correspondência SIA/SIH (tabela anterior)', L(rel.sia).map(([s, tp]) => html`<li><span class="code">${s}</span>${c.nome('siaSih', s) ?? ''} <span class="chip soft">${tp === 'A' ? 'SIA' : tp === 'H' ? 'SIH' : tp}</span></li>`))}
        ${sec('Redes de atenção', L(rel.rede).map((r) => html`<li><span class="code">${r}</span>${c.nome('componentesRede', r) ?? ''}</li>`))}`;
    }
  }
  return '';
}

function bindTab(k, body) {
  $$('[data-filter]', body).forEach((inp) => {
    inp.addEventListener('input', () => {
      const q = norm(inp.value);
      const tbl = inp.closest('.tab-tools').nextElementSibling;
      $$('tbody tr', tbl).forEach((tr) => (tr.hidden = q && !tr.dataset.text.includes(q)));
    });
  });
}

// ---------------------------------------------------------------------------
// Navegação hierárquica

async function viewArvore({ params }) {
  const c = C();
  const count = {};
  for (const p of c.procs) for (const k of [p.g, p.sg, p.fo]) count[k] = (count[k] || 0) + 1;
  const open = params.get('g');
  main.innerHTML = String(html`<div class="page">
    ${pageHead('Navegar por grupos', 'Estrutura hierárquica da Tabela Unificada: grupo → subgrupo → forma de organização → procedimento.',
      html`<button class="btn sm" id="expand">${icon('plus')}<span>Expandir tudo</span></button><button class="btn sm" id="collapse">${icon('minus')}<span>Recolher</span></button>`)}
    <div class="input-icon wide">${icon('search')}<input id="tree-q" type="search" placeholder="Filtrar grupos, subgrupos e formas…" /></div>
    <div class="tree card" id="tree">
      ${Object.entries(c.t.grupos).map(([g, gn]) => html`
        <details class="t-g" ${open === g ? 'open' : ''} data-text="${norm(gn)}">
          <summary><span class="t-code g-${g}">${g}</span><span class="t-name">${gn}</span><span class="t-count">${num(count[g] || 0)}</span>${icon('down', 'caret')}</summary>
          ${Object.entries(c.t.subgrupos).filter(([k]) => k.startsWith(g)).map(([sg, sn]) => html`
            <details class="t-s" data-text="${norm(sn)}">
              <summary><span class="t-code">${sg.slice(2)}</span><span class="t-name">${sn}</span><span class="t-count">${num(count[sg] || 0)}</span>${icon('down', 'caret')}</summary>
              <ul>${Object.entries(c.t.formas).filter(([k]) => k.startsWith(sg)).map(([fo, fn]) => html`
                <li data-text="${norm(fn)}"><a href="#/procedimentos?g=${g}&sg=${sg}&fo=${fo}"><span class="t-code">${fo.slice(4)}</span><span class="t-name">${fn}</span><span class="t-count">${num(count[fo] || 0)}</span></a></li>`)}
              </ul>
            </details>`)}
        </details>`)}
    </div></div>`);
  $('#expand').onclick = () => $$('#tree details').forEach((d) => (d.open = true));
  $('#collapse').onclick = () => $$('#tree details').forEach((d) => (d.open = false));
  $('#tree-q').addEventListener('input', debounce((e) => {
    const q = norm(e.target.value.trim());
    $$('#tree .t-g').forEach((g) => {
      let any = !q || g.dataset.text.includes(q);
      $$('.t-s', g).forEach((s) => {
        let sAny = !q || s.dataset.text.includes(q) || g.dataset.text.includes(q);
        $$('li', s).forEach((li) => {
          const hit = !q || li.dataset.text.includes(q) || sAny;
          li.hidden = !hit;
          if (q && li.dataset.text.includes(q)) sAny = true;
        });
        s.hidden = !sAny;
        s.open = !!q && sAny && !s.dataset.text.includes(q);
        if (sAny) any = true;
      });
      g.hidden = !any;
      g.open = !!q && any;
    });
  }, 150));
}

// ---------------------------------------------------------------------------
// CID-10 e CBO

function listPage({ title, lead, items, placeholder, hrefFn, codeFmt = (x) => x, extra = () => '', params }) {
  const q0 = params.get('q') || '';
  main.innerHTML = String(html`<div class="page">
    ${pageHead(title, lead)}
    <div class="input-icon wide">${icon('search')}<input id="lq" type="search" placeholder="${placeholder}" value="${q0}" autocomplete="off" /></div>
    <div id="lres"></div></div>`);
  const host = $('#lres');
  let shown = 100;
  const draw = () => {
    const q = norm($('#lq').value.trim());
    const qc = q.replace(/[.\s-]/g, '').toUpperCase();
    const r = q ? items.filter((it) => it.co.startsWith(qc) || q.split(/\s+/).every((t) => it.n.includes(t))) : items;
    host.innerHTML = String(html`<p class="count"><strong>${num(r.length)}</strong> registros</p>
      <div class="code-list card">${r.slice(0, shown).map((it) => html`<a href="${hrefFn(it)}"><span class="code">${codeFmt(it.co)}</span><span>${raw(mark(it.no, $('#lq').value))}</span>${extra(it)}</a>`)}</div>
      ${r.length > shown ? html`<div class="more"><button class="btn" data-more>Mostrar mais</button></div>` : ''}`);
  };
  $('#lq').addEventListener('input', debounce(() => {
    shown = 100;
    const p = new URLSearchParams();
    if ($('#lq').value) p.set('q', $('#lq').value);
    setParams(p);
    draw();
  }, 150));
  host.onclick = (e) => e.target.closest('[data-more]') && ((shown += 200), draw());
  draw();
  $('#lq').focus();
}

async function viewCidLista({ params }) {
  main.innerHTML = String(html`<div class="page">${loadingBlock('Carregando CID-10…')}</div>`);
  const items = await C().loadCid();
  listPage({
    title: 'CID-10',
    lead: 'Classificação Estatística Internacional de Doenças. Abra um CID para ver os procedimentos relacionados.',
    items,
    params,
    placeholder: 'Ex.: J18, pneumonia, diabetes…',
    hrefFn: (it) => `#/cid/${it.co}`,
    codeFmt: fmtCid,
    extra: (it) => (it.sx ? html`<span class="chip soft">${SEXO[it.sx] ?? it.sx}</span>` : ''),
  });
}

async function viewCidDetalhe({ args: [co], token }) {
  const c = C();
  await c.loadCid();
  const cid = c.cidMap.get(co.toUpperCase());
  main.innerHTML = String(html`<div class="page">
    ${pageHead(cid ? cid.no : `CID ${fmtCid(co)}`, '', '', html`<a href="#/cid">CID-10</a>${icon('right')}<span>${fmtCid(co)}</span>`)}
    <div class="detail-top"><div class="code-big"><span class="code">${fmtCid(co)}</span></div>
      <div class="chips">${cid?.sx ? html`<span class="chip">Sexo: ${SEXO[cid.sx] ?? cid.sx}</span>` : ''}${cid?.ag && cid.ag !== '0' ? html`<span class="chip warn">${AGRAVO[cid.ag] ?? `Agravo ${cid.ag}`}</span>` : ''}</div></div>
    <h2 class="section-title">Procedimentos relacionados</h2>
    <div id="res">${c.completo ? loadingBlock('Carregando relacionamentos…') : incompleteNotice('A lista de procedimentos por CID')}</div></div>`);
  if (!c.completo) return;
  const idx = await c.reverse('cid', progress($('#res')));
  if (stale(token)) return;
  const set = new Set(idx.get(co.toUpperCase()) || []);
  resultsTable($('#res'), c.procs.filter((p) => set.has(p.co)), { exportName: `cid_${co}`, emptyText: 'Nenhum procedimento associado a este CID.' });
}

async function viewCboLista({ params }) {
  const c = C();
  const items = Object.entries(c.t.ocupacoes).map(([co, no]) => ({ co, no, n: norm(no) }));
  listPage({
    title: 'Ocupações (CBO)',
    lead: 'Classificação Brasileira de Ocupações utilizada pela SIGTAP (inclui códigos estendidos, como 2231F9).',
    items,
    params,
    placeholder: 'Ex.: 225125, enfermeiro, fisioterapeuta…',
    hrefFn: (it) => `#/cbo/${it.co}`,
  });
}

async function viewCboDetalhe({ args: [co], token }) {
  const c = C();
  const name = c.nome('ocupacoes', co.toUpperCase());
  main.innerHTML = String(html`<div class="page">
    ${pageHead(name || `CBO ${co}`, '', '', html`<a href="#/cbo">Ocupações (CBO)</a>${icon('right')}<span>${co}</span>`)}
    <div class="detail-top"><div class="code-big"><span class="code">${co}</span><button class="icon-btn ghost" data-copy="${co}">${icon('copy')}</button></div></div>
    <h2 class="section-title">Procedimentos que a ocupação pode registrar</h2>
    <div id="res">${c.completo ? loadingBlock('Carregando relacionamentos…') : incompleteNotice('A lista de procedimentos por CBO')}</div></div>`);
  if (!c.completo) return;
  const idx = await c.reverse('cbo', progress($('#res')));
  if (stale(token)) return;
  const set = new Set(idx.get(co.toUpperCase()) || []);
  resultsTable($('#res'), c.procs.filter((p) => set.has(p.co)), { exportName: `cbo_${co}`, emptyText: 'Nenhum procedimento associado a esta ocupação.' });
}

// ---------------------------------------------------------------------------
// Tabelas auxiliares

const AUX = {
  financiamento: { title: 'Financiamento', table: 'financiamentos', param: 'fin', desc: 'Tipo de financiamento do procedimento (PAB, MAC, FAEC…).' },
  rubrica: { title: 'Rubrica (subtipo de financiamento)', table: 'rubricas', param: 'rub', desc: 'Subdivisões do FAEC.' },
  complexidade: { title: 'Complexidade', table: null, param: 'cx', desc: 'Nível de complexidade da atenção.' },
  modalidade: { title: 'Modalidade de atendimento', table: 'modalidades', param: 'mod', desc: 'Ambulatorial, hospitalar, hospital-dia, atenção domiciliar.' },
  registro: { title: 'Instrumento de registro', table: 'registros', param: 'reg', desc: 'BPA, AIH, APAC, RAAS, e-SUS APS.' },
  servico: { title: 'Serviço / Classificação', table: 'classificacoes', rel: 'srv', desc: 'Serviços especializados e suas classificações (CNES).' },
  habilitacao: { title: 'Habilitação', table: 'habilitacoes', rel: 'hab', desc: 'Habilitações exigidas do estabelecimento.' },
  grupoHabilitacao: { title: 'Grupo de habilitação', table: 'gruposHabilitacao', desc: 'Agrupamentos de habilitações.' },
  leito: { title: 'Tipo de leito', table: 'leitos', rel: 'lei', desc: 'Leitos em que o procedimento pode ser realizado.' },
  regra: { title: 'Regra condicionada', table: 'regras', rel: 'rc', desc: 'Regras adicionais de processamento.' },
  renases: { title: 'RENASES', table: 'renases', rel: 'ren', desc: 'Relação Nacional de Ações e Serviços de Saúde.' },
  tuss: { title: 'TUSS', table: 'tuss', rel: 'tus', desc: 'Terminologia Unificada da Saúde Suplementar.' },
  detalhe: { title: 'Detalhe', table: 'detalhes', rel: 'det', desc: 'Detalhamentos complementares de procedimentos.' },
  rede: { title: 'Componente de rede de atenção', table: 'componentesRede', rel: 'rede', desc: 'Redes temáticas de atenção à saúde.' },
  ocupacao: { title: 'Ocupação (CBO)', href: '#/cbo', table: 'ocupacoes', desc: 'Classificação Brasileira de Ocupações.' },
  cid: { title: 'CID-10', href: '#/cid', desc: 'Classificação Internacional de Doenças.' },
  estrutura: { title: 'Grupo / Subgrupo / Forma', href: '#/navegar', table: 'formas', desc: 'Estrutura hierárquica da tabela.' },
};

function auxItems(key) {
  const a = AUX[key];
  if (key === 'complexidade') return Object.entries(COMPLEXIDADE);
  const t = C().t[a.table];
  if (!t) return [];
  return Object.entries(t).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]);
}

async function viewTabelas() {
  main.innerHTML = String(html`<div class="page">
    ${pageHead('Tabelas auxiliares', 'Tabelas de domínio da SIGTAP. Selecione um item para listar os procedimentos associados.')}
    <div class="aux-grid">${Object.entries(AUX).map(([k, a]) => {
      const n = k === 'cid' ? C().meta.totais.cids : auxItems(k).length;
      return html`<a class="aux-card ${n ? '' : 'dim'}" href="${a.href || `#/tabelas/${k}`}"><strong>${a.title}</strong><span>${a.desc}</span><b>${n ? `${num(n)} itens` : 'Disponível na carga completa'}</b></a>`;
    })}</div></div>`);
}

async function viewTabela({ args: [key], params }) {
  const a = AUX[key];
  if (!a) return (location.hash = '#/tabelas');
  const items = auxItems(key).map(([co, no]) => ({ co, no: no || '', n: norm(no) }));
  if (!items.length) {
    main.innerHTML = String(html`<div class="page">${pageHead(a.title, a.desc, '', html`<a href="#/tabelas">Tabelas auxiliares</a>`)}${incompleteNotice('Esta tabela')}</div>`);
    return;
  }
  listPage({
    title: a.title,
    lead: a.desc,
    items,
    params,
    placeholder: 'Filtrar por código ou nome…',
    hrefFn: (it) => (a.param ? `#/procedimentos?${a.param}=${it.co}` : a.rel ? `#/tabelas/${key}/${it.co}` : '#/tabelas'),
    extra: (it) => (key === 'servico' ? html`<span class="chip soft">${C().nome('servicos', it.co.split('-')[0]) ?? ''}</span>` : ''),
  });
  $('.page-head').insertAdjacentHTML('afterbegin', String(html`<nav class="crumbs"><a href="#/tabelas">Tabelas auxiliares</a></nav>`));
}

async function viewTabelaItem({ args: [key, code], token }) {
  const a = AUX[key];
  const c = C();
  if (!a?.rel) return (location.hash = `#/tabelas/${key}`);
  const val = c.t[a.table]?.[code];
  const name = Array.isArray(val) ? val[0] : val;
  const desc = Array.isArray(val) ? val[1] : '';
  main.innerHTML = String(html`<div class="page">
    ${pageHead(name || code, desc, '', html`<a href="#/tabelas">Tabelas auxiliares</a>${icon('right')}<a href="#/tabelas/${key}">${a.title}</a>`)}
    <div class="detail-top"><div class="code-big"><span class="code">${code}</span></div>
    ${key === 'servico' ? html`<div class="chips"><span class="chip">${c.nome('servicos', code.split('-')[0])}</span></div>` : ''}</div>
    <div id="res">${c.completo ? loadingBlock('Carregando relacionamentos…') : incompleteNotice()}</div></div>`);
  if (!c.completo) return;
  const idx = await c.reverse(a.rel, progress($('#res')));
  if (stale(token)) return;
  const set = new Set(idx.get(code) || []);
  resultsTable($('#res'), c.procs.filter((p) => set.has(p.co)), { exportName: `${key}_${code}` });
}

// ---------------------------------------------------------------------------
// Compatibilidade

async function viewCompat({ params }) {
  const c = C();
  main.innerHTML = String(html`<div class="page">
    ${pageHead('Compatibilidades', 'Verifique se um procedimento secundário pode ser registrado com um procedimento principal, conforme a SIGTAP.')}
    ${!c.completo ? incompleteNotice('A verificação de compatibilidade') : ''}
    <div class="compat card">
      <label class="field"><span>Procedimento principal</span><div class="input-icon">${icon('search')}<input id="cp-a" placeholder="Código ou nome" autocomplete="off" /></div><div class="picked" id="pa"></div></label>
      <div class="compat-sep">${icon('link')}</div>
      <label class="field"><span>Procedimento secundário (opcional)</span><div class="input-icon">${icon('search')}<input id="cp-b" placeholder="Código ou nome" autocomplete="off" /></div><div class="picked" id="pb"></div></label>
    </div>
    <div id="cp-res"></div></div>`);
  const sel = { a: params.get('a'), b: params.get('b') };
  const pickedHtml = (co) => (co && c.get(co) ? html`<div class="picked-item">${procLink(co)}</div>` : '');
  async function draw() {
    $('#pa').innerHTML = String(pickedHtml(sel.a));
    $('#pb').innerHTML = String(pickedHtml(sel.b));
    const p = new URLSearchParams();
    if (sel.a) p.set('a', sel.a);
    if (sel.b) p.set('b', sel.b);
    setParams(p);
    const host = $('#cp-res');
    if (!sel.a || !c.completo) return (host.innerHTML = '');
    const rel = (await c.rel(sel.a)) || {};
    const cpt = rel.cpt || [];
    const reg = (r) => c.nome('registros', r) ?? r;
    if (sel.b) {
      const hits = cpt.filter((x) => x[0] === sel.b);
      const exc = (rel.exc || []).filter((x) => x[1] === sel.b);
      const ok = hits.some((x) => x[3] === '1');
      host.innerHTML = String(html`<div class="verdict ${hits.length ? (ok ? 'ok' : 'bad') : 'none'}">
        ${icon(hits.length ? (ok ? 'check' : 'x') : 'info')}
        <div><strong>${hits.length ? (ok ? 'Compatíveis' : 'Incompatíveis') : 'Sem regra de compatibilidade cadastrada'}</strong>
        <p>${hits.length ? hits.map((x) => `${TIPO_COMPAT[x[3]] ?? x[3]} — registro principal ${reg(x[1])}, compatível ${reg(x[2])}${x[4] ? `, quantidade permitida ${x[4]}` : ''}`).join(' · ') : 'A SIGTAP não lista este par como compatível para o procedimento principal escolhido.'}</p>
        ${exc.length ? html`<p class="small">Há ${exc.length} exceção(ões) de compatibilidade envolvendo este par.</p>` : ''}</div></div>`);
      return;
    }
    const list = cpt.map((x) => c.get(x[0])).filter(Boolean);
    host.innerHTML = String(html`<h2 class="section-title">Compatíveis com ${fmtCode(sel.a)}</h2><div id="cp-tab"></div>`);
    resultsTable($('#cp-tab'), list, { exportName: `compativeis_${sel.a}`, emptyText: 'Nenhum procedimento compatível cadastrado.' });
  }
  procAutocomplete($('#cp-a'), (p) => ((sel.a = p.co), ($('#cp-a').value = ''), draw()));
  procAutocomplete($('#cp-b'), (p) => ((sel.b = p.co), ($('#cp-b').value = ''), draw()));
  draw();
}

// ---------------------------------------------------------------------------
// Simulador de valores

async function viewSimulador() {
  const c = C();
  main.innerHTML = String(html`<div class="page">
    ${pageHead('Simulador de valores', 'Monte uma cesta de procedimentos e calcule os valores de referência da tabela SUS na competência selecionada.',
      html`<button class="btn sm" id="sim-csv">${icon('csv')}<span>Exportar</span></button><button class="btn sm" id="sim-print">${icon('print')}<span>Imprimir</span></button><button class="btn sm danger-ghost" id="sim-clear">${icon('trash')}<span>Limpar</span></button>`)}
    <div class="card pad-card"><label class="field"><span>Adicionar procedimento</span><div class="input-icon">${icon('plus')}<input id="sim-add" placeholder="Digite código ou nome e pressione Enter" autocomplete="off" /></div></label></div>
    <div id="sim"></div></div>`);
  const draw = () => {
    const cesta = prefs.get('cesta', []);
    const modo = prefs.get('simModo', 'amb');
    const rows = cesta.map((it) => ({ ...it, p: c.get(it.co) }));
    const val = (p) => (modo === 'amb' ? p.sa : p.sh + p.sp);
    const tot = { sa: 0, sh: 0, sp: 0, v: 0 };
    rows.forEach((r) => {
      if (!r.p) return;
      ['sa', 'sh', 'sp'].forEach((k) => (tot[k] += r.p[k] * r.qt));
      tot.v += val(r.p) * r.qt;
    });
    const zero = rows.filter((r) => r.p && !val(r.p)).length;
    $('#sim').innerHTML = String(rows.length === 0
      ? emptyState('Sua cesta está vazia', 'Adicione procedimentos acima ou pelo botão + nas listas de resultados.')
      : html`<div class="seg" role="radiogroup" aria-label="Regime de atendimento">
          <button role="radio" aria-checked="${modo === 'amb'}" class="${modo === 'amb' ? 'on' : ''}" data-modo="amb">Ambulatorial <small>SA</small></button>
          <button role="radio" aria-checked="${modo === 'hosp'}" class="${modo === 'hosp' ? 'on' : ''}" data-modo="hosp">Hospitalar <small>SH + SP</small></button>
        </div>
        <div class="table-wrap card"><table class="simple sim">
        <thead><tr><th>Procedimento</th><th class="num">Qtd.</th>${modo === 'amb' ? html`<th class="num">SA</th>` : html`<th class="num">SH</th><th class="num">SP</th>`}<th class="num">Subtotal</th><th></th></tr></thead>
        <tbody>${rows.map((r, i) => r.p
          ? html`<tr><td>${procLink(r.co)}${r.p.qtMax && r.qt > r.p.qtMax ? html`<span class="chip warn">Excede a quantidade máxima (${r.p.qtMax})</span>` : ''}${!val(r.p) ? html`<span class="chip soft">Sem valor ${modo === 'amb' ? 'ambulatorial' : 'hospitalar'}</span>` : ''}</td>
            <td class="num"><div class="stepper"><button data-dec="${i}" aria-label="Diminuir">${icon('minus')}</button><input data-qt="${i}" type="number" min="1" value="${r.qt}" aria-label="Quantidade" /><button data-inc="${i}" aria-label="Aumentar">${icon('plus')}</button></div></td>
            ${modo === 'amb' ? html`<td class="num" data-label="SA">${money(r.p.sa * r.qt)}</td>` : html`<td class="num" data-label="SH">${money(r.p.sh * r.qt)}</td><td class="num" data-label="SP">${money(r.p.sp * r.qt)}</td>`}
            <td class="num strong" data-label="Subtotal">${money(val(r.p) * r.qt)}</td>
            <td><button class="icon-btn ghost" data-del="${i}" title="Remover">${icon('trash')}</button></td></tr>`
          : html`<tr><td colspan="${modo === 'amb' ? 4 : 5}"><span class="code">${fmtCode(r.co)}</span> <span class="muted">não consta na competência ${c.meta.rotulo}</span></td><td><button class="icon-btn ghost" data-del="${i}">${icon('trash')}</button></td></tr>`)}</tbody>
        <tfoot><tr><th>Total</th><th class="num">${num(rows.reduce((s2, r) => s2 + r.qt, 0))}</th>${modo === 'amb' ? html`<th class="num">${money(tot.sa)}</th>` : html`<th class="num">${money(tot.sh)}</th><th class="num">${money(tot.sp)}</th>`}<th class="num">${money(tot.v)}</th><th></th></tr></tfoot>
        </table></div>
        <div class="values">
          ${modo === 'amb'
            ? html`<div class="value-card"><span>Serviço Ambulatorial (SA)</span><strong>${money(tot.sa)}</strong></div><div class="value-card"><span>Itens sem valor ambulatorial</span><strong>${zero}</strong></div>`
            : html`<div class="value-card"><span>Serviço Hospitalar (SH)</span><strong>${money(tot.sh)}</strong></div><div class="value-card"><span>Serviço Profissional (SP)</span><strong>${money(tot.sp)}</strong></div>`}
          <div class="value-card accent"><span>Total ${modo === 'amb' ? 'ambulatorial' : 'hospitalar'}</span><strong>${money(tot.v)}</strong></div>
        </div>
        <p class="muted small">Valores de referência da Tabela SUS (competência ${c.meta.rotulo}), sem incrementos, complementos estaduais/municipais ou regras de rateio de SP.</p>`);
  };
  const save = (fn) => {
    const cesta = prefs.get('cesta', []);
    fn(cesta);
    prefs.set('cesta', cesta.filter((x) => x.qt > 0));
    renderNav('simulador');
    draw();
  };
  $('#sim').onclick = (e) => {
    const m = e.target.closest('[data-modo]');
    if (m) return prefs.set('simModo', m.dataset.modo), draw();
    const t = e.target.closest('[data-inc],[data-dec],[data-del]');
    if (!t) return;
    save((cs) => {
      if (t.dataset.inc) cs[+t.dataset.inc].qt++;
      if (t.dataset.dec) cs[+t.dataset.dec].qt = Math.max(1, cs[+t.dataset.dec].qt - 1);
      if (t.dataset.del) cs.splice(+t.dataset.del, 1);
    });
  };
  $('#sim').onchange = (e) => {
    const i = e.target.dataset.qt;
    if (i !== undefined) save((cs) => (cs[+i].qt = Math.max(1, parseInt(e.target.value, 10) || 1)));
  };
  procAutocomplete($('#sim-add'), (p) => {
    $('#sim-add').value = '';
    addCesta(p.co);
    draw();
  });
  $('#sim-clear').onclick = () => confirm('Remover todos os procedimentos do simulador?') && save((cs) => cs.splice(0));
  $('#sim-print').onclick = () => window.print();
  $('#sim-csv').onclick = () => {
    const cesta = prefs.get('cesta', []);
    const amb = prefs.get('simModo', 'amb') === 'amb';
    downloadCSV(`simulacao_${amb ? 'ambulatorial' : 'hospitalar'}_${c.id}.csv`, ['Código', 'Procedimento', 'Quantidade', 'SA (R$)', 'SH (R$)', 'SP (R$)', `Subtotal ${amb ? 'SA' : 'SH+SP'} (R$)`],
      cesta.map((r) => {
        const p = c.get(r.co) || { no: '', sa: 0, sh: 0, sp: 0 };
        return [fmtCode(r.co), p.no, r.qt, (p.sa * r.qt) / 100, (p.sh * r.qt) / 100, (p.sp * r.qt) / 100, ((amb ? p.sa : p.sh + p.sp) * r.qt) / 100];
      }));
  };
  draw();
}

// ---------------------------------------------------------------------------
// Comparar procedimentos e competências

async function viewComparar({ params, token }) {
  const c = C();
  const comps = store.manifest.competencias;
  main.innerHTML = String(html`<div class="page">
    ${pageHead('Comparar', 'Atributos de até quatro procedimentos lado a lado, e diferenças entre competências da tabela.')}
    <section class="section">
      <div class="section-head"><h2>Procedimentos lado a lado</h2></div>
      <div class="card pad-card"><label class="field"><span>Adicionar à comparação</span><div class="input-icon">${icon('plus')}<input id="cmp-add" placeholder="Código ou nome" autocomplete="off" /></div></label></div>
      <div id="cmp"></div>
    </section>
    <section class="section">
      <div class="section-head"><h2>Diferenças entre competências</h2></div>
      ${comps.length < 2
        ? html`<div class="notice info">${icon('info')}<div>Apenas a competência ${comps[0]?.rotulo} está publicada neste site. Ao gerar novas competências (workflow mensal), você poderá comparar procedimentos incluídos, excluídos e valores alterados.</div></div>`
        : html`<div class="card pad-card field-row">
            <label class="field"><span>De</span><select id="dA">${comps.map((x, i) => html`<option value="${x.id}" ${i === 1 ? 'selected' : ''}>${x.rotulo}</option>`)}</select></label>
            <label class="field"><span>Para</span><select id="dB">${comps.map((x, i) => html`<option value="${x.id}" ${i === 0 ? 'selected' : ''}>${x.rotulo}</option>`)}</select></label>
            <button class="btn primary" id="dGo">Comparar</button></div><div id="diff"></div>`}
    </section></div>`);

  const draw = () => {
    const list = prefs.get('cmp', []).map((co) => c.get(co) || { co, missing: true });
    const host = $('#cmp');
    if (!list.length) return (host.innerHTML = String(emptyState('Nada para comparar', 'Use o botão “Comparar” na página de um procedimento ou adicione acima.')));
    const rowsDef = [
      ['Grupo', (p) => c.nome('grupos', p.g)],
      ['Subgrupo', (p) => c.nome('subgrupos', p.sg)],
      ['Forma de organização', (p) => c.nome('formas', p.fo)],
      ['Complexidade', (p) => cxLabel(p.cx)],
      ['Financiamento', (p) => finName(p.fin)],
      ['Modalidade', (p) => p.mod.map((m) => c.nome('modalidades', m)).join(', ') || '—'],
      ['Instrumento de registro', (p) => p.reg.map((m) => c.nome('registros', m)).join(', ') || '—'],
      ['Sexo', (p) => SEXO[p.sx] ?? '—'],
      ['Idade mínima', (p) => fmtIdade(p.idMin) ?? '—'],
      ['Idade máxima', (p) => fmtIdade(p.idMax) ?? '—'],
      ['Quantidade máxima', (p) => p.qtMax ?? '—'],
      ['Permanência (dias)', (p) => p.dias ?? '—'],
      ['Pontos', (p) => p.pts ?? '—'],
      ['SA', (p) => money(p.sa), 'sa'],
      ['SH', (p) => money(p.sh), 'sh'],
      ['SP', (p) => money(p.sp), 'sp'],
      ['Total ambulatorial', (p) => money(p.totAmb), 'totAmb'],
      ['Total hospitalar', (p) => money(p.totHosp), 'totHosp'],
    ];
    const ok = list.filter((p) => !p.missing);
    host.innerHTML = String(html`<div class="table-wrap card"><table class="simple compare">
      <thead><tr><th></th>${list.map((p) => html`<th><div class="cmp-h">${p.missing ? fmtCode(p.co) : procLink(p.co)}<button class="icon-btn ghost" data-rmcmp="${p.co}" title="Remover">${icon('x')}</button></div></th>`)}</tr></thead>
      <tbody>${rowsDef.map(([l, fn, key]) => {
        const vals = ok.map((p) => (key ? p[key] : String(fn(p))));
        const diff = new Set(vals).size > 1;
        const max = key ? Math.max(...vals) : null;
        return html`<tr class="${diff ? 'is-diff' : ''}"><th>${l}</th>${list.map((p) => html`<td class="${key && !p.missing && p[key] === max && diff ? 'best' : ''}">${p.missing ? '—' : fn(p)}</td>`)}</tr>`;
      })}</tbody></table></div><p class="muted small">Linhas destacadas indicam atributos diferentes entre os procedimentos.</p>`);
  };
  $('#cmp').onclick = (e) => {
    const b = e.target.closest('[data-rmcmp]');
    if (!b) return;
    prefs.set('cmp', prefs.get('cmp', []).filter((x) => x !== b.dataset.rmcmp));
    renderNav('comparar');
    draw();
  };
  procAutocomplete($('#cmp-add'), (p) => {
    $('#cmp-add').value = '';
    addCmp(p.co);
    draw();
  });
  draw();

  if (comps.length >= 2) {
    $('#dGo').onclick = async () => {
      const host = $('#diff');
      host.innerHTML = String(loadingBlock('Carregando competências…'));
      const [A, B] = await Promise.all([store.load($('#dA').value), store.load($('#dB').value)]);
      if (stale(token)) return;
      const novos = B.procs.filter((p) => !A.get(p.co));
      const excl = A.procs.filter((p) => !B.get(p.co));
      const alter = [];
      for (const p of B.procs) {
        const o = A.get(p.co);
        if (!o) continue;
        const ch = [];
        for (const k of ['sa', 'sh', 'sp']) if (o[k] !== p[k]) ch.push(`${k.toUpperCase()}: ${money(o[k])} → ${money(p[k])}`);
        if (o.no !== p.no) ch.push('Nome alterado');
        if (o.cx !== p.cx) ch.push(`Complexidade: ${cxLabel(o.cx)} → ${cxLabel(p.cx)}`);
        if (o.fin !== p.fin) ch.push(`Financiamento: ${o.fin} → ${p.fin}`);
        if (ch.length) alter.push([p, ch]);
      }
      const block = (title, items, fn) => html`<details class="diff-block card" ${items.length ? 'open' : ''}><summary><strong>${title}</strong><b class="badge">${num(items.length)}</b></summary>
        ${items.length ? html`<ul class="mini-list">${items.slice(0, 500).map(fn)}</ul>` : html`<p class="muted">Nenhum.</p>`}</details>`;
      host.innerHTML = String(html`
        ${block('Procedimentos incluídos', novos, (p) => html`<li>${procLink(p.co)}</li>`)}
        ${block('Procedimentos excluídos', excl, (p) => html`<li><span class="code">${fmtCode(p.co)}</span> ${p.no}</li>`)}
        ${block('Procedimentos alterados', alter, ([p, ch]) => html`<li>${procLink(p.co)}<div class="small muted">${ch.join(' · ')}</div></li>`)}`);
    };
  }
}

// ---------------------------------------------------------------------------
// Favoritos e histórico

async function viewFavoritos() {
  const c = C();
  const draw = () => {
    const fav = prefs.get('fav', []);
    const hist = prefs.get('hist', []);
    main.innerHTML = String(html`<div class="page">
      ${pageHead('Favoritos e histórico', 'Armazenados apenas neste navegador.')}
      <section class="section"><div class="section-head"><h2>${icon('star')} Favoritos</h2>${fav.length ? html`<button class="link-btn" id="fav-csv">Exportar CSV</button>` : ''}</div>
        <div id="fav-list">${fav.length ? '' : emptyState('Nenhum favorito', 'Use a estrela nas listas ou na página do procedimento.')}</div></section>
      <section class="section"><div class="section-head"><h2>${icon('clock')} Histórico</h2>${hist.length ? html`<button class="link-btn" id="hist-clear">Limpar histórico</button>` : ''}</div>
        ${hist.length ? html`<ul class="mini-list card">${hist.map((co) => html`<li>${procLink(co)}</li>`)}</ul>` : html`<p class="muted">Nenhum procedimento visualizado ainda.</p>`}</section></div>`);
    if (fav.length) resultsTable($('#fav-list'), fav.map((co) => c.get(co)).filter(Boolean), { exportName: 'favoritos' });
    $('#fav-csv')?.addEventListener('click', () => $('#fav-list [data-export]')?.click());
    $('#hist-clear')?.addEventListener('click', () => (prefs.set('hist', []), draw()));
  };
  draw();
}

// ---------------------------------------------------------------------------
// Dados e sobre

async function viewDownload() {
  const c = C();
  const comps = store.manifest.competencias;
  main.innerHTML = String(html`<div class="page narrow">
    ${pageHead('Dados e download', 'Origem, atualização e arquivos utilizados por esta consulta.')}
    <section class="card pad-card">
      <h2>Competências disponíveis</h2>
      <div class="table-wrap"><table class="simple">
        <thead><tr><th>Competência</th><th>Procedimentos</th><th>Carga</th><th>Arquivo de origem</th><th>Dados</th></tr></thead>
        <tbody>${comps.map((x) => html`<tr><td><strong>${x.rotulo}</strong></td><td>${num(x.procedimentos)}</td>
          <td>${x.completo ? html`<span class="chip ok">Completa</span>` : html`<span class="chip warn">Parcial</span>`}</td>
          <td class="small"><span class="code">${x.arquivo}</span></td>
          <td><a class="btn sm" href="data/${x.id}/base.json" download>${icon('download')}<span>JSON</span></a></td></tr>`)}</tbody></table></div>
      <div class="dl-row">
        <button class="btn primary" id="dl-csv">${icon('csv')}<span>Baixar todos os procedimentos (CSV)</span></button>
        <a class="btn" href="ftp://ftp2.datasus.gov.br/pub/sistemas/tup/downloads/" target="_blank" rel="noopener">${icon('external')}<span>FTP oficial do DATASUS</span></a>
        <button class="link-btn dl-how" id="dl-how">${icon('info')}<span>Como os dados são atualizados</span></button>
      </div>
    </section></div>
    <dialog class="modal" id="dl-modal" aria-labelledby="dl-modal-title">
      <div class="modal-head"><h2 id="dl-modal-title">Como os dados são atualizados</h2>
        <button class="icon-btn" id="dl-modal-close" aria-label="Fechar">${icon('x')}</button></div>
      <div class="modal-body prose">
      <p>O DATASUS publica mensalmente o pacote <code>TabelaUnificada_AAAAMM_vXXXX.zip</code> em
      <code>ftp://ftp2.datasus.gov.br/pub/sistemas/tup/downloads/</code>. O script <code>scripts/sigtap_build.py</code>
      lê os arquivos de largura fixa usando os próprios layouts publicados no pacote e gera os arquivos em <code>data/AAAAMM/</code>.</p>
      <pre><code>python3 scripts/sigtap_build.py oficial                  # competência mais recente
python3 scripts/sigtap_build.py oficial --competencia 202610
python3 scripts/sigtap_build.py oficial --zip TabelaUnificada_202610_v2610101010.zip</code></pre>
      <p>O repositório inclui um workflow do GitHub Actions que executa a atualização todo mês e publica o resultado.</p>
      <h3>Competência atual</h3>
      <ul><li>Fonte: ${c.meta.fonte}</li><li>Arquivo: <code>${c.meta.arquivo}</code></li><li>Gerado em: ${new Date(c.meta.geradoEm).toLocaleString('pt-BR')}</li></ul>
      ${c.meta.avisos?.length ? html`<div class="notice warn">${icon('alert')}<div>${c.meta.avisos.map((a) => html`<p>${a}</p>`)}</div></div>` : ''}
    </div></dialog>`);
  const modal = $('#dl-modal');
  $('#dl-how').onclick = () => modal.showModal();
  $('#dl-modal-close').onclick = () => modal.close();
  modal.addEventListener('click', (e) => e.target === modal && modal.close());
  $('#dl-csv').onclick = () => {
    downloadCSV(`sigtap_${c.id}.csv`,
      ['Código', 'Procedimento', 'Grupo', 'Subgrupo', 'Forma de organização', 'Complexidade', 'Financiamento', 'Rubrica', 'Sexo', 'Idade mín. (meses)', 'Idade máx. (meses)', 'Qtd. máxima', 'Permanência (dias)', 'Pontos', 'SA (R$)', 'SH (R$)', 'SP (R$)'],
      c.procs.map((p) => [p.co, p.no, p.g, p.sg, p.fo, cxLabel(p.cx), finName(p.fin), p.rub ?? '', SEXO[p.sx] ?? '', p.idMin ?? '', p.idMax ?? '', p.qtMax ?? '', p.dias ?? '', p.pts ?? '', p.sa / 100, p.sh / 100, p.sp / 100]));
  };
}

async function viewSobre() {
  main.innerHTML = String(html`<div class="page narrow">
    ${pageHead('Sobre a SIGTAP', 'Sistema de Gerenciamento da Tabela de Procedimentos, Medicamentos e OPM do SUS.')}
    <section class="card pad-card prose">
      <p>A Tabela Unificada do SUS reúne, desde 2008, os procedimentos ambulatoriais e hospitalares, medicamentos e órteses,
      próteses e materiais especiais (OPM) financiados pelo SUS. É mantida pelo Ministério da Saúde e publicada mensalmente
      por competência pelo DATASUS.</p>
      <h3>Estrutura do código</h3>
      <div class="code-anatomy">
        <span><b>03</b><small>Grupo</small></span><i>.</i><span><b>01</b><small>Subgrupo</small></span><i>.</i>
        <span><b>01</b><small>Forma de organização</small></span><i>.</i><span><b>007</b><small>Sequencial</small></span><i>-</i><span><b>2</b><small>Dígito verificador</small></span>
      </div>
      <h3>Valores</h3>
      <ul>
        <li><strong>SA</strong> — Serviço Ambulatorial: valor pago no atendimento ambulatorial (BPA/APAC).</li>
        <li><strong>SH</strong> — Serviço Hospitalar: diárias, taxas, materiais e exames do período de internação.</li>
        <li><strong>SP</strong> — Serviço Profissional: honorários dos profissionais na internação (rateado por pontos).</li>
        <li><strong>Total hospitalar</strong> = SH + SP.</li>
      </ul>
      <h3>Atalhos de teclado</h3>
      <ul class="kbd-list">
        <li><kbd>Ctrl</kbd> + <kbd>K</kbd> ou <kbd>/</kbd> — busca rápida em qualquer página</li>
        <li><kbd>↑</kbd> <kbd>↓</kbd> e <kbd>Enter</kbd> — navegar nos resultados da busca rápida</li>
        <li><kbd>Esc</kbd> — fechar a busca</li>
      </ul>
      <div class="notice info">${icon('info')}<div>Esta é uma consulta independente e não oficial. Os dados são públicos e
      redistribuídos sem alteração de conteúdo; confirme sempre no
      <a href="http://sigtap.datasus.gov.br/" target="_blank" rel="noopener">SIGTAP oficial</a> antes de faturar.</div></div>
    </section></div>`);
}

// ---------------------------------------------------------------------------
// Busca rápida (Ctrl+K)

const palette = {
  el: $('#palette'),
  input: $('#palette-input'),
  results: $('#palette-results'),
  items: [],
  active: 0,
  open() {
    this.el.hidden = false;
    document.body.classList.add('no-scroll');
    this.input.value = '';
    this.draw();
    this.input.focus();
    C().loadCid().then(() => this.input.value && this.draw());
  },
  close() {
    this.el.hidden = true;
    document.body.classList.remove('no-scroll');
  },
  draw() {
    const q = this.input.value.trim();
    const c = C();
    const groups = [];
    if (!q) {
      const hist = prefs.get('hist', []).map((co) => c.get(co)).filter(Boolean).slice(0, 5);
      if (hist.length) groups.push(['Recentes', hist.map((p) => ({ href: `#/procedimento/${p.co}`, code: fmtCode(p.co), text: p.no }))]);
      groups.push(['Páginas', NAV_PAGES.map((n) => ({ href: `#/${n[0]}`, icon: n[1], text: n[2] }))]);
    } else {
      const procs = c.search(q).slice(0, 8);
      if (procs.length) groups.push(['Procedimentos', procs.map((p) => ({ href: `#/procedimento/${p.co}`, code: fmtCode(p.co), text: p.no, val: p.sa ? money(p.sa) : p.totHosp ? money(p.totHosp) : '' }))]);
      const nq = norm(q);
      const qc = nq.replace(/[.\s-]/g, '').toUpperCase();
      const match = (co, n) => co.startsWith(qc) || nq.split(/\s+/).every((t) => n.includes(t));
      const cids = (c.cid || []).filter((x) => match(x.co, x.n)).slice(0, 4);
      if (cids.length) groups.push(['CID-10', cids.map((x) => ({ href: `#/cid/${x.co}`, code: fmtCid(x.co), text: x.no }))]);
      const cbos = Object.entries(c.t.ocupacoes).filter(([co, no]) => match(co, norm(no))).slice(0, 4);
      if (cbos.length) groups.push(['Ocupações (CBO)', cbos.map(([co, no]) => ({ href: `#/cbo/${co}`, code: co, text: no }))]);
      const pages = NAV_PAGES.filter((n) => norm(n[2]).includes(nq));
      if (pages.length) groups.push(['Páginas', pages.map((n) => ({ href: `#/${n[0]}`, icon: n[1], text: n[2] }))]);
      groups.push(['', [{ href: `#/procedimentos?q=${encodeURIComponent(q)}`, icon: 'list', text: `Ver todos os procedimentos para “${q}”` }]]);
    }
    this.items = groups.flatMap((g) => g[1]);
    this.active = 0;
    let i = 0;
    this.results.innerHTML = String(html`${groups.map(([title, items]) => html`
      ${title ? html`<div class="pr-group">${title}</div>` : ''}
      ${items.map((it) => html`<a class="pr-item ${i === 0 ? 'on' : ''}" role="option" data-i="${i++}" href="${it.href}">
        ${it.icon ? icon(it.icon) : html`<span class="code">${it.code}</span>`}<span class="pr-text">${raw(mark(it.text, q))}</span>${it.val ? html`<span class="pr-val">${it.val}</span>` : ''}</a>`)}`)}`);
  },
  move(d) {
    const els = $$('.pr-item', this.results);
    if (!els.length) return;
    this.active = (this.active + d + els.length) % els.length;
    els.forEach((e, i) => e.classList.toggle('on', i === this.active));
    els[this.active].scrollIntoView({ block: 'nearest' });
  },
};

palette.input.addEventListener('input', debounce(() => palette.draw(), 80));
palette.input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') e.preventDefault(), palette.move(1);
  if (e.key === 'ArrowUp') e.preventDefault(), palette.move(-1);
  if (e.key === 'Enter') {
    e.preventDefault();
    const it = palette.items[palette.active];
    if (it) (location.hash = it.href), palette.close();
  }
  if (e.key === 'Escape') palette.close();
});
palette.el.addEventListener('mousedown', (e) => e.target === palette.el && palette.close());
palette.results.addEventListener('click', (e) => e.target.closest('.pr-item') && palette.close());

// ---------------------------------------------------------------------------
// Shell: tema, menu, competência, atalhos e ações globais

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  prefs.set('theme', t);
  $('#theme-btn').innerHTML = String(icon(t === 'dark' ? 'sun' : 'moon'));
}

function closeSidebar() {
  document.body.classList.remove('nav-open');
}

function initShell() {
  $('#menu-btn').innerHTML = String(icon('menu'));
  $('.st-icon').innerHTML = String(icon('search'));
  $('.pi-icon').innerHTML = String(icon('search'));
  const sysDark = matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(prefs.get('theme', sysDark ? 'dark' : 'light'));
  $('#theme-btn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  $('#menu-btn').onclick = () => document.body.classList.toggle('nav-open');
  $('#scrim').onclick = closeSidebar;
  $('#search-trigger').onclick = () => palette.open();

  const sel = $('#comp-select');
  sel.innerHTML = String(html`${store.manifest.competencias.map((x) => html`<option value="${x.id}" ${x.id === C().id ? 'selected' : ''}>${x.rotulo}${x.id === store.manifest.atual ? ' (atual)' : ''}</option>`)}`);
  sel.onchange = async () => {
    main.innerHTML = String(html`<div class="page">${loadingBlock(`Carregando competência ${sel.selectedOptions[0].text}…`)}</div>`);
    await store.use(sel.value);
    renderFoot();
    route();
  };
  renderFoot();

  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      palette.el.hidden ? palette.open() : palette.close();
    } else if (e.key === '/' && !typing && palette.el.hidden) {
      e.preventDefault();
      palette.open();
    } else if (e.key === 'Escape' && !palette.el.hidden) palette.close();
  });

  document.addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      e.preventDefault();
      const co = fav.dataset.fav;
      const list = prefs.get('fav', []);
      const on = list.includes(co);
      prefs.set('fav', on ? list.filter((x) => x !== co) : [co, ...list]);
      const big = fav.classList.contains('btn');
      fav.outerHTML = String(favBtn(co, big));
      toast(on ? 'Removido dos favoritos' : 'Adicionado aos favoritos');
      return;
    }
    const ce = e.target.closest('[data-cesta]');
    if (ce) return e.preventDefault(), addCesta(ce.dataset.cesta);
    const cm = e.target.closest('[data-cmp]');
    if (cm) return e.preventDefault(), addCmp(cm.dataset.cmp);
    const cp = e.target.closest('[data-copy]');
    if (cp) return e.preventDefault(), copy(cp.dataset.copy, `Código ${cp.dataset.copy} copiado`);
  });
}

function renderFoot() {
  const c = C();
  $('#sidebar-foot').innerHTML = String(html`<div class="comp-pill ${c.completo ? 'ok' : 'warn'}">
    <span class="dot"></span><div><strong>Competência ${c.meta.rotulo}</strong><small>${c.completo ? 'Carga completa' : 'Carga parcial'} · ${num(c.procs.length)} proc.</small></div></div>
    <button class="kbd-hint" id="kbd-hint">${icon('keyboard')} <span>Busca rápida</span> <kbd>/</kbd></button>`);
  $('#kbd-hint').onclick = () => palette.open();
}

async function boot() {
  try {
    await store.init();
  } catch (err) {
    main.innerHTML = String(errorBlock(`${err.message}. Se abriu o arquivo direto do disco, sirva a pasta com um servidor HTTP (ex.: python3 -m http.server).`));
    return;
  }
  initShell();
  window.addEventListener('hashchange', route);
  route();
}

boot();
