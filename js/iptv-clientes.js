// =====================================================================
// iptv-clientes.js — Clientes: CRUD, tabela, paginação, M3U, Telegram
// =====================================================================

// ── FILTERS & SEARCH ─────────────────────────────────────────────────
// FIX: handleSearch com debounce para evitar re-render a cada tecla
const handleSearch = debounce(function(v) {
  searchTerm = v.toLowerCase();
  pgPage = 1;
  if (searchTerm && !document.getElementById('page-clientes')?.classList.contains('active')) {
    const navClientes = document.querySelector('.nav-item[onclick*="clientes"]');
    goPage('clientes', navClientes);
  }
  renderTable('tDash');
  renderTableClientes();
  const inlineSearch = document.querySelector('#chipsClientes input');
  if (inlineSearch && inlineSearch.value !== v) inlineSearch.value = v;
}, 220);

function buildChips(rowId) {
  const el = document.getElementById(rowId); if (!el) return;
  const labels = { todos: 'Todos', ativo: 'Ativos', trial: 'Trial', vencido: 'Vencidos', suspenso: 'Suspensos', cancelado: 'Cancelados' };
  let html = Object.entries(labels).map(([k, v]) =>
    `<div class="chip${k === filterChip ? ' active' : ''}" onclick="setChip('${k}')">${v}</div>`).join('');
  if (rowId === 'chipsClientes') {
    html += `<div class="filter-search" style="margin-left:auto"><input placeholder="🔍 Buscar..." oninput="handleSearch(this.value)" value="${searchTerm}"></div>`;
    html += `<select onchange="pgPerPage=+this.value;pgPage=1;renderTableClientes()" style="background:var(--card);border:1px solid var(--border);border-radius:7px;padding:5px 8px;color:var(--text);font-size:11px;outline:none">
      <option value="10">10/pág</option><option value="20" selected>20/pág</option>
      <option value="50">50/pág</option><option value="100">100/pág</option></select>`;
  }
  el.innerHTML = html;
}

function setChip(f) {
  filterChip = f;
  buildChips('chipsDash'); buildChips('chipsClientes');
  pgPage = 1; renderTable('tDash'); renderTableClientes();
}

function getFiltered() {
  return clients.filter(c => {
    if (filterChip !== 'todos' && c.status !== filterChip) return false;
    if (searchTerm && ![c.nome, c.usuario_iptv||'', c.whatsapp||'', c.plano_nome||'', c.email||'']
      .some(v => v.toLowerCase().includes(searchTerm))) return false;
    return true;
  });
}

// ── TABLE - DASHBOARD ─────────────────────────────────────────────────
function renderTable(tbId) {
  const tb = document.getElementById(tbId); if (!tb) return;
  const list = getFiltered().slice(0, 10);
  if (!list.length) { tb.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted)">Nenhum cliente encontrado</td></tr>`; return; }
  tb.innerHTML = list.map((c, i) => rowHTML(c, i, false)).join('');
}

