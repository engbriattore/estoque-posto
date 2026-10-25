import { codigo5, montarApuracao, parseBrNumber } from "./normalizar.js";

const BASE = "https://resultados.tse.jus.br/oficial";
const CICLO = "ele2026";
const ELEICAO = "6258";
const CARGO = "0001";
const ELEICAO6 = ELEICAO.padStart(6, "0");
const USER_AGENT = "apuracao-exterior/1.0 (leitura pessoal dos arquivos publicos do TSE; cache de 12s)";

export function urlResultado(uf, municipio) {
  const unidade = String(uf).toLowerCase();
  const nome = municipio ? `${unidade}${codigo5(municipio)}` : unidade;
  return `${BASE}/${CICLO}/${ELEICAO}/dados/${unidade}/${nome}-c${CARGO}-e${ELEICAO6}-u.json`;
}

export function urlAcompanhamento(uf) {
  const unidade = String(uf).toLowerCase();
  return `${BASE}/${CICLO}/${ELEICAO}/dados/${unidade}/${unidade}-e${ELEICAO6}-ab.json`;
}

export function urlMunicipios() {
  return `${BASE}/${CICLO}/${ELEICAO}/config/mun-e${ELEICAO6}-cm.json`;
}

export async function mapPool(items, limit, fn) {
  if (!items.length) return [];
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

export function createLoader({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  ttlMs = 12_000,
  configTtlMs = 6 * 60 * 60 * 1000,
  timeoutMs = 8_000,
} = {}) {
  const cache = new Map();
  const inflight = new Map();
  let snapshot = null;
  let flight = null;

  async function getJson(url, ttl, { fresh = false } = {}) {
    const hit = cache.get(url);
    const moment = now();
    if (!fresh && hit && moment - hit.at < ttl) return { body: hit.body, stale: false };
    if (inflight.has(url)) return inflight.get(url);

    const pending = (async () => {
      const headers = { accept: "application/json", "user-agent": USER_AGENT };
      if (hit?.lastModified) headers["if-modified-since"] = hit.lastModified;
      if (hit?.etag) headers["if-none-match"] = hit.etag;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { headers, signal: ctrl.signal });
        if (response.status === 304 && hit) {
          hit.at = now();
          return { body: hit.body, stale: false };
        }
        if (!response.ok) throw new Error(`TSE ${response.status}`);
        const body = await response.json();
        cache.set(url, {
          body,
          at: now(),
          lastModified: response.headers?.get?.("last-modified") || "",
          etag: response.headers?.get?.("etag") || "",
        });
        return { body, stale: false };
      } catch (error) {
        if (hit) return { body: hit.body, stale: true };
        throw error;
      } finally {
        clearTimeout(timer);
        inflight.delete(url);
      }
    })();

    inflight.set(url, pending);
    return pending;
  }

  async function assemble(fresh) {
    let stale = false;
    const read = async (url, ttl) => {
      const result = await getJson(url, ttl, { fresh });
      if (result.stale) stale = true;
      return result.body;
    };

    const [brasilDoc, exteriorDoc, abBrasil, abExterior, cm] = await Promise.all([
      read(urlResultado("br"), ttlMs),
      read(urlResultado("zz"), ttlMs),
      read(urlAcompanhamento("br"), ttlMs),
      read(urlAcompanhamento("zz"), ttlMs),
      read(urlMunicipios(), configTtlMs),
    ]);

    const municipios = (cm.abr || []).find((item) => item.cd === "zz")?.mu || [];
    const postosAtivos = (abExterior.abr || []).filter(
      (item) => item.tpabr === "mun" && parseBrNumber(item.s?.st) > 0,
    );
    const cityPairs = await mapPool(postosAtivos, 6, async (item) => {
      try {
        const doc = await read(urlResultado("zz", item.cdabr), ttlMs);
        return [codigo5(item.cdabr), doc];
      } catch {
        return null;
      }
    });

    const ufsAtivas = (abBrasil.abr || []).filter(
      (item) => item.tpabr === "uf" && String(item.cdabr).toLowerCase() !== "br" && parseBrNumber(item.s?.st) > 0,
    );
    const statePairs = await mapPool(ufsAtivas, 6, async (item) => {
      const uf = String(item.cdabr).toLowerCase();
      try {
        const doc = await read(urlResultado(uf), ttlMs);
        return [uf, doc];
      } catch {
        return null;
      }
    });

    return montarApuracao({
      brasilDoc,
      exteriorDoc,
      abBrasil,
      abExterior,
      municipios,
      cityDocs: Object.fromEntries(cityPairs.filter(Boolean)),
      stateDocs: Object.fromEntries(statePairs.filter(Boolean)),
      obtidoEm: new Date(now()).toISOString(),
      defasado: stale,
      aviso: stale ? "Sem contato novo com o TSE. Mostrando a última leitura que chegou." : "",
    });
  }

  return {
    async load({ fresh = false } = {}) {
      const moment = now();
      if (!fresh && snapshot && moment - snapshot.at < ttlMs) return snapshot.data;
      if (!flight) {
        flight = assemble(fresh)
          .then((data) => {
            snapshot = { at: now(), data };
            return data;
          })
          .catch((error) => {
            if (snapshot) {
              return {
                ...snapshot.data,
                defasado: true,
                aviso: "Sem contato novo com o TSE. Mostrando a última leitura que chegou.",
              };
            }
            throw error;
          })
          .finally(() => {
            flight = null;
          });
      }
      return flight;
    },
  };
}
