"use client";

import { Check, Plus, X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import {
  DIAS_SEMANA,
  ESCALAS,
  LIMITES_EXTRA,
  LISTA_TIPOS_PERGUNTA,
  novoIdPergunta,
  textoDoHorario,
  TIPOS_PERGUNTA,
  type DiaSemana,
  type Escala,
  type HorarioDetalhe,
  type Pergunta,
  type TipoPergunta,
} from "@/lib/vaga-extra";
import { Botao } from "../ui/botao";
import { classesEntrada, MensagemErro, Seletor } from "../ui/campo";

// As partes da vaga que a empresa monta do jeito dela, no formulário de publicar:
// perguntas para o candidato, benefícios a mais e o horário em turnos.
// Cada uma manda o que montou num campo escondido (JSON ou um campo por item).

const pilula =
  "inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors focus-visible:outline-2 focus-visible:outline-focus";
const ligada = "border-ink bg-ink text-surface-100";
const desligada = "border-line bg-surface-300 text-ink hover:border-line-strong";

/** Enter num campo de texto adiciona o item, em vez de enviar o formulário. */
function aoEnter(fazer: () => void) {
  return (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      fazer();
    }
  };
}

// ---------------------------------------------------------------- perguntas

type PerguntaEditada = Pergunta & { novaOpcao: string };

/**
 * "Perguntas para o candidato": a empresa escreve a pergunta e escolhe o tipo de resposta.
 * O candidato responde ao curtir; as obrigatórias precisam de resposta.
 */
