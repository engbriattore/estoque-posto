import { POSTOS } from "./places.js";
import { UFS } from "./ufs.js";

const URNA = {
  LULA: "Lula",
  "LUIZ INÁCIO LULA DA SILVA": "Luiz Inácio Lula da Silva",
  "FLAVIO BOLSONARO": "Flávio Bolsonaro",
  "FLAVIO NANTES BOLSONARO": "Flávio Nantes Bolsonaro",
  "GERALDO ALCKMIN": "Geraldo Alckmin",
  "GERALDO JOSE RODRIGUES ALCKMIN FILHO": "Geraldo José Rodrigues Alckmin Filho",
  "ALFREDO GASPAR": "Alfredo Gaspar",
  "ALFREDO GASPAR DE MENDONÇA NETO": "Alfredo Gaspar de Mendonça Neto",
};

const PARTICULAS = new Set(["da", "de", "do", "dos", "das", "e", "del", "la", "los", "y", "of"]);

export const ROTULOS_STATUS = {
  "nao-iniciada": "Ainda não começou",
  "em-apuracao": "Em apuração",
  finalizada: "Totalização final",
};

export function parseBrNumber(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function titleName(value) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const known = URNA[raw.toLocaleUpperCase("pt-BR")];
  if (known) return known;
  return raw
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((word, index) => {
      if (index > 0 && PARTICULAS.has(word)) return word;
      return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
    })
    .join(" ");
}

export function codigo5(value) {
  return String(value ?? "").replace(/\D/g, "").padStart(5, "0");
}

export function statusDe(doc) {
  if (!doc) return "nao-iniciada";
  if (doc.tf === "s" || doc.and === "f") return "finalizada";
  const apuradas = parseBrNumber(doc.s?.st);
  const pct = parseBrNumber(doc.s?.pstn ?? doc.s?.pst);
  if (apuradas > 0 || pct > 0) return "em-apuracao";
  if (doc.and && doc.and !== "n") return "em-apuracao";
  return "nao-iniciada";
}

export function fotoCandidato(sq) {
  if (!sq) return "";
  return `https://resultados.tse.jus.br/oficial/ele2026/6258/fotos/br/${sq}.jpeg`;
}

function blocoSecoes(s = {}) {
  return {
    total: parseBrNumber(s.ts),
    apuradas: parseBrNumber(s.st),
    naoTotalizadas: parseBrNumber(s.snt),
    instaladas: parseBrNumber(s.si),
    naoInstaladas: parseBrNumber(s.sni),
  };
}

function blocoEleitores(e = {}) {
  return {
    aptos: parseBrNumber(e.te),
    comparecimento: parseBrNumber(e.c),
    abstencao: parseBrNumber(e.a),
    comparecimentoPct: parseBrNumber(e.pcn ?? e.pc),
  };
}

function blocoVotos(v = {}) {
  return {
    total: parseBrNumber(v.tv),
    validos: parseBrNumber(v.vv),
    brancos: parseBrNumber(v.vb),
    nulos: parseBrNumber(v.vn),
    nulosTecnicos: parseBrNumber(v.vnt),
    anulados: parseBrNumber(v.van),
  };
}

export function candidatosDe(doc) {
  const cargos = doc?.carg || [];
  const carg = cargos.find((item) => String(item.cd) === "1") || cargos[0];
  if (!carg) return [];
  const lista = [];
  for (const agr of carg.agr || []) {
    for (const par of agr.par || []) {
      for (const cand of par.cand || []) {
        const vice = (cand.vs || []).find((item) => item.tp === "v");
        lista.push({
          numero: String(cand.n),
          nomeUrna: titleName(cand.nmu || cand.nm),
          nomeCompleto: titleName(cand.nm),
          partido: par.sg || "",
          coligacao: agr.tp === "c" ? agr.com || agr.nm || "" : "",
          vice: vice ? titleName(vice.nmu || vice.nm) : "",
          votos: parseBrNumber(cand.vap),
          percentual: parseBrNumber(cand.pvapn ?? cand.pvap),
          situacao: cand.st || "",
          sq: String(cand.sqcand || ""),
          seq: Number(cand.seq || 0) || 0,
          foto: fotoCandidato(cand.sqcand),
        });
      }
    }
  }
  lista.sort((a, b) => b.votos - a.votos || a.seq - b.seq || a.numero.localeCompare(b.numero));
  return lista;
}

export function normalizarEscopo(doc, { codigo, nome, tipo }) {
  return {
    codigo,
    nome,
    tipo,
    status: statusDe(doc),
    apurado: parseBrNumber(doc?.s?.pstn ?? doc?.s?.pst),
    secoes: blocoSecoes(doc?.s),
    eleitores: blocoEleitores(doc?.e),
    votos: blocoVotos(doc?.v),
    candidatos: candidatosDe(doc),
    atualizado: [doc?.dg, doc?.hg].filter(Boolean).join(" "),
    finalizado: doc?.tf === "s" || doc?.and === "f",
  };
}