// ── TABLE - CLIENTES COM PAGINAÇÃO ────────────────────────────────────
function renderTableClientes() {
  const tb = document.getElementById('tClientes'); if (!tb) return;
  const all        = getFiltered();
  const total      = all.length;
  const totalPages = Math.max(1, Math.ceil(total / pgPerPage));
  if (pgPage > totalPages) pgPage = totalPages;
  const list = all.slice((pgPage - 1) * pgPerPage, pgPage * pgPerPage);
  const cc = document.getElementById('clientCount');
  if (cc) cc.textContent = `${total} cliente${total !== 1 ? 's' : ''}`;
  if (!list.length) { tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Nenhum cliente encontrado</td></tr>`; }
  else tb.innerHTML = list.map((c, i) => rowHTML(c, (pgPage - 1) * pgPerPage + i, true)).join('');
  renderPagination('pagClientes', pgPage, totalPages, p => { pgPage = p; renderTableClientes(); });
}

function rowHTML(c, i, ext) {
  // FIX: trial agora está no STATUS_MAP em iptv-core.js
  const st   = STATUS_MAP[c.status] || STATUS_MAP.vencido;
  const dl   = getDL(c.data_vencimento);
  const bp   = Math.max(0, Math.min(100, (dl / 30) * 100));
  const dlTxt = dl < 0 ? `${-dl}d venc.` : dl === 0 ? 'hoje' : `${dl}d`;
  const chk  = ext ? `<td onclick="event.stopPropagation()"><input type="checkbox" class="lote-check chk-row" data-id="${c.id}" onchange="updateSelectCount()"></td>` : '';
  const devCol = ext ? `<td><span style="font-size:12px">📱 ${c.dispositivos || 1}</span></td>` : '';
  return `<tr onclick="openDetail('${c.id}')">
    ${chk}
    <td><div class="client-info">
      <div class="avatar" style="background:${AVAT_COLS[i % AVAT_COLS.length]}">${initials(c.nome)}</div>
      <div><div class="client-name">${c.nome}</div><div class="client-sub">${c.whatsapp || '—'}</div></div>
    </div></td>
    <td><span class="plan-tag">${c.plano_nome || '—'}</span></td>
    <td><span class="badge ${st.c}"><span class="badge-dot" style="background:${st.d}"></span>${st.l}</span></td>
    <td>
      <div class="${exClass(dl)}" style="font-size:11.5px">${c.data_vencimento}</div>
      <div class="exp-bar"><div class="exp-fill" style="width:${bp}%;background:${exColor(dl)}"></div></div>
      <div style="font-size:10px;color:var(--muted);margin-top:2px">${dlTxt}</div>
    </td>
    ${devCol}
    <td onclick="event.stopPropagation()">
      <div class="actions">
        <button class="btn btn-ghost btn-ico btn-sm"   onclick="editClient('${c.id}')"  title="Editar">✏️</button>
        <button class="btn btn-success btn-ico btn-sm" onclick="openRenovar('${c.id}')" title="Renovar">🔄</button>
        <button class="btn btn-yellow btn-ico btn-sm"  onclick="openM3U('${c.id}')"    title="M3U">📡</button>
        <button class="btn btn-ghost btn-ico btn-sm"   onclick="sendWAById('${c.id}')" title="WhatsApp">📱</button>
        <button class="btn btn-danger btn-ico btn-sm"  onclick="deleteClient('${c.id}')" title="Excluir">🗑️</button>
      </div>
    </td>
  </tr>`;
}

function renderPagination(elId, page, total, cb) {
  const el = document.getElementById(elId); if (!el) return;
  if (total <= 1) { el.innerHTML = ''; return; }
  const maxBtns = 5;
  let start = Math.max(1, page - 2), end = Math.min(total, start + maxBtns - 1);
  if (end - start < maxBtns - 1) start = Math.max(1, end - maxBtns + 1);
  let btns = '';
  for (let p = start; p <= end; p++) btns += `<button class="pag-btn${p===page?' active':''}" onclick="(${cb.toString()})(${p})">${p}</button>`;
  el.innerHTML = `
    <div class="pag-info">Página ${page} de ${total}</div>
    <div class="pag-btns">
      <button class="pag-btn" onclick="(${cb.toString()})(${Math.max(1,page-1)})" ${page===1?'disabled':''}>◀</button>
      ${btns}
      <button class="pag-btn" onclick="(${cb.toString()})(${Math.min(total,page+1)})" ${page===total?'disabled':''}>▶</button>
    </div>`;
}

function toggleSelectAll(chk) { document.querySelectorAll('.chk-row').forEach(c => c.checked = chk.checked); updateSelectCount(); }
function updateSelectCount() {
  const sel = document.querySelectorAll('.chk-row:checked').length;
  const cc  = document.getElementById('clientCount');
  if (cc && sel > 0) cc.textContent = `${sel} selecionado${sel!==1?'s':''}`;
  else if (cc) cc.textContent = `${getFiltered().length} cliente${getFiltered().length!==1?'s':''}`;
}

// ── ADD CLIENT ────────────────────────────────────────────────────────
async function addClient() {
  const nome    = document.getElementById('nNome').value.trim();
  const whats   = document.getElementById('nWhats').value.trim();
  const planNome = document.getElementById('nPlano').value;
  const venc    = document.getElementById('nVenc').value;
  const user    = document.getElementById('nUser').value.trim();
  const pass    = document.getElementById('nPass').value.trim();
  if (!nome || !whats || !planNome || !venc || !user || !pass) { toast('Preencha os campos obrigatórios!', 'error'); return; }
  const plano = planos.find(p => p.nome === planNome);
  setBtnLoading('btnAddClient', true);
  try {
    const statusVal = document.getElementById('nStatus').value;
    const [novo] = await sbPost('clientes', {
      user_id: currentUser.id,
      nome, whatsapp: whats.replace(/\D/g,''),
      email:       document.getElementById('nEmail').value || null,
      usuario_iptv: user, senha_iptv: pass,
      plano_id:    plano?.id || null,
      plano_nome:  plano?.nome || planNome || null,
      status:      statusVal === 'trial' ? 'ativo' : statusVal,
      data_inicio: new Date().toISOString().split('T')[0],
      data_vencimento: venc,
      dispositivos: String(document.getElementById('nDevs').value),
      telegram_id: document.getElementById('nTg').value || null,
      observacoes: document.getElementById('nObs').value || null
    });
    await sbPost('historico_clientes', { user_id: currentUser.id, cliente_id: novo.id, tipo: 'Cadastro', descricao: 'Cliente cadastrado' });
    closeModal('mNovo');
    ['nNome','nWhats','nEmail','nUser','nPass','nObs','nTg'].forEach(id => { const e = document.getElementById(id); if(e) e.value=''; });
    await reloadAll();
    toast(`✅ ${nome} cadastrado!`, 'success');
  } catch(e) { toast('Erro: ' + e.message, 'error', 5000); }
  finally { setBtnLoading('btnAddClient', false); }
}

// ── EDIT CLIENT ───────────────────────────────────────────────────────
function editClient(id) {
  const c = clients.find(x => x.id === id); if (!c) return;
  editId = id;
  document.getElementById('editTitle').textContent = `✏️ ${c.nome.toUpperCase()}`;
  document.getElementById('eNome').value  = c.nome;
  document.getElementById('eWhats').value = c.whatsapp || '';
  document.getElementById('eEmail').value = c.email    || '';
  document.getElementById('eUser').value  = c.usuario_iptv || '';
  document.getElementById('ePass').value  = c.senha_iptv   || '';
  document.getElementById('ePlano').value = c.plano_nome   || '';
  document.getElementById('eVenc').value  = c.data_vencimento;
  document.getElementById('eStatus').value = c.status;
  document.getElementById('eDevs').value  = c.dispositivos || 2;
  document.getElementById('eObs').value   = c.observacoes  || '';
  document.getElementById('eTg').value    = c.telegram_id  || '';
  document.getElementById('tgChatId').value = c.telegram_id || '';
  document.getElementById('m3uBox').textContent = buildM3U(c);
  document.getElementById('epgBox').textContent = buildEPG(c);
  document.getElementById('usrBox').textContent = c.usuario_iptv || '';
  document.getElementById('pwdBox').textContent = c.senha_iptv   || '';
  loadHistorico(id);
  document.querySelectorAll('#mEditar .tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  document.querySelectorAll('#mEditar .tab-content').forEach((c, i) => c.classList.toggle('active', i === 0));
  openModal('mEditar');
}

async function loadHistorico(cid) {
  try {
    const hist = await sbGet('historico_clientes', `?cliente_id=eq.${cid}&order=created_at.desc&limit=15`);
    document.getElementById('histBody').innerHTML = hist.length
      ? hist.map(h => `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid rgba(26,42,74,.4)">
          <div style="width:6px;height:6px;border-radius:50%;background:var(--accent);margin-top:4px;flex-shrink:0"></div>
          <div><div style="font-size:12px;line-height:1.4"><strong>${h.tipo}</strong> — ${h.descricao||''}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px">${new Date(h.created_at).toLocaleString('pt-BR')}</div></div>
        </div>`).join('')
      : '<div class="empty-state"><div class="e-ico">📋</div><p>Sem histórico</p></div>';
  } catch(e) { document.getElementById('histBody').innerHTML = '<div class="empty-state"><p>Erro ao carregar</p></div>'; }
}

async function saveEdit() {
  const c = clients.find(x => x.id === editId); if (!c) return;
  const newStatus = document.getElementById('eStatus').value;
  const planNome  = document.getElementById('ePlano').value;
  const plano     = planos.find(p => p.nome === planNome);
  setBtnLoading('btnSaveEdit', true);
  try {
    await sbPatch('clientes', editId, {
      nome:         document.getElementById('eNome').value,
      whatsapp:     document.getElementById('eWhats').value,
      email:        document.getElementById('eEmail').value || null,
      usuario_iptv: document.getElementById('eUser').value,
      senha_iptv:   document.getElementById('ePass').value,
      plano_id:     plano?.id || null,
      plano_nome:   plano?.nome || planNome || null,
      data_vencimento: document.getElementById('eVenc').value,
      status:       newStatus,
      dispositivos: String(document.getElementById('eDevs').value),
      observacoes:  document.getElementById('eObs').value || null,
      telegram_id:  document.getElementById('eTg').value  || null,
      updated_at:   new Date().toISOString()
    });
    await sbPost('historico_clientes', { user_id: currentUser.id, cliente_id: editId, tipo: 'Edição', descricao: c.status !== newStatus ? `Status → ${STATUS_MAP[newStatus]?.l || newStatus}` : 'Dados atualizados' });
    closeModal('mEditar');
    await reloadAll();
    toast('✏️ Cliente atualizado!', 'info');
  } catch(e) { toast('Erro: ' + e.message, 'error', 5000); }
  finally { setBtnLoading('btnSaveEdit', false); }
}

// ── DELETE CLIENT ─────────────────────────────────────────────────────
async function deleteClient(id) {
  const c = clients.find(x => x.id === id); if (!c) return;
  confirm2('🗑️', 'Excluir cliente?', `${c.nome} será removido permanentemente.`, 'btn-danger', 'Excluir', async () => {
    try { await sbDelete('clientes', id); await reloadAll(); toast(`🗑️ ${c.nome} removido.`, 'error'); }
    catch(e) { toast('Erro: ' + e.message, 'error'); }
  });
}

// ── DETALHES ──────────────────────────────────────────────────────────
function openDetail(id) {
  const c = clients.find(x => x.id === id); if (!c) return;
  const dl = getDL(c.data_vencimento), st = STATUS_MAP[c.status] || STATUS_MAP.vencido;
  document.getElementById('detTitle').textContent = `👤 ${c.nome}`;
  document.getElementById('detBody').innerHTML = `
    <div class="section-title" style="margin-top:4px">Informações</div>
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">WhatsApp</div><div class="detail-value">${c.whatsapp||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Email</div><div class="detail-value">${c.email||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value"><span class="badge ${st.c}">${st.l}</span></div></div>
      <div class="detail-item"><div class="detail-label">Plano</div><div class="detail-value"><span class="plan-tag">${c.plano_nome||'—'}</span></div></div>
      <div class="detail-item"><div class="detail-label">Vencimento</div><div class="detail-value ${exClass(dl)}">${c.data_vencimento} (${dl<0?'vencido':dl+'d'})</div></div>
      <div class="detail-item"><div class="detail-label">Dispositivos</div><div class="detail-value">📱 ${c.dispositivos||1}</div></div>
      <div class="detail-item"><div class="detail-label">Telegram</div><div class="detail-value">${c.telegram_id||'—'}</div></div>
      <div class="detail-item"><div class="detail-label">Dias Restantes</div><div class="detail-value ${exClass(dl)}">${c.dias_restantes!==undefined?c.dias_restantes:dl}d</div></div>
    </div>
    <div class="section-title">Link M3U</div>
    <div class="copy-box" style="margin-bottom:3px" onclick="navigator.clipboard.writeText('${buildM3U(c).replace(/'/g,"\\'")}').then(()=>toast('Copiado!','info'))">${buildM3U(c)}</div>
    <div class="copy-hint">👆 Clique para copiar</div>
    ${c.observacoes ? `<div style="background:rgba(240,184,0,.07);border:1px solid rgba(240,184,0,.2);border-radius:8px;padding:8px 11px;font-size:12px;color:var(--yellow);margin:11px 0">📝 ${c.observacoes}</div>` : ''}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">
      <button class="btn btn-success btn-sm" onclick="closeModal('mDetalhe');openRenovar('${id}')">🔄 Renovar</button>
      <button class="btn btn-ghost btn-sm"   onclick="sendWAById('${id}')">📱 WhatsApp</button>
      <button class="btn btn-yellow btn-sm"  onclick="openM3U('${id}');closeModal('mDetalhe')">📡 M3U</button>
      <button class="btn btn-danger btn-sm"  onclick="closeModal('mDetalhe');deleteClient('${id}')">🗑️ Excluir</button>
    </div>`;
  document.getElementById('btnDetEdit').onclick = () => { closeModal('mDetalhe'); editClient(id); };
  openModal('mDetalhe');
}

// ── RENOVAR ───────────────────────────────────────────────────────────
function openRenovar(id) {
  const c = clients.find(x => x.id === id); if (!c) return;
  renovId = id;
  const dl = getDL(c.data_vencimento);
  document.getElementById('renovInfo').innerHTML = `<div style="display:flex;gap:10px;align-items:center">
    <div class="avatar" style="background:${AVAT_COLS[0]};width:34px;height:34px;font-size:12px">${initials(c.nome)}</div>
    <div><div style="font-weight:700;font-size:13px">${c.nome}</div>
    <div style="color:var(--muted);font-size:11px;margin-top:2px">Plano: <strong>${c.plano_nome||'—'}</strong> | Vence: ${c.data_vencimento} | <span class="${exClass(dl)}">${dl<0?'VENCIDO':dl+'d restantes'}</span></div></div>
  </div>`;
  document.getElementById('rPlano').value = c.plano_nome || '';
  const p = planos.find(pl => pl.nome === c.plano_nome);
  document.getElementById('rValor').value = p ? p.preco : '';
  openModal('mRenovar');
}

async function confirmRenovar() {
  const c     = clients.find(x => x.id === renovId); if (!c) return;
  const dias   = +document.getElementById('rDur').value;
  const planNome = document.getElementById('rPlano').value;
  const plano  = planos.find(pl => pl.nome === planNome);
  const base   = getDL(c.data_vencimento) < 0 ? new Date() : new Date(c.data_vencimento);
  base.setDate(base.getDate() + dias);
  const novoVenc = base.toISOString().split('T')[0];
  const val  = +document.getElementById('rValor').value;
  const forma = document.getElementById('rForma').value;
  const obs  = document.getElementById('rObs').value || `Renovado ${dias}d via ${forma}`;
  setBtnLoading('btnRenovar', true);
  try {
    await sbPatch('clientes', renovId, { plano_id: plano?.id||null, plano_nome: plano?.nome||planNome||null, data_vencimento: novoVenc, status: 'ativo', updated_at: new Date().toISOString() });
    await sbPost('historico_clientes', { user_id: currentUser.id, cliente_id: renovId, tipo: 'Renovação', descricao: obs });
    if (val > 0) await sbPost('pagamentos', { user_id: currentUser.id, cliente_id: renovId, plano_id: plano?.id||null, valor: val, metodo_pagamento: forma, status: 'pago', data_vencimento: novoVenc, data_pagamento: new Date().toISOString().split('T')[0], observacoes: obs });
    if (document.getElementById('rSendTg')?.checked) await tgNotificarRenovacao(renovId, planNome, novoVenc);
    if (document.getElementById('rSendWA')?.checked) sendWAById(renovId);
    closeModal('mRenovar');
    await reloadAll();
    toast(`🔄 ${c.nome} renovado até ${novoVenc}!`, 'success');
  } catch(e) { toast('Erro: ' + e.message, 'error', 5000); }
  finally { setBtnLoading('btnRenovar', false); }
}

// ── RENOVAÇÃO EM LOTE ─────────────────────────────────────────────────
function openRenovacaoLote() {
  const selecionados = [...document.querySelectorAll('.chk-row:checked')].map(c => c.dataset.id);
  let lista = selecionados.length > 0
    ? clients.filter(c => selecionados.includes(c.id))
    : clients.filter(c => getDL(c.data_vencimento) <= 7);
  document.getElementById('loteList').innerHTML = lista.map(c => {
    const dl = getDL(c.data_vencimento);
    return `<div class="lote-item">
      <input type="checkbox" class="lote-check lote-row" data-id="${c.id}" checked style="width:auto">
      <div style="flex:1"><div style="font-weight:600">${c.nome}</div>
      <div style="font-size:10px;color:var(--muted)">${c.plano_nome||'—'} | <span class="${exClass(dl)}">${dl<0?-dl+'d vencido':dl+'d'}</span></div></div>
    </div>`;
  }).join('') || '<div class="empty-state"><p>Nenhum cliente vencido/vencendo</p></div>';
  document.getElementById('lotePlano').innerHTML = planos.map(p => `<option value="${p.nome}">${p.nome} — R$ ${p.preco}</option>`).join('');
  atualizarLoteSel();
  openModal('mLote');
}

function loteSelectAll()     { document.querySelectorAll('.lote-row').forEach(c => c.checked = true); atualizarLoteSel(); }
function loteSelectVencidos(){ document.querySelectorAll('.lote-row').forEach(c => { const cl = clients.find(x=>x.id===c.dataset.id); c.checked = cl ? getDL(cl.data_vencimento) < 0 : false; }); atualizarLoteSel(); }
function loteSelectVencendo(){ document.querySelectorAll('.lote-row').forEach(c => { const cl = clients.find(x=>x.id===c.dataset.id); c.checked = cl ? getDL(cl.data_vencimento)<=7&&getDL(cl.data_vencimento)>=0 : false; }); atualizarLoteSel(); }
function atualizarLoteSel()  { const n = document.querySelectorAll('.lote-row:checked').length; document.getElementById('loteSel').textContent = n + ' selecionado' + (n!==1?'s':''); }

async function confirmarLote() {
  const ids = [...document.querySelectorAll('.lote-row:checked')].map(c => c.dataset.id);
  if (!ids.length) { toast('Selecione pelo menos um cliente!', 'warn'); return; }
  const dias    = +document.getElementById('loteDur').value;
  const planNome = document.getElementById('lotePlano').value;
  const plano   = planos.find(p => p.nome === planNome);
  const val     = +document.getElementById('loteValor').value;
  const forma   = document.getElementById('loteForma').value;
  setBtnLoading('btnLote', true);
  let ok = 0, err = 0;
  for (const id of ids) {
    try {
      const c = clients.find(x => x.id === id); if (!c) continue;
      const base = getDL(c.data_vencimento) < 0 ? new Date() : new Date(c.data_vencimento);
      base.setDate(base.getDate() + dias);
      const novoVenc = base.toISOString().split('T')[0];
      await sbPatch('clientes', id, { plano_id: plano?.id||null, plano_nome: plano?.nome||planNome||null, data_vencimento: novoVenc, status: 'ativo', updated_at: new Date().toISOString() });
      await sbPost('historico_clientes', { user_id: currentUser.id, cliente_id: id, tipo: 'Renovação', descricao: `Renovação em lote ${dias}d` });
      if (val > 0) await sbPost('pagamentos', { user_id: currentUser.id, cliente_id: id, plano_id: plano?.id||null, valor: val, metodo_pagamento: forma, status: 'pago', data_vencimento: novoVenc, data_pagamento: new Date().toISOString().split('T')[0] });
      ok++;
    } catch(e) { err++; }
  }
  closeModal('mLote');
  await reloadAll();
  toast(`🔄 ${ok} renovado${ok!==1?'s':''}${err>0?` (${err} erro${err!==1?'s':''})`:''} !`, err>0?'warn':'success');
  setBtnLoading('btnLote', false);
}

// ── M3U / WHATSAPP ────────────────────────────────────────────────────
function openM3U(id) {
  editClient(id);
  setTimeout(() => {
    document.querySelectorAll('#mEditar .tab').forEach((t,i) => t.classList.toggle('active', i===1));
    document.querySelectorAll('#mEditar .tab-content').forEach((c,i) => c.classList.toggle('active', i===1));
  }, 60);
}
function sendWA() {
  const c = clients.find(x => x.id === editId); if (!c) return;
  const msg = encodeURIComponent(`📡 *Acesso IPTV*\n🔗 M3U: ${buildM3U(c)}\n📺 EPG: ${buildEPG(c)}\n👤 Usuário: ${c.usuario_iptv}\n🔒 Senha: ${c.senha_iptv}`);
  window.open(`https://wa.me/55${(c.whatsapp||'').replace(/\D/g,'')}?text=${msg}`, '_blank');
}
function sendWAById(id) {
  const c = clients.find(x => x.id === id); if (!c) return;
  const dl  = getDL(c.data_vencimento);
  const msg = `Olá ${c.nome.split(' ')[0]}! 👋\n\n${dl<0?'Sua assinatura IPTV está *vencida*.':'Vence em *'+dl+' dias* ('+c.data_vencimento+').'}\n\nRenove agora! 📡`;
  window.open(`https://wa.me/55${(c.whatsapp||'').replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');
}
function copyAllM3U() {
  const c = clients.find(x => x.id === editId); if (!c) return;
  navigator.clipboard.writeText(`M3U: ${buildM3U(c)}\nEPG: ${buildEPG(c)}\nUsuário: ${c.usuario_iptv}\nSenha: ${c.senha_iptv}`).then(() => toast('Dados copiados!', 'info'));
}

// ── TELEGRAM ──────────────────────────────────────────────────────────
async function tgSend(chatId, text) {
  const token = cfg.telegram_bot_token;
  if (!token)  throw new Error('Token do Telegram não configurado.');
  if (!chatId) throw new Error('Chat ID não informado.');
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.description || 'Erro ao enviar');
  return d;
}

async function enviarTg() {
  const msg    = document.getElementById('tgMsg').value.trim();
  const chatId = document.getElementById('tgChatId').value.trim();
  const fb     = document.getElementById('tgFeedback');
  if (!msg) { toast('Digite uma mensagem!', 'error'); return; }
  setBtnLoading('btnEnviarTg', true);
  try {
    await tgSend(chatId || cfg.telegram_chat_id, msg);
    const c = clients.find(x => x.id === editId);
    if (c) await sbPost('historico_clientes', { user_id: currentUser.id, cliente_id: editId, tipo: 'Telegram', descricao: `Msg: ${msg.substring(0,60)}` });
    fb.innerHTML = `<div style="color:var(--green);font-size:12px;margin-top:6px">✅ Enviado!</div>`;
    document.getElementById('tgMsg').value = '';
    toast('✈️ Mensagem enviada!', 'success');
  } catch(e) { fb.innerHTML = `<div style="color:var(--accent3);font-size:12px;margin-top:6px">❌ ${e.message}</div>`; }
  finally { setBtnLoading('btnEnviarTg', false); }
}

async function tgEnviarM3U() {
  const c = clients.find(x => x.id === editId); if (!c) return;
  try {
    await tgSend(c.telegram_id || cfg.telegram_chat_id, `📡 *Seus dados IPTV*\n\n👤 Usuário: \`${c.usuario_iptv}\`\n🔒 Senha: \`${c.senha_iptv}\`\n🔗 M3U: \`${buildM3U(c)}\`\n\n✅ Bom entretenimento!`);
    toast('📡 M3U enviado via Telegram!', 'success');
  } catch(e) { toast('Erro: ' + e.message, 'error'); }
}

