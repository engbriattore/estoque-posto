const REGIOES = [
  "América do Sul",
  "Caribe e América Central",
  "América do Norte",
  "Europa",
  "África",
  "Oriente Médio",
  "Ásia",
  "Oceania",
];

const ABAS = ["exterior", "brasil", "estados"];
const CORES = { 13: "var(--lula)", 22: "var(--flavio)" };

const numFmt = new Intl.NumberFormat("pt-BR");
const pctFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const horaFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});

const estado = {
  dados: null,
  aba: "exterior",
  regiao: "todas",
  abertos: new Set(),
  carregando: false,
  ordemManual: false,
  sugeriuApurado: false,
};

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function fold(value) {
  return String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function cor(numero) {
  return CORES[numero] || "var(--ink)";
}

function largura(valor) {
  const n = Number(valor) || 0;
  return Math.max(0, Math.min(100, n));
}

function relogio() {
  $("relogio").textContent = `2º turno · ${horaFmt.format(new Date())} · Brasília`;
}

function fraseDelta(valor) {
  if (valor == null) return "";
  const absoluto = pctFmt.format(Math.abs(valor));
  if (Math.abs(valor) < 0.05) return "igual ao Brasil";
  return valor > 0 ? `${absoluto} p.p. acima do Brasil` : `${absoluto} p.p. abaixo do Brasil`;
}

function quando(atualizado) {
  if (!atualizado) return "";
  const [data, tempo = ""] = atualizado.split(" ");
  const [dia, mes] = data.split("/");
  return `${dia}/${mes}, ${tempo.slice(0, 5)}`;
}

function htmlPessoa(cand, delta) {
  const contando = cand.votos > 0;
  const tom = cor(cand.numero);
  return `<article class="pessoa" style="--tom:${tom}">
    <div class="pessoa-topo">
      <div class="avatar">
        <img src="${esc(cand.foto)}" alt="" width="36" height="36" referrerpolicy="no-referrer" onerror="this.classList.add('falhou')">
        <span class="avatar-fallback" style="background:${tom}">${esc(cand.numero)}</span>
      </div>
      <h3 class="nome">${esc(cand.nomeUrna)}</h3>
      <span class="numero">${esc(cand.numero)}</span>
    </div>
    <p class="pct${contando ? " contando" : ""}">${pctFmt.format(cand.percentual)}%</p>
    <p class="votos">${numFmt.format(cand.votos)} ${cand.votos === 1 ? "voto" : "votos"}</p>
    <p class="partido">${esc(cand.partido)}${cand.vice ? ` · ${esc(cand.vice)}` : ""}</p>
    <div class="trilho" aria-hidden="true"><span style="width:${largura(cand.percentual)}%"></span></div>
    ${delta ? `<p class="delta">${esc(fraseDelta(delta))}</p>` : ""}
    ${cand.situacao ? `<p class="selo">${esc(cand.situacao)}</p>` : ""}
  </article>`;
}

function htmlHero(escopo, { olho, espera, nota, metas = [] }) {
  const vivo = escopo.apurado > 0 || (escopo.votos?.validos || 0) > 0;
  const numero = vivo ? `${pctFmt.format(escopo.apurado)}%` : numFmt.format(escopo.eleitores.aptos);
  const legenda = vivo ? "das seções apuradas" : espera;
  const linhas = vivo
    ? [`${numFmt.format(escopo.secoes.apuradas)} de ${numFmt.format(escopo.secoes.total)} seções`, ...metas]
    : metas;
  if (escopo.eleitores.comparecimento) linhas.push(`${pctFmt.format(escopo.eleitores.comparecimentoPct)}% de comparecimento`);
  return `<section class="cartao">
    <p class="olho">${esc(olho)}</p>
    <p class="hero">${numero}</p>
    <p class="hero-legenda">${esc(legenda)}</p>
    <ul class="meta-linha">
      ${linhas.map((linha) => `<li>${esc(linha)}</li>`).join("")}
    </ul>
    <div class="apurado-linha"><span>Apurado</span><strong>${pctFmt.format(escopo.apurado)}%</strong></div>
    <div class="trilho" role="img" aria-label="${pctFmt.format(escopo.apurado)}% das seções apuradas"><span style="width:${largura(escopo.apurado)}%"></span></div>
    ${nota ? `<p class="nota">${esc(nota)}</p>` : ""}
    <div class="dupla">${escopo.candidatos.map((cand) => htmlPessoa(cand)).join("")}</div>
    <dl class="stats">
      <div><dt>Válidos</dt><dd>${numFmt.format(escopo.votos.validos)}</dd></div>
      <div><dt>Brancos</dt><dd>${numFmt.format(escopo.votos.brancos)}</dd></div>
      <div><dt>Nulos</dt><dd>${numFmt.format(escopo.votos.nulos)}</dd></div>
    </dl>
    ${escopo.atualizado ? `<p class="nota">Arquivo do TSE de ${esc(quando(escopo.atualizado))}, horário de Brasília.</p>` : ""}
  </section>`;
}

function pintarExterior() {
  const { exterior, brasil, comparacao, resumoPostos } = estado.dados;
  const deltas = new Map(comparacao.map((item) => [item.numero, item.diferenca]));
  const espera = exterior.status === "nao-iniciada" && brasil.status === "nao-iniciada";
  $("exterior-resumo").innerHTML = `
    ${htmlHero(exterior, {
      olho: "Fora do país",
      espera: "eleitores aptos no exterior",
      nota: espera ? "A divulgação começa às 17h, horário de Brasília. Cada posto entra conforme a urna de lá fecha." : "",
      metas: [`${numFmt.format(resumoPostos.total)} postos`, `${numFmt.format(exterior.secoes.total)} seções`],
    }).replace(
      exterior.candidatos.map((cand) => htmlPessoa(cand)).join(""),
      exterior.candidatos.map((cand) => htmlPessoa(cand, deltas.get(cand.numero))).join(""),
    )}
    <section class="comparar">
      <h2>No Brasil</h2>
      <p>${brasil.candidatos.map((cand) => `${esc(cand.nomeUrna)} ${pctFmt.format(cand.percentual)}%`).join(" · ")}</p>
      <p class="nota" style="margin-top:4px">${pctFmt.format(brasil.apurado)}% apurado · ${numFmt.format(brasil.eleitores.aptos)} aptos</p>
      <button type="button" class="link" data-ir="brasil">Ver o Brasil</button>
    </section>`;
  $("exterior-resumo").removeAttribute("aria-busy");
  if (!estado.ordemManual && !estado.sugeriuApurado && resumoPostos.comUrna > 0) {
    $("ordem").value = "apurado";
    estado.sugeriuApurado = true;
  }
}

function pintarBrasil() {
  const { brasil, exterior, resumoPostos } = estado.dados;
  $("brasil-resumo").innerHTML = `
    ${htmlHero(brasil, {
      olho: "País inteiro",
      espera: "eleitores aptos",
      nota: brasil.status === "nao-iniciada" ? "A totalização nacional começa depois das 17h, horário de Brasília." : "",
      metas: [`${numFmt.format(brasil.secoes.total)} seções`],
    })}
    <section class="comparar">
      <h2>Fora do país</h2>
      <p>${numFmt.format(exterior.eleitores.aptos)} aptos em ${numFmt.format(resumoPostos.total)} postos.</p>
      <button type="button" class="link" data-ir="exterior">Ver as urnas do exterior</button>
    </section>`;
}

function htmlEstado(uf) {
  const mini = uf.candidatos?.length
    ? `<p class="placar-mini">${uf.candidatos.map((cand) => `<span style="--tom:${cor(cand.numero)}"><b>${esc(cand.nomeUrna)}</b> ${pctFmt.format(cand.percentual)}%</span>`).join("")}</p>`
    : `<p class="espera">${uf.apurado > 0 ? "Votos ainda não entraram nesta leitura." : "Aguardando as urnas"}</p>`;
  return `<article class="estado${uf.codigo === "zz" ? " estado-exterior" : ""}">
    <header><h3>${esc(uf.nome)}</h3><strong>${pctFmt.format(uf.apurado)}%</strong></header>
    <p class="posto-meta">${numFmt.format(uf.eleitores.aptos)} aptos · ${numFmt.format(uf.secoes.apuradas)} de ${numFmt.format(uf.secoes.total)} seções</p>
    <div class="trilho"><span style="width:${largura(uf.apurado)}%"></span></div>
    ${mini}
  </article>`;
}

function pintarEstados() {
  const lista = estado.dados.estados;
  const exterior = lista.filter((uf) => uf.codigo === "zz");
  const resto = lista.filter((uf) => uf.codigo !== "zz");
  $("lista-estados").innerHTML = `
    <p class="secao-titulo" style="margin:0 4px 8px">Fora do país</p>
    <div class="grupo">${exterior.map(htmlEstado).join("")}</div>
    <p class="secao-titulo" style="margin:18px 4px 8px">Estados e Distrito Federal</p>
    <div class="grupo">${resto.map(htmlEstado).join("")}</div>`;
}

function postosVisiveis() {
  const q = fold($("busca").value.trim());
  const soUrna = $("so-urna").checked;
  const ordem = $("ordem").value;
  const lista = estado.dados.postos.filter((posto) => {
    if (estado.regiao !== "todas" && posto.regiao !== estado.regiao) return false;
    if (soUrna && posto.apurado <= 0) return false;
    if (!q) return true;
    return fold(`${posto.nome} ${posto.pais} ${posto.regiao}`).includes(q);
  });
  const por = {
    aptos: (a, b) => b.eleitores.aptos - a.eleitores.aptos || a.nome.localeCompare(b.nome, "pt-BR"),
    apurado: (a, b) => b.apurado - a.apurado || b.eleitores.aptos - a.eleitores.aptos,
    nome: (a, b) => a.nome.localeCompare(b.nome, "pt-BR"),
    votos: (a, b) => (b.votos?.validos || 0) - (a.votos?.validos || 0) || b.eleitores.aptos - a.eleitores.aptos,
  }[ordem];
  return lista.sort(por);
}

function htmlPosto(posto) {
  const aberto = estado.abertos.has(posto.codigo) ? "open" : "";
  const placar = posto.candidatos?.length
    ? `<p class="placar-mini">${posto.candidatos.map((cand) => `<span style="--tom:${cor(cand.numero)}"><b>${esc(cand.nomeUrna)}</b> ${pctFmt.format(cand.percentual)}%</span>`).join("")}</p>`
    : `<p class="espera">${posto.apurado > 0 ? "Urna recebida. Os votos deste posto ainda não entraram." : "Aguardando a urna"}</p>`;
  const extra = posto.votos
    ? `<dl class="miudos">
        <div><dt>Válidos</dt><dd>${numFmt.format(posto.votos.validos)}</dd></div>
        <div><dt>Brancos</dt><dd>${numFmt.format(posto.votos.brancos)}</dd></div>
        <div><dt>Nulos</dt><dd>${numFmt.format(posto.votos.nulos)}</dd></div>
        <div><dt>Comparecimento</dt><dd>${pctFmt.format(posto.eleitores.comparecimentoPct)}%</dd></div>
      </dl>`
    : `<p class="fonte-linha">${numFmt.format(posto.secoes.total)} ${posto.secoes.total === 1 ? "seção" : "seções"} neste posto.</p>`;
  return `<details class="posto" data-codigo="${esc(posto.codigo)}" ${aberto}>
    <summary>
      <span class="posto-nome">${esc(posto.nome)}</span>
      <span class="posto-pct">${pctFmt.format(posto.apurado)}%<small>apurado</small></span>
      <span class="posto-meta">${esc(posto.pais)} · ${numFmt.format(posto.eleitores.aptos)} aptos</span>
      <span class="trilho"><span style="width:${largura(posto.apurado)}%"></span></span>
      ${placar}
    </summary>
    ${extra}
    <p class="fonte-linha">${posto.atualizado ? `TSE ${esc(quando(posto.atualizado))}, Brasília` : "Ainda sem horário de totalização neste posto."}</p>
  </details>`;
}

function pintarLista() {
  if (!estado.dados) return;
  const lista = postosVisiveis();
  const total = estado.dados.postos.length;
  $("contagem-lista").textContent = lista.length === total ? `${numFmt.format(total)} postos` : `${numFmt.format(lista.length)} de ${numFmt.format(total)}`;
  $("lista-postos").innerHTML = lista.length
    ? lista.map(htmlPosto).join("")
    : `<p class="vazio">${$("so-urna").checked && estado.dados.resumoPostos.comUrna === 0 ? "Nenhuma urna do exterior entrou ainda." : "Nenhum posto com esse filtro."}</p>`;
}

function textoAviso(dados) {
  if (dados.erro) return dados.erro;
  if (dados.defasado) return dados.aviso || "Mostrando a última leitura que chegou.";
  return "";
}

function pintarAviso() {
  const texto = estado.dados ? textoAviso(estado.dados) : "";
  const aviso = $("aviso");
  aviso.hidden = !texto;
  aviso.textContent = texto;
}

function pintar() {
  if (!estado.dados) return;
  pintarAviso();
  pintarExterior();
  pintarBrasil();
  pintarEstados();
  pintarLista();
  const vivo = estado.dados.exterior.apurado > 0;
  document.title = vivo
    ? `Exterior ${pctFmt.format(estado.dados.exterior.apurado)}% · Apuração`
    : "Apuração 2026 · urnas no exterior";
}

function mostrarAba(aba, { historico = false } = {}) {
  if (!ABAS.includes(aba)) aba = "exterior";
  estado.aba = aba;
  $("abas").dataset.index = String(ABAS.indexOf(aba));
  for (const nome of ABAS) {
    $(`painel-${nome}`).hidden = nome !== aba;
    const botao = $(`aba-${nome}`);
    const ativo = nome === aba;
    botao.setAttribute("aria-selected", ativo ? "true" : "false");
    botao.tabIndex = ativo ? 0 : -1;
  }
  const hash = `#${aba}`;
  if (location.hash !== hash) {
    if (historico) history.pushState(null, "", hash);
    else history.replaceState(null, "", hash);
  }
}

async function carregar({ fresco = false } = {}) {
  if (estado.carregando) return;
  estado.carregando = true;
  const botao = $("atualizar");
  botao.disabled = true;
  botao.classList.add("girando");
  try {
    const resposta = await fetch(fresco ? "/api/apuracao?fresco=1" : "/api/apuracao", { cache: "no-store" });
    const corpo = await resposta.json();
    if (!resposta.ok) throw new Error(corpo.erro || "Não foi possível ler a apuração.");
    estado.dados = corpo;
    pintar();
  } catch (error) {
    if (!estado.dados) {
      $("aviso").hidden = false;
      $("aviso").textContent = error.message || "Não consegui falar com a apuração.";
      $("exterior-resumo").innerHTML = `<section class="cartao"><p class="olho">Sem leitura</p><p class="hero-legenda">O servidor não alcançou os arquivos do TSE agora.</p></section>`;
    }
  } finally {
    estado.carregando = false;
    botao.disabled = false;
    botao.classList.remove("girando");
  }
}

function pintarChips() {
  $("regioes").innerHTML = ["todas", ...REGIOES].map((regiao) => {
    const rotulo = regiao === "todas" ? "Todos" : regiao;
    const ativo = estado.regiao === regiao;
    return `<button type="button" class="chip" data-regiao="${esc(regiao)}" aria-pressed="${ativo}">${esc(rotulo)}</button>`;
  }).join("");
}

function iniciar() {
  const inicial = location.hash.replace("#", "");
  mostrarAba(ABAS.includes(inicial) ? inicial : "exterior");
  pintarChips();
  relogio();
  setInterval(relogio, 30_000);

  $("abas").addEventListener("click", (event) => {
    const botao = event.target.closest("[data-aba]");
    if (botao) mostrarAba(botao.dataset.aba, { historico: true });
  });
  $("abas").addEventListener("keydown", (event) => {
    const atual = ABAS.indexOf(estado.aba);
    if (event.key === "ArrowRight") mostrarAba(ABAS[(atual + 1) % ABAS.length], { historico: true });
    if (event.key === "ArrowLeft") mostrarAba(ABAS[(atual + ABAS.length - 1) % ABAS.length], { historico: true });
  });
  window.addEventListener("popstate", () => mostrarAba(location.hash.replace("#", "")));
  document.body.addEventListener("click", (event) => {
    const ir = event.target.closest("[data-ir]");
    if (ir) mostrarAba(ir.dataset.ir, { historico: true });
  });

  $("atualizar").addEventListener("click", () => carregar({ fresco: true }));
  $("busca").addEventListener("input", pintarLista);
  $("ordem").addEventListener("change", () => {
    estado.ordemManual = true;
    pintarLista();
  });
  $("so-urna").addEventListener("change", pintarLista);
  $("regioes").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-regiao]");
    if (!chip) return;
    estado.regiao = chip.dataset.regiao;
    for (const el of $("regioes").querySelectorAll("[data-regiao]")) {
      el.setAttribute("aria-pressed", el === chip ? "true" : "false");
    }
    pintarLista();
  });
  document.addEventListener("toggle", (event) => {
    const posto = event.target;
    if (!posto.classList?.contains("posto")) return;
    if (posto.open) estado.abertos.add(posto.dataset.codigo);
    else estado.abertos.delete(posto.dataset.codigo);
  }, true);

  carregar();
  setInterval(() => {
    if (document.visibilityState === "visible") carregar();
  }, 15_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") carregar();
  });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

iniciar();
