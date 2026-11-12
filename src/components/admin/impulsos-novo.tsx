"use client";

import { ArrowLeft, Rocket, Search } from "lucide-react";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Selo } from "@/components/ui/basicos";
import { Botao, classesBotao } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import { useAcao } from "@/components/ui/usar-acao";
import { impulsionarCliente, vagasParaImpulso, type VagaParaImpulso } from "@/lib/acoes/admin-impulsos";
import { formatarData, formatarMoeda, plural } from "@/lib/formato";
import { Inteiro, Reais } from "./impulsos";

// Admin › Impulsos › Novo impulso (migração 20270430120000): o admin escolhe vagas de um cliente (pelo nome, pelo
// título ou pelo tipo) e elas entram numa campanha só no Google, com uma verba para todas. A verba e os dias de partida
// saem das regras dos tipos das vagas escolhidas. Um cliente por vez: o cliente com campanha correndo ganha as vagas
// novas nela.

type TipoCurto = { id: string; nome: string };

/** "todos", "outros" ou o id do tipo */
type FiltroTipo = string;

const OUTROS = "outros";

function chaveDoTipo(v: VagaParaImpulso) {
  return v.tipo_id ?? OUTROS;
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-pill border px-3 text-body-sm transition-colors ${
        ativo ? "border-ink bg-ink font-semibold text-surface-100" : "border-line text-ink hover:bg-surface-300"
      }`}
    >
      {children}
    </button>
  );
}

function LinhaDaVaga({
  v,
  marcada,
  mudar,
  porTipo,
}: {
  v: VagaParaImpulso;
  marcada: boolean;
  mudar: (marcar: boolean) => void;
  /** a lista já vem agrupada por tipo (o cliente inteiro): o selo do tipo sobra */
  porTipo: boolean;
}) {
  const detalhes = [
    `${v.bairro}, ${v.cidade}`,
    plural(v.curtidas, "curtida", "curtidas"),
    v.parada ? "parada há 5 dias ou mais" : null,
    v.com_salario ? "com salário" : null,
  ].filter(Boolean);
  return (
    <li>
      <label
        className={`flex items-start gap-3 px-4 py-2.5 ${
          v.impulsionada ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-surface-300"
        } ${marcada ? "bg-surface-300" : ""}`}
      >
        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0"
          disabled={v.impulsionada}
          checked={marcada}
          onChange={(e) => mudar(e.target.checked)}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-label">{v.titulo}</span>
            {!porTipo && <Selo variante="contorno">{v.tipo ?? "Outros"}</Selo>}
          </span>
          <span className="block text-body-sm text-ink-muted">
            {detalhes.join(", ")}
            {v.impulsionada ? ". Já está sendo impulsionada" : ""}
          </span>
        </span>
      </label>
    </li>
  );
}

export function NovoImpulso({
  tipos,
  contaInicial,
  vagasIniciais,
}: {
  tipos: TipoCurto[];
  /** aberto pelo "Mais vagas" de um cliente: as vagas dele já vêm do servidor */
  contaInicial: string | null;
  vagasIniciais: VagaParaImpulso[] | null;
}) {
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<FiltroTipo>("todos");
  const [contaFixa, setContaFixa] = useState<string | null>(contaInicial);
  const [vagas, setVagas] = useState<VagaParaImpulso[] | null>(vagasIniciais);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [procurando, iniciar] = useTransition();
  const [escolhidas, setEscolhidas] = useState<Record<string, VagaParaImpulso>>({});
  const [trocouCliente, setTrocouCliente] = useState<string | null>(null);
  // os dias e a verba seguem a sugestão dos tipos marcados até o admin mexer (null: a sugestão)
  const [diasEscolhidos, setDias] = useState<number | null>(null);
  const [verbaEscolhida, setVerba] = useState<number | null>(null);
  const [avisar, setAvisar] = useState(true);
  const { rodar, pendente, mensagem } = useAcao();

  function procurar(filtro: { busca: string; tipo: FiltroTipo; conta: string | null }) {
    setErroBusca(null);
    iniciar(async () => {
      const r = await vagasParaImpulso(filtro.busca, {
        tipo: filtro.conta || filtro.tipo === "todos" ? null : filtro.tipo,
        conta: filtro.conta,
      });
      if (r.ok) setVagas(r.vagas);
      else setErroBusca(r.erro);
    });
  }

  const lista = useMemo(() => {
    const todas = vagas ?? [];
    // no cliente inteiro, o tipo filtra aqui mesmo (a lista já tem todas as vagas dele)
    return contaFixa && tipo !== "todos" ? todas.filter((v) => chaveDoTipo(v) === tipo) : todas;
  }, [vagas, contaFixa, tipo]);

  // quantas vagas de cada tipo há na lista (nos chips)
  const porTipo = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of vagas ?? []) m.set(chaveDoTipo(v), (m.get(chaveDoTipo(v)) ?? 0) + 1);
    return m;
  }, [vagas]);

  const marcadas = Object.values(escolhidas);
  const cliente = marcadas[0] ? { id: marcadas[0].conta_id, nome: marcadas[0].conta, campanha: marcadas[0].campanha } : null;
  const sugestaoVerba = marcadas.reduce((t, v) => t + Number(v.sugestao.verba), 0);
  const sugestaoDias = marcadas.reduce((m, v) => Math.max(m, v.sugestao.dias), 1);
  const raios = [...new Set(marcadas.map((v) => v.sugestao.raio))].sort((a, b) => a - b);
  const sugestao = Math.round(sugestaoVerba * 100) / 100;
  const verba = verbaEscolhida ?? sugestao;
  const dias = diasEscolhidos ?? (marcadas.length ? sugestaoDias : 7);

  /** Marca ou desmarca vagas; vaga de outro cliente recomeça a escolha com ele (um cliente por vez). */
  function marcarVarias(lista: VagaParaImpulso[], sim: boolean) {
    const livres = lista.filter((v) => !v.impulsionada);
    if (!livres.length) return;
    const outroCliente = sim && marcadas.some((x) => x.conta_id !== livres[0].conta_id);
    setTrocouCliente(outroCliente ? livres[0].conta : null);
    const base: Record<string, VagaParaImpulso> = outroCliente ? {} : { ...escolhidas };
    for (const v of livres) {
      if (sim) base[v.id] = v;
      else delete base[v.id];
    }
    setEscolhidas(base);
  }

  function verCliente(conta: string) {
    setContaFixa(conta);
    setTipo("todos");
    procurar({ busca: "", tipo: "todos", conta });
  }

  function voltarParaBusca() {
    setContaFixa(null);
    setTipo("todos");
    setVagas(null);
  }

  function escolherTipo(t: FiltroTipo) {
    setTipo(t);
    // na busca, o tipo vai ao banco (a lista de 60 pode não ter todas as daquele tipo)
    if (!contaFixa && vagas !== null) procurar({ busca, tipo: t, conta: null });
  }

  // a lista em grupos: na busca, por cliente; no cliente inteiro, por tipo (para marcar um tipo de uma vez)
  const grupos = useMemo(() => {
    const m = new Map<string, { titulo: string; vagas: VagaParaImpulso[]; v0: VagaParaImpulso }>();
    for (const v of lista) {
      const chave = contaFixa ? chaveDoTipo(v) : v.conta_id;
      const g = m.get(chave);
      if (g) g.vagas.push(v);
      else m.set(chave, { titulo: contaFixa ? (v.tipo ?? "Outros") : v.conta, vagas: [v], v0: v });
    }
    return [...m.entries()];
  }, [lista, contaFixa]);

  const nomeDoClienteFixo = contaFixa ? (vagas?.[0]?.conta ?? null) : null;
  // no cliente inteiro, todas as livres de uma vez (o tipo escolhido filtra)
  const livresDoCliente = contaFixa ? lista.filter((v) => !v.impulsionada) : [];
  const todasDoClienteMarcadas = livresDoCliente.length > 0 && livresDoCliente.every((v) => escolhidas[v.id]);
  const campanhaDoClienteFixo = contaFixa ? (vagas?.[0]?.campanha ?? null) : null;
  const n = marcadas.length;

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        {contaFixa ? (
          <div className="flex flex-wrap items-center gap-3">
            <Botao tamanho="sm" variante="fantasma" onClick={voltarParaBusca}>
              <ArrowLeft aria-hidden />
              Outra busca
            </Botao>
            <p className="text-body">
              {nomeDoClienteFixo ? (
                <>
                  Todas as vagas no ar de <span className="text-label">{nomeDoClienteFixo}</span>
                </>
              ) : procurando ? (
                "Carregando as vagas do cliente…"
              ) : (
                "Este cliente não tem vaga no ar."
              )}
            </p>
            {campanhaDoClienteFixo && (
              <Selo variante="match">
                Campanha correndo
                {campanhaDoClienteFixo.ate ? ` até ${formatarData(campanhaDoClienteFixo.ate)}` : ""}
              </Selo>
            )}
            {livresDoCliente.length > 1 && (
              <Botao tamanho="sm" onClick={() => marcarVarias(livresDoCliente, !todasDoClienteMarcadas)}>
                {todasDoClienteMarcadas ? "Desmarcar todas" : `Marcar as ${livresDoCliente.length} livres`}
              </Botao>
            )}
          </div>
        ) : (
          <form
            role="search"
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              procurar({ busca, tipo, conta: null });
            }}
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-label">Cliente ou vaga</span>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="JC Distribuição, assistente fiscal…"
                maxLength={80}
                className={`${classesEntrada} w-full max-w-md`}
              />
            </label>
            <Botao type="submit" tamanho="sm" disabled={procurando}>
              <Search aria-hidden />
              {procurando ? "Procurando…" : busca.trim() ? "Procurar" : "Ver as vagas paradas"}
            </Botao>
          </form>
        )}

        {(vagas !== null || contaFixa) && (
          <div className="flex flex-col gap-1.5">
            <span className="text-body-sm text-ink-muted">Tipo de vaga</span>
            <div className="sem-barra -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              <Chip ativo={tipo === "todos"} onClick={() => escolherTipo("todos")}>
                Todos
              </Chip>
              {[...tipos, { id: OUTROS, nome: "Outros" }].map((t) => {
                const quantas = porTipo.get(t.id) ?? 0;
                // no cliente inteiro, só os tipos que ele tem
                if (contaFixa && !quantas) return null;
                return (
                  <Chip key={t.id} ativo={tipo === t.id} onClick={() => escolherTipo(t.id)}>
                    {t.nome}
                    {(contaFixa || tipo === "todos") && quantas > 0 && (
                      <span className={`tabular-nums ${tipo === t.id ? "text-surface-100/75" : "text-ink-muted"}`}>
                        {quantas}
                      </span>
                    )}
                  </Chip>
                );
              })}
            </div>
          </div>
        )}

        {erroBusca && <p className="text-body-sm text-danger">{erroBusca}</p>}
        {vagas && lista.length === 0 && !procurando && (
          <p className="text-body-sm text-ink-muted">
            {contaFixa
              ? "Nenhuma vaga deste tipo no ar."
              : "Nenhuma vaga no ar com essa busca. Tente parte do título, o nome do cliente ou outro tipo."}
          </p>
        )}

        <div className={`flex flex-col gap-3 ${procurando ? "opacity-60" : ""}`}>
          {grupos.map(([chave, g]) => {
            const livres = g.vagas.filter((v) => !v.impulsionada);
            const todasMarcadas = livres.length > 0 && livres.every((v) => escolhidas[v.id]);
            return (
              <section key={chave} className="overflow-hidden rounded-md border border-line">
                <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line bg-surface-100 px-4 py-2">
                  <div className="min-w-0">
                    <h3 className="text-label">
                      {g.titulo} <span className="font-normal text-ink-muted">{plural(g.vagas.length, "vaga", "vagas")}</span>
                    </h3>
                    {!contaFixa && g.v0.campanha && (
                      <p className="text-body-sm text-cerrado-text">
                        Campanha correndo{g.v0.campanha.ate ? ` até ${formatarData(g.v0.campanha.ate)}` : ""}: as vagas novas
                        entram nela
                      </p>
                    )}
                  </div>
                  <span className="flex flex-wrap gap-1">
                    {livres.length > 0 && (contaFixa || livres.length > 1) && (
                      <Botao tamanho="sm" variante="fantasma" onClick={() => marcarVarias(g.vagas, !todasMarcadas)}>
                        {todasMarcadas
                          ? "Desmarcar"
                          : livres.length === g.vagas.length
                            ? livres.length === 1
                              ? "Marcar"
                              : "Marcar todas"
                            : `Marcar ${livres.length === 1 ? "a livre" : `as ${livres.length} livres`}`}
                      </Botao>
                    )}
                    {!contaFixa && (
                      <Botao tamanho="sm" variante="fantasma" onClick={() => verCliente(g.v0.conta_id)}>
                        Todas as vagas do cliente
                      </Botao>
                    )}
                  </span>
                </header>
                <ul className="divide-y divide-line">
                  {g.vagas.map((v) => (
                    <LinhaDaVaga
                      key={v.id}
                      v={v}
                      marcada={Boolean(escolhidas[v.id])}
                      mudar={(sim) => marcarVarias([v], sim)}
                      porTipo={Boolean(contaFixa)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        {/* no celular, o formulário fica no fim da lista: a barra leva até ele */}
        {cliente && (
          <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 rounded-lg border border-line-strong bg-surface-200 p-3 shadow-raised md:bottom-4 lg:hidden">
            <span className="min-w-0 text-body-sm">
              <span className="text-label">{plural(n, "vaga", "vagas")}</span> de {cliente.nome}
            </span>
            <a href="#impulsionar-escolhidas" className={classesBotao("primario", "sm")}>
              Revisar
            </a>
          </div>
        )}
      </div>

      <form
        id="impulsionar-escolhidas"
        aria-label="Impulsionar as vagas escolhidas"
        className="flex scroll-mt-24 flex-col gap-4 rounded-md border border-line bg-surface-100 p-4 lg:sticky lg:top-24"
        onSubmit={(e) => {
          e.preventDefault();
          if (!cliente) return;
          rodar(
            () =>
              impulsionarCliente({
                conta: cliente.id,
                anuncios: marcadas.map((v) => v.id),
                dias: cliente.campanha ? null : dias,
                verba,
                avisar,
              }),
            (r) => {
              if (!r.ok) return;
              setEscolhidas({});
              setVerba(null);
              setDias(null);
              if (vagas !== null) procurar({ busca, tipo, conta: contaFixa });
            },
          );
        }}
      >
        {!cliente ? (
          <>
            <h3 className="text-label">Nada marcado ainda</h3>
            <p className="text-body-sm text-ink-muted">
              Marque vagas de um cliente. Elas entram numa campanha só no Google, com uma verba para todas: o Google põe o
              dinheiro nas vagas que mais aparecem na busca. A verba é do Publike; o cliente não paga nada.
            </p>
            {mensagem}
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-h3">{cliente.nome}</h3>
              <p className="text-body-sm text-ink-muted">{plural(n, "vaga escolhida", "vagas escolhidas")}</p>
              <span className="flex flex-wrap gap-1">
                {[...new Map(marcadas.map((v) => [v.tipo ?? "Outros", 0])).keys()].map((t) => (
                  <Selo key={t} variante="neutro">
                    {t} {marcadas.filter((v) => (v.tipo ?? "Outros") === t).length}
                  </Selo>
                ))}
              </span>
              {trocouCliente && (
                <p className="text-body-sm text-ink-muted">
                  Um cliente por vez: a escolha recomeçou com {trocouCliente}.
                </p>
              )}
            </div>

            {cliente.campanha ? (
              <p className="text-body-sm">
                {n === 1 ? "A vaga entra" : "As vagas entram"} na campanha que já corre
                {cliente.campanha.ate ? ` até ${formatarData(cliente.campanha.ate)}` : ""}. A verba soma à dela.
              </p>
            ) : (
              <Inteiro rotulo="Dias" valor={dias} mudar={setDias} max={30} />
            )}

            <div className="flex flex-col gap-1">
              <Reais
                rotulo={cliente.campanha ? "Verba a mais no Google" : "Verba no Google (total)"}
                valor={verba}
                mudar={setVerba}
              />
              <p className="text-body-sm text-ink-muted">
                Sugestão pelos tipos: {formatarMoeda(sugestao)}.
                {verbaEscolhida !== null && Math.abs(verbaEscolhida - sugestao) > 0.009 && (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="text-terra-text underline underline-offset-2"
                      onClick={() => setVerba(null)}
                    >
                      Usar a sugestão
                    </button>
                  </>
                )}
              </p>
            </div>

            <p className="text-body-sm text-ink-muted">
              {!cliente.campanha &&
                `Cerca de ${formatarMoeda(Math.round((verba / Math.max(dias, 1)) * 100) / 100)} por dia para todas juntas. `}
              {raios.length === 1
                ? `Aparece para quem está a até ${raios[0]} km de cada vaga.`
                : `Aparece para quem está a até ${raios.at(-1)} km das vagas (o raio de cada tipo vai de ${raios[0]} a ${raios.at(-1)} km).`}{" "}
              Os dias contam quando o Google aprovar o primeiro anúncio.
            </p>

            <label className="flex items-start gap-2 text-body">
              <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} className="mt-1 size-4" />
              <span>
                Avisar o cliente
                <span className="block text-body-sm text-ink-muted">Um aviso só no sino, com as vagas.</span>
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <Botao type="submit" variante="primario" tamanho="sm" disabled={pendente || verba < n}>
                <Rocket aria-hidden />
                {pendente
                  ? "Impulsionando…"
                  : cliente.campanha
                    ? `Pôr ${n === 1 ? "a vaga" : `as ${n} vagas`} na campanha`
                    : `Impulsionar ${n === 1 ? "a vaga" : `${n} vagas`}`}
              </Botao>
              <Botao
                tamanho="sm"
                variante="fantasma"
                onClick={() => {
                  setEscolhidas({});
                  setVerba(null);
                  setDias(null);
                  setTrocouCliente(null);
                }}
              >
                Limpar
              </Botao>
            </div>
            {mensagem}
          </>
        )}
      </form>
    </div>
  );
}
