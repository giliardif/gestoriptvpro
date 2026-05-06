// =====================================================================
// iptv-whatsapp.js — WhatsApp Drawer: config, send, Evolution, Twilio
// =====================================================================

const WA_TPL_DEFAULT = {
  BV: `Olá {nome}! 🎉\n\nSeu acesso IPTV foi ativado!\n\n📺 Plano: {plano}\n📅 Válido até: {vencimento}\n🔗 Link M3U: {m3u}\n\nQualquer dúvida, é só chamar! 😊`,
  A3: `Olá {nome}! ⏰\n\nSeu plano IPTV vence em *3 dias* ({vencimento}).\n\n📺 {plano} — R$ {valor}\n\nPara renovar, entre em contato! 😊`,
  A1: `⚠️ Olá {nome}!\n\nSeu plano vence *amanhã* ({vencimento}).\n\n📺 {plano} — R$ {valor}\n\nRenove agora para não perder o acesso! 🚀`,
  CP: `✅ Olá {nome}!\n\nPagamento confirmado!\n\n💰 Valor: R$ {valor}\n📅 Novo vencimento: {vencimento}\n\nObrigado pela confiança! 🙏`,
};

let waProv = 'callmebot';

// ── HELPER SUPABASE PARA O DRAWER ─────────────────────────────────────
async function waFetch(path, opts = {}) {
  const isWrite = ['POST','PATCH','PUT','DELETE'].includes(opts.method);
  const res = await fetch(SB_URL + '/rest/v1/' + path, {
    ...opts,
    headers: { ...getHeaders(isWrite), ...(opts.headers || {}) }
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(e.message || res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

// ── DRAWER OPEN/CLOSE ─────────────────────────────────────────────────
function toggleWaDrawer() {
  document.getElementById('waDrawer').classList.contains('open') ? closeWaDrawer() : openWaDrawer();
}

function openWaDrawer() {
  document.getElementById('waDrawer').classList.add('open');
  document.getElementById('waOverlay').classList.add('open');
  document.getElementById('waDrawerBtn').classList.add('wa-icon-active');
  waLoadConfig();
  waLoadStats();
}

function closeWaDrawer() {
  document.getElementById('waDrawer').classList.remove('open');
  document.getElementById('waOverlay').classList.remove('open');
  document.getElementById('waDrawerBtn').classList.remove('wa-icon-active');
}

// ESC fecha o drawer
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeWaDrawer(); });

// ── TABS ──────────────────────────────────────────────────────────────
function waTab(id, btn) {
  document.querySelectorAll('.wa-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.wa-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('wap-' + id).classList.add('active');
  btn.classList.add('active');
  if (id === 'historico') waLoadHist();
}

// ── PROVEDOR ──────────────────────────────────────────────────────────
function waSelProv(id) {
  waProv = id;
  ['callmebot', 'evolution', 'twilio'].forEach(p => {
    document.getElementById('waprov-' + p).classList.toggle('sel', p === id);
    document.getElementById('waF-' + p).style.display = p === id ? 'block' : 'none';
  });
}

// ── CARREGAR CONFIG ───────────────────────────────────────────────────
async function waLoadConfig() {
  if (!currentUser) return;
  try {
    const data = await waFetch(`notificacoes_config?user_id=eq.${currentUser.id}&limit=1`);
    if (!data?.length) return;
    const d = data[0];
    waSelProv(d.provedor || 'callmebot');
    if (d.callmebot_apikey)   document.getElementById('waCbKey').value   = d.callmebot_apikey;
    if (d.evolution_instance) document.getElementById('waEvInst').value  = d.evolution_instance;
    if (d.twilio_sid)         document.getElementById('waTwSid').value   = d.twilio_sid;
    if (d.twilio_token)       document.getElementById('waTwToken').value = d.twilio_token;
    if (d.twilio_from)        document.getElementById('waTwFrom').value  = d.twilio_from;
    document.getElementById('waTogBV').checked = d.ativo_boas_vindas ?? true;
    document.getElementById('waTogA3').checked = d.ativo_aviso_3dias ?? true;
    document.getElementById('waTogA1').checked = d.ativo_aviso_1dia  ?? true;
    document.getElementById('waTogCP').checked = d.ativo_confirmacao ?? true;
    if (d.template_boas_vindas) document.getElementById('waTplBV').value = d.template_boas_vindas;
    if (d.template_aviso_3dias) document.getElementById('waTplA3').value = d.template_aviso_3dias;
    if (d.template_aviso_1dia)  document.getElementById('waTplA1').value = d.template_aviso_1dia;
    if (d.template_confirmacao) document.getElementById('waTplCP').value = d.template_confirmacao;
    if ((d.provedor || 'callmebot') === 'evolution' && d.evolution_instance) {
      setTimeout(() => waEvCheckStatus(), 500);
    }
  } catch(e) { console.warn('waLoadConfig:', e); }
}

// ── STATS (badge pulsante) ────────────────────────────────────────────
async function waLoadStats() {
  if (!currentUser) return;
  try {
    const data = await waFetch(`notificacoes_resumo?user_id=eq.${currentUser.id}&limit=1`);
    if (!data?.length) return;
    const d = data[0];
    document.getElementById('waSt1').textContent = d.total_enviadas  || 0;
    document.getElementById('waSt2').textContent = d.total_pendentes || 0;
    document.getElementById('waSt3').textContent = d.total_erros     || 0;
    const alertCount = (d.total_erros || 0) + (d.total_pendentes || 0);
    const badge = document.getElementById('waBadge');
    if (alertCount > 0) {
      badge.textContent = alertCount > 9 ? '9+' : alertCount;
      badge.classList.add('show');
    } else {
      badge.classList.remove('show');
    }
  } catch(e) {}
}

// ── SALVAR CONFIG ─────────────────────────────────────────────────────
async function waSalvar() {
  if (!currentUser) { toast('⚠️ Faça login primeiro', 'warn'); return; }
  const novaInstancia = document.getElementById('waEvInst').value.trim() || null;

  // Se trocou instância Evolution, deletar a anterior no servidor
  if (waProv === 'evolution' && novaInstancia) {
    try {
      const atual = await waFetch(`notificacoes_config?user_id=eq.${currentUser.id}&limit=1`);
      const instanciaAtual = atual?.[0]?.evolution_instance;
      if (instanciaAtual && instanciaAtual !== novaInstancia) {
        const confirmar = confirm(
          `⚠️ Você está trocando a instância\n\nDe: ${instanciaAtual}\nPara: ${novaInstancia}\n\nA instância anterior será deletada do servidor Evolution.\nConfirmar?`
        );
        if (!confirmar) return;
        const url = document.getElementById('waEvUrl').value.trim().replace(/\/$/, '');
        const key = document.getElementById('waEvKey').value.trim();
        try {
          const del = await fetch(`${url}/instance/delete/${instanciaAtual}`, {
            method: 'DELETE', headers: { 'apikey': key }
          });
          toast(del.ok ? `🗑️ Instância ${instanciaAtual} deletada` : `⚠️ Não foi possível deletar ${instanciaAtual}`, del.ok ? 'success' : 'warn');
        } catch(e) { toast('⚠️ Erro ao deletar instância antiga — continuando', 'warn'); }
      }
    } catch(e) { console.warn('Erro ao verificar instância atual:', e); }
  }

  const payload = {
    user_id:             currentUser.id,
    provedor:            waProv,
    callmebot_apikey:    document.getElementById('waCbKey').value.trim()   || null,
    evolution_instance:  novaInstancia,
    twilio_sid:          document.getElementById('waTwSid').value.trim()   || null,
    twilio_token:        document.getElementById('waTwToken').value.trim() || null,
    twilio_from:         document.getElementById('waTwFrom').value.trim()  || null,
    ativo_boas_vindas:   document.getElementById('waTogBV').checked,
    ativo_aviso_3dias:   document.getElementById('waTogA3').checked,
    ativo_aviso_1dia:    document.getElementById('waTogA1').checked,
    ativo_confirmacao:   document.getElementById('waTogCP').checked,
    template_boas_vindas: document.getElementById('waTplBV').value,
    template_aviso_3dias: document.getElementById('waTplA3').value,
    template_aviso_1dia:  document.getElementById('waTplA1').value,
    template_confirmacao: document.getElementById('waTplCP').value,
    updated_at: new Date().toISOString(),
  };
  try {
    await waFetch('notificacoes_config?on_conflict=user_id', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(payload)
    });
    toast('✅ Configurações WA salvas!', 'success');
    if (waProv === 'evolution' && novaInstancia) setTimeout(() => waEvCheckStatus(), 800);
  } catch(e) { toast('❌ Erro: ' + e.message, 'error'); }
}

// ── HISTÓRICO ─────────────────────────────────────────────────────────
async function waLoadHist() {
  if (!currentUser) return;
  const filtro = document.getElementById('waHistFiltro').value;
  const el     = document.getElementById('waHistContainer');
  el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted);font-size:13px">Carregando...</div>';
  try {
    let path = `notificacoes_fila?user_id=eq.${currentUser.id}&order=created_at.desc&limit=60&select=*,clientes(nome)`;
    if (filtro) path += `&status=eq.${filtro}`;
    const data = await waFetch(path);
    if (!data?.length) {
      el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted);font-size:13px">Nenhum registro</div>';
      return;
    }
    const tipoLabel = { boas_vindas:'🎉 BV', aviso_3dias:'⏰ 3d', aviso_1dia:'⚠️ 1d', confirmacao:'✅ Pag', manual:'🔧' };
    const rows = data.map(n => {
      const dt = n.created_at
        ? new Date(n.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
        : '—';
      return `<tr>
        <td style="color:var(--muted)">${dt}</td>
        <td style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${n.clientes?.nome || '—'}</td>
        <td style="font-family:monospace;color:#00bfb3;font-size:11px">${n.destinatario}</td>
        <td><span style="font-size:11px">${tipoLabel[n.tipo] || n.tipo}</span></td>
        <td><span class="ws-pill ws-${n.status==='enviado'?'env':n.status==='pendente'?'pen':'err'}">${n.status}</span></td>
      </tr>`;
    }).join('');
    el.innerHTML = `<table class="wa-hist-table"><thead><tr><th>Data</th><th>Cliente</th><th>Número</th><th>Tipo</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
  } catch(e) {
    el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--accent3);font-size:13px">Erro: ${e.message}</div>`;
  }
}

// ── FUNÇÃO CENTRAL DE ENVIO ───────────────────────────────────────────
async function waSendMsg(numero, texto) {
  // Recarrega config para garantir credenciais atualizadas
  let waCfg = null;
  try {
    const rows = await waFetch(`notificacoes_config?user_id=eq.${currentUser.id}&limit=1`);
    waCfg = rows?.[0] || null;
  } catch(e) {}

  const provedor = waCfg?.provedor || waProv;

  if (provedor === 'evolution') {
    // SEGURANÇA: URL e API Key lidas dos inputs hidden (valores fixos do admin)
    const url  = document.getElementById('waEvUrl').value.trim().replace(/\/$/, '');
    const inst = (waCfg?.evolution_instance || document.getElementById('waEvInst')?.value || '').trim();
    const key  = document.getElementById('waEvKey').value.trim();
    if (!url || !inst || !key) throw new Error('Evolution API: verifique o nome da instância');
    let num = numero.replace(/\D/g, '');
    if (!num.startsWith('55')) num = '55' + num;
    const r = await fetch(`${url}/message/sendText/${inst}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': key },
      body: JSON.stringify({ number: num, textMessage: { text: texto } })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || d.error || `HTTP ${r.status}`);
    return { ok: true };

  } else if (provedor === 'callmebot') {
    const apikey = waCfg?.callmebot_apikey || document.getElementById('waCbKey')?.value.trim();
    if (!apikey) throw new Error('CallMeBot: API Key não configurada');
    let num = numero.replace(/\D/g, '');
    if (!num.startsWith('55')) num = '55' + num;
    const r = await fetch(`https://api.callmebot.com/whatsapp.php?phone=${num}&text=${encodeURIComponent(texto)}&apikey=${apikey}`);
    if (!r.ok) throw new Error(`CallMeBot HTTP ${r.status}`);
    return { ok: true };

  } else if (provedor === 'twilio') {
    const sid   = waCfg?.twilio_sid   || document.getElementById('waTwSid')?.value.trim();
    const token = waCfg?.twilio_token || document.getElementById('waTwToken')?.value.trim();
    const from  = waCfg?.twilio_from  || document.getElementById('waTwFrom')?.value.trim();
    if (!sid || !token || !from) throw new Error('Twilio não configurado');
    let num = numero.replace(/\D/g, '');
    if (!num.startsWith('55')) num = '55' + num;
    const body = new URLSearchParams({ To: `whatsapp:+${num}`, From: `whatsapp:+${from}`, Body: texto });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || `HTTP ${r.status}`);
    return { ok: true };

  } else {
    throw new Error('Selecione e configure um provedor de WhatsApp');
  }
}

// ── TESTE DE ENVIO ────────────────────────────────────────────────────
async function waEnviarTeste() {
  if (!currentUser) { toast('⚠️ Faça login primeiro', 'warn'); return; }
  const num  = document.getElementById('waTestNum').value.replace(/\D/g, '');
  const tipo = document.getElementById('waTestTipo').value;
  if (!num || num.length < 10) { toast('⚠️ Digite um número válido (com DDD)', 'warn'); return; }
  const tplMap = { boas_vindas:'waTplBV', aviso_3dias:'waTplA3', aviso_1dia:'waTplA1', confirmacao:'waTplCP' };
  const msg = document.getElementById(tplMap[tipo]).value
    .replace(/{nome}/g,       'João Teste')
    .replace(/{plano}/g,      'Premium')
    .replace(/{vencimento}/g, '30/04/2025')
    .replace(/{valor}/g,      '40.00')
    .replace(/{m3u}/g,        'http://servidor.com/get.php?user=teste');
  const btn = document.getElementById('waBtnTeste');
  btn.disabled = true; btn.textContent = '⏳ Enviando...';
  try {
    await waSendMsg(num, msg);
    toast('✅ Mensagem enviada com sucesso!', 'success');
    await waFetch('notificacoes_fila', {
      method: 'POST',
      body: JSON.stringify({ user_id: currentUser.id, tipo: 'manual_teste', destinatario: num, mensagem: msg, status: 'enviado' })
    }).catch(() => {});
    waLoadStats();
  } catch(e) {
    toast('❌ Erro ao enviar: ' + e.message, 'error');
    console.error('[waSendMsg]', e);
  }
  btn.disabled = false; btn.textContent = '▶ Enviar Teste';
}

// ── EVOLUTION API HELPERS ─────────────────────────────────────────────
async function waEvGetCreds() {
  const url  = document.getElementById('waEvUrl').value.trim().replace(/\/$/, '');
  const inst = document.getElementById('waEvInst').value.trim();
  const key  = document.getElementById('waEvKey').value.trim();
  if (!inst) { toast('⚠️ Informe o nome da Instância', 'warn'); return null; }
  if (!url || !key) { toast('⚠️ Configuração do servidor incompleta. Contate o administrador.', 'warn'); return null; }
  return { url, inst, key };
}

async function waEvCreateInstance() {
  const c = await waEvGetCreds(); if (!c) return;
  try {
    const r = await fetch(`${c.url}/instance/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': c.key },
      body: JSON.stringify({ instanceName: c.inst, qrcode: true, integration: 'WHATSAPP-BAILEYS' })
    });
    const d = await r.json();
    if (r.ok) {
      toast('✅ Instância criada! Agora clique em "Ver Status / QR"', 'success');
      if (d.qrcode?.base64) waEvShowQR(d.qrcode.base64);
      else waEvCheckStatus();
    } else {
      if (d.message?.includes('already') || d.message?.includes('existe')) {
        toast('ℹ️ Instância já existe. Verificando status...', 'info');
        waEvCheckStatus();
      } else {
        toast('❌ Erro: ' + (d.message || JSON.stringify(d)), 'error');
      }
    }
  } catch(e) { toast('❌ Erro ao criar instância: ' + e.message, 'error'); }
}

async function waEvCheckStatus() {
  const c = await waEvGetCreds(); if (!c) return;
  const statusEl = document.getElementById('waEvStatus');
  const dot      = document.getElementById('waEvStatusDot');
  const txt      = document.getElementById('waEvStatusTxt');
  const qrArea   = document.getElementById('waEvQrArea');
  const connArea = document.getElementById('waEvConnected');
  statusEl.style.display = 'block';
  dot.style.background   = 'var(--muted)';
  txt.textContent        = 'Verificando...';
  qrArea.style.display   = 'none';
  connArea.style.display = 'none';
  try {
    const r = await fetch(`${c.url}/instance/connectionState/${c.inst}`, { headers: { 'apikey': c.key } });
    const d = await r.json();
    const state = d.instance?.state || d.state || '';
    if (state === 'open') {
      dot.style.background = 'var(--accent2)';
      txt.textContent      = 'Conectado ✅';
      txt.style.color      = 'var(--accent2)';
      connArea.style.display = 'block';
      qrArea.style.display   = 'none';
    } else if (state === 'close' || state === 'connecting' || !state) {
      dot.style.background = 'var(--accent3)';
      txt.textContent      = 'Desconectado — escaneie o QR Code';
      txt.style.color      = 'var(--accent3)';
      connArea.style.display = 'none';
      await waEvGetQR();
    } else {
      dot.style.background = '#f0b800';
      txt.textContent      = 'Status: ' + state;
      txt.style.color      = '#f0b800';
    }
  } catch(e) {
    dot.style.background = 'var(--accent3)';
    txt.textContent      = 'Erro ao conectar com a API';
    txt.style.color      = 'var(--accent3)';
    toast('❌ Erro: ' + e.message, 'error');
  }
}

async function waEvGetQR() {
  const c = await waEvGetCreds(); if (!c) return;
  const qrArea = document.getElementById('waEvQrArea');
  const qrImg  = document.getElementById('waEvQrImg');
  qrArea.style.display = 'block';
  qrImg.innerHTML = '<div style="color:#999;font-size:12px;padding:20px">⏳ Gerando QR Code...</div>';
  try {
    const r = await fetch(`${c.url}/instance/connect/${c.inst}`, { headers: { 'apikey': c.key } });
    const d = await r.json();
    const base64 = d.base64 || d.qrcode?.base64 || d.qr;
    if (base64) waEvShowQR(base64);
    else qrImg.innerHTML = '<div style="color:var(--accent3);font-size:11px;padding:10px">Não foi possível gerar o QR Code.<br>Verifique se a instância existe.</div>';
  } catch(e) {
    qrImg.innerHTML = '<div style="color:var(--accent3);font-size:11px;padding:10px">Erro: ' + e.message + '</div>';
  }
}

function waEvShowQR(base64) {
  const qrArea = document.getElementById('waEvQrArea');
  const qrImg  = document.getElementById('waEvQrImg');
  qrArea.style.display = 'block';
  const src = base64.startsWith('data:') ? base64 : 'data:image/png;base64,' + base64;
  qrImg.innerHTML = `<img src="${src}" style="width:180px;height:180px;border-radius:6px;display:block">`;
}

// ── ACCORDION TEMPLATES ───────────────────────────────────────────────
function waToggleAcc(hdr) { hdr.classList.toggle('open'); }

function waResetTpl(k) {
  if (confirm('Restaurar template para o padrão?'))
    document.getElementById('waTpl' + k).value = WA_TPL_DEFAULT[k];
}

function waInsert(id, v) {
  const el = document.getElementById(id);
  const s  = el.selectionStart, e = el.selectionEnd;
  el.value = el.value.substring(0, s) + v + el.value.substring(e);
  el.selectionStart = el.selectionEnd = s + v.length;
  el.focus();
}
