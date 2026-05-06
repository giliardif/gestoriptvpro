// =====================================================================
// iptv-mercadopago.js — Mercado Pago: cupom, planos, PIX, cartão
// =====================================================================

let mpSelectedMethod  = 'pix';
let mpPollInterval    = null;
let mpPlanoSelecionado = null;
let mpPlanosTodos      = [];
let mpCupomAtual       = null;
let _cupomDebounce     = null;

// ── CUPOM ─────────────────────────────────────────────────────────────
function onCupomInput() {
  const val = document.getElementById('mpCupomInput')?.value?.trim();
  document.getElementById('mpCupomClear').style.display = val ? 'block' : 'none';
  if (mpCupomAtual && mpCupomAtual.codigo !== val.toUpperCase()) limparCupomSilencioso();
  clearTimeout(_cupomDebounce);
  if (val && val.length >= 3) _cupomDebounce = setTimeout(() => aplicarCupom(true), 800);
  else setFeedback('', '');
}

function setFeedback(msg, tipo) {
  const el = document.getElementById('mpCupomFeedback');
  if (el) { el.textContent = msg; el.className = 'cupom-feedback' + (tipo ? ' ' + tipo : ''); }
}

function limparCupomSilencioso() {
  mpCupomAtual = null;
  document.getElementById('mpCupomApplied')?.classList.add('hidden');
  const resumoEl = document.getElementById('mpPrecoResumo');
  if (resumoEl) resumoEl.style.display = 'none';
  atualizarPrecoResumo();
}

function limparCupom() {
  mpCupomAtual = null;
  const inp = document.getElementById('mpCupomInput');
  if (inp) inp.value = '';
  document.getElementById('mpCupomClear').style.display = 'none';
  document.getElementById('mpCupomApplied')?.classList.add('hidden');
  const resumoEl = document.getElementById('mpPrecoResumo');
  if (resumoEl) resumoEl.style.display = 'none';
  setFeedback('', '');
  atualizarPrecoResumo();
}

async function aplicarCupom(silencioso = false) {
  const codigo = document.getElementById('mpCupomInput')?.value?.trim().toUpperCase();
  if (!codigo) { if (!silencioso) toast('Digite o código do cupom!', 'warn'); return; }
  if (!mpPlanoSelecionado) { if (!silencioso) toast('Selecione um plano primeiro.', 'warn'); return; }

  setFeedback('⏳ Validando...', 'loading');
  try {
    const rows  = await sbGet('cupons', `?codigo=eq.${encodeURIComponent(codigo)}&ativo=eq.true&limit=1`);
    const cupom = rows?.[0];

    if (!cupom) { setFeedback('❌ Cupom inválido ou inativo.', 'err'); limparCupomSilencioso(); return; }
    if (cupom.validade && new Date(cupom.validade) < new Date()) { setFeedback('❌ Cupom vencido.', 'err'); limparCupomSilencioso(); return; }
    if (cupom.limite_usos && (cupom.usos_realizados || 0) >= cupom.limite_usos) { setFeedback('❌ Cupom esgotado.', 'err'); limparCupomSilencioso(); return; }

    // Válido!
    mpCupomAtual = cupom;
    const descTxt = cupom.tipo === 'percentual'
      ? `${cupom.valor}% OFF`
      : `R$ ${Number(cupom.valor).toFixed(2).replace('.', ',')} OFF`;
    setFeedback(`✅ Cupom "${cupom.codigo}" aplicado — ${descTxt}`, 'ok');
    document.getElementById('mpCupomNome').textContent  = cupom.descricao || cupom.codigo;
    document.getElementById('mpCupomBadge').textContent = descTxt;
    document.getElementById('mpCupomApplied')?.classList.remove('hidden');
    atualizarPrecoResumo();
  } catch(e) {
    setFeedback('❌ Erro ao validar cupom.', 'err');
    console.error('aplicarCupom:', e);
  }
}

function calcularValorFinal(valorOriginal) {
  if (!mpCupomAtual) return valorOriginal;
  if (mpCupomAtual.tipo === 'percentual') {
    return Math.max(0, valorOriginal * (1 - Math.min(+mpCupomAtual.valor, 100) / 100));
  }
  return Math.max(0, valorOriginal - +mpCupomAtual.valor);
}