async function tgNotificarRenovacao(cid, plano, venc) {
  const c = clients.find(x => x.id === cid); if (!c || !cfg.telegram_bot_token) return;
  const chatId = c.telegram_id || cfg.telegram_chat_id; if (!chatId) return;
  try { await tgSend(chatId, `✅ *Renovação confirmada!*\n\nOlá ${c.nome.split(' ')[0]}!\nPlano: *${plano}*\nNovo vencimento: *${venc}*\n\nObrigado! 📡`); } catch(e) {}
}

async function testTg() {
  const token  = document.getElementById('cfgTgt').value.trim();
  const chatId = document.getElementById('cfgTgc').value.trim();
  if (!token) { toast('Informe o token!', 'error'); return; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const d = await r.json();
    if (!d.ok) throw new Error(d.description);
    toast(`✅ Bot conectado: ${d.result.first_name}`, 'success', 4000);
    if (chatId) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chat_id: chatId, text: '✅ *IPTV PRO conectado!* Notificações funcionando.', parse_mode: 'Markdown' }) });
      toast('📨 Mensagem de teste enviada!', 'success', 3000);
    }
  } catch(e) { toast('Erro: ' + e.message, 'error', 5000); }
}

// Templates Telegram
function tplRenovacao()  { const c = clients.find(x=>x.id===editId); if(!c)return; document.getElementById('tgMsg').value=`✅ *Renovação confirmada!*\n\nOlá ${c.nome.split(' ')[0]}! 🎉\n📋 Plano: *${c.plano_nome||'—'}*\n📅 Vencimento: *${c.data_vencimento}*\n\nQualquer dúvida é só chamar! 📡`; }
function tplVencimento() { const c = clients.find(x=>x.id===editId); if(!c)return; const dl=getDL(c.data_vencimento); document.getElementById('tgMsg').value=dl<0?`⚠️ *Assinatura vencida!*\n\nOlá ${c.nome.split(' ')[0]}, sua assinatura venceu há *${-dl} dias*.\nRenove agora! 📡`:`⏰ *Aviso de vencimento*\n\nOlá ${c.nome.split(' ')[0]}! Vence em *${dl} dia${dl!==1?'s':''}* (${c.data_vencimento}).\nRenove com antecedência! 📡`; }
function tplCredenciais(){ const c = clients.find(x=>x.id===editId); if(!c)return; document.getElementById('tgMsg').value=`📡 *Seus dados de acesso IPTV*\n\n👤 Usuário: \`${c.usuario_iptv}\`\n🔒 Senha: \`${c.senha_iptv}\`\n\n🔗 M3U:\n\`${buildM3U(c)}\``; }
function tplBoasVindas() { const c = clients.find(x=>x.id===editId); if(!c)return; document.getElementById('tgMsg').value=`👋 *Bem-vindo ao IPTV!*\n\nOlá ${c.nome.split(' ')[0]}! 🎉\n\n👤 Usuário: \`${c.usuario_iptv}\`\n🔒 Senha: \`${c.senha_iptv}\`\n📅 Válido até: *${c.data_vencimento}*\n📋 Plano: *${c.plano_nome||'—'}*\n\nBom entretenimento! 📡`; }

