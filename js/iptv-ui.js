// =====================================================================
// iptv-ui.js — UI: theme, sidebar, modals, toast, notifs, perfil, charts
// =====================================================================

// ── TOAST ─────────────────────────────────────────────────────────────
function toast(msg, type = 'success', dur = 3200) {
  const stack = document.getElementById('toastStack');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`; t.textContent = msg;
  stack.appendChild(t);
  setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 300); }, dur);
}

// ── MODAL ─────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function switchTab(tabId, el) {
  const modal = el.closest('.modal');
  modal.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  el.classList.add('active'); document.getElementById(tabId).classList.add('active');
}

function confirm2(icon, msg, sub, btnCls, btnTxt, cb) {
  document.getElementById('cfIcon').textContent = icon;
  document.getElementById('cfMsg').textContent  = msg;
  document.getElementById('cfSub').textContent  = sub;
  const btn = document.getElementById('cfBtn');
  btn.className = `btn ${btnCls}`; btn.textContent = btnTxt;
  btn.onclick = () => { closeModal('mConfirm'); cb(); };
  openModal('mConfirm');
}

// ── BUTTONS ───────────────────────────────────────────────────────────
function setBtnLoad(id, loading, txt) {
  const btn = document.getElementById(id); if (!btn) return;
  btn.disabled = loading;
  if (loading) { btn.dataset.orig = btn.innerHTML; btn.innerHTML = txt || '<div class="spinner" style="margin:0 auto"></div>'; }
  else { btn.innerHTML = btn.dataset.orig || txt || btn.innerHTML; }
}
function setBtnLoading(id, loading) { setBtnLoad(id, loading); }

// ── COPY BOX ──────────────────────────────────────────────────────────
function cpBox(id) {
  const txt = document.getElementById(id).textContent;
  navigator.clipboard.writeText(txt).then(() => toast('Copiado! ✓', 'info')).catch(() => {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Copiado! ✓', 'info');
  });
}

// ── THEME & SIDEBAR ───────────────────────────────────────────────────
function toggleTheme() {
  isDark = !isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.getElementById('themeBtn').textContent = isDark ? '🌙' : '☀️';
  setTimeout(() => { renderChart1(); renderDonut(); fcRenderChart(); }, 60);
}
function toggleSb() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sbOverlay').classList.toggle('active');
}
function closeSb() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sbOverlay').classList.remove('active');
}

// ── PAGES ─────────────────────────────────────────────────────────────
function goPage(id, navEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (navEl) { document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); navEl.classList.add('active'); }
  const titles = {
    dashboard: 'DASHBOARD', clientes: 'CLIENTES', planos: 'PLANOS',
    financeiro: 'PAGAMENTOS', fluxo: '📊 FLUXO DE CAIXA',
    forecast: '📈 FORECAST', alertas: 'ALERTAS', config: 'CONFIGURAÇÕES'
  };
  document.getElementById('pageTitle').textContent = titles[id] || id.toUpperCase();
  if (id === 'planos')    renderPlanos();
  if (id === 'financeiro') loadPagamentos();
  if (id === 'fluxo')     loadFluxoCaixa();
  if (id === 'alertas')   renderAlertas();
  if (id === 'config')    { renderConfig(); loadConfig(); }
  if (id === 'clientes')  { pgPage = 1; renderTableClientes(); }
  if (id === 'forecast')  { reloadAll().then(() => fcRenderAll()); return; }
  closeSb();
}

// ── DB STATUS ─────────────────────────────────────────────────────────
function setDbStatus(ok) {
  document.getElementById('dbDot').className  = 'db-dot ' + (ok ? 'ok' : 'err');
  document.getElementById('dbTxt').textContent = ok ? 'Online' : 'Erro';
}

// ── USER UI ───────────────────────────────────────────────────────────
function updateUserUI() {
  const nome     = currentTenant?.nome || currentUser?.email?.split('@')[0] || 'Usuário';
  const initStr  = initials(nome);
  const el = id => document.getElementById(id);

  if (el('sfAv'))   el('sfAv').textContent   = initStr;
  if (el('sfNome')) el('sfNome').textContent  = nome;

  const plano  = (currentTenant?.plano_sistema || 'TRIAL').toUpperCase();
  const vencTenant = currentTenant?.data_expiracao
    ? new Date(currentTenant.data_expiracao).toLocaleDateString('pt-BR') : '—';
  const since = currentUser?.created_at
    ? new Date(currentUser.created_at).toLocaleDateString('pt-BR') : '—';

  const ci = el('contaInfo');
  if (ci) ci.innerHTML = `
    <div style="margin-bottom:6px"><strong>Email:</strong> ${currentUser?.email || '—'}</div>
    <div style="margin-bottom:6px"><strong>Plano:</strong> <span style="color:var(--accent)">${plano}</span></div>
    <div><strong>Expira:</strong> ${vencTenant}</div>`;

  renderWelcome();
  renderAssinatura();
}

function renderWelcome() {
  const nome      = currentTenant?.nome || currentUser?.email?.split('@')[0] || 'Usuário';
  const firstName = nome.split(' ')[0];
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? '☀️ Bom dia' : hour < 18 ? '🌤️ Boa tarde' : '🌙 Boa noite';
  const bar = document.getElementById('welcomeBar');
  if (bar) bar.querySelector('.welcome-greeting').innerHTML = `${greeting}, <span class="hi">${firstName}</span>!`;

  const dias  = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const now   = new Date();
  const wDate = document.getElementById('wDate');
  if (wDate) wDate.textContent = `${dias[now.getDay()]}, ${now.getDate()} de ${meses[now.getMonth()]} de ${now.getFullYear()}`;

  const plano     = (currentTenant?.plano_sistema || 'TRIAL').toUpperCase();
  const wPlanName = document.getElementById('wPlanName');
  if (wPlanName) wPlanName.textContent = '● ' + plano + ' — Ativo';

  if (currentTenant?.data_expiracao) {
    const dl   = Math.ceil((new Date(currentTenant.data_expiracao) - new Date()) / 86400000);
    const warn = document.getElementById('wExpiryWarn');
    const wTxt = document.getElementById('wExpiryTxt');
    if (warn && wTxt && dl <= 7) {
      warn.style.display = 'flex';
      wTxt.textContent   = dl <= 0 ? 'Assinatura vencida! Clique para renovar' : `Vence em ${dl} dia(s) — Clique para renovar`;
    }
  }
}

function renderAssinatura() {
  const plano = (currentTenant?.plano_sistema || 'TRIAL').toUpperCase();
  const el    = id => document.getElementById(id);
  if (el('assPlanName')) el('assPlanName').textContent = '📋 Plano ' + plano;
  if (currentTenant?.data_expiracao) {
    const dl  = Math.ceil((new Date(currentTenant.data_expiracao) - new Date()) / 86400000);
    const dt  = new Date(currentTenant.data_expiracao).toLocaleDateString('pt-BR');
    if (el('assVenc')) el('assVenc').textContent = dt;
    if (el('assDias')) {
      el('assDias').textContent  = dl <= 0 ? 'VENCIDO' : dl + 'd';
      el('assDias').style.color  = dl <= 0 ? 'var(--accent3)' : dl <= 7 ? 'var(--yellow)' : 'var(--green)';
    }
    if (el('assStatus')) {
      if      (dl <= 0) { el('assStatus').className = 'assinatura-status exp';  el('assStatus').innerHTML = '<span>● VENCIDO</span>'; }
      else if (dl <= 7) { el('assStatus').className = 'assinatura-status warn'; el('assStatus').innerHTML = '<span>⚠️ VENCENDO</span>'; }
      else              { el('assStatus').className = 'assinatura-status ok';   el('assStatus').innerHTML = '<span>● ATIVO</span>'; }
    }
  }
  const ativos = clients.filter(c => c.status === 'ativo').length;
  if (el('assClientes')) el('assClientes').textContent = ativos;
}

function showTrialBanner() {
  if (!currentTenant || currentTenant.plano_sistema !== 'trial') return;
  const days = Math.ceil((new Date(currentTenant.data_expiracao) - new Date()) / 86400000);
  if (days > 0) {
    document.getElementById('trialDays').textContent = days;
    document.getElementById('trialBanner').classList.add('show');
  }
}

// ── EDITAR PERFIL ─────────────────────────────────────────────────────
function openEditPerfil() {
  const nome    = currentTenant?.nome || currentUser?.user_metadata?.nome || currentUser?.email?.split('@')[0] || '';
  const email   = currentUser?.email || '';
  const tel     = currentTenant?.telefone || currentUser?.user_metadata?.telefone || '';
  const empresa = currentTenant?.empresa  || currentTenant?.nome_empresa || currentUser?.user_metadata?.empresa || '';
  const plano   = (currentTenant?.plano_sistema || 'TRIAL').toUpperCase();
  const venc    = currentTenant?.data_expiracao ? currentTenant.data_expiracao.split('T')[0] : '—';
  const initStr = initials(nome || email);

  document.getElementById('epAvatar').textContent    = initStr;
  document.getElementById('epNomeDisplay').textContent = nome || '—';
  document.getElementById('epEmailDisplay').textContent = email;
  document.getElementById('epPlano').textContent     = plano;
  document.getElementById('epVenc').textContent      = venc;
  document.getElementById('epNome').value            = nome;
  document.getElementById('epEmail').value           = email;
  document.getElementById('epTelefone').value        = tel;
  document.getElementById('epEmpresa').value         = empresa;
  document.getElementById('epSenha').value           = '';
  document.getElementById('epSenhaConf').value       = '';
  openModal('mEditPerfil');
}

async function savePerfil() {
  const nome    = document.getElementById('epNome').value.trim();
  const email   = document.getElementById('epEmail').value.trim();
  const tel     = document.getElementById('epTelefone').value.trim();
  const empresa = document.getElementById('epEmpresa').value.trim();
  const senha   = document.getElementById('epSenha').value;
  const senhaC  = document.getElementById('epSenhaConf').value;

  if (!nome)  { toast('⚠️ Informe seu nome.', 'warn'); return; }
  if (!email) { toast('⚠️ Informe seu email.', 'warn'); return; }
  if (senha && senha.length < 6) { toast('⚠️ Senha mínimo 6 caracteres.', 'warn'); return; }
  if (senha && senha !== senhaC) { toast('⚠️ Senhas não coincidem.', 'warn'); return; }

  setBtnLoad('btnSavePerfil', true, 'Salvando...');
  try {
    const authPayload = { data: { nome, telefone: tel, empresa } };
    if (email !== currentUser.email) authPayload.email = email;
    if (senha) authPayload.password = senha;

    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + SB_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(authPayload)
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error_description || d.msg || 'Erro ao salvar.');
    currentUser = { ...currentUser, ...d };

    if (currentTenant?.id) {
      await sbPatch('tenants', currentTenant.id, {
        nome, telefone: tel, nome_empresa: empresa, updated_at: new Date().toISOString()
      }).catch(() => {});
      if (currentTenant) { currentTenant.nome = nome; currentTenant.telefone = tel; currentTenant.nome_empresa = empresa; }
    }
    updateUserUI();
    closeModal('mEditPerfil');
    toast(email !== currentUser.email ? '✅ Dados salvos! Confirme o novo email.' : '✅ Perfil atualizado!', 'success', 5000);
  } catch(e) {
    toast('Erro: ' + e.message, 'error', 5000);
  } finally { setBtnLoad('btnSavePerfil', false, '💾 Salvar Alterações'); }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────
function toggleNotif() { document.getElementById('notifPanel').classList.toggle('open'); }

function buildNotifications() {
  notifs = [];
  clients.filter(c => { const d = getDL(c.data_vencimento); return d >= 0 && d <= 7; })
    .forEach(c => notifs.push({ icon: '⏰', text: `<strong>${c.nome}</strong> vence em ${getDL(c.data_vencimento)}d`, time: 'agora', unread: true, id: c.id }));
  clients.filter(c => c.status === 'suspenso')
    .forEach(c => notifs.push({ icon: '⏸️', text: `<strong>${c.nome}</strong> suspenso`, time: 'agora', unread: false, id: c.id }));
  renderNotifPanel();
}

function renderNotifPanel() {
  const list = document.getElementById('notifList');
  if (!notifs.length) { list.innerHTML = '<div class="empty-state" style="padding:16px"><div class="e-ico">✅</div><p>Sem notificações</p></div>'; return; }
  list.innerHTML = notifs.map((n, i) => `
    <div class="notif-item${n.unread ? ' unread' : ''}" onclick="notifClick(${i})">
      <div style="font-size:16px;flex-shrink:0">${n.icon}</div>
      <div><div class="notif-text">${n.text}</div><div class="notif-time">${n.time}</div></div>
    </div>`).join('');
  const unread = notifs.filter(n => n.unread).length;
  document.getElementById('notifDot').style.display = unread ? 'block' : 'none';
}

function markRead()       { notifs.forEach(n => n.unread = false); renderNotifPanel(); }
function notifClick(i)    { notifs[i].unread = false; renderNotifPanel(); if (notifs[i].id) openDetail(notifs[i].id); document.getElementById('notifPanel').classList.remove('open'); }

function updateAlertBadge() {
  const days  = +(cfg.notif_vencimento_dias || 7);
  const count = clients.filter(c => { const d = getDL(c.data_vencimento); return d >= 0 && d <= days; }).length
              + clients.filter(c => c.status === 'suspenso').length;
  const nb = document.getElementById('navAlerts');
  if (nb) nb.textContent = count || '';
}

// ── ACTIVITY ──────────────────────────────────────────────────────────
async function loadActivity() {
  try {
    const hist = await sbGet('historico_clientes', `?user_id=eq.${currentUser.id}&order=created_at.desc&limit=6`);
    const AC   = { Cadastro:'#00cc6a', Renovação:'#00d4ff', Edição:'#f0b800', Bloqueio:'#ff2d78', Desbloqueio:'#7b2fff', Telegram:'#29b6f6' };
    document.getElementById('actList').innerHTML = hist.map(h => {
      const clienteLocal = clients.find(c => c.id === h.cliente_id);
      const nome = clienteLocal?.nome || 'Cliente';
      const cor  = AC[h.tipo] || '#00d4ff';
      const diff = Math.round((Date.now() - new Date(h.created_at)) / 60000);
      const t    = diff < 1 ? 'agora' : diff < 60 ? `há ${diff}min` : diff < 1440 ? `há ${Math.round(diff/60)}h` : `há ${Math.round(diff/1440)}d`;
      return `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid rgba(26,42,74,.4)">
        <div style="width:6px;height:6px;border-radius:50%;background:${cor};margin-top:4px;flex-shrink:0"></div>
        <div><div style="font-size:12px;line-height:1.4"><strong>${nome}</strong> — ${h.tipo}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:1px">${t}</div></div>
      </div>`;
    }).join('') || '<div class="empty-state" style="padding:14px"><p>Sem atividade</p></div>';
  } catch(e) {}
}

// ── CHARTS ────────────────────────────────────────────────────────────
function renderChart1() {
  const wrap = document.getElementById('chart1'); if (!wrap) return;
  const W = wrap.clientWidth || 340, H = 130, pL = 8, pR = 8, pT = 20, pB = 22;
  const cW = W - pL - pR, cH = H - pT - pB;
  const now = new Date();
  const meses = Array.from({ length: 7 }, (_, i) => {
    const d     = new Date(now.getFullYear(), now.getMonth() - 6 + i, 1);
    const label = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][d.getMonth()];
    const total = pagamentos.filter(p => {
      if (!p.data_pagamento || p.status !== 'pago') return false;
      const pd = new Date(p.data_pagamento);
      return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear();
    }).reduce((s, p) => s + (+p.valor || 0), 0);
    return { label, total };
  });
  const max = Math.max(...meses.map(m => m.total), 1);
  const bW  = Math.max(7, (cW / 7) * 0.62);
  const gap = (cW - bW * 7) / (7 + 1);
  let s = '';
  meses.forEach((m, i) => {
    const x = pL + gap + (bW + gap) * i, bH = (m.total / max) * cH, y = pT + cH - bH;
    const isLast = i === 6;
    s += `<rect x="${x}" y="${y}" width="${bW}" height="${bH}" rx="2"
      fill="${isLast ? 'url(#g1)' : 'rgba(0,212,255,0.18)'}" style="cursor:pointer"
      onmouseenter="showTip(event,'ct1','${m.label}',${m.total})"
      onmouseleave="hideTip('ct1')"/>
    ${bH > 14 ? `<text x="${x+bW/2}" y="${y-3}" text-anchor="middle" style="font-family:Rajdhani,sans-serif;font-size:8.5px;fill:var(--accent);font-weight:600">${m.total > 0 ? 'R$'+Math.round(m.total) : ''}</text>` : ''}
    <text x="${x+bW/2}" y="${H-4}" text-anchor="middle" style="font-family:Rajdhani,sans-serif;font-size:9.5px;fill:var(--muted)">${m.label}</text>`;
  });
  wrap.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">
    <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#00d4ff"/><stop offset="100%" stop-color="#7b2fff"/></linearGradient></defs>
    <line x1="${pL}" y1="${pT+cH}" x2="${W-pR}" y2="${pT+cH}" stroke="var(--border)" stroke-width="1"/>${s}
  </svg>`;
}