function progressoAb(item) {
  return {
    status: statusDe(item),
    apurado: parseBrNumber(item?.s?.pstn ?? item?.s?.pst),
    secoes: blocoSecoes(item?.s),
    eleitores: blocoEleitores(item?.e),
    atualizado: [item?.dt, item?.ht].filter(Boolean).join(" "),
    finalizado: item?.and === "f",
  };
}

function postoDe(municipio, abItem, doc) {
  const codigo = codigo5(municipio.cd);
  const meta = POSTOS[codigo];
  const nome = meta?.nome || titleName(municipio.nm);
  const base = abItem
    ? progressoAb(abItem)
    : {
        status: "nao-iniciada",
        apurado: 0,
        secoes: blocoSecoes(),
        eleitores: blocoEleitores(),
        atualizado: "",
        finalizado: false,
      };
  const escopo = doc ? normalizarEscopo(doc, { codigo, nome, tipo: "posto" }) : null;
  return {
    codigo,
    nome,
    nomeTse: municipio.nm || "",
    pais: meta?.pais || "Exterior",
    regiao: meta?.regiao || "Outros",
    status: escopo?.status || base.status,
    apurado: escopo ? escopo.apurado : base.apurado,
    secoes: escopo ? escopo.secoes : base.secoes,
    eleitores: escopo ? escopo.eleitores : base.eleitores,
    votos: escopo ? escopo.votos : null,
    candidatos: escopo ? escopo.candidatos : null,
    atualizado: escopo?.atualizado || base.atualizado,
    finalizado: escopo ? escopo.finalizado : base.finalizado,
  };
}

function umaCasa(valor) {
  return Math.round(valor * 10) / 10;
}

export function comparar(exterior, brasil) {
  const porNumero = new Map((brasil.candidatos || []).map((cand) => [cand.numero, cand]));
  const ambos = (exterior.votos?.validos || 0) > 0 && (brasil.votos?.validos || 0) > 0;
  return (exterior.candidatos || []).map((cand) => {
    const noBrasil = porNumero.get(cand.numero);
    return {
      numero: cand.numero,
      nomeUrna: cand.nomeUrna,
      exterior: cand.percentual,
      brasil: noBrasil ? noBrasil.percentual : null,
      diferenca: ambos && noBrasil ? umaCasa(cand.percentual - noBrasil.percentual) : null,
    };
  });
}

export function montarApuracao({
  brasilDoc,
  exteriorDoc,
  abBrasil,
  abExterior,
  municipios,
  cityDocs = {},
  stateDocs = {},
  obtidoEm,
  defasado = false,
  aviso = "",
}) {
  const brasil = normalizarEscopo(brasilDoc, { codigo: "br", nome: "Brasil", tipo: "pais" });
  const exterior = normalizarEscopo(exteriorDoc, { codigo: "zz", nome: "Exterior", tipo: "uf" });
  const abMun = new Map(
    (abExterior?.abr || [])
      .filter((item) => item.tpabr === "mun")
      .map((item) => [codigo5(item.cdabr), item]),
  );
  const postos = (municipios || [])
    .map((mun) => postoDe(mun, abMun.get(codigo5(mun.cd)), cityDocs[codigo5(mun.cd)]))
    .sort((a, b) => b.eleitores.aptos - a.eleitores.aptos || a.nome.localeCompare(b.nome, "pt-BR"));

  const abUf = new Map(
    (abBrasil?.abr || [])
      .filter((item) => item.tpabr === "uf")
      .map((item) => [String(item.cdabr).toLowerCase(), item]),
  );

  const estados = [...abUf.keys()]
    .filter((uf) => uf !== "br")
    .map((uf) => {
      const nome = UFS[uf] || uf.toUpperCase();
      const doc = stateDocs[uf];
      if (doc) return normalizarEscopo(doc, { codigo: uf, nome, tipo: "uf" });
      const prog = progressoAb(abUf.get(uf) || {});
      return {
        codigo: uf,
        nome,
        tipo: "uf",
        ...prog,
        votos: null,
        candidatos: null,
      };
    })
    .sort((a, b) => {
      if (a.codigo === "zz") return -1;
      if (b.codigo === "zz") return 1;
      return b.apurado - a.apurado || a.nome.localeCompare(b.nome, "pt-BR");
    });

  const comUrna = postos.filter((posto) => posto.apurado > 0).length;
  const concluidos = postos.filter((posto) => posto.apurado >= 100).length;

  return {
    fonte: {
      nome: "Tribunal Superior Eleitoral",
      url: "https://resultados.tse.jus.br/oficial/app/index.html",
      eleicao: "6258",
      pleito: "3221",
      turno: 2,
      cargo: "Presidente",
      dataPleito: "25/10/2026",
    },
    obtidoEm,
    defasado: Boolean(defasado),
    aviso,
    brasil,
    exterior,
    comparacao: comparar(exterior, brasil),
    postos,
    resumoPostos: {
      total: postos.length,
      comUrna,
      concluidos,
      aguardando: postos.length - comUrna,
    },
    estados,
    regioes: [...new Set(postos.map((posto) => posto.regiao))].sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}
