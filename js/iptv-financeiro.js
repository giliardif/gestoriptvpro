// =====================================================================
// iptv-financeiro.js — Pagamentos, Fluxo de Caixa, Custos, Forecast
// =====================================================================

// ── CONSTANTES ────────────────────────────────────────────────────────
const CAT_ICONS  = { servidor:'🖥️', dominio:'🌐', licenca:'📋', marketing:'📣', suporte:'🛠️', outros:'📦' };
const CAT_COLORS = { servidor:'#00d4ff', dominio:'#7b2fff', licenca:'#f0b800', marketing:'#ff2d78', suporte:'#00cc6a', outros:'#4a6080' };
const MONTHS_PT  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

let fcHorizon        = 6;
let fcxMesSelecionado = null;

// ── PAGAMENTOS ────────────────────────────────────────────────────────
async function loadPagamentos() {
  try {
    pagamentos = await sbGet('pagamentos', `?user_id=eq.${currentUser.id}&order=created_at.desc`);
    renderPagamentos();
  } catch(e) { toast('Erro ao carregar pagamentos: ' + e.message, 'error'); }
}

function renderFinStats(lista) {
  const src      = lista || pagamentos;
  const temFiltro = !!lista;
  const pago = src.filter(p => p.status === 'pago').reduce((s,p) => s+(+p.valor||0), 0);
  const pend = src.filter(p => p.status === 'pendente').reduce((s,p) => s+(+p.valor||0), 0);
  const venc = src.filter(p => p.status === 'vencido').reduce((s,p) => s+(+p.valor||0), 0);
  const rec  = clients.filter(c => c.status === 'ativo').reduce((s,c) => s+(+c.plano_preco||0), 0);
  const filtroLabel = temFiltro ? `<div style="font-size:9px;color:var(--muted);margin-top:2px;letter-spacing:.5px">⚡ período filtrado</div>` : '';
  document.getElementById('finStats').innerHTML = `
    <div class="fin-card"><div class="fin-val" style="color:var(--green)">${fmtBRL(pago)}</div><div class="fin-label">Recebido</div>${filtroLabel}</div>
    <div class="fin-card"><div class="fin-val" style="color:var(--yellow)">${fmtBRL(pend)}</div><div class="fin-label">Pendente</div>${filtroLabel}</div>
    <div class="fin-card"><div class="fin-val" style="color:var(--accent3)">${fmtBRL(venc)}</div><div class="fin-label">Inadimplente</div>${filtroLabel}</div>
    <div class="fin-card"><div class="fin-val" style="color:var(--accent)">${fmtBRL(rec)}</div><div class="fin-label">Recorrente/mês</div></div>`;
}