function atualizarPrecoResumo() {
  const p       = mpPlanoSelecionado;
  const resumoEl = document.getElementById('mpPrecoResumo');
  if (!p) { if (resumoEl) resumoEl.style.display = 'none'; return; }
  const valorOriginal = +p.preco;
  const valorFinal    = calcularValorFinal(valorOriginal);
  const temDesconto   = valorFinal < valorOriginal;
  if (resumoEl) resumoEl.style.display = 'flex';
  const origEl = document.getElementById('mpPrecoOriginal');
  const finEl  = document.getElementById('mpPrecoFinal');
  if (origEl) { origEl.textContent = temDesconto ? `R$ ${valorOriginal.toFixed(2).replace('.', ',')}` : ''; origEl.style.display = temDesconto ? 'inline' : 'none'; }
  if (finEl)  finEl.textContent = `R$ ${valorFinal.toFixed(2).replace('.', ',')}`;
  const priceEl = document.getElementById('mpPlanPrice');
  if (priceEl) priceEl.innerHTML = temDesconto
    ? `<span style="font-size:12px;text-decoration:line-through;color:var(--muted);margin-right:4px">R$ ${valorOriginal.toFixed(2).replace('.', ',')}</span><span style="color:var(--green)">R$ ${valorFinal.toFixed(2).replace('.', ',')}</span>`
    : `R$ ${valorOriginal.toFixed(2).replace('.', ',')}`;
}

// ── SELETOR DE MÉTODO ─────────────────────────────────────────────────
function selectMpMethod(method) {
  mpSelectedMethod = method;
  document.getElementById('mpMethodPix').classList.toggle('selected',  method === 'pix');
  document.getElementById('mpMethodCard').classList.toggle('selected', method === 'cartao');
  document.getElementById('mpPixQr').classList.remove('show');
  document.getElementById('mpCardForm').style.display = 'none';
  const btn = document.getElementById('btnMpPagar');
  if (btn) btn.textContent = method === 'pix' ? '⚡ Gerar PIX' : '💳 Pagar com Cartão';
}

// ── ABRIR MODAL ───────────────────────────────────────────────────────
async function openMpModal() {
  const el = id => document.getElementById(id);
  mpPlanoSelecionado = null;

  // Reset cupom
  mpCupomAtual = null;
  if (el('mpCupomInput'))  el('mpCupomInput').value = '';
  if (el('mpCupomClear'))  el('mpCupomClear').style.display = 'none';
  if (el('mpCupomApplied')) el('mpCupomApplied').classList.add('hidden');
  if (el('mpPrecoResumo')) el('mpPrecoResumo').style.display = 'none';
  setFeedback('', '');

  // Reset visual
  if (el('mpPlanInfoBox'))  el('mpPlanInfoBox').style.display  = 'none';
  if (el('mpPlanSelector')) el('mpPlanSelector').style.display = 'block';
  if (el('mpPlanOptions'))  el('mpPlanOptions').innerHTML = '<div style="text-align:center;padding:16px;color:var(--muted);font-size:12px">⏳ Carregando planos...</div>';
  if (el('mpPixQr'))    el('mpPixQr').classList.remove('show');
  if (el('mpCardForm')) el('mpCardForm').style.display = 'none';

  const planoAtual = (currentTenant?.plano_sistema || 'trial').toLowerCase();
  if (el('mpModalTitle')) el('mpModalTitle').textContent = planoAtual === 'trial' ? '⬆️ FAZER UPGRADE' : '💳 RENOVAR ASSINATURA';
  selectMpMethod('pix');

  // Pré-preencher nome e CPF
  const nomeEl = el('mpPayerNome');
  const cpfEl  = el('mpPayerCpf');
  if (nomeEl && !nomeEl.value) nomeEl.value = currentTenant?.nome || currentUser?.email?.split('@')[0] || '';
  if (cpfEl && !cpfEl.value && currentTenant?.cpf) {
    let c = currentTenant.cpf.replace(/\D/g, '');
    c = c.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    cpfEl.value = c;
  }

  openModal('mAssinatura');

  // Carregar planos do sistema
  try {
    mpPlanosTodos = await sbGet('planos_sistema', '?ativo=eq.true&order=preco.asc');
    if (!mpPlanosTodos.length) {
      if (el('mpPlanOptions')) el('mpPlanOptions').innerHTML = '<div style="text-align:center;padding:16px;color:var(--yellow);font-size:12px">⚠️ Nenhum plano disponível. Contate o administrador.</div>';
      return;
    }
    renderMpPlanOptions(planoAtual);
  } catch(e) {
    if (el('mpPlanOptions')) el('mpPlanOptions').innerHTML = '<div style="text-align:center;padding:16px;color:var(--accent3);font-size:12px">❌ Erro ao carregar planos.</div>';
  }
}