function renderDonut() {
  const wrap = document.getElementById('donutWrap'); if (!wrap) return;
  const pc = {}; clients.forEach(c => pc[c.plano_nome || 'Sem plano'] = (pc[c.plano_nome || 'Sem plano'] || 0) + 1);
  const segs  = Object.entries(pc).map(([n, v]) => ({ name: n, val: v }));
  const total = segs.reduce((s, x) => s + x.val, 0) || 1;
  const R = 50, r = 30, cx = 58, cy = 58;
  const cols = ['#00d4ff','#7b2fff','#00cc6a','#f0b800','#ff2d78'];
  let angle = -Math.PI / 2, paths = '';
  segs.forEach((seg, i) => {
    const a = (seg.val / total) * Math.PI * 2; if (a < 0.01) { angle += a; return; }
    const x1 = cx + R*Math.cos(angle), y1 = cy + R*Math.sin(angle);
    const x2 = cx + R*Math.cos(angle+a), y2 = cy + R*Math.sin(angle+a);
    const xi1 = cx + r*Math.cos(angle), yi1 = cy + r*Math.sin(angle);
    const xi2 = cx + r*Math.cos(angle+a), yi2 = cy + r*Math.sin(angle+a);
    const lg = a > Math.PI ? 1 : 0;
    paths += `<path d="M${xi1},${yi1} A${r},${r} 0 ${lg},1 ${xi2},${yi2} L${x2},${y2} A${R},${R} 0 ${lg},0 ${x1},${y1} Z" fill="${cols[i%cols.length]}" opacity="0.85" style="cursor:pointer" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0.85"><title>${seg.name}: ${seg.val}</title></path>`;
    seg.color = cols[i % cols.length]; angle += a;
  });
  const legend = segs.map(s =>
    `<div style="display:flex;align-items:center;gap:7px;font-size:12px;margin-bottom:6px">
      <div style="width:6px;height:6px;border-radius:50%;background:${s.color};flex-shrink:0"></div>
      <span style="flex:1">${s.name}</span>
      <span style="font-weight:700;font-size:11.5px">${Math.round(s.val/total*100)}%</span>
    </div>`).join('');
  wrap.innerHTML = `<div style="display:flex;align-items:center;gap:14px">
    <svg width="116" height="116" viewBox="0 0 116 116" style="flex-shrink:0">${paths}
      <text x="58" y="54" text-anchor="middle" style="font-family:Orbitron,monospace;font-size:15px;font-weight:700;fill:var(--text)">${total}</text>
      <text x="58" y="67" text-anchor="middle" style="font-family:Rajdhani,sans-serif;font-size:9px;fill:var(--muted)">clientes</text>
    </svg>
    <div style="flex:1">${legend}</div>
  </div>`;
}