// ── PLANOS ────────────────────────────────────────────────────────────
const PLAN_COLORS = ['#00d4ff','#7b2fff','#f0b800','#00cc6a','#ff2d78'];

function renderPlanos() {
  const pc = {}; clients.forEach(c => pc[c.plano_nome] = (pc[c.plano_nome]||0) + 1);
  document.getElementById('planosGrid').innerHTML = planos.map((p, i) => `
    <div class="plan-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div style="font-size:22px">📺</div><span class="badge badge-active">${pc[p.nome]||0} clientes</span>
      </div>
      <div style="font-family:'Orbitron',monospace;font-size:12.5px;font-weight:700;color:${PLAN_COLORS[i%PLAN_COLORS.length]};margin-bottom:4px">${p.nome}</div>
      <div style="font-size:19px;font-weight:700;margin-bottom:4px">R$ ${p.preco}<span style="font-size:10px;color:var(--muted);font-weight:400">/mês</span></div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:11px">${p.descricao||''}</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:12px">📅 ${p.duracao_dias}d &nbsp;|&nbsp; 📱 ${p.max_telas} tela${p.max_telas>1?'s':''} &nbsp;|&nbsp; ${p.qualidade||'HD'}</div>
      <div style="margin-bottom:9px">
        <div style="font-size:9.5px;color:var(--muted);margin-bottom:3px">${Math.round((pc[p.nome]||0)/Math.max(clients.length,1)*100)}% dos clientes</div>
        <div class="prog-bar"><div class="prog-fill" style="width:${Math.round((pc[p.nome]||0)/Math.max(clients.length,1)*100)}%;background:${PLAN_COLORS[i%PLAN_COLORS.length]}"></div></div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="editPlan('${p.id}')">✏️ Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deletePlan('${p.id}','${p.nome}')">🗑️</button>
      </div>
    </div>`).join('');
}

