// =====================================================================
// iptv-core.js — Supabase, Auth, State, Utils
// =====================================================================

// ── SUPABASE CONFIG ───────────────────────────────────────────────────
const SB_URL  = 'https://qzprfrbfabqczhzwwpkw.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6cHJmcmJmYWJxY3poend3cGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NTE0NDksImV4cCI6MjA4OTUyNzQ0OX0.vOz4XkqRP_BKn69YowDSV4aC5JiTRQQNoCqdFxnexwQ';

let SB_TOKEN      = '';
let currentUser   = null;
let currentTenant = null;
let _refreshTimer = null;
let _autoStatusTimer = null;

function getHeaders(isWrite = false) {
  const token = SB_TOKEN || SB_ANON;
  const h = { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + token };
  if (isWrite) { h['Content-Type'] = 'application/json'; h['Prefer'] = 'return=representation'; }
  return h;
}

// ── JWT REFRESH ───────────────────────────────────────────────────────
function scheduleRefresh(expiresIn = 3600) {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  const delay = Math.max((expiresIn - 120) * 1000, 30_000);
  _refreshTimer = setTimeout(async () => {
    try { await refreshToken(); } catch(e) { console.warn('Refresh falhou:', e); }
  }, delay);
}

async function refreshToken() {
  const refresh = localStorage.getItem('iptv_refresh');
  if (!refresh) return false;
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'apikey': SB_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh })
  });
  if (!r.ok) { doLogout(); return false; }
  const d = await r.json();
  SB_TOKEN = d.access_token;
  localStorage.setItem('iptv_token',   d.access_token);
  localStorage.setItem('iptv_refresh', d.refresh_token);
  scheduleRefresh(d.expires_in || 3600);
  return true;
}

// ── SUPABASE CRUD ─────────────────────────────────────────────────────
async function sbFetch(fn) {
  try {
    return await fn();
  } catch(e) {
    if (e.message && (e.message.includes('JWT expired') || e.message.includes('PGRST303'))) {
      const ok = await refreshToken();
      if (ok) return await fn();
      else throw new Error('Sessão expirada. Faça login novamente.');
    }
    throw e;
  }
}

async function sbGet(table, query = '') {
  return sbFetch(async () => {
    const r = await fetch(`${SB_URL}/rest/v1/${table}${query}`, { headers: getHeaders() });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  });
}
async function sbPost(table, data) {
  return sbFetch(async () => {
    const r = await fetch(`${SB_URL}/rest/v1/${table}`, { method: 'POST', headers: getHeaders(true), body: JSON.stringify(data) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  });
}
async function sbPatch(table, id, data) {
  return sbFetch(async () => {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'PATCH', headers: getHeaders(true), body: JSON.stringify(data) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  });
}
async function sbDelete(table, id) {
  return sbFetch(async () => {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'DELETE', headers: getHeaders() });
    if (!r.ok) throw new Error(await r.text());
    return true;
  });
}

// ── STATE ─────────────────────────────────────────────────────────────
let clients      = [];
let planos       = [];
let pagamentos   = [];
let cfg          = {};
let notifs       = [];
let custos       = [];
let editId       = null;
let renovId      = null;
let searchTerm   = '';
let filterChip   = 'todos';
let isDark       = true;
let csvData      = [];
let editingPlanId = null;

// Paginação
let pgPage      = 1, pgPerPage    = 20;
let pagPgtoPage = 1, pagPgtoPerPage = 20;

const AVAT_COLS = [
  'linear-gradient(135deg,#00d4ff,#7b2fff)',
  'linear-gradient(135deg,#ff2d78,#7b2fff)',
  'linear-gradient(135deg,#00cc6a,#00d4ff)',
  'linear-gradient(135deg,#f0b800,#ff2d78)',
  'linear-gradient(135deg,#7b2fff,#ff2d78)',
  'linear-gradient(135deg,#00d4ff,#00cc6a)'
];

// FIX: trial adicionado ao STATUS_MAP
const STATUS_MAP = {
  ativo:     { l: 'Ativo',     c: 'badge-active',   d: '#00cc6a' },
  trial:     { l: 'Trial',     c: 'badge-trial',    d: '#00d4ff' },
  vencido:   { l: 'Vencido',   c: 'badge-inactive', d: '#ff2d78' },
  suspenso:  { l: 'Suspenso',  c: 'badge-pending',  d: '#f0b800' },
  cancelado: { l: 'Cancelado', c: 'badge-blocked',  d: '#7b2fff' },
};