function showTip(e, tipId, lbl, val) {
  const t = document.getElementById(tipId); if (!t) return;
  t.style.display = 'block'; t.textContent = `${lbl}: ${fmtBRL(val)}`;
  const rect = e.target.closest('svg').getBoundingClientRect();
  t.style.left = (e.clientX - rect.left + 8) + 'px';
  t.style.top  = (e.clientY - rect.top - 30) + 'px';
}
function hideTip(tipId) { const t = document.getElementById(tipId); if (t) t.style.display = 'none'; }

// ── CONFIG PAGE ───────────────────────────────────────────────────────
async function loadConfig() {
  try {
    const rows = await sbGet('configuracoes', `?user_id=eq.${currentUser.id}&limit=1`);
    if (rows?.[0]) { cfg = rows[0]; renderConfig(); }
  } catch(e) {}
}

function renderConfig() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('cfgSrv',       cfg.servidor_url);
  set('cfgPort',      cfg.servidor_porta);
  set('cfgPfx',       cfg.servidor_prefixo);
  set('cfgTgt',       cfg.telegram_bot_token);
  set('cfgTgc',       cfg.telegram_chat_id);
  const ad = document.getElementById('cfgAlertDays'); if (ad) ad.value = cfg.notif_vencimento_dias || 7;
}