async function addPlan() {
  const nome = document.getElementById('pNome').value.trim();
  if (!nome) { toast('Informe o nome!', 'error'); return; }
  setBtnLoading('btnAddPlan', true);
  try {
    const payload = {
      user_id:      currentUser.id,
      nome, preco:  +document.getElementById('pValor').value,
      duracao_dias: +document.getElementById('pDias').value,
      max_telas:    +document.getElementById('pDevs').value,
      qualidade:    document.getElementById('pQual').value,
      descricao:    document.getElementById('pDesc').value,
      ativo:        document.getElementById('pAtivo').value === 'true'
    };
    if (editingPlanId) { await sbPatch('planos', editingPlanId, payload); toast(`✅ Plano ${nome} atualizado!`, 'success'); }
    else { await sbPost('planos', payload); toast(`✅ Plano ${nome} criado!`, 'success'); }
    editingPlanId = null;
    document.getElementById('modalPlanoTitle').textContent = 'NOVO PLANO';
    ['pNome','pValor','pDias','pDesc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = id==='pDias'?'30':''; });
    closeModal('mPlano');
    await loadPlanos(); renderPlanos();
  } catch(e) { toast('Erro: ' + e.message, 'error', 5000); }
  finally { setBtnLoading('btnAddPlan', false); }
}

function editPlan(id) {
  const p = planos.find(x => x.id === id); if (!p) return;
  editingPlanId = id;
  document.getElementById('modalPlanoTitle').textContent = 'EDITAR PLANO';
  document.getElementById('pNome').value  = p.nome;
  document.getElementById('pValor').value = p.preco;
  document.getElementById('pDias').value  = p.duracao_dias;
  document.getElementById('pDevs').value  = p.max_telas;
  document.getElementById('pQual').value  = p.qualidade || 'HD';
  document.getElementById('pDesc').value  = p.descricao || '';
  document.getElementById('pAtivo').value = p.ativo ? 'true' : 'false';
  openModal('mPlano');
}

function deletePlan(id, nome) {
  confirm2('🗑️', 'Excluir plano?', `"${nome}" será desativado.`, 'btn-danger', 'Excluir', async () => {
    try { await sbPatch('planos', id, { ativo: false }); await loadPlanos(); renderPlanos(); toast(`🗑️ Plano "${nome}" removido.`, 'error'); }
    catch(e) { toast('Erro: ' + e.message, 'error'); }
  });
}

async function loadPlanos() {
  try {
    planos = await sbGet('planos', `?user_id=eq.${currentUser.id}&ativo=eq.true&order=preco.asc`);
    populatePlanSelects();
  } catch(e) { console.error(e); }
}

function populatePlanSelects() {
  const opts = planos.map(p => `<option value="${p.nome}">${p.nome} — R$ ${p.preco}</option>`).join('');
  ['nPlano'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = '<option value="">Selecione...</option>' + opts; });
  ['ePlano','rPlano'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = opts; });
}