// ── UTILS ─────────────────────────────────────────────────────────────
const initials     = n => n.split(' ').slice(0, 2).map(x => x[0]).join('').toUpperCase();
const getDL        = e => Math.round((new Date(e) - new Date()) / 864e5);
const exClass      = d => d < 0 ? 'expiry-over' : d <= 7 ? 'expiry-warn' : 'expiry-ok';
const exColor      = d => d < 0 ? '#ff2d78' : d <= 7 ? '#f0b800' : '#00cc6a';
const getServerCfg = () => ({ url: cfg.servidor_url || 'http://servidor.com', port: cfg.servidor_porta || '8080', pfx: cfg.servidor_prefixo || '/get.php?username=' });
const buildM3U     = c => { const s = getServerCfg(); return `${s.url}:${s.port}${s.pfx}${c.usuario_iptv}&password=${c.senha_iptv}&type=m3u_plus&output=ts`; };
const buildEPG     = c => { const s = getServerCfg(); return `${s.url}:${s.port}/xmltv.php?username=${c.usuario_iptv}&password=${c.senha_iptv}`; };
const fmtBRL       = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtBRLk      = v => v >= 1000 ? 'R$' + (v / 1000).toFixed(1) + 'k' : fmtBRL(v);

// Debounce genérico
function debounce(fn, ms = 220) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── AUTH ──────────────────────────────────────────────────────────────
async function doOAuth(provider) {
  const redirectTo = 'https://gestoriptvpro.vercel.app';
  window.location.href = `${SB_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}`;
}

async function checkOAuthCallback() {
  const hash = window.location.hash;
  if (!hash.includes('access_token')) return false;
  const params    = new URLSearchParams(hash.substring(1));
  const token     = params.get('access_token');
  const refresh   = params.get('refresh_token');
  const expiresIn = params.get('expires_in');
  if (!token) return false;
  try {
    SB_TOKEN = token;
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + token } });
    if (!r.ok) return false;
    currentUser = await r.json();
    localStorage.setItem('iptv_token',   token);
    if (refresh) localStorage.setItem('iptv_refresh', refresh);
    scheduleRefresh(+expiresIn || 3600);
    history.replaceState(null, '', window.location.pathname);
    return true;
  } catch(e) { return false; }
}

async function doLogin() {
  const email = document.getElementById('lEmail').value.trim();
  const senha = document.getElementById('lSenha').value;
  const msg   = document.getElementById('loginMsg');
  if (!email || !senha) { msg.className = 'auth-msg err'; msg.textContent = 'Preencha email e senha.'; return; }
  setBtnLoad('btnLogin', true, 'ENTRANDO...');
  msg.textContent = '';
  try {
    const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { 'apikey': SB_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error_description || d.msg || 'Erro ao entrar');
    SB_TOKEN    = d.access_token;
    currentUser = d.user;
    localStorage.setItem('iptv_token',   d.access_token);
    localStorage.setItem('iptv_refresh', d.refresh_token);
    scheduleRefresh(d.expires_in || 3600);
    await afterLogin();
  } catch(e) {
    msg.className = 'auth-msg err';
    msg.textContent = e.message.includes('Invalid login') ? 'Email ou senha inválidos.' : e.message;
  } finally { setBtnLoad('btnLogin', false, 'ENTRAR'); }
}