function renderPagamentos() {
  const fCliente      = (document.getElementById('fPgtoCliente')?.value || '').toLowerCase();
  const fStatus       = document.getElementById('fPgtoStatus')?.value   || '';
  const fForma        = document.getElementById('fPgtoForma')?.value    || '';
  const fDe           = document.getElementById('fPgtoDe')?.value       || '';
  const fAte          = document.getElementById('fPgtoAte')?.value      || '';
  const temFiltroAtivo = fCliente || fStatus || fForma || fDe || fAte;

  let filtered = pagamentos.filter(p => {
    const clienteNome = clients.find(c => c.id === p.cliente_id)?.nome || '';
    if (fCliente && !clienteNome.toLowerCase().includes(fCliente)) return false;
    if (fStatus  && p.status !== fStatus) return false;
    if (fForma   && p.metodo_pagamento !== fForma) return false;
    if (fDe      && p.data_pagamento && p.data_pagamento < fDe) return false;
    if (fAte     && p.data_pagamento && p.data_pagamento > fAte) return false;
    return true;
  });

  renderFinStats(temFiltroAtivo ? filtered : null);

  const total      = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pagPgtoPerPage));
  if (pagPgtoPage > totalPages) pagPgtoPage = totalPages;
  const list = filtered.slice((pagPgtoPage-1)*pagPgtoPerPage, pagPgtoPage*pagPgtoPerPage);

  const cc = document.getElementById('pgtoCount');
  if (cc) cc.textContent = `${total} registro${total!==1?'s':''}`;

  const stColor = { pago:'color:var(--green)', pendente:'color:var(--yellow)', vencido:'color:var(--accent3)', cancelado:'color:var(--muted)' };
  document.getElementById('payList').innerHTML = list.length
    ? list.map(p => {
        const clienteNome = clients.find(c => c.id === p.cliente_id)?.nome || '—';
        const planoNome   = planos.find(pl => pl.id === p.plano_id)?.nome  || '—';
        return `<div class="pay-item">
          <div style="flex:1">
            <div style="font-weight:600">${clienteNome}</div>
            <div style="font-size:10px;color:var(--muted)">${p.data_pagamento||'—'} · ${p.metodo_pagamento||'—'}${p.observacoes?' · '+p.observacoes:''}</div>
          </div>
          <span class="plan-tag">${planoNome}</span>
          <div style="min-width:70px;text-align:right;font-weight:700">${fmtBRL(p.valor)}</div>
          <div style="min-width:70px;text-align:right;font-size:11px;font-weight:600;${stColor[p.status]||''}">${(p.status||'').toUpperCase()}</div>
          <div style="display:flex;gap:4px;margin-left:8px">
            <button class="btn btn-accent btn-ico btn-sm" onclick="editPgto('${p.id}')" title="Editar">✏️</button>
            <button class="btn btn-danger btn-ico btn-sm" onclick="deletePgto('${p.id}')" title="Excluir">🗑️</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty-state"><div class="e-ico">💰</div><p>Nenhum pagamento encontrado</p></div>';

  renderPagination('pagPgto', pagPgtoPage, totalPages, p => { pagPgtoPage = p; renderPagamentos(); });
}

function limparFiltrosPgto() {
  ['fPgtoCliente','fPgtoStatus','fPgtoForma','fPgtoDe','fPgtoAte'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  pagPgtoPage = 1; renderPagamentos();
}

function setupPgtoModal(reset = true) {
  const sel = document.getElementById('pgCliente');
  sel.innerHTML = '<option value="">Selecione...</option>' + clients.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
  if (reset) {
    document.getElementById('pgEditId').value  = '';
    document.getElementById('pgValor').value   = '';
    document.getElementById('pgObs').value     = '';
    document.getElementById('pgForma').value   = 'PIX';
    document.getElementById('pgStatus').value  = 'pago';
    document.getElementById('pgData').value    = new Date().toISOString().split('T')[0];
    document.getElementById('modalPgtoTitle').textContent = 'REGISTRAR PAGAMENTO';
  }
}

function editPgto(id) {
  const p = pagamentos.find(x => x.id === id); if (!p) return;
  setupPgtoModal(true);
  document.getElementById('pgEditId').value  = id;
  document.getElementById('pgCliente').value = p.cliente_id || '';
  document.getElementById('pgValor').value   = p.valor || '';
  document.getElementById('pgForma').value   = p.metodo_pagamento || 'PIX';
  document.getElementById('pgStatus').value  = p.status || 'pago';
  document.getElementById('pgData').value    = p.data_pagamento || new Date().toISOString().split('T')[0];
  document.getElementById('pgObs').value     = p.observacoes || '';
  document.getElementById('modalPgtoTitle').textContent = 'EDITAR PAGAMENTO';
  openModal('mPgto');
}

async function savePgto() {
  const editIdPg = document.getElementById('pgEditId').value;
  const cid = document.getElementById('pgCliente').value;
  const val = +document.getElementById('pgValor').value;
  if (!cid || !val) { toast('Preencha os campos!', 'error'); return; }
  const payload = {
    cliente_id:       cid, valor: val,
    metodo_pagamento: document.getElementById('pgForma').value,
    status:           document.getElementById('pgStatus').value,
    data_vencimento:  document.getElementById('pgData').value,
    data_pagamento:   document.getElementById('pgData').value,
    observacoes:      document.getElementById('pgObs').value || null
  };
  setBtnLoading('btnAddPgto', true);
  try {
    if (editIdPg) {
      await sbPatch('pagamentos', editIdPg, { ...payload, updated_at: new Date().toISOString() });
      toast('✅ Pagamento atualizado!', 'success');
    } else {
      await sbPost('pagamentos', { user_id: currentUser.id, ...payload });
      toast('✅ Pagamento registrado!', 'success');
    }
    closeModal('mPgto');
    await loadPagamentos();
  } catch(e) { toast('Erro: ' + e.message, 'error', 5000); }
  finally { setBtnLoading('btnAddPgto', false); }
}

async function deletePgto(id) {
  confirm2('🗑️','Excluir pagamento?','Será removido permanentemente.','btn-danger','Excluir', async () => {
    try { await sbDelete('pagamentos', id); await loadPagamentos(); toast('🗑️ Removido.', 'error'); }
    catch(e) { toast('Erro: '+e.message,'error'); }
  });
}

// ── FLUXO DE CAIXA ────────────────────────────────────────────────────
function fcxGetMeses() {
  const hoje = new Date();
  return Array.from({length:6}, (_,i) => {
    const d   = new Date(hoje.getFullYear(), hoje.getMonth()-5+i, 1);
    const ano = d.getFullYear(), mes = d.getMonth()+1;
    const ini = `${ano}-${String(mes).padStart(2,'0')}-01`;
    const fim = new Date(ano, mes, 0).toISOString().split('T')[0];
    const label = MONTHS_PT[d.getMonth()];
    return { ano, mes, label, ini, fim };
  });
}

function fcxRenderMesChips(meses) {
  const el = document.getElementById('fcxMesChips'); if (!el) return;
  const selIni = fcxMesSelecionado?.ini;
  el.innerHTML = meses.map(m => {
    const ativo = selIni === m.ini;
    return `<div onclick="fcxSelectMes('${m.ini}')" style="padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;transition:all .2s;
      background:${ativo?'var(--accent)':'var(--card)'};color:${ativo?'#000':'var(--muted)'};
      border:1px solid ${ativo?'var(--accent)':'var(--border)'}">${m.label}</div>`;
  }).join('');
}

function fcxSelectMes(ini) {
  fcxMesSelecionado = fcxGetMeses().find(m => m.ini === ini) || null;
  loadFluxoCaixa();
}