// ── RENDERIZAR OPÇÕES DE PLANO ────────────────────────────────────────
function renderMpPlanOptions(planoAtual) {
  const opts = document.getElementById('mpPlanOptions'); if (!opts) return;
  opts.innerHTML = mpPlanosTodos.map(p => {
    const isCurrent = p.nome?.toLowerCase() === planoAtual;
    return `<div class="mp-plan-option${isCurrent ? ' selected' : ''}" onclick="selectMpPlano('${p.id}')" id="mpOpt_${p.id}">
      <div class="mp-plan-option-left">
        <div class="mp-plan-option-name">${p.nome}${isCurrent ? '<span class="mp-current-badge">● atual</span>' : ''}</div>
        <div class="mp-plan-option-desc">${p.descricao || 'Acesso completo ao sistema'}${p.max_clientes ? ' · até ' + p.max_clientes + ' clientes' : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="mp-plan-option-price">R$ ${Number(p.preco).toFixed(2).replace('.', ',')}<span style="font-size:10px;color:var(--muted);font-weight:400">/mês</span></div>
        <div class="mp-plan-option-radio"></div>
      </div>
    </div>`;
  }).join('');
  const autoSelect = mpPlanosTodos.find(p => p.nome?.toLowerCase() === planoAtual) || mpPlanosTodos[0];
  if (autoSelect) selectMpPlano(autoSelect.id);
}

function selectMpPlano(id) {
  const p = mpPlanosTodos.find(x => x.id === id); if (!p) return;
  mpPlanoSelecionado = p;
  document.querySelectorAll('.mp-plan-option').forEach(el => el.classList.remove('selected'));
  document.getElementById('mpOpt_' + id)?.classList.add('selected');
  const el = elId => document.getElementById(elId);
  if (el('mpPlanName'))    el('mpPlanName').textContent    = p.nome;
  if (el('mpPlanPrice'))   el('mpPlanPrice').textContent   = 'R$ ' + Number(p.preco).toFixed(2).replace('.', ',');
  if (el('mpPlanInfoBox')) el('mpPlanInfoBox').style.display = 'flex';
  if (el('mpPixQr'))    el('mpPixQr').classList.remove('show');
  if (el('mpCardForm')) el('mpCardForm').style.display = 'none';
  atualizarPrecoResumo();
}

// ── PROCESSAR PAGAMENTO ───────────────────────────────────────────────
async function processarPagamento() {
  if (mpSelectedMethod === 'pix') await gerarPix();
  else await abrirCheckoutCartao();
}

// ── GERAR PIX ─────────────────────────────────────────────────────────
async function gerarPix() {
  const btn = document.getElementById('btnMpPagar');
  if (btn) { btn.textContent = '⏳ Gerando...'; btn.disabled = true; }
  try {
    // Credenciais MP do admin (tabela configuracoes, sem filtro de user_id)
    const cfgRows = await sbGet('configuracoes', '?limit=1&order=created_at.asc');
    const mpToken = cfgRows?.[0]?.mp_access_token;
    if (!mpToken) { toast('⚠️ Credenciais Mercado Pago não configuradas. Contate o administrador.', 'warn', 5000); return; }

    const p = mpPlanoSelecionado;
    if (!p) { toast('⚠️ Selecione um plano antes de pagar.', 'warn', 4000); return; }
    const valorOriginal = +p.preco;
    const valor         = calcularValorFinal(valorOriginal);
    if (!valorOriginal || valorOriginal <= 0) { toast('⚠️ Plano sem valor definido.', 'warn', 6000); return; }

    // Validar pagador
    const payerNome = document.getElementById('mpPayerNome')?.value?.trim();
    const payerCpf  = document.getElementById('mpPayerCpf')?.value?.replace(/\D/g, '');
    if (!payerNome) { toast('⚠️ Informe seu nome completo.', 'warn', 4000); document.getElementById('mpPayerNome')?.focus(); return; }
    if (!payerCpf || payerCpf.length !== 11) { toast('⚠️ Informe um CPF válido com 11 dígitos.', 'warn', 4000); document.getElementById('mpPayerCpf')?.focus(); return; }

    // Chamar API Mercado Pago
    const resp = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'Authorization':      'Bearer ' + mpToken,
        'X-Idempotency-Key':  currentUser.id + '-' + Date.now()
      },
      body: JSON.stringify({
        transaction_amount: Number(valor),
        description:        'IPTV PRO — Renovação Plano ' + p.nome,
        payment_method_id:  'pix',
        payer: {
          email:          currentUser.email,
          first_name:     payerNome.split(' ')[0],
          last_name:      payerNome.split(' ').slice(1).join(' ') || payerNome.split(' ')[0],
          identification: { type: 'CPF', number: payerCpf }
        }
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.message || data.error);

    // Registrar no Supabase
    await sbPost('pagamentos_sistema', {
      tenant_id:          currentTenant?.id || currentUser.id,
      valor:              Number(valor),
      status:             'pendente',
      metodo:             'pix',
      mp_payment_id:      String(data.id),
      cupom_codigo:       mpCupomAtual?.codigo || null,
      desconto_aplicado:  mpCupomAtual ? (valorOriginal - valor) : 0,
      created_at:         new Date().toISOString()
    }).catch(() => {});

    // Incrementar uso do cupom
    if (mpCupomAtual?.id) {
      sbPatch('cupons', mpCupomAtual.id, {
        usos_realizados: (mpCupomAtual.usos_realizados || 0) + 1
      }).catch(() => {});
    }

    // Exibir QR Code
    const qrCode   = data.point_of_interaction?.transaction_data?.qr_code;
    const qrBase64 = data.point_of_interaction?.transaction_data?.qr_code_base64;
    document.getElementById('mpPixQr')?.classList.add('show');
    const qrImg = document.getElementById('mpQrImg');
    if (qrImg && qrBase64) qrImg.innerHTML = `<img src="data:image/png;base64,${qrBase64}" style="width:160px;height:160px;border-radius:8px">`;
    const pixCode = document.getElementById('mpPixCode');
    if (pixCode) pixCode.textContent = qrCode || '—';

    // Salvar CPF/nome no tenant para próximas renovações
    if (currentTenant?.id && payerCpf) {
      sbPatch('tenants', currentTenant.id, { cpf: payerCpf, nome: payerNome || currentTenant.nome })
        .then(() => { if (currentTenant) { currentTenant.cpf = payerCpf; currentTenant.nome = payerNome || currentTenant.nome; } })
        .catch(() => {});
    }

    // Polling de status
    if (mpPollInterval) clearInterval(mpPollInterval);
    mpPollInterval = setInterval(() => checkPagamentoPix(data.id, mpToken), 5000);
    toast('✅ PIX gerado! Escaneie o QR Code para pagar.', 'success', 6000);
  } catch(e) {
    toast('Erro ao gerar PIX: ' + e.message, 'error', 6000);
  } finally {
    if (btn) { btn.textContent = '⚡ Gerar PIX'; btn.disabled = false; }
  }
}