async function doRegister() {
  const nome   = document.getElementById('rNome').value.trim();
  const email  = document.getElementById('rEmail').value.trim();
  const tel    = document.getElementById('rTelefone')?.value?.trim() || '';
  const senha  = document.getElementById('rSenha').value;
  const senhaC = document.getElementById('rSenhaConf').value;
  const termos = document.getElementById('rTermos')?.checked;
  const msg    = document.getElementById('registerMsg');

  msg.className = 'auth-msg err'; msg.textContent = '';
  if (!nome)                                         { msg.textContent = '⚠️ Informe seu nome.'; return; }
  if (!email)                                        { msg.textContent = '⚠️ Informe seu email.'; return; }
  if (!tel || tel.replace(/\D/g,'').length < 10)    { msg.textContent = '⚠️ Informe um telefone válido.'; return; }
  if (!senha || senha.length < 6)                    { msg.textContent = '⚠️ Senha com mínimo 6 caracteres.'; return; }
  if (senha !== senhaC)                              { msg.textContent = '⚠️ As senhas não coincidem.'; return; }
  if (!termos)                                       { msg.textContent = '⚠️ Aceite os Termos de Uso para continuar.'; return; }

  setBtnLoad('btnRegister', true, 'CRIANDO CONTA...');
  msg.textContent = '';
  try {
    const r = await fetch(`${SB_URL}/auth/v1/signup`, {
      method: 'POST', headers: { 'apikey': SB_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha, data: { nome, telefone: tel } })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error_description || d.msg || 'Erro ao criar conta');
    if (d.access_token) {
      SB_TOKEN    = d.access_token;
      currentUser = d.user;
      localStorage.setItem('iptv_token',   d.access_token);
      localStorage.setItem('iptv_refresh', d.refresh_token);
      scheduleRefresh(d.expires_in || 3600);
      await afterLogin();
    } else {
      msg.className = 'auth-msg ok';
      msg.textContent = '✅ Conta criada! Verifique seu email para confirmar.';
    }
  } catch(e) {
    msg.className = 'auth-msg err';
    msg.textContent = e.message.includes('already registered') ? '⚠️ Email já cadastrado.' : e.message;
  } finally { setBtnLoad('btnRegister', false, 'CRIAR CONTA GRÁTIS'); }
}

async function tryAutoLogin() {
  const token   = localStorage.getItem('iptv_token');
  const refresh = localStorage.getItem('iptv_refresh');
  if (!token) return false;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + token } });
    if (r.ok) { SB_TOKEN = token; currentUser = await r.json(); return true; }
    if (refresh) {
      const r2 = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: { 'apikey': SB_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh })
      });
      if (r2.ok) {
        const d = await r2.json();
        SB_TOKEN = d.access_token; currentUser = d.user;
        localStorage.setItem('iptv_token',   d.access_token);
        localStorage.setItem('iptv_refresh', d.refresh_token);
        scheduleRefresh(d.expires_in || 3600);
        return true;
      }
    }
  } catch(e) {}
  return false;
}

async function afterLogin() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('mainApp').style.display = '';
  document.getElementById('sidebar').classList.add('ready');
  try {
    const tenants = await sbGet('tenants', `?user_id=eq.${currentUser.id}&limit=1`);
    currentTenant = tenants[0] || null;
  } catch(e) {}
  updateUserUI();
  showTrialBanner();
  // Detectar preferência do sistema para tema
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    isDark = false;
    document.documentElement.setAttribute('data-theme', 'light');
    document.getElementById('themeBtn').textContent = '☀️';
  }
  await reloadAll();
  setTimeout(() => waLoadStats(), 2000);
  // Auto-refresh de status a cada 60 minutos
  if (_autoStatusTimer) clearInterval(_autoStatusTimer);
  _autoStatusTimer = setInterval(async () => {
    if (currentUser) { await autoAtualizarVencidos(); renderTableClientes(); renderTable('tDash'); }
  }, 60 * 60 * 1000);
}

function doLogout() {
  confirm2('🚪', 'Sair do sistema?', 'Você precisará fazer login novamente.', 'btn-danger', 'Sair', () => {
    if (_autoStatusTimer) clearInterval(_autoStatusTimer);
    localStorage.removeItem('iptv_token');
    localStorage.removeItem('iptv_refresh');
    SB_TOKEN = ''; currentUser = null; currentTenant = null;
    clients = []; planos = []; pagamentos = []; cfg = {};
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('trialBanner').classList.remove('show');
    document.getElementById('lEmail').value = '';
    document.getElementById('lSenha').value = '';
  });
}

function authTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  if (tab === 'login')    document.querySelector('.auth-tab:first-child')?.classList.add('active');
  else if (tab === 'register') document.querySelector('.auth-tab:last-child')?.classList.add('active');
  const formId = tab === 'login' ? 'fLogin' : tab === 'register' ? 'fRegister' : 'fRecovery';
  document.getElementById(formId)?.classList.add('active');
}