async function saveConfig() {
  if (!currentUser) return;
  const data = {
    user_id:            currentUser.id,
    servidor_url:       document.getElementById('cfgSrv')?.value,
    servidor_porta:     document.getElementById('cfgPort')?.value,
    servidor_prefixo:   document.getElementById('cfgPfx')?.value,
    telegram_bot_token: document.getElementById('cfgTgt')?.value,
    telegram_chat_id:   document.getElementById('cfgTgc')?.value,
    notif_vencimento_dias: +document.getElementById('cfgAlertDays')?.value,
    updated_at: new Date().toISOString()
  };
  setBtnLoad('btnSaveConfig', true, 'Salvando...');
  try {
    if (cfg.id) await sbPatch('configuracoes', cfg.id, data);
    else { const [r] = await sbPost('configuracoes', data); cfg = r; }
    Object.assign(cfg, data);
    toast('💾 Configurações salvas!', 'success');
  } catch(e) { toast('Erro: ' + e.message, 'error'); }
  finally { setBtnLoad('btnSaveConfig', false, '💾 Salvar'); }
}

// ── ALERTAS ───────────────────────────────────────────────────────────
function renderAlertas() {
  const days = +(cfg.notif_vencimento_dias || 7);
  const venc = clients.filter(c => { const d = getDL(c.data_vencimento); return d >= 0 && d <= days; });
  const exp  = clients.filter(c => getDL(c.data_vencimento) < 0 && c.status === 'ativo');
  const sus  = clients.filter(c => c.status === 'suspenso');
  let h = '';
  if (venc.length) h += `<div style="margin-bottom:14px"><div style="font-size:9px;letter-spacing:1.5px;color:var(--yellow);font-weight:600;text-transform:uppercase;margin-bottom:8px">⏰ VENCENDO (${venc.length})</div>${venc.map(c => `<div class="alert-item alert-warn" style="margin-bottom:5px"><div style="flex:1"><strong>${c.nome}</strong> — ${c.plano_nome||'—'} — <span class="expiry-warn">${getDL(c.data_vencimento)}d</span></div><button class="btn btn-success btn-sm" onclick="openRenovar('${c.id}')">🔄</button><button class="btn btn-ghost btn-sm" onclick="sendWAById('${c.id}')">📱</button></div>`).join('')}</div>`;
  if (exp.length)  h += `<div style="margin-bottom:14px"><div style="font-size:9px;letter-spacing:1.5px;color:var(--accent3);font-weight:600;text-transform:uppercase;margin-bottom:8px">❌ VENCIDOS (${exp.length})</div>${exp.map(c => `<div class="alert-item alert-error" style="margin-bottom:5px"><div style="flex:1"><strong>${c.nome}</strong> — <span class="expiry-over">${-getDL(c.data_vencimento)}d vencido</span></div><button class="btn btn-success btn-sm" onclick="openRenovar('${c.id}')">🔄</button></div>`).join('')}</div>`;
  if (sus.length)  h += `<div><div style="font-size:9px;letter-spacing:1.5px;color:var(--accent2);font-weight:600;text-transform:uppercase;margin-bottom:8px">⏸️ SUSPENSOS (${sus.length})</div>${sus.map(c => `<div class="alert-item alert-warn" style="margin-bottom:5px"><div style="flex:1"><strong>${c.nome}</strong> — ${c.observacoes||'Suspenso'}</div><button class="btn btn-success btn-sm" onclick="editClient('${c.id}')">✏️</button></div>`).join('')}</div>`;
  if (!h) h = '<div class="empty-state"><div class="e-ico">✅</div><p>Nenhum alerta ativo</p></div>';
  document.getElementById('alertasBody').innerHTML = h;
}

// ── WINDOW EVENTS ─────────────────────────────────────────────────────
document.addEventListener('click', e => {
  if (!e.target.closest('.icon-btn') && !e.target.closest('.notif-panel'))
    document.getElementById('notifPanel')?.classList.remove('open');
});
document.querySelectorAll('.modal-overlay').forEach(o =>
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); })
);
window.addEventListener('resize', () => { renderChart1(); renderDonut(); fcRenderChart(); });