async function loadFluxoCaixa() {
  const meses = fcxGetMeses();
  if (!fcxMesSelecionado) fcxMesSelecionado = meses[meses.length - 1];
  const { ini: mesInicio, fim: mesFim, label: mesLabel } = fcxMesSelecionado;

  fcxRenderMesChips(meses);
  const selLabel = document.getElementById('fcxMesSel');
  if (selLabel) selLabel.textContent = `— ${mesLabel}`;
  const filtroTipo = document.getElementById('fcxFiltroStatus')?.value || '';

  // Pagamentos do mês
  let pgtosMes = [];
  try {
    pgtosMes = await sbGet('pagamentos', `?user_id=eq.${currentUser.id}&status=eq.pago&data_pagamento=gte.${mesInicio}&data_pagamento=lte.${mesFim}&order=data_pagamento.desc`);
  } catch(e) { pgtosMes = []; }

  // Custos
  let custosAll = [];
  try {
    custosAll = await sbGet('custos', `?user_id=eq.${currentUser.id}&order=data_custo.desc`);
  } catch(e) {
    const saidaEl = document.getElementById('fcxSaidaList');
    if (saidaEl) saidaEl.innerHTML = `<div class="empty-state"><div class="e-ico">⚠️</div><p style="color:var(--yellow)">Execute o SQL <strong>iptv-criar-custos.sql</strong> no Supabase para habilitar esta seção.</p></div>`;
    const catEl = document.getElementById('fcxCategorias');
    if (catEl) catEl.innerHTML = '<div class="empty-state"><p>Aguardando criação da tabela</p></div>';
    custosAll = [];
  }
  custos = custosAll;
  const custosMes = custos.filter(c => c.data_custo >= mesInicio && c.data_custo <= mesFim);

  const entradas = pgtosMes.reduce((s,p) => s+(+p.valor||0), 0);
  const saidas   = custosMes.reduce((s,c) => s+(+c.valor||0), 0);
  const saldo    = entradas - saidas;
  const margem   = entradas > 0 ? Math.round(saldo/entradas*100) : 0;

  // KPIs
  const el = (id, v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
  el('fcxEntradas',    'R$' + entradas.toLocaleString('pt-BR'));
  el('fcxEntradasSub', `${pgtosMes.length} pagamento${pgtosMes.length!==1?'s':''} confirmado${pgtosMes.length!==1?'s':''}`);
  el('fcxSaidas',      'R$' + saidas.toLocaleString('pt-BR'));
  el('fcxSaidasSub',   `${custosMes.length} custo${custosMes.length!==1?'s':''} registrado${custosMes.length!==1?'s':''}`);
  const saldoEl = document.getElementById('fcxSaldo');
  if (saldoEl) { saldoEl.textContent = (saldo<0?'-':'')+'R$'+Math.abs(saldo).toLocaleString('pt-BR'); saldoEl.style.color = saldo>=0?'var(--accent)':'var(--accent3)'; }
  const saldoSubEl = document.getElementById('fcxSaldoSub');
  if (saldoSubEl) { saldoSubEl.textContent = saldo>=0?'✅ lucro':'❌ prejuízo'; saldoSubEl.className=`stat-change ${saldo>=0?'up':'down'}`; }
  const margemEl = document.getElementById('fcxMargem');
  if (margemEl) { margemEl.textContent = margem+'%'; margemEl.style.color = margem>=50?'var(--accent2)':margem>=20?'var(--yellow)':'var(--accent3)'; }
  el('fcxMargemSub', margem>=50?'💪 excelente':margem>=20?'👍 razoável':entradas===0?'sem entradas ainda':'⚠️ atenção');

  // Saldo acumulado histórico
  try {
    const [todosP, todosC] = await Promise.all([
      sbGet('pagamentos', `?user_id=eq.${currentUser.id}&status=eq.pago&select=valor`),
      sbGet('custos',     `?user_id=eq.${currentUser.id}&select=valor`).catch(()=>[])
    ]);
    const saldoAcum = todosP.reduce((s,p)=>s+(+p.valor||0),0) - todosC.reduce((s,c)=>s+(+c.valor||0),0);
    const fcxAcumEl  = document.getElementById('fcxSaldoAcum');
    const fcxAcumSub = document.getElementById('fcxSaldoAcumSub');
    if (fcxAcumEl) { fcxAcumEl.textContent = (saldoAcum<0?'-':'')+'R$'+Math.abs(saldoAcum).toLocaleString('pt-BR'); fcxAcumEl.style.color = saldoAcum>=0?'#00bfb3':'var(--accent3)'; }
    if (fcxAcumSub) { fcxAcumSub.textContent = saldoAcum>=0?'✅ saldo positivo':'❌ saldo negativo'; fcxAcumSub.className=`stat-change ${saldoAcum>=0?'up':'down'}`; }
  } catch(e) { const acEl=document.getElementById('fcxSaldoAcum'); if(acEl) acEl.textContent='—'; }

  // Lista entradas
  const entEl    = document.getElementById('fcxEntList');
  const entCount = document.getElementById('fcxEntCount');
  if (filtroTipo !== 'saidas') {
    if (entCount) entCount.textContent = pgtosMes.length + ' registro' + (pgtosMes.length!==1?'s':'');
    if (entEl) {
      const clienteMap = {}; clients.forEach(c => clienteMap[c.id] = c.nome);
      entEl.innerHTML = pgtosMes.length
        ? pgtosMes.map(p => {
            const cn = clienteMap[p.cliente_id] || p.cliente_nome || '—';
            const pn = planos.find(pl=>pl.id===p.plano_id)?.nome || p.plano_nome || '—';
            return `<div class="pay-item">
              <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--green),var(--accent));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${(cn[0]||'?').toUpperCase()}</div>
              <div style="flex:1"><div style="font-weight:600;font-size:12.5px">${cn}</div>
              <div style="font-size:10px;color:var(--muted)">${p.data_pagamento||'—'} · ${p.metodo_pagamento||'—'} · <span style="color:var(--accent2)">${pn}</span></div></div>
              <div style="font-weight:700;color:var(--green);font-size:13px">+${fmtBRL(p.valor)}</div>
            </div>`;
          }).join('')
        : '<div class="empty-state"><div class="e-ico">📥</div><p>Nenhum pagamento recebido neste mês</p></div>';
    }
  } else if (entEl) {
    entEl.innerHTML = '<div class="empty-state"><p>Filtro: mostrando só saídas</p></div>';
  }

  // Lista saídas
  const saidaEl = document.getElementById('fcxSaidaList');
  if (filtroTipo !== 'entradas' && saidaEl && custos.length) {
    const listaExibir = custosMes.length ? custosMes : custos.slice(0,20);
    saidaEl.innerHTML = listaExibir.map(c => `
      <div class="pay-item">
        <div style="font-size:20px;flex-shrink:0">${CAT_ICONS[c.categoria]||'📦'}</div>
        <div style="flex:1"><div style="font-weight:600;font-size:12.5px">${c.descricao}</div>
        <div style="font-size:10px;color:var(--muted)">${c.data_custo} · ${c.categoria}${c.recorrente?' · 🔄':''}${c.observacoes?' · '+c.observacoes:''}</div></div>
        <div style="font-weight:700;color:var(--accent3);font-size:13px">-${fmtBRL(c.valor)}</div>
        <button class="btn btn-danger btn-ico btn-sm" onclick="deleteCusto('${c.id}')" title="Excluir">🗑️</button>
      </div>`).join('');
  } else if (saidaEl && !custos.length) {
    saidaEl.innerHTML = '<div class="empty-state"><div class="e-ico">📤</div><p>Nenhum custo registrado</p></div>';
  }

  // Categorias
  const catTotais = {};
  custos.forEach(c => catTotais[c.categoria] = (catTotais[c.categoria]||0) + (+c.valor||0));
  const totalCat = Object.values(catTotais).reduce((s,v)=>s+v,0) || 1;
  const catEl = document.getElementById('fcxCategorias');
  if (catEl && Object.keys(catTotais).length) {
    catEl.innerHTML = Object.entries(catTotais).sort((a,b)=>b[1]-a[1]).map(([cat,val]) => {
      const pct = Math.round(val/totalCat*100);
      return `<div style="margin-bottom:11px">
        <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px"><span>${CAT_ICONS[cat]||'📦'} ${cat}</span><strong>${fmtBRL(val)}</strong></div>
        <div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:${CAT_COLORS[cat]||'#4a6080'}"></div></div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">${pct}% dos custos</div>
      </div>`;
    }).join('');
  } else if (catEl) { catEl.innerHTML = '<div class="empty-state"><p>Nenhum custo ainda</p></div>'; }

  await renderFluxoChart(meses);
}

async function renderFluxoChart(meses) {
  const wrap = document.getElementById('fcxChart'); if (!wrap) return;
  if (!meses) meses = fcxGetMeses();
  const dados = await Promise.all(meses.map(m =>
    Promise.all([
      sbGet('pagamentos',`?user_id=eq.${currentUser.id}&status=eq.pago&data_pagamento=gte.${m.ini}&data_pagamento=lte.${m.fim}`).catch(()=>[]),
      sbGet('custos',    `?user_id=eq.${currentUser.id}&data_custo=gte.${m.ini}&data_custo=lte.${m.fim}`).catch(()=>[])
    ]).then(([pg,cs]) => ({
      label: m.label, ini: m.ini,
      entradas: pg.reduce((s,p)=>s+(+p.valor||0),0),
      saidas:   cs.reduce((s,c)=>s+(+c.valor||0),0)
    }))
  ));
  const selIni = fcxMesSelecionado?.ini;
  const W = Math.max(wrap.clientWidth||360,300), H=180, pL=54, pR=10, pT=28, pB=24;
  const cW=W-pL-pR, cH=H-pT-pB;
  const maxV = Math.max(...dados.map(m=>Math.max(m.entradas,m.saidas)),1);
  const bW = Math.max(12,(cW/6)*0.33), gap=(cW-bW*2*6)/(6+1);
  let svg='', grid='';
  for(let i=0;i<=3;i++){
    const v=(maxV/3)*i, y=pT+cH-(v/maxV)*cH;
    grid+=`<line x1="${pL}" y1="${y}" x2="${W-pR}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="${i?'4,4':'0'}"/>`;
    grid+=`<text x="${pL-4}" y="${y+4}" text-anchor="end" style="font-family:Rajdhani,sans-serif;font-size:9px;fill:var(--muted)">${fmtBRLk(v)}</text>`;
  }
  dados.forEach((m,i)=>{
    const xBase=pL+gap+(bW*2+gap)*i;
    const hE=Math.max((m.entradas/maxV)*cH, m.entradas>0?2:0);
    const hS=Math.max((m.saidas/maxV)*cH, m.saidas>0?2:0);
    const isSel = m.ini===selIni;
    const xMid = xBase+bW;
    svg+=`<g onclick="fcxSelectMes('${m.ini}')" style="cursor:pointer">
      <rect x="${xBase}" y="${pT+cH-hE}" width="${bW}" height="${hE}" rx="2" fill="var(--green)" opacity="${isSel?1:0.35}"/>
      <rect x="${xBase+bW+1}" y="${pT+cH-hS}" width="${bW}" height="${hS}" rx="2" fill="var(--accent3)" opacity="${isSel?1:0.35}"/>
      ${isSel?`<rect x="${xBase-2}" y="${pT}" width="${bW*2+5}" height="${cH}" rx="3" fill="rgba(0,212,255,.04)" stroke="rgba(0,212,255,.2)" stroke-width="1"/>`:'' }
      ${m.entradas>0?`<text x="${xBase+bW/2}" y="${pT+cH-hE-4}" text-anchor="middle" style="font-family:Rajdhani,sans-serif;font-size:8px;fill:var(--green);font-weight:700">${fmtBRLk(m.entradas)}</text>`:''}
      ${m.saidas>0?`<text x="${xBase+bW*1.5+1}" y="${pT+cH-hS-4}" text-anchor="middle" style="font-family:Rajdhani,sans-serif;font-size:8px;fill:var(--accent3);font-weight:700">${fmtBRLk(m.saidas)}</text>`:''}
      <text x="${xMid}" y="${H-5}" text-anchor="middle" style="font-family:Rajdhani,sans-serif;font-size:${isSel?11:9}px;fill:${isSel?'var(--accent)':'var(--muted)'};font-weight:${isSel?700:400}">${m.label}</text>
    </g>`;
  });
  wrap.innerHTML=`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${grid}${svg}</svg>`;
}

// ── CUSTOS ────────────────────────────────────────────────────────────
function setupCustoModal() {
  document.getElementById('cData').value  = new Date().toISOString().split('T')[0];
  document.getElementById('cDesc').value  = '';
  document.getElementById('cValor').value = '';
  document.getElementById('cObs').value   = '';
}

async function addCusto() {
  const desc = document.getElementById('cDesc').value.trim();
  const val  = +document.getElementById('cValor').value;
  const data = document.getElementById('cData').value;
  if (!desc || !val || !data) { toast('Preencha os campos obrigatórios!', 'error'); return; }
  setBtnLoading('btnAddCusto', true);
  try {
    await sbPost('custos', {
      user_id:     currentUser.id, descricao: desc, valor: val,
      categoria:   document.getElementById('cCategoria').value,
      data_custo:  data,
      recorrente:  document.getElementById('cRecorrente').value === 'true',
      observacoes: document.getElementById('cObs').value || null
    });
    closeModal('mCusto');
    await loadFluxoCaixa();
    toast('✅ Custo registrado!', 'success');
  } catch(e) { toast('Erro: '+e.message,'error',5000); }
  finally { setBtnLoading('btnAddCusto', false); }
}

async function deleteCusto(id) {
  confirm2('🗑️','Excluir custo?','Será removido permanentemente.','btn-danger','Excluir', async () => {
    try { await sbDelete('custos', id); await loadFluxoCaixa(); toast('🗑️ Custo removido.','error'); }
    catch(e) { toast('Erro: '+e.message,'error'); }
  });
}

// ── FORECAST ENGINE ───────────────────────────────────────────────────
function fcCalcRiskScore(c) {
  let score = 0;
  const dl = getDL(c.data_vencimento);
  if      (dl < 0)   score += 50;
  else if (dl <= 3)  score += 45;
  else if (dl <= 7)  score += 35;
  else if (dl <= 15) score += 25;
  else if (dl <= 30) score += 10;
  if (c.status === 'suspenso')  score += 35;
  if (c.status === 'cancelado') score += 40;
  if (c.status === 'trial')     score += 15;
  const val = +c.plano_preco || 0;
  if (val === 0) score += 10; else if (val <= 25) score += 5;
  return Math.min(100, score);
}

function fcGetRisk(score) {
  if (score >= 60) return { l:'Alto Risco',  c:'risk-high', key:'high' };
  if (score >= 30) return { l:'Médio Risco', c:'risk-med',  key:'medium' };
  if (score >= 10) return { l:'Baixo Risco', c:'risk-low',  key:'low' };
  return { l:'Confirmado', c:'risk-ok', key:'confirmed' };
}
function fcGetRiskColor(score) {
  if (score >= 60) return 'var(--accent3)';
  if (score >= 30) return 'var(--yellow)';
  if (score >= 10) return 'var(--green)';
  return 'var(--accent)';
}

function fcBuildMonths() {
  const now = new Date();
  return Array.from({length:12}, (_,m) => {
    const d = new Date(now.getFullYear(), now.getMonth()+m, 1);
    let confirmed=0, atRisk=0, potential=0;
    clients.forEach(c => {
      const plano = planos.find(p => p.id===c.plano_id);
      const val = plano?.preco||0; if(!val||c.status==='cancelado') return;
      const dl = getDL(c.data_vencimento), score = fcCalcRiskScore(c);
      const cs = m===0?-999:m*30-15, ce = m===0?15:m*30+15;
      if (dl>cs && dl<=ce) {
        if (c.status==='suspenso') { atRisk+=val; }
        else if (c.status==='ativo'||c.status==='trial') {
          if (score<30) confirmed+=val; else if (score<60) atRisk+=val; else potential+=val;
        }
      }
    });
    return { label:MONTHS_PT[d.getMonth()], confirmed, atRisk, potential, total:confirmed+atRisk+potential, index:m };
  });
}

function fcRenderKPIs() {
  let confirmed=0, atRisk=0, lost=0;
  clients.forEach(c => {
    const plano = planos.find(p=>p.id===c.plano_id);
    const val = plano?.preco||0; if(!val) return;
    const score=fcCalcRiskScore(c), dl=getDL(c.data_vencimento);
    if (c.status==='cancelado') { lost+=val; return; }
    if (dl>15) return;
    if (dl<0&&c.status!=='ativo') { lost+=val; return; }
    if (c.status==='suspenso') { atRisk+=val; return; }
    if (score<30&&(c.status==='ativo'||c.status==='trial')) confirmed+=val;
    else if (score<60) atRisk+=val;
    else lost+=val;
  });
  const total = confirmed+atRisk+lost||1;
  const churnPct = Math.round((atRisk+lost)/total*100);
  const nextMonth = fcBuildMonths()[1];
  const forecast  = nextMonth.confirmed + nextMonth.atRisk*0.65;
  const riskN = clients.filter(c=>fcCalcRiskScore(c)>=30&&c.status!=='cancelado').length;
  const lostN = clients.filter(c=>fcCalcRiskScore(c)>=60||c.status==='cancelado').length;
  const safeN = clients.filter(c=>fcCalcRiskScore(c)<30&&getDL(c.data_vencimento)<=15&&c.status==='ativo').length;
  const el = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  el('fcConfirmed',fmtBRLk(confirmed)); el('fcRisk',fmtBRLk(atRisk)); el('fcLost',fmtBRLk(lost));
  el('fcNext',fmtBRLk(forecast)); el('fcChurn',churnPct+'%');
  const sub = document.querySelector('#fcNext')?.closest('.fc-kpi')?.querySelector('.fc-kpi-sub');
  if (sub) sub.textContent = nextMonth.label+' · 65% risco assumido';
  el('fcConfirmedSub',safeN+' clientes seguros'); el('fcRiskSub',riskN+' em risco');
  el('fcLostSub',lostN+' perdidos'); el('fcChurnSub',fmtBRL(atRisk+lost)+' ameaçados');
  fcUpdateSim(document.getElementById('fcSimSlider')?.value||80);
}

function fcRenderChart() {
  const wrap = document.getElementById('fcChart'); if (!wrap) return;
  const months = fcBuildMonths().slice(0, fcHorizon);
  const W = Math.max(wrap.clientWidth||400,300), H=180, pL=54, pR=10, pT=18, pB=28;
  const cW=W-pL-pR, cH=H-pT-pB;
  const maxVal = Math.max(...months.map(m=>m.confirmed+m.atRisk+m.potential),1);
  const bW = Math.max(12,(cW/months.length)*0.55);
  const gap = (cW-bW*months.length)/(months.length+1);
  let bars='', labels='', grid='';
  for(let i=0;i<=4;i++){
    const v=(maxVal/4)*i, y=pT+cH-(v/maxVal)*cH;
    grid+=`<line x1="${pL}" y1="${y}" x2="${W-pR}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="${i?'4,4':'0'}"/>`;
    grid+=`<text x="${pL-4}" y="${y+4}" text-anchor="end" style="font-family:Rajdhani,sans-serif;font-size:9px;fill:var(--muted)">${fmtBRLk(v)}</text>`;
  }
  months.forEach((m,i) => {
    const x=pL+gap+(bW+gap)*i;
    const hC=(m.confirmed/maxVal)*cH, hR=(m.atRisk/maxVal)*cH, hP=(m.potential/maxVal)*cH;
    const yB=pT+cH; const isNow=i===0;
    if(isNow) bars+=`<rect x="${x-2}" y="${pT}" width="${bW+4}" height="${cH}" rx="3" fill="rgba(0,212,255,.03)" stroke="rgba(0,212,255,.15)" stroke-width="1"/>`;
    if(hP>0) bars+=`<rect x="${x}" y="${yB-hP}" width="${bW}" height="${hP}" fill="rgba(0,212,255,0.18)"/>`;
    if(hR>0) bars+=`<rect x="${x}" y="${yB-hP-hR}" width="${bW}" height="${hR}" fill="${isNow?'var(--yellow)':'rgba(240,184,0,0.45)'}" onmouseenter="fcShowTip(event,${i})" onmouseleave="fcHideTip()" style="cursor:pointer"/>`;
    if(hC>0) bars+=`<rect x="${x}" y="${yB-hP-hR-hC}" width="${bW}" height="${hC}" fill="${isNow?'var(--green)':'rgba(0,204,106,0.55)'}" onmouseenter="fcShowTip(event,${i})" onmouseleave="fcHideTip()" style="cursor:pointer"/>`;
    const topH=hC+hR+hP;
    if(topH>14) bars+=`<text x="${x+bW/2}" y="${yB-topH-4}" text-anchor="middle" style="font-family:Rajdhani,sans-serif;font-size:8.5px;fill:var(--text);font-weight:600">${fmtBRLk(m.total)}</text>`;
    labels+=`<text x="${x+bW/2}" y="${H-5}" text-anchor="middle" style="font-family:Rajdhani,sans-serif;font-size:${isNow?10.5:9}px;fill:${isNow?'var(--accent)':'var(--muted)'};font-weight:${isNow?700:400}">${m.label}${isNow?'◄':''}</text>`;
  });
  wrap.innerHTML=`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${grid}${bars}${labels}</svg>`;
  wrap._months = months;
}

function fcShowTip(event, idx) {
  const wrap=document.getElementById('fcChart'); if(!wrap||!wrap._months) return;
  const m=wrap._months[idx], t=document.getElementById('fcTip');
  t.style.display='block';
  t.innerHTML=`<div class="fc-tip-title">${m.label}${idx===0?' (este mês)':''}</div>
    <div class="fc-tip-row"><span class="fc-tip-lbl" style="color:var(--green)">✅ Confirmada</span><span style="font-weight:700;color:var(--green)">${fmtBRL(m.confirmed)}</span></div>
    <div class="fc-tip-row"><span class="fc-tip-lbl" style="color:var(--yellow)">⚠️ Em Risco</span><span style="font-weight:700;color:var(--yellow)">${fmtBRL(m.atRisk)}</span></div>
    <div class="fc-tip-row"><span class="fc-tip-lbl">📅 Potencial</span><span style="font-weight:700">${fmtBRL(m.potential)}</span></div>
    <div style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px;display:flex;justify-content:space-between"><span>Total</span><strong>${fmtBRL(m.total)}</strong></div>`;
  const rect=wrap.getBoundingClientRect();
  t.style.left=Math.min(event.clientX-rect.left+8, rect.width-170)+'px';
  t.style.top=(event.clientY-rect.top-70)+'px';
}
function fcHideTip() { const t=document.getElementById('fcTip'); if(t) t.style.display='none'; }

function fcSetHorizon(h, el) {
  fcHorizon=h;
  document.querySelectorAll('.fc-h-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  fcRenderChart(); fcRenderMonthBreak();
}
function fcSwitchTab(tabId, el) {
  const panel=el.closest('.panel');
  panel.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  panel.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
  el.classList.add('active'); document.getElementById(tabId).classList.add('active');
  if(tabId==='fcTabMonth') fcRenderMonthBreak();
}

function fcRenderRiskTable() {
  const filter=document.getElementById('fcRiskFilter')?.value||'all';
  let list=clients.map(c=>({...c,score:fcCalcRiskScore(c),dl:getDL(c.data_vencimento),val:planos.find(p=>p.id===c.plano_id)?.preco||0}))
    .filter(c=>c.val>0&&c.status!=='cancelado')
    .filter(c=>filter==='all'||fcGetRisk(c.score).key===filter)
    .sort((a,b)=>b.score-a.score);
  const cc=document.getElementById('fcRiskCount'); if(cc) cc.textContent=list.length+' cliente'+(list.length!==1?'s':'');
  const tb=document.getElementById('fcRiskTable'); if(!tb) return;
  if(!list.length){tb.innerHTML=`<tr><td colspan="6" style="text-align:center;padding:22px;color:var(--muted)">Nenhum cliente nessa categoria</td></tr>`;return;}
  tb.innerHTML=list.map(c=>{
    const risk=fcGetRisk(c.score),rc=fcGetRiskColor(c.score);
    const dlTxt=c.dl<0?`<span style="color:var(--accent3)">${-c.dl}d vencido</span>`:`<span style="${c.dl<=7?'color:var(--yellow)':''}">${c.dl}d</span>`;
    return `<tr><td><div style="font-weight:600;font-size:12.5px">${c.nome}</div><div style="font-size:10px;color:var(--muted)">${c.whatsapp||'—'}</div></td>
      <td><span class="plan-tag">${c.plano_nome||'—'}</span></td>
      <td>${dlTxt}<div style="font-size:10px;color:var(--muted)">${c.data_vencimento}</div></td>
      <td><strong>${fmtBRL(c.val)}</strong></td>
      <td><div class="score-wrap"><div class="score-bar"><div class="score-fill" style="width:${c.score}%;background:${rc}"></div></div><div class="score-num" style="color:${rc}">${c.score}</div></div><span class="risk-badge ${risk.c}">${risk.l}</span></td>
      <td><div style="display:flex;gap:4px"><button class="btn btn-ghost btn-sm btn-ico" onclick="sendWAById('${c.id}')">📱</button>${c.dl<=15?`<button class="btn btn-success btn-sm" style="font-size:10.5px;padding:4px 8px" onclick="openRenovar('${c.id}')">🔄</button>`:''}</div></td></tr>`;
  }).join('');
}

function fcRenderAllTable() {
  const stClass={ativo:'badge-active',vencido:'badge-inactive',suspenso:'badge-pending',cancelado:'badge-blocked',trial:'badge-trial'};
  const list=clients.map(c=>({...c,score:fcCalcRiskScore(c),dl:getDL(c.data_vencimento),val:planos.find(p=>p.id===c.plano_id)?.preco||0})).sort((a,b)=>b.score-a.score);
  const tb=document.getElementById('fcAllTable'); if(!tb) return;
  tb.innerHTML=list.map(c=>{
    const risk=fcGetRisk(c.score);
    const dlTxt=c.dl<0?`<span style="color:var(--accent3)">${-c.dl}d venc.</span>`:`<span style="${c.dl<=7?'color:var(--yellow)':''}">${c.dl}d</span>`;
    return `<tr><td><div style="font-weight:600">${c.nome}</div></td>
      <td><span class="plan-tag">${c.plano_nome||'—'}</span></td>
      <td><span class="badge ${stClass[c.status]||'badge-inactive'}">${STATUS_MAP[c.status]?.l||c.status}</span></td>
      <td>${dlTxt}</td><td><strong>${fmtBRL(c.val)}</strong></td>
      <td><span class="risk-badge ${risk.c}">${risk.l}</span></td></tr>`;
  }).join('');
}

function fcRenderMonthBreak() {
  const months=fcBuildMonths().slice(0,fcHorizon);
  const wrap=document.getElementById('fcMonthBreak'); if(!wrap) return;
  wrap.innerHTML=months.map((m,i)=>{
    const pC=m.total>0?m.confirmed/m.total*100:0, pR=m.total>0?m.atRisk/m.total*100:0;
    return `<div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;margin-bottom:7px">
        <div style="font-weight:700;font-size:13px${i===0?';color:var(--accent)':''}">${m.label}${i===0?' <span style="font-size:10px;font-weight:400;color:var(--muted)">(atual)</span>':''}</div>
        <div style="font-weight:700">${fmtBRL(m.total)}</div>
      </div>
      <div style="display:flex;height:7px;border-radius:4px;overflow:hidden;margin-bottom:5px">
        <div style="width:${pC}%;background:var(--green)"></div><div style="width:${pR}%;background:var(--yellow)"></div><div style="flex:1;background:rgba(0,212,255,0.18)"></div>
      </div>
      <div style="display:flex;gap:12px;font-size:11px;color:var(--muted)">
        <span style="color:var(--green)">✅ ${fmtBRL(m.confirmed)}</span>
        <span style="color:var(--yellow)">⚠️ ${fmtBRL(m.atRisk)}</span>
        <span>📅 ${fmtBRL(m.potential)}</span>
      </div>
    </div>`;
  }).join('');
}

function fcRenderPlanBreak() {
  const breakdown={};
  clients.forEach(c=>{
    const plano=planos.find(p=>p.id===c.plano_id);
    const val=plano?.preco||0; if(!val||c.status==='cancelado') return;
    const nome=c.plano_nome||'Sem Plano';
    if(!breakdown[nome]) breakdown[nome]={val:0,count:0,risk:0};
    breakdown[nome].val+=val; breakdown[nome].count+=1;
    if(fcCalcRiskScore(c)>=30) breakdown[nome].risk+=val;
  });
  const total=Object.values(breakdown).reduce((s,v)=>s+v.val,0)||1;
  const colors=['#00d4ff','#7b2fff','#f0b800','#00cc6a','#ff2d78'];
  const wrap=document.getElementById('fcPlanBreak'); if(!wrap) return;
  wrap.innerHTML=Object.entries(breakdown).sort((a,b)=>b[1].val-a[1].val).map(([nome,d],i)=>{
    const pct=Math.round(d.val/total*100), rPct=d.val>0?Math.round(d.risk/d.val*100):0;
    return `<div style="margin-bottom:13px">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:12.5px">
        <div style="display:flex;align-items:center;gap:6px"><div style="width:9px;height:9px;border-radius:2px;background:${colors[i%colors.length]}"></div><span>${nome}</span></div>
        <strong>${fmtBRL(d.val)}</strong>
      </div>
      <div style="display:flex;height:5px;border-radius:3px;overflow:hidden">
        <div style="width:${100-rPct}%;background:${colors[i%colors.length]}"></div>
        <div style="width:${rPct}%;background:rgba(240,184,0,0.5)"></div>
      </div>
      <div style="font-size:10px;color:var(--muted);margin-top:3px">${d.count} cliente${d.count!==1?'s':''} · ${pct}% da receita · ${rPct}% em risco</div>
    </div>`;
  }).join('');
}

function fcUpdateSim(pct) {
  const simEl=document.getElementById('fcSimPct'); if(simEl) simEl.textContent=pct+'%';
  let atRisk=0, confirmed=0;
  clients.forEach(c=>{
    const plano=planos.find(p=>p.id===c.plano_id);
    const val=plano?.preco||0; if(!val||c.status==='cancelado') return;
    const score=fcCalcRiskScore(c);
    if(score>=30&&score<60) atRisk+=val;
    if(score<30&&c.status==='ativo') confirmed+=val;
  });
  const renovado=atRisk*(pct/100), nao=atRisk*(1-pct/100), total=confirmed+renovado;
  const wrap=document.getElementById('fcSimResults'); if(!wrap) return;
  wrap.innerHTML=`
    <div class="fc-sim-result" style="background:rgba(0,204,106,.07);border:1px solid rgba(0,204,106,.2)"><span>💰 Receita confirmada</span><strong style="color:var(--green)">${fmtBRL(confirmed)}</strong></div>
    <div class="fc-sim-result" style="background:rgba(0,212,255,.07);border:1px solid rgba(0,212,255,.2)"><span>🔄 Renovam (${pct}%)</span><strong style="color:var(--accent)">${fmtBRL(renovado)}</strong></div>
    <div class="fc-sim-result" style="background:rgba(255,45,120,.07);border:1px solid rgba(255,45,120,.2)"><span>❌ Não renovam</span><strong style="color:var(--accent3)">-${fmtBRL(nao)}</strong></div>
    <div class="fc-sim-result" style="background:rgba(123,47,255,.1);border:1px solid rgba(123,47,255,.3)"><strong>📊 Total projetado</strong><strong style="color:var(--accent2);font-size:14px">${fmtBRL(total)}</strong></div>`;
}

function fcRenderAlerts() {
  const urgente  = clients.filter(c=>{const d=getDL(c.data_vencimento);return d>=0&&d<=2;});
  const highRisk = clients.filter(c=>fcCalcRiskScore(c)>=60&&c.status!=='cancelado');
  const sus      = clients.filter(c=>c.status==='suspenso');
  const safe     = clients.filter(c=>fcCalcRiskScore(c)<10&&c.status==='ativo').length;
  let html='';
  if(urgente.length)  html+=`<div class="fc-arow fc-arow-err">🚨 <span><strong>${urgente.length}</strong> vence${urgente.length>1?'m':''} em até 2 dias</span></div>`;
  if(highRisk.length) html+=`<div class="fc-arow fc-arow-err">❌ <span><strong>${highRisk.length}</strong> alto risco — ${fmtBRL(highRisk.reduce((s,c)=>s+(planos.find(p=>p.id===c.plano_id)?.preco||0),0))}</span></div>`;
  if(sus.length)      html+=`<div class="fc-arow fc-arow-warn">⏸️ <span><strong>${sus.length}</strong> suspenso${sus.length>1?'s':''}</span></div>`;
  if(safe>0)          html+=`<div class="fc-arow fc-arow-ok">✅ <span><strong>${safe}</strong> cliente${safe!==1?'s':''} sem risco</span></div>`;
  if(!html) html='<div class="fc-arow fc-arow-ok">🎉 <span>Nenhum alerta crítico!</span></div>';
  const wrap=document.getElementById('fcAlerts'); if(wrap) wrap.innerHTML=html;
}

function fcRenderAll() {
  fcRenderKPIs(); fcRenderChart(); fcRenderRiskTable(); fcRenderAllTable();
  fcRenderMonthBreak(); fcRenderPlanBreak(); fcRenderAlerts();
  fcUpdateSim(document.getElementById('fcSimSlider')?.value||80);
}