async function doRecovery() {
  const email = document.getElementById('recEmail').value.trim();
  const msg   = document.getElementById('recoveryMsg');
  msg.className = 'auth-msg err'; msg.textContent = '';
  if (!email) { msg.textContent = '⚠️ Informe seu email.'; return; }
  setBtnLoad('btnRecovery', true, 'ENVIANDO...');
  try {
    const r = await fetch(`${SB_URL}/auth/v1/recover`, {
      method: 'POST', headers: { 'apikey': SB_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error_description || d.msg || 'Erro ao enviar email.'); }
    msg.className = 'auth-msg ok';
    msg.textContent = '✅ Link enviado! Verifique sua caixa de entrada (e o spam).';
    document.getElementById('recEmail').value = '';
  } catch(e) { msg.textContent = e.message; }
  finally { setBtnLoad('btnRecovery', false, '📧 ENVIAR LINK DE RECUPERAÇÃO'); }
}

// ── AUTH HELPERS ──────────────────────────────────────────────────────
function fmtTelReg(el) {
  let v = el.value.replace(/\D/g,'');
  if (v.length > 11) v = v.slice(0,11);
  if (v.length > 10) v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  else if (v.length > 6) v = v.replace(/^(\d{2})(\d{4})(\d*)$/, '($1) $2-$3');
  else if (v.length > 2) v = v.replace(/^(\d{2})(\d*)$/, '($1) $2');
  el.value = v;
}

function togglePassVis(inputId, eyeId) {
  const inp = document.getElementById(inputId);
  const eye = document.getElementById(eyeId);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (eye) eye.textContent = inp.type === 'text' ? '🙈' : '👁️';
}

function checkSenhaForce() {
  const val = document.getElementById('rSenha')?.value || '';
  const bar = document.getElementById('senhaForceBar');
  const txt = document.getElementById('senhaForceTxt');
  let score = 0;
  if (val.length >= 6)             score++;
  if (val.length >= 10)            score++;
  if (/[A-Z]/.test(val))          score++;
  if (/[0-9]/.test(val))          score++;
  if (/[^A-Za-z0-9]/.test(val))   score++;
  const levels = [
    { pct: 0,   color: '',         label: '' },
    { pct: 20,  color: '#ff2d78',  label: 'Muito fraca' },
    { pct: 40,  color: '#f0b800',  label: 'Fraca' },
    { pct: 60,  color: '#00bfb3',  label: 'Média' },
    { pct: 80,  color: '#00d4ff',  label: 'Forte' },
    { pct: 100, color: '#00cc6a',  label: 'Muito forte 💪' },
  ];
  const lv = levels[Math.min(score, 5)];
  if (bar) { bar.style.width = lv.pct + '%'; bar.style.background = lv.color; }
  if (txt) { txt.textContent = lv.label; txt.style.color = lv.color; }
  checkSenhaMatch();
}

function checkSenhaMatch() {
  const s1 = document.getElementById('rSenha')?.value || '';
  const s2 = document.getElementById('rSenhaConf')?.value || '';
  const el = document.getElementById('senhaMatchTxt');
  if (!el || !s2) { if (el) el.textContent = ''; return; }
  if (s1 === s2) { el.textContent = '✅ Senhas coincidem';     el.style.color = 'var(--green)'; }
  else           { el.textContent = '❌ Senhas não coincidem'; el.style.color = 'var(--accent3)'; }
}

function fmtCpf(el) {
  let v = el.value.replace(/\D/g,'').substring(0,11);
  v = v.replace(/(\d{3})(\d)/,   '$1.$2');
  v = v.replace(/(\d{3})(\d)/,   '$1.$2');
  v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  el.value = v;
}

function showTermos() {
  let m = document.getElementById('mTermos');
  if (m) { m.classList.add('open'); return; }
  m = document.createElement('div');
  m.id = 'mTermos'; m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal" style="width:560px;max-height:80vh;overflow-y:auto">
      <button class="modal-close" onclick="closeModal('mTermos')">✕</button>
      <div class="modal-title">📄 TERMOS DE USO & POLÍTICA DE PRIVACIDADE</div>
      <div style="font-size:12px;line-height:1.8;color:var(--muted)">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px">1. Aceitação dos Termos</div>
        <p style="margin-bottom:12px">Ao criar uma conta no IPTV PRO, você concorda com estes Termos de Uso.</p>
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px">2. Uso do Serviço</div>
        <p style="margin-bottom:12px">O IPTV PRO é uma plataforma de gestão para revendedores. É proibido compartilhar acesso com terceiros não autorizados.</p>
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px">3. Dados Pessoais</div>
        <p style="margin-bottom:12px">Coletamos apenas nome, email e telefone. Seus dados não são compartilhados sem consentimento.</p>
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px">4. Pagamentos e Assinatura</div>
        <p style="margin-bottom:12px">Trial de 7 dias gratuitos. Após, é necessário contratar um plano. Não há reembolso de períodos utilizados.</p>
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px">5. Cancelamento</div>
        <p style="margin-bottom:12px">Você pode cancelar a qualquer momento. Sem reembolso de períodos já pagos.</p>
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px">6. Limitação de Responsabilidade</div>
        <p>O IPTV PRO não se responsabiliza por perdas causadas por uso indevido ou falhas de terceiros.</p>
      </div>
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-ghost" onclick="closeModal('mTermos')">Fechar</button>
        <button class="btn btn-primary" onclick="aceitarTermos()">✅ Aceitar e Fechar</button>
      </div>
    </div>`;
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
  document.body.appendChild(m);
  m.classList.add('open');
}

function aceitarTermos() {
  const cb = document.getElementById('rTermos');
  if (cb) cb.checked = true;
  closeModal('mTermos');
  toast('✅ Termos aceitos!', 'success', 2000);
}

// ── AUTO-STATUS VENCIDOS ──────────────────────────────────────────────
async function autoAtualizarVencidos() {
  const vencidos = clients.filter(c =>
    (c.status === 'ativo' || c.status === 'trial') &&
    c.data_vencimento && getDL(c.data_vencimento) < 0
  );
  if (!vencidos.length) return;
  await Promise.allSettled(vencidos.map(c =>
    sbPatch('clientes', c.id, { status: 'vencido', updated_at: new Date().toISOString() })
  ));
  vencidos.forEach(c => { c.status = 'vencido'; });
}

// ── RELOAD ALL ────────────────────────────────────────────────────────
async function reloadAll() {
  if (!currentUser) return;
  try {
    const [planosData, cfgData, clientesData, pagamentosData] = await Promise.all([
      sbGet('planos',          `?user_id=eq.${currentUser.id}&ativo=eq.true&order=preco.asc`),
      sbGet('configuracoes',   `?user_id=eq.${currentUser.id}&limit=1`),
      sbGet('clientes_resumo', `?user_id=eq.${currentUser.id}&order=data_vencimento.asc`),
      sbGet('pagamentos',      `?user_id=eq.${currentUser.id}&order=created_at.desc`)
    ]);
    planos     = planosData;
    if (cfgData?.[0]) cfg = cfgData[0];
    clients    = clientesData;
    pagamentos = pagamentosData;

    await autoAtualizarVencidos();
    populatePlanSelects();
    buildChips('chipsDash'); buildChips('chipsClientes');
    renderTable('tDash'); renderTableClientes();
    renderChart1(); renderDonut(); buildNotifications(); updateAlertBadge();
    renderAssinatura();
    if (document.getElementById('page-forecast')?.classList.contains('active')) fcRenderAll();

    // Dashboard stats
    const total  = clients.length;
    const ativos = clients.filter(c => c.status === 'ativo').length;
    const trial  = clients.filter(c => c.status === 'trial').length;
    const v7     = clients.filter(c => { const d = getDL(c.data_vencimento); return d >= 0 && d <= 7; }).length;

    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('sTotal',     total);
    el('sAtivos',    ativos);
    el('navTotal',   total);
    document.getElementById('sAtivosLbl').innerHTML = `▲ ${ativos} ativo${ativos !== 1 ? 's' : ''}`;
    document.getElementById('sAtivoPct').textContent = `${total > 0 ? Math.round(ativos / total * 100) : 0}% do total`;
    document.getElementById('sTrialLbl').textContent = `▲ ${trial} em trial`;
    document.getElementById('sTrialPill').textContent = `${trial} trial`;

    // Receita estimada
    const rec = clients.filter(c => c.status === 'ativo').reduce((s, c) => {
      const p = planos.find(pl => pl.id === c.plano_id); return s + (p?.preco || 0);
    }, 0);
    el('sReceita', 'R$' + rec.toLocaleString('pt-BR'));

    // Recebido real no mês + Pendente + Saldo Acumulado
    try {
      const hoje     = new Date();
      const mesInicio = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-01`;
      const mesFim    = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).toISOString().split('T')[0];
      const pgtosMes  = await sbGet('pagamentos', `?user_id=eq.${currentUser.id}&status=eq.pago&data_pagamento=gte.${mesInicio}&data_pagamento=lte.${mesFim}`);
      const recebido  = pgtosMes.reduce((s, p) => s + (+p.valor || 0), 0);
      const pendente  = Math.max(0, rec - recebido);
      const pct       = rec > 0 ? Math.round(recebido / rec * 100) : 100;
      el('sRecebido', 'R$' + recebido.toLocaleString('pt-BR'));
      document.getElementById('sRecebidoPill').textContent = pct + '% recebido';
      document.getElementById('sRecebidoPill').className   = `stat-pill ${pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'bad'}`;
      el('sPendente', 'R$' + pendente.toLocaleString('pt-BR'));
      document.getElementById('sPendenteLbl').textContent  = pendente === 0 ? '✅ sem pendências' : 'estimado − recebido';
      document.getElementById('sPendenteLbl').className    = `stat-change ${pendente === 0 ? 'up' : 'down'}`;
      document.getElementById('sPendentePill').textContent = pendente === 0 ? 'tudo recebido' : `R$${pendente} em aberto`;
      document.getElementById('sPendentePill').className   = `stat-pill ${pendente === 0 ? 'ok' : pendente < rec * 0.3 ? 'warn' : 'bad'}`;

      // Saldo acumulado histórico
      const [todosP, todosC] = await Promise.all([
        sbGet('pagamentos', `?user_id=eq.${currentUser.id}&status=eq.pago&select=valor`),
        sbGet('custos',     `?user_id=eq.${currentUser.id}&select=valor`).catch(() => [])
      ]);
      const saldoAcum = todosP.reduce((s,p) => s+(+p.valor||0), 0) - todosC.reduce((s,c) => s+(+c.valor||0), 0);
      const saEl = document.getElementById('sSaldoAcum');
      if (saEl) { saEl.textContent = (saldoAcum<0?'-':'') + 'R$' + Math.abs(saldoAcum).toLocaleString('pt-BR'); saEl.style.color = saldoAcum >= 0 ? '#00bfb3' : 'var(--accent3)'; }
      const saLbl = document.getElementById('sSaldoAcumLbl');
      if (saLbl) { saLbl.textContent = saldoAcum >= 0 ? '✅ saldo positivo' : '❌ saldo negativo'; saLbl.className = `stat-change ${saldoAcum>=0?'up':'down'}`; }
      const saPill = document.getElementById('sSaldoAcumPill');
      if (saPill) saPill.textContent = `${todosP.length} pgtos registrados`;
    } catch(e) { el('sRecebido','—'); el('sPendente','—'); }

    let al = '';
    if (v7 > 0) al += `<div class="alert-item alert-warn">⏰ <span><strong>${v7}</strong> vencendo em 7 dias</span><button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="goPage('alertas',null)">Ver</button></div>`;
    document.getElementById('alertsDash').innerHTML = al;
    loadActivity().catch(() => {});
    setDbStatus(true);
  } catch(e) {
    console.error('reloadAll:', e);
    setDbStatus(false);
    toast('Erro ao carregar: ' + e.message, 'error', 4000);
  }
}