// ── CSV IMPORT / EXPORT ───────────────────────────────────────────────
function exportCSV() {
  const h = ['Nome','WhatsApp','Email','Plano','Status','Vencimento','Dispositivos','Usuário IPTV'];
  const rows = clients.map(c => [c.nome, c.whatsapp||'', c.email||'', c.plano_nome||'', STATUS_MAP[c.status]?.l||c.status, c.data_vencimento, c.dispositivos||1, c.usuario_iptv||'']);
  const csv  = [h, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const a    = document.createElement('a');
  a.href     = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = `clientes_iptv_${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); toast('📥 CSV exportado!', 'success');
}

// Export de pagamentos
function exportPagamentosCSV() {
  const h = ['Cliente','Data','Valor','Forma','Status','Observação'];
  const rows = pagamentos.map(p => {
    const nome = clients.find(c=>c.id===p.cliente_id)?.nome || '—';
    return [nome, p.data_pagamento||'—', p.valor||0, p.metodo_pagamento||'—', p.status||'—', p.observacoes||''];
  });
  const csv = [h, ...rows].map(r => r.map(v=>`"${v}"`).join(',')).join('\n');
  const a   = document.createElement('a');
  a.href    = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = `pagamentos_iptv_${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); toast('📥 Pagamentos exportados!', 'success');
}

function downloadCSVTemplate() {
  const csv = 'nome,whatsapp,email,usuario_m3u,senha_m3u,plano_nome,vencimento\nJoão Silva,11999990000,joao@email.com,joao123,senha123,Básico,2025-12-31';
  const a   = document.createElement('a');
  a.href    = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = 'modelo_clientes.csv'; a.click();
}

function handleCSVFile(input) { if (input.files[0]) readCSV(input.files[0]); }
function handleCSVDrop(e) {
  e.preventDefault(); document.getElementById('csvDrop').classList.remove('over');
  const file = e.dataTransfer.files[0]; if (file) readCSV(file);
}

function readCSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const lines   = e.target.result.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g,'').toLowerCase());
    csvData = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g,''));
      const obj  = {}; headers.forEach((h,i) => obj[h] = vals[i]||'');
      return obj;
    }).filter(r => r.nome);
    showCSVPreview();
  };
  reader.readAsText(file, 'UTF-8');
}