export function EditorPerguntas({ inicial, erro }: { inicial: Pergunta[]; erro?: string }) {
  const base = useId();
  const [lista, setLista] = useState<PerguntaEditada[]>(inicial.map((p) => ({ ...p, novaOpcao: "" })));

  const mudar = (id: string, parte: Partial<PerguntaEditada>) =>
    setLista((l) => l.map((p) => (p.id === id ? { ...p, ...parte } : p)));

  function adicionar() {
    setLista((l) => [
      ...l,
      { id: novoIdPergunta(), nome: "", tipo: "sim_nao", opcoes: [], obrigatoria: false, novaOpcao: "" },
    ]);
  }

  function addOpcao(p: PerguntaEditada) {
    const nova = p.novaOpcao.replace(/\s+/g, " ").trim().slice(0, LIMITES_EXTRA.nomeOpcao);
    if (!nova || p.opcoes.includes(nova) || p.opcoes.length >= LIMITES_EXTRA.opcoes) return;
    mudar(p.id, { opcoes: [...p.opcoes, nova], novaOpcao: "" });
  }

  const json = JSON.stringify(
    lista.map(({ id, nome, tipo, opcoes, obrigatoria, esperada, eliminatoria }) => ({
      id,
      nome,
      tipo,
      opcoes,
      obrigatoria,
      esperada: esperada ?? null,
      eliminatoria: Boolean(esperada) && Boolean(eliminatoria),
    })),
  );

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-label">
        Perguntas para o candidato <span className="font-normal text-ink-muted">(opcional)</span>
      </legend>
      <p className="-mt-1 text-body-sm text-ink-muted">
        Algum requisito que não está acima? Escreva a pergunta e escolha como a pessoa responde. Ela responde ao curtir
        a vaga, e a resposta aparece junto do candidato.
      </p>
      <input type="hidden" name="perguntas" value={json} />
      {lista.length > 0 && (
        <ol className="flex flex-col gap-3">
          {lista.map((p, i) => {
            const id = `${base}-${p.id}`;
            return (
              <li key={p.id} className="flex flex-col gap-3 rounded-md border border-line bg-surface-100 p-3 sm:p-4">
                <div className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <label htmlFor={`${id}-nome`} className="text-label">
                      Pergunta {i + 1}
                    </label>
                    <input
                      id={`${id}-nome`}
                      value={p.nome}
                      onChange={(e) => mudar(p.id, { nome: e.target.value })}
                      onKeyDown={aoEnter(() => {})}
                      maxLength={LIMITES_EXTRA.nomePergunta}
                      placeholder={`Ex.: ${TIPOS_PERGUNTA[p.tipo].exemplo}`}
                      className={classesEntrada}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setLista((l) => l.filter((x) => x.id !== p.id))}
                    aria-label={`Tirar a pergunta ${i + 1}`}
                    className="mt-7 inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
                  >
                    <X aria-hidden className="size-5" />
                  </button>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex flex-col gap-1.5 sm:w-64">
                    <label htmlFor={`${id}-tipo`} className="text-label">
                      Tipo de resposta
                    </label>
                    <Seletor
                      id={`${id}-tipo`}
                      value={p.tipo}
                      onChange={(e) =>
                        mudar(p.id, { tipo: e.target.value as TipoPergunta, esperada: null, eliminatoria: false })
                      }
                      className={classesEntrada}
                    >
                      {LISTA_TIPOS_PERGUNTA.map((t) => (
                        <option key={t} value={t}>
                          {TIPOS_PERGUNTA[t].nome}
                        </option>
                      ))}
                    </Seletor>
                  </div>
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-label">
                    <input
                      type="checkbox"
                      checked={p.obrigatoria}
                      onChange={(e) => mudar(p.id, { obrigatoria: e.target.checked })}
                      className="size-5 accent-[var(--pk-ink)]"
                    />
                    Resposta obrigatória
                  </label>
                </div>
                {p.tipo === "opcoes" && (
                  <div className="flex flex-col gap-2">
                    <span className="text-label">Opções</span>
                    {p.opcoes.length > 0 && (
                      <ul className="flex flex-wrap gap-2">
                        {p.opcoes.map((o) => (
                          <li key={o} className={`${pilula} ${desligada} pr-1.5`}>
                            {o}
                            <button
                              type="button"
                              onClick={() =>
                                mudar(p.id, {
                                  opcoes: p.opcoes.filter((x) => x !== o),
                                  ...(p.esperada === o ? { esperada: null, eliminatoria: false } : {}),
                                })
                              }
                              aria-label={`Tirar a opção ${o}`}
                              className="inline-flex size-7 items-center justify-center rounded-pill hover:bg-surface-200"
                            >
                              <X aria-hidden className="size-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {p.opcoes.length < LIMITES_EXTRA.opcoes && (
                      <div className="flex gap-2">
                        <label htmlFor={`${id}-opcao`} className="sr-only">
                          Nova opção
                        </label>
                        <input
                          id={`${id}-opcao`}
                          value={p.novaOpcao}
                          onChange={(e) => mudar(p.id, { novaOpcao: e.target.value })}
                          onKeyDown={aoEnter(() => addOpcao(p))}
                          maxLength={LIMITES_EXTRA.nomeOpcao}
                          placeholder={p.opcoes.length ? "Outra opção" : "Ex.: Manhã"}
                          className={`${classesEntrada} min-w-0 flex-1`}
                        />
                        <Botao tamanho="sm" onClick={() => addOpcao(p)} className="min-h-11">
                          <Plus aria-hidden />
                          Opção
                        </Botao>
                      </div>
                    )}
                    {p.opcoes.length < 2 && (
                      <p className="text-body-sm text-ink-muted">Dê pelo menos 2 opções para a pessoa escolher.</p>
                    )}
                  </div>
                )}
                {(p.tipo === "sim_nao" || (p.tipo === "opcoes" && p.opcoes.length >= 2)) && (
                  <div className="flex flex-col gap-3 rounded-md bg-surface-300 p-3 sm:flex-row sm:items-end">
                    <div className="flex flex-col gap-1.5 sm:w-64">
                      <label htmlFor={`${id}-esperada`} className="text-label">
                        Resposta que você procura
                      </label>
                      <Seletor
                        id={`${id}-esperada`}
                        value={p.esperada ?? ""}
                        onChange={(e) =>
                          mudar(p.id, {
                            esperada: e.target.value || null,
                            eliminatoria: e.target.value ? p.eliminatoria : false,
                          })
                        }
                        className={classesEntrada}
                      >
                        <option value="">Qualquer uma</option>
                        {(p.tipo === "sim_nao"
                          ? [
                              { valor: "sim", nome: "Sim" },
                              { valor: "nao", nome: "Não" },
                            ]
                          : p.opcoes.map((o) => ({ valor: o, nome: o }))
                        ).map((o) => (
                          <option key={o.valor} value={o.valor}>
                            {o.nome}
                          </option>
                        ))}
                      </Seletor>
                    </div>
                    {p.esperada && (
                      <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-label">
                        <input
                          type="checkbox"
                          checked={Boolean(p.eliminatoria)}
                          onChange={(e) => mudar(p.id, { eliminatoria: e.target.checked })}
                          className="size-5 accent-[var(--pk-ink)]"
                        />
                        Eliminatória
                      </label>
                    )}
                    <p className="text-body-sm text-ink-muted sm:flex-1">
                      {p.esperada
                        ? p.eliminatoria
                          ? "Quem responder diferente fica com nota 0 na triagem."
                          : "Conta pontos na nota de aderência."
                        : "Só você vê. Serve para a nota de aderência."}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {lista.length < LIMITES_EXTRA.perguntas && (
        <Botao tamanho="sm" onClick={adicionar} className="self-start">
          <Plus aria-hidden />
          {lista.length ? "Adicionar outra pergunta" : "Adicionar pergunta"}
        </Botao>
      )}
      {erro && <MensagemErro>{erro}</MensagemErro>}
    </fieldset>
  );
}

// ---------------------------------------------------------------- benefícios a mais

/** Os benefícios que a empresa escreve, ao lado dos prontos. Cada um vira uma pílula marcada. */
export function BeneficiosExtras({ inicial, erro }: { inicial: string[]; erro?: string }) {
  const id = useId();
  const [lista, setLista] = useState(inicial);
  const [novo, setNovo] = useState("");

  function adicionar() {
    const nome = novo.replace(/\s+/g, " ").trim().slice(0, LIMITES_EXTRA.nomeBeneficio);
    if (!nome) return;
    if (!lista.some((b) => b.toLowerCase() === nome.toLowerCase())) setLista((l) => [...l, nome]);
    setNovo("");
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="beneficios_extras_enviado" value="1" />
      {lista.map((b) => (
        <input key={b} type="hidden" name="beneficios_extras" value={b} />
      ))}
      {lista.length > 0 && (
        <ul aria-label="Benefícios que você adicionou" className="flex flex-wrap gap-2">
          {lista.map((b) => (
            <li key={b} className={`${pilula} ${ligada} pr-1.5`}>
              <Check aria-hidden className="size-4" />
              {b}
              <button
                type="button"
                onClick={() => setLista((l) => l.filter((x) => x !== b))}
                aria-label={`Tirar ${b}`}
                className="inline-flex size-7 items-center justify-center rounded-pill hover:bg-surface-100/20"
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {lista.length < LIMITES_EXTRA.beneficiosExtras && (
        <div className="flex gap-2">
          <label htmlFor={id} className="sr-only">
            Outro benefício
          </label>
          <input
            id={id}
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={aoEnter(adicionar)}
            maxLength={LIMITES_EXTRA.nomeBeneficio}
            placeholder="Outro benefício. Ex.: bônus por meta"
            className={`${classesEntrada} min-w-0 flex-1`}
          />
          <Botao tamanho="sm" onClick={adicionar} disabled={!novo.trim()} className="min-h-11">
            <Plus aria-hidden />
            Adicionar
          </Botao>
        </div>
      )}
      {erro && <MensagemErro>{erro}</MensagemErro>}
    </div>
  );
}

// ---------------------------------------------------------------- horário

/** Horário montado: escala, dias e turnos, mais uma observação. Mostra como fica na vaga. */
export function MontarHorario({ inicial, erro }: { inicial: HorarioDetalhe | null; erro?: string }) {
  const base = useId();
  const [h, setH] = useState<HorarioDetalhe>(inicial ?? { escala: null, dias: [], turnos: [], obs: "" });
  // sem horário montado, fica atrás de um botão (é opcional e ocupava meia tela no celular)
  const [aberto, setAberto] = useState(
    Boolean(inicial && (inicial.escala || inicial.dias.length || inicial.turnos.length || inicial.obs.trim())),
  );
  const mudar = (parte: Partial<HorarioDetalhe>) => setH((atual) => ({ ...atual, ...parte }));
  const completos = h.turnos.filter((t) => t.inicio && t.fim);
  const previa = textoDoHorario({ ...h, turnos: completos, obs: h.obs.trim() });

  function alternarDia(d: DiaSemana) {
    mudar({ dias: h.dias.includes(d) ? h.dias.filter((x) => x !== d) : [...h.dias, d] });
  }

  // atalho: a escala comum já marca os dias de costume (dá para mudar depois)
  function escolherEscala(e: Escala) {
    const nova = h.escala === e ? null : e;
    const dias: DiaSemana[] | null =
      nova === "5x2"
        ? ["seg", "ter", "qua", "qui", "sex"]
        : nova === "6x1"
          ? ["seg", "ter", "qua", "qui", "sex", "sab"]
          : null;
    mudar({ escala: nova, ...(dias && h.dias.length === 0 ? { dias } : {}) });
  }

  if (!aberto) {
    return (
      <div className="flex flex-col gap-1.5">
        <Botao tamanho="sm" onClick={() => setAberto(true)} className="self-start">
          <Plus aria-hidden />
          Adicionar horário
        </Botao>
        <p className="text-body-sm text-ink-muted">Opcional: escala, dias da semana e turnos.</p>
        {erro && <MensagemErro>{erro}</MensagemErro>}
      </div>
    );
  }

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1 text-label">
        Horário <span className="font-normal text-ink-muted">(opcional)</span>
      </legend>
      <input type="hidden" name="horario_detalhe" value={JSON.stringify({ ...h, turnos: completos })} />

      <div className="flex flex-col gap-2">
        <span id={`${base}-escala`} className="text-body-sm text-ink-muted">
          Escala
        </span>
        <div role="group" aria-labelledby={`${base}-escala`} className="flex flex-wrap gap-2">
          {ESCALAS.map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={h.escala === e}
              onClick={() => escolherEscala(e)}
              className={`${pilula} ${h.escala === e ? ligada : desligada}`}
            >
              {h.escala === e && <Check aria-hidden className="size-4" />}
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span id={`${base}-dias`} className="text-body-sm text-ink-muted">
          Dias de trabalho
        </span>
        <div role="group" aria-labelledby={`${base}-dias`} className="flex flex-wrap gap-2">
          {DIAS_SEMANA.map((d) => {
            const marcado = h.dias.includes(d.valor);
            return (
              <button
                key={d.valor}
                type="button"
                aria-pressed={marcado}
                aria-label={d.nome}
                onClick={() => alternarDia(d.valor)}
                className={`${pilula} min-w-14 justify-center ${marcado ? ligada : desligada}`}
              >
                {d.curto}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-body-sm text-ink-muted">Turnos</span>
        {h.turnos.length > 0 && (
          <ul className="flex flex-col gap-2">
            {h.turnos.map((t, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`${base}-ini-${i}`}>
                  Começo do turno {i + 1}
                </label>
                <input
                  id={`${base}-ini-${i}`}
                  type="time"
                  value={t.inicio}
                  onChange={(e) =>
                    mudar({ turnos: h.turnos.map((x, j) => (j === i ? { ...x, inicio: e.target.value } : x)) })
                  }
                  className={`${classesEntrada} w-32`}
                />
                <span className="text-body-sm text-ink-muted">às</span>
                <label className="sr-only" htmlFor={`${base}-fim-${i}`}>
                  Fim do turno {i + 1}
                </label>
                <input
                  id={`${base}-fim-${i}`}
                  type="time"
                  value={t.fim}
                  onChange={(e) =>
                    mudar({ turnos: h.turnos.map((x, j) => (j === i ? { ...x, fim: e.target.value } : x)) })
                  }
                  className={`${classesEntrada} w-32`}
                />
                <button
                  type="button"
                  onClick={() => mudar({ turnos: h.turnos.filter((_, j) => j !== i) })}
                  aria-label={`Tirar o turno ${i + 1}`}
                  className="inline-flex size-11 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
                >
                  <X aria-hidden className="size-5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {h.turnos.length < LIMITES_EXTRA.turnos && (
          <Botao
            tamanho="sm"
            onClick={() =>
              mudar({
                turnos: [
                  ...h.turnos,
                  h.turnos.length ? { inicio: "13:00", fim: "17:00" } : { inicio: "08:00", fim: "12:00" },
                ],
              })
            }
            className="self-start"
          >
            <Plus aria-hidden />
            {h.turnos.length ? "Adicionar turno" : "Adicionar horário"}
          </Botao>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${base}-obs`} className="text-body-sm text-ink-muted">
          Observação
        </label>
        <input
          id={`${base}-obs`}
          value={h.obs}
          onChange={(e) => mudar({ obs: e.target.value })}
          onKeyDown={aoEnter(() => {})}
          maxLength={LIMITES_EXTRA.obsHorario}
          placeholder="Ex.: Folga aos domingos, sábado até meio-dia"
          className={classesEntrada}
        />
      </div>

      {previa && (
        <p className="rounded-md bg-surface-300 px-3 py-2 text-body-sm">
          <span className="text-ink-muted">Na vaga: </span>
          {previa}
        </p>
      )}
      {erro && <MensagemErro>{erro}</MensagemErro>}
    </fieldset>
  );
}