// ── INIT ──────────────────────────────────────────────────────────────
async function init() {
  const loadEl = document.getElementById('appLoading');
  const msgEl  = document.getElementById('loadMsg');
  try {
    if (msgEl) msgEl.textContent = 'VERIFICANDO SESSÃO...';
    const fromOAuth = await checkOAuthCallback();
    const logged    = fromOAuth || await tryAutoLogin();
    setTimeout(() => { if (loadEl) loadEl.classList.add('gone'); }, 800);
    if (logged) {
      document.getElementById('authScreen').classList.add('hidden');
      document.getElementById('mainApp').style.display = '';
      document.getElementById('sidebar').classList.add('ready');
      try {
        const tenants = await sbGet('tenants', `?user_id=eq.${currentUser.id}&limit=1`);
        currentTenant = tenants[0] || null;
      } catch(e) {}
      updateUserUI();
      showTrialBanner();
      if (msgEl) msgEl.textContent = 'CARREGANDO DADOS...';
      await reloadAll();
      // Auto-refresh status a cada 60 min
      if (_autoStatusTimer) clearInterval(_autoStatusTimer);
      _autoStatusTimer = setInterval(async () => {
        if (currentUser) { await autoAtualizarVencidos(); renderTableClientes(); renderTable('tDash'); }
      }, 60 * 60 * 1000);
    } else {
      document.getElementById('authScreen').classList.remove('hidden');
    }
  } catch(e) {
    console.error('Init error:', e);
    if (loadEl) loadEl.classList.add('gone');
    document.getElementById('authScreen').classList.remove('hidden');
  }
}
