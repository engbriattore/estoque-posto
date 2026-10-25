import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { REGIOES, POSTOS } from "../lib/places.js";
import { montarApuracao, parseBrNumber, titleName } from "../lib/normalizar.js";
import { createLoader, urlAcompanhamento, urlMunicipios, urlResultado } from "../lib/tse.js";
import { createApp } from "../server.js";

const br2 = JSON.parse(await readFile(new URL("./fixtures/br-2turno.json", import.meta.url)));
const br1 = JSON.parse(await readFile(new URL("./fixtures/br-1turno.json", import.meta.url)));
const zz2 = JSON.parse(await readFile(new URL("./fixtures/zz-2turno.json", import.meta.url)));
const codigos = JSON.parse(await readFile(new URL("./fixtures/postos-codigos.json", import.meta.url)));

test("lê número brasileiro e nome de urna", () => {
  assert.equal(parseBrNumber("47,027772356"), 47.027772356);
  assert.equal(parseBrNumber("56104503"), 56104503);
  assert.equal(titleName("FLAVIO BOLSONARO"), "Flávio Bolsonaro");
  assert.equal(titleName("LUIZ INÁCIO LULA DA SILVA"), "Luiz Inácio Lula da Silva");
});

test("segundo turno ainda sem voto separa Brasil e exterior", () => {
  const apuracao = montarApuracao({
    brasilDoc: br2,
    exteriorDoc: zz2,
    abBrasil: { abr: [] },
    abExterior: { abr: [] },
    municipios: [{ cd: "29955", nm: "LISBOA" }],
    obtidoEm: "2026-10-25T08:59:00.000Z",
  });

  assert.equal(apuracao.brasil.status, "nao-iniciada");
  assert.equal(apuracao.brasil.eleitores.aptos, 158745502);
  assert.equal(apuracao.brasil.secoes.total, 499248);
  assert.equal(apuracao.brasil.candidatos[0].nomeUrna, "Lula");
  assert.equal(apuracao.brasil.candidatos[1].nomeUrna, "Flávio Bolsonaro");
  assert.equal(apuracao.exterior.eleitores.aptos, 916683);
  assert.equal(apuracao.exterior.secoes.total, 1351);
  assert.equal(apuracao.postos[0].nome, "Lisboa");
  assert.equal(apuracao.postos[0].pais, "Portugal");
  assert.equal(apuracao.postos[0].candidatos, null);
  assert.equal(apuracao.comparacao[0].diferenca, null);
});

test("primeiro turno totalizado guarda o voto oficial", () => {
  const apuracao = montarApuracao({
    brasilDoc: br1,
    exteriorDoc: zz2,
    abBrasil: { abr: [] },
    abExterior: { abr: [] },
    municipios: [],
    obtidoEm: "2026-10-25T08:59:00.000Z",
  });
  const flavio = apuracao.brasil.candidatos.find((cand) => cand.numero === "22");
  const lula = apuracao.brasil.candidatos.find((cand) => cand.numero === "13");
  assert.equal(apuracao.brasil.status, "finalizada");
  assert.equal(flavio.votos, 56104503);
  assert.equal(lula.votos, 53879538);
  assert.ok(Math.abs(flavio.percentual - 47.027772356) < 1e-9);
});

test("posto com seção apurada entra na comparação quando o arquivo chega", () => {
  const apuracao = montarApuracao({
    brasilDoc: br2,
    exteriorDoc: zz2,
    abBrasil: { abr: [{ tpabr: "uf", cdabr: "sp", and: "n", s: { pst: "0,00", st: "0", ts: "10" }, e: { te: "100" } }] },
    abExterior: {
      abr: [{ tpabr: "mun", cdabr: "29955", and: "n", s: { pst: "0,00", st: "0", ts: "103" }, e: { te: "78624", c: "0" } }],
    },
    municipios: [{ cd: "29955", nm: "LISBOA" }],
    cityDocs: { "29955": { ...zz2, cdabr: "29955", tpabr: "mu", e: { ...zz2.e, te: "78624" }, s: { ...zz2.s, ts: "103" } } },
    obtidoEm: "2026-10-25T08:59:00.000Z",
  });
  assert.equal(apuracao.postos[0].eleitores.aptos, 78624);
  assert.equal(apuracao.postos[0].candidatos.length, 2);
  assert.equal(apuracao.estados[0].codigo, "sp");
});

test("cada posto do TSE tem país e região", () => {
  assert.equal(Object.keys(POSTOS).length, 186);
  assert.deepEqual(codigos.toSorted(), Object.keys(POSTOS).toSorted());
  for (const posto of Object.values(POSTOS)) {
    assert.ok(posto.nome);
    assert.ok(posto.pais);
    assert.ok(REGIOES.includes(posto.regiao));
  }
  assert.equal(POSTOS["29955"].pais, "Portugal");
  assert.equal(POSTOS["30112"].pais, "Estados Unidos");
  assert.equal(POSTOS["30627"].nome, "Tóquio");
});

test("endereços oficiais do segundo turno", () => {
  assert.equal(
    urlResultado("zz", "29262"),
    "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/zz/zz29262-c0001-e006258-u.json",
  );
  assert.equal(
    urlAcompanhamento("br"),
    "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-e006258-ab.json",
  );
  assert.equal(
    urlMunicipios(),
    "https://resultados.tse.jus.br/oficial/ele2026/6258/config/mun-e006258-cm.json",
  );
});

test("não pede o arquivo do posto enquanto a urna não entrou", async () => {
  const urls = [];
  const docs = {
    [urlResultado("br")]: br2,
    [urlResultado("zz")]: zz2,
    [urlAcompanhamento("br")]: { abr: [{ tpabr: "uf", cdabr: "zz", s: { st: "0", pst: "0,00" }, e: { te: "1" } }] },
    [urlAcompanhamento("zz")]: { abr: [{ tpabr: "mun", cdabr: "29955", s: { st: "0", pst: "0,00", ts: "103" }, e: { te: "78624" } }] },
    [urlMunicipios()]: { abr: [{ cd: "zz", mu: [{ cd: "29955", nm: "LISBOA" }] }] },
  };
  const fetchImpl = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, headers: { get: () => "" }, json: async () => docs[url] };
  };
  const loader = createLoader({ fetchImpl, now: () => 1000 });
  const data = await loader.load();
  assert.equal(data.postos[0].nome, "Lisboa");
  assert.equal(data.postos[0].eleitores.aptos, 78624);
  assert.equal(data.postos[0].candidatos, null);
  assert.equal(urls.some((url) => url.includes("zz29955")), false);
  const chamadas = urls.length;
  await loader.load();
  assert.equal(urls.length, chamadas);
});

test("a página e a API sobem juntas", async () => {
  const server = createServer(createApp({
    load: async () => ({ ok: true, postos: [], brasil: { apurado: 0 } }),
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const api = await fetch(`http://127.0.0.1:${port}/api/apuracao`);
    assert.equal((await api.json()).ok, true);
    const html = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Apuração/);
    const sumiu = await fetch(`http://127.0.0.1:${port}/../server.js`);
    assert.equal(sumiu.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
