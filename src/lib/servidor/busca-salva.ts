import "server-only";
import { categoria, REGIMES } from "@/lib/constantes";
import { nomeDoTempo } from "@/lib/deslocamento";
import { descreverOrigem, raioDaBusca, TURNOS, type Filtros } from "@/lib/filtros";
import { pontoDoLocal, type Local } from "@/lib/regioes";
import type { Regime } from "@/lib/tipos";

// A busca da página inicial vista do servidor: de onde contam as distâncias e o nome
// curto de uma busca com aviso ("Me avise de vagas assim").

/** Sem GPS nem ponto no mapa, as distâncias contam a partir de onde a pessoa mora. */
export function partirDoLocal(filtros: Filtros, local: Local | null): Filtros {
  if (!local || filtros.origem !== "centro") return filtros;
  return { ...filtros, ...pontoDoLocal(local) };
}

export function textoDaOrigem(filtros: Filtros, local: Local | null) {
  if (!local || filtros.origem !== "centro") return descreverOrigem(filtros.origem);
  if (local.ponto) return "da sua casa";
  if (local.centro) return `do meio de ${local.bairro}`;
  return local.regiao ? `da Região ${local.regiao} de Goiânia` : `do centro de ${local.cidade}`;
}

/** “caixa” · Comércio e vendas · CLT · à tarde · até 10 km da sua casa */
export function rotuloDaBusca(f: Filtros, local: Local | null) {
  const distancia = f.tempo ? nomeDoTempo(f.tempo).replace(/^Até/, "até") : `até ${f.raio} km`;
  return [
    f.q ? `“${f.q}”` : null,
    f.categoria ? categoria(f.categoria).nome : null,
    f.regime ? REGIMES[f.regime as Regime]?.nome : null,
    f.turno ? TURNOS.find((t) => t.valor === f.turno)?.curto : null,
    `${distancia} ${textoDaOrigem(f, local)}`,
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 160);
}

/** O que vai para o banco (salvar_busca) e serve para achar a busca já salva. */
export function dadosDaBusca(f: Filtros) {
  return {
    texto: f.q || null,
    categoria: f.categoria,
    regime: f.regime,
    turno: f.turno,
    lat: f.lat,
    lng: f.lng,
    raio_km: raioDaBusca(f),
  };
}

type Salva = {
  id: number;
  texto: string | null;
  categoria: string | null;
  regime: string | null;
  turno: string | null;
  lat: number;
  lng: number;
  raio_km: number;
};

/** A busca salva igual a esta (o mesmo que o banco confere em salvar_busca). */
export function acharBuscaSalva(f: Filtros, salvas: Salva[]) {
  const d = dadosDaBusca(f);
  return (
    salvas.find(
      (s) =>
        s.texto === d.texto &&
        s.categoria === d.categoria &&
        s.regime === d.regime &&
        s.turno === d.turno &&
        Math.abs(s.lat - d.lat) < 0.0005 &&
        Math.abs(s.lng - d.lng) < 0.0005 &&
        Number(s.raio_km) === d.raio_km,
    ) ?? null
  );
}