function showCSVPreview() {
  const p = document.getElementById('csvPreview');
  if (!csvData.length) { p.innerHTML = '<div class="empty-state" style="padding:14px"><p>Nenhum dado válido encontrado</p></div>'; return; }
  p.innerHTML = `<div style="margin-top:12px;font-size:12px;color:var(--muted);margin-bottom:6px">Encontrados <strong style="color:var(--text)">${csvData.length}</strong> registros — prévia:</div>
    <div class="csv-preview"><table style="font-size:11px;width:100%;border-collapse:collapse">
      <thead><tr>${Object.keys(csvData[0]).map(h=>`<th style="padding:5px 8px;text-align:left;color:var(--muted);border-bottom:1px solid var(--border)">${h}</th>`).join('')}</tr></thead>
      <tbody>${csvData.slice(0,5).map(r=>`<tr>${Object.values(r).map(v=>`<td style="padding:5px 8px;border-bottom:1px solid rgba(26,42,74,.3)">${v}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>${csvData.length>5?`<div style="padding:6px 8px;font-size:11px;color:var(--muted)">... e mais ${csvData.length-5}</div>`:''}</div>`;
  document.getElementById('btnImportCSV').disabled = false;
}

async function importarCSV() {
  if (!csvData.length) { toast('Nenhum dado para importar!', 'warn'); return; }
  setBtnLoad('btnImportCSV', true, 'IMPORTANDO...');
  let ok = 0, err = 0;
  for (const row of csvData) {
    try {
      const plano = planos.find(p => p.nome.toLowerCase() === (row.plano_nome||'').toLowerCase());
      await sbPost('clientes', {
        user_id:      currentUser.id,
        nome:         row.nome || 'Sem nome',
        whatsapp:     (row.whatsapp||'').replace(/\D/g,''),
        email:        row.email || null,
        usuario_iptv: row.usuario_m3u || row.usuario_iptv || row.usuario || '',
        senha_iptv:   row.senha_m3u   || row.senha_iptv   || row.senha   || '',
        plano_id:     plano?.id   || null,
        plano_nome:   row.plano_nome  || plano?.nome || '',
        status:       'ativo',
        data_inicio:  new Date().toISOString().split('T')[0],
        data_vencimento: row.vencimento || new Date(Date.now()+30*86400000).toISOString().split('T')[0],
        dispositivos: 1
      });
      ok++;
    } catch(e) { err++; }
  }
  document.getElementById('csvResult').innerHTML = `<div style="padding:10px;border-radius:8px;background:${ok>0?'rgba(0,204,106,.08)':'rgba(255,45,120,.08)'};border:1px solid ${ok>0?'rgba(0,204,106,.25)':'rgba(255,45,120,.25)'};font-size:13px;margin-top:8px">
    ${ok>0?`✅ <strong>${ok}</strong> cliente${ok!==1?'s':''} importado${ok!==1?'s':''}`:''} ${err>0?` ⚠️ <strong>${err}</strong> erro${err!==1?'s':''}`:''}</div>`;
  setBtnLoad('btnImportCSV', false, '📤 Importar');
  if (ok > 0) { await reloadAll(); csvData = []; }
}