// ── POLLING PIX ───────────────────────────────────────────────────────
async function checkPagamentoPix(paymentId, token) {
  try {
    const resp = await fetch('https://api.mercadopago.com/v1/payments/' + paymentId, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await resp.json();
    if (data.status === 'approved') {
      clearInterval(mpPollInterval);
      const rows = await sbGet('pagamentos_sistema', '?mp_payment_id=eq.' + paymentId + '&limit=1').catch(() => []);
      if (rows?.[0]?.id) await sbPatch('pagamentos_sistema', rows[0].id, { status: 'aprovado', data_pagamento: new Date().toISOString() }).catch(() => {});
      closeModal('mAssinatura');
      toast('🎉 Pagamento aprovado! Sua assinatura foi renovada.', 'success', 7000);
      setTimeout(() => reloadAll(), 1500);
    }
  } catch(e) {}
}

// ── CHECKOUT CARTÃO ───────────────────────────────────────────────────
async function abrirCheckoutCartao() {
  const btn = document.getElementById('btnMpPagar');
  if (btn) { btn.textContent = '⏳ Gerando link...'; btn.disabled = true; }
  try {
    const cfgRows = await sbGet('configuracoes', '?limit=1&order=created_at.asc');
    const mpToken = cfgRows?.[0]?.mp_access_token;
    if (!mpToken) { toast('⚠️ Credenciais Mercado Pago não configuradas.', 'warn', 5000); return; }
    const p = mpPlanoSelecionado;
    if (!p || !p.preco) { toast('⚠️ Selecione um plano.', 'warn', 4000); return; }
    const valor = calcularValorFinal(+p.preco);

    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + mpToken },
      body: JSON.stringify({
        items: [{ title: 'IPTV PRO — Plano ' + p.nome, quantity: 1, unit_price: Number(valor), currency_id: 'BRL' }],
        payer: { email: currentUser.email },
        back_urls: { success: 'https://gestoriptvpro.vercel.app', failure: 'https://gestoriptvpro.vercel.app' },
        auto_return: 'approved'
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.message || data.error);

    await sbPost('pagamentos_sistema', {
      tenant_id: currentTenant?.id || currentUser.id,
      valor: Number(valor), status: 'pendente', metodo: 'cartao',
      mp_preference_id: data.id, created_at: new Date().toISOString()
    }).catch(() => {});

    window.open(data.init_point, '_blank');
    document.getElementById('mpCardForm').style.display = 'block';
    toast('🔗 Checkout aberto em nova aba!', 'info');
  } catch(e) {
    toast('Erro: ' + e.message, 'error', 6000);
  } finally {
    if (btn) { btn.textContent = '💳 Pagar com Cartão'; btn.disabled = false; }
  }
}

// ── COPIAR PIX ────────────────────────────────────────────────────────
function copyPixCode() {
  const code = document.getElementById('mpPixCode')?.textContent;
  if (code && code !== '—') {
    navigator.clipboard.writeText(code).then(() => toast('📋 Código PIX copiado!', 'success'));
  }
}
