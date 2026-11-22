"use client";

import { ChevronDown, ListChecks, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { distanciaCurta } from "@/lib/rota-curriculo";
import { BotaoConvidar } from "../painel/botao-convidar";
import { classesChip } from "../painel/fluxo";
import { Avatar } from "../ui/basicos";

// A lista dos "Prontos para assumir" (22/11/2026; Marcelo: "precisa ter uma maneira de contrair e pesquisar também,
// com algum critério, imagina 15 candidatos, chamar todos não faz sentido", "alguma ordem de priorização"). Abre com
// os 3 primeiros pela prioridade (quem atende tudo o que a vaga pede, depois a nota de aderência, a mesma de
// Candidatos e de "Para a sua vaga", depois a distância); dá para buscar no que a pessoa fez, ficar só com quem
// atende a vaga, limitar a distância, ordenar pela distância e recolher a lista.

export type ProntoNaLista = {
  perfil_id: string;
  nome: string;
  cidade: string | null;
  bairro: string | null;
  titulo: string | null;
  funcao: string;
  porque: string;
  distancia_m: number | null;
  /** a nota de aderência à vaga (0 a 100); null: não deu para calcular */
  nota: number | null;
  /** atende cada item que a vaga pede (escolaridade, CNH, horário, distância...) */
  atende: boolean;
  /** o que falta para atender a vaga ("CNH B", "Horário") */
  falta: string[];
  /** a ordem de prioridade (0 = a primeira) */
  ordem: number;
};

const PRIMEIROS = 3;
const DISTANCIAS = [
  { m: null, nome: "Qualquer distância" },
  { m: 5000, nome: "Até 5 km" },
  { m: 10000, nome: "Até 10 km" },
  { m: 20000, nome: "Até 20 km" },
] as const;

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function ListaDosProntos({
  anuncioId,
  prontos,
  convidados,
}: {
  anuncioId: string;
  prontos: ProntoNaLista[];
  convidados: string[];
}) {
  const [aberta, setAberta] = useState(true);
  const [todos, setTodos] = useState(false);
  const [busca, setBusca] = useState("");
  const [soAtende, setSoAtende] = useState(false);
  const [ate, setAte] = useState<number | null>(null);
  const [pelaDistancia, setPelaDistancia] = useState(false);
  const jaConvidados = useMemo(() => new Set(convidados), [convidados]);
  const atendem = prontos.filter((p) => p.atende).length;
  const comControles = prontos.length > PRIMEIROS;

  const filtrados = useMemo(() => {
    const termos = normal(busca).split(/\s+/).filter(Boolean);
    return prontos
      .filter((p) => !soAtende || p.atende)
      .filter((p) => ate === null || (p.distancia_m !== null && p.distancia_m <= ate))
      .filter((p) => {
        if (!termos.length) return true;
        const texto = normal([p.nome, p.funcao, p.porque, p.titulo, p.bairro, p.cidade].filter(Boolean).join(" "));
        return termos.every((t) => texto.includes(t));
      })
      .sort((a, b) =>
        pelaDistancia
          ? (a.distancia_m ?? Infinity) - (b.distancia_m ?? Infinity) || a.ordem - b.ordem
          : a.ordem - b.ordem,
      );
  }, [prontos, busca, soAtende, ate, pelaDistancia]);
  const filtrando = Boolean(busca.trim()) || soAtende || ate !== null;
  const mostrados = todos || filtrando ? filtrados : filtrados.slice(0, PRIMEIROS);
  const escondidos = filtrados.length - mostrados.length;

  return (
    <div className="flex flex-col gap-3">
      {comControles && (
        <button
          type="button"
          onClick={() => setAberta((a) => !a)}
          aria-expanded={aberta}
          className="inline-flex min-h-10 items-center gap-1.5 self-start text-label underline-offset-2 hover:underline"
        >
          <ChevronDown aria-hidden className={`size-4 transition-transform ${aberta ? "rotate-180" : ""}`} />
          {aberta ? "Recolher a lista" : `Abrir a lista (${prontos.length})`}
        </button>
      )}
      {aberta && (
        <>
          {comControles && (
            <div className="flex flex-col gap-2">
              <label className="relative block">
                <span className="sr-only">Buscar entre os prontos</span>
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar no que a pessoa fez ou no bairro: hotel, Unimed, Bueno…"
                  className="min-h-11 w-full rounded-md border border-line-strong bg-surface-100 pr-3 pl-9 text-body-sm"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={!pelaDistancia}
                  onClick={() => setPelaDistancia(false)}
                  className={classesChip(!pelaDistancia)}
                >
                  Mais indicados primeiro
                </button>
                <button
                  type="button"
                  aria-pressed={pelaDistancia}
                  onClick={() => setPelaDistancia(true)}
                  className={classesChip(pelaDistancia)}
                >
                  Mais perto primeiro
                </button>
                <button
                  type="button"
                  aria-pressed={soAtende}
                  onClick={() => setSoAtende((s) => !s)}
                  className={classesChip(soAtende)}
                >
                  Só quem atende a vaga
                  <span className="tabular-nums opacity-70">{atendem}</span>
                </button>
                <label className="inline-flex items-center">
                  <span className="sr-only">Distância da vaga</span>
                  <select
                    value={ate ?? ""}
                    onChange={(e) => setAte(e.target.value ? Number(e.target.value) : null)}
                    className="min-h-10 rounded-pill border border-line-strong bg-surface-200 px-3 text-label"
                  >
                    {DISTANCIAS.map((d) => (
                      <option key={d.nome} value={d.m ?? ""}>
                        {d.nome}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {filtrados.length === 0 ? (
            <p className="text-body-sm text-ink-muted">Ninguém com esse filtro. Tire um filtro ou mude a busca.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {mostrados.map((p) => (
                <li key={p.perfil_id} className="flex flex-wrap items-start gap-3 rounded-md bg-surface-100 p-3">
                  <Avatar nome={p.nome} tamanho={36} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-x-2 text-label">
                      {p.nome}
                      {p.nota !== null && (
                        <span
                          className={`rounded-pill px-2 py-0.5 text-caption tabular-nums ${
                            p.nota >= 80 ? "bg-cerrado text-on-cerrado" : "bg-surface-300 text-ink-muted"
                          }`}
                        >
                          {p.nota}% com a vaga
                        </span>
                      )}
                    </span>
                    <span className="text-body-sm">{p.funcao} · pronto para assumir</span>
                    {p.porque && <span className="text-body-sm text-ink-muted">{p.porque}</span>}
                    <span className="text-body-sm">
                      {p.atende ? (
                        <span className="text-cerrado-text">Atende tudo o que a vaga pede</span>
                      ) : p.falta.length ? (
                        <span className="text-ink-muted">Falta para a vaga: {p.falta.join(", ").toLowerCase()}</span>
                      ) : null}
                    </span>
                    {(p.bairro || p.cidade) && (
                      <span className="flex items-center gap-1 text-caption text-ink-muted">
                        <MapPin aria-hidden className="size-3.5" />
                        {[p.bairro, p.cidade].filter(Boolean).join(", ")}
                        {p.distancia_m != null && ` · ≈ ${distanciaCurta(p.distancia_m)} da vaga`}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <BotaoConvidar anuncioId={anuncioId} perfilId={p.perfil_id} convidado={jaConvidados.has(p.perfil_id)} />
                    <Link
                      href={`/painel/anuncio/${anuncioId}/copiloto?ver=talentos&pessoa=${p.perfil_id}#p-${p.perfil_id}`}
                      className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-label underline-offset-2 hover:bg-surface-300 hover:underline"
                    >
                      <ListChecks aria-hidden className="size-[18px]" />
                      Conferir com os critérios da vaga
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!filtrando && filtrados.length > PRIMEIROS && (
            <button
              type="button"
              onClick={() => setTodos((t) => !t)}
              className="inline-flex min-h-10 items-center gap-1.5 self-start text-label underline-offset-2 hover:underline"
            >
              <ChevronDown aria-hidden className={`size-4 transition-transform ${todos ? "rotate-180" : ""}`} />
              {todos ? "Mostrar só os 3 primeiros" : `Ver mais ${escondidos} ${escondidos === 1 ? "pessoa" : "pessoas"}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
