"use client";

import { CircleAlert, LoaderCircle, Plus, Workflow, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { previaDaRegra, salvarRegra, type Previa } from "@/lib/acoes/regras";
import { FORMATOS_ENTREVISTA, type FormatoEntrevista } from "@/lib/recrutamento";
import {
  ACOES,
  CAMPOS,
  ESPERAS,
  fraseDaRegra,
  GATILHOS,
  LIMITES_DA_REGRA,
  limpo,
  NOME_ETAPA_DA_REGRA,
  NOME_ETAPA_PARADA,
  nomeDoValor,
  regraDispensa,
  type Acao,
  type CampoCondicao,
  type Condicao,
  type EtapaDaRegra,
  type EtapaParada,
  type Gatilho,
  type RegraMontada,
  type TipoAcao,
  type TipoGatilho,
} from "@/lib/regras";
import type { Pergunta } from "@/lib/vaga-extra";
import { BotaoExperimentar } from "../botao-experimentar";
import { Botao } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";

// A tela de montar uma regra das Automações personalizadas (claude/plano-regras-personalizadas.md): a frase em
// partes (Quando, Se, Então, Vale em), a prévia de quem ela pegaria e o salvar (ligada ou desligada). Sem o recurso,
// dá para montar e ver a prévia; salvar abre os 15 dias grátis.

export type ContextoDaTela = {
  vagas: { id: string; titulo: string; clienteId: string | null }[];
  clientes: { id: string; nome: string }[];
  /** as perguntas de cada vaga (com a resposta esperada da triagem, só para os modelos) */
  perguntas: Record<string, Pergunta[]>;
  testes: { id: string; nome: string }[];
  equipe: { id: string; nome: string }[];
  /** o endereço da primeira vaga, para a entrevista presencial */
  endereco: string;
  formatos: FormatoEntrevista[];
  liberado: boolean;
  podeExperimentar: boolean;
};

const DIAS = [1, 2, 3, 5, 7, 10, 15, 30];
const HORAS = [2, 6, 12, 24, 48, 72];
const KMS = [2, 3, 5, 10, 15, 20, 30, 50];
const PORCENTOS = [30, 40, 50, 60, 70, 80, 90];
const DURACOES = [15, 30, 45, 60, 90];

function gatilhoPadrao(tipo: TipoGatilho): Gatilho {
  switch (tipo) {
    case "entrou_etapa":
      return { tipo, etapa: "entrevista" };
    case "parado":
      return { tipo, etapa: "analise", dias: 3 };
    case "entrevista_passou":
      return { tipo, horas: 24 };
    default:
      return { tipo } as Gatilho;
  }
}

function acaoPadrao(tipo: TipoAcao, ctx: ContextoDaTela): Acao {
  switch (tipo) {
    case "mover":
      return { tipo, etapa: "analise" };
    case "mensagem":
      return { tipo, texto: "Oi, {nome}! ", esperar: "agora" };
    case "teste":
      return { tipo, modelo: ctx.testes[0]?.id ?? "" };
    case "horarios":
      return { tipo, formato: "presencial", local: ctx.endereco || null, duracao: 30 };
    case "avisar":
      return { tipo, quem: "eu" };
    default:
      return { tipo } as Acao;
  }
}

/** Uma linha da frase: o nome da parte à esquerda e o que se escolhe à direita. */
function Parte({ nome, id, children }: { nome: string; id: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-2 border-b border-line py-4 last:border-b-0 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-4"
    >
      <h3 id={id} className="pt-2.5 font-display text-h3">
        {nome}
      </h3>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

function Tirar({ rotulo, onClick }: { rotulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-300 hover:text-ink"
    >
      <X aria-hidden className="size-4" />
    </button>
  );
}

function Mais({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center gap-1.5 self-start text-label underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus aria-hidden className="size-4" />
      {children}
    </button>
  );
}

const linha = "flex min-w-0 flex-wrap items-center gap-2 rounded-md bg-surface-300/60 p-2";

export function MontarRegra({
  id,
  inicial,
  ctx,
  voltar,
}: {
  id: string | null;
  inicial: RegraMontada;
  ctx: ContextoDaTela;
  /** para onde voltar depois de salvar (a aba da vaga ou a página das automações) */
  voltar: string;
}) {
  const router = useRouter();
  const [regra, setRegra] = useState<RegraMontada>(inicial);
  const [nomeMexido, setNomeMexido] = useState(Boolean(id || inicial.modelo));
  const [rodarAgora, setRodarAgora] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  // a prévia é da regra como estava ao pedir: enquanto a chave não bate, está contando
  const [previa, setPrevia] = useState<{ chave: string; previa: Previa | null } | null>(null);
  const base = useId();
  const mudar = (m: Partial<RegraMontada>) => setRegra((r) => ({ ...r, ...m }));

  // as perguntas que a regra pode usar: as da vaga, ou (em todas as vagas) as de todas, uma vez cada pelo nome
  const perguntas = useMemo(() => {
    const ids =
      regra.vale_em === "vaga"
        ? [regra.anuncio_id ?? ""]
        : regra.vale_em === "cliente"
          ? ctx.vagas.filter((v) => v.clienteId === regra.cliente_id).map((v) => v.id)
          : ctx.vagas.map((v) => v.id);
    const vistas = new Map<string, Pergunta>();
    for (const v of ids)
      for (const q of ctx.perguntas[v] ?? [])
        if (q.tipo !== "texto" && !vistas.has(limpo(q.nome))) vistas.set(limpo(q.nome), q);
    return [...vistas.values()];
  }, [regra.vale_em, regra.anuncio_id, regra.cliente_id, ctx]);

  const dispensa = regraDispensa(regra);
  const nomes = useMemo(
    () => ({
      testes: new Map(ctx.testes.map((t) => [t.id, t.nome])),
      equipe: new Map(ctx.equipe.map((e) => [e.id, e.nome])),
    }),
    [ctx],
  );
  const frase = fraseDaRegra(regra, nomes);
  const deTempo = ["parado", "teste_vencido", "entrevista_passou"].includes(regra.gatilho.tipo);

  // o nome sugerido segue a frase até a pessoa escrever o dela
  const nome = nomeMexido
    ? regra.nome
    : frase
        .replace(/^Quando /, "")
        .replace(/\.$/, "")
        .slice(0, 80);
  const paraSalvar = useMemo(() => ({ ...regra, nome }), [regra, nome]);

  // a prévia, um pouco depois de parar de mexer
  const chave = JSON.stringify([regra.gatilho, regra.condicoes, regra.vale_em, regra.anuncio_id, regra.cliente_id]);
  const ultima = useRef("");
  useEffect(() => {
    ultima.current = chave;
    const t = setTimeout(async () => {
      const r = await chamarAcao(() => previaDaRegra(paraSalvar)).catch(() => null);
      if (ultima.current !== chave) return;
      setPrevia({ chave, previa: r && r.ok ? (r as { previa: Previa }).previa : null });
    }, 600);
    return () => clearTimeout(t);
    // a chave já resume o que muda a prévia
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  const lendo = previa?.chave !== chave;
  const contagem = lendo ? null : (previa?.previa ?? null);

  function salvar(ligar: boolean) {
    setErro(null);
    if (ligar && dispensa && !confirmar) return setConfirmar(true);
    iniciar(async () => {
      const r = await chamarAcao(() =>
        salvarRegra(id, paraSalvar, { ligar, rodarAgora: ligar && rodarAgora && !deTempo }),
      );
      if (!r.ok) return setErro(r.erro);
      router.push(voltar);
      router.refresh();
    });
  }

  // ------------------------------------------------------------------------- as condições
  function trocarCondicao(i: number, c: Condicao) {
    mudar({ condicoes: regra.condicoes.map((x, j) => (j === i ? c : x)) });
  }
  function condicaoNova(campo: CampoCondicao): Condicao {
    switch (campo) {
      case "pergunta": {
        const q = perguntas[0];
        if (q?.tipo === "numero") return { campo, pergunta: q.nome, op: "maior_igual", valor: 1 };
        return {
          campo,
          pergunta: q?.nome ?? "",
          op: "em",
          valores: [q?.tipo === "opcoes" ? (q.opcoes[0] ?? "") : "sim"],
        };
      }
      case "distancia":
        return { campo, op: "ate", valor: 5 };
      case "combina":
      case "teste":
        return { campo, op: "maior_igual", valor: 70 };
      case "triagem":
        return { campo, op: "atende" };
      case "curriculo":
        return { campo, op: "tem" };
      case "origem":
        return { campo, op: "publike" };
    }
  }

  function editorDaCondicao(c: Condicao, i: number) {
    const rotulo = `${base}-c${i}`;
    const campo = (
      <Seletor
        aria-label={`Condição ${i + 1}`}
        value={c.campo}
        onChange={(e) => trocarCondicao(i, condicaoNova(e.target.value as CampoCondicao))}
        className={classesEntrada}
        envoltorio="w-full sm:w-auto"
      >
        {CAMPOS.map((k) => (
          <option key={k.campo} value={k.campo} disabled={k.campo === "pergunta" && !perguntas.length}>
            {k.nome}
          </option>
        ))}
      </Seletor>
    );
    let resto: ReactNode = null;
    if (c.campo === "pergunta") {
      const q = perguntas.find((x) => limpo(x.nome) === limpo(c.pergunta)) ?? null;
      resto = (
        <>
          <Seletor
            aria-label="Pergunta"
            value={q?.nome ?? ""}
            onChange={(e) => {
              const nova = perguntas.find((x) => x.nome === e.target.value);
              if (!nova) return;
              trocarCondicao(
                i,
                nova.tipo === "numero"
                  ? { campo: "pergunta", pergunta: nova.nome, op: "maior_igual", valor: 1 }
                  : {
                      campo: "pergunta",
                      pergunta: nova.nome,
                      op: "em",
                      valores: [nova.tipo === "opcoes" ? (nova.opcoes[0] ?? "") : "sim"],
                    },
              );
            }}
            className={classesEntrada}
            envoltorio="w-full sm:max-w-xs"
          >
            {!q && <option value="">Escolha a pergunta</option>}
            {perguntas.map((x) => (
              <option key={x.id} value={x.nome}>
                “{x.nome}”
              </option>
            ))}
          </Seletor>
          {q?.tipo === "numero" && c.op !== "em" && c.op !== "fora" ? (
            <>
              <Seletor
                aria-label="Comparação"
                value={c.op}
                onChange={(e) =>
                  trocarCondicao(i, { ...c, op: e.target.value as "maior_igual" | "menor_igual" } as Condicao)
                }
                className={classesEntrada}
              >
                <option value="maior_igual">é pelo menos</option>
                <option value="menor_igual">é no máximo</option>
              </Seletor>
              <input
                type="number"
                aria-label="Número"
                min={0}
                value={(c as { valor: number }).valor}
                onChange={(e) => trocarCondicao(i, { ...c, valor: Number(e.target.value) } as Condicao)}
                className={`${classesEntrada} w-24`}
              />
            </>
          ) : q && (c.op === "em" || c.op === "fora") ? (
            <>
              <Seletor
                aria-label="É ou não é"
                value={c.op}
                onChange={(e) => trocarCondicao(i, { ...c, op: e.target.value as "em" | "fora" })}
                className={classesEntrada}
              >
                <option value="em">respondeu</option>
                <option value="fora">não respondeu</option>
              </Seletor>
              <Seletor
                aria-label="Resposta"
                value={c.valores[0] ?? ""}
                onChange={(e) => trocarCondicao(i, { ...c, valores: [e.target.value] })}
                className={classesEntrada}
              >
                {(q.tipo === "opcoes" ? q.opcoes : ["sim", "nao"]).map((v) => (
                  <option key={v} value={v}>
                    {nomeDoValor(v)}
                  </option>
                ))}
              </Seletor>
            </>
          ) : null}
        </>
      );
    } else if (c.campo === "distancia") {
      resto = (
        <>
          <Seletor
            aria-label="Perto ou longe"
            value={c.op}
            onChange={(e) => trocarCondicao(i, { ...c, op: e.target.value as "ate" | "mais_de" })}
            className={classesEntrada}
          >
            <option value="ate">mora a até</option>
            <option value="mais_de">mora a mais de</option>
          </Seletor>
          <Seletor
            aria-label="Quilômetros"
            value={String(c.valor)}
            onChange={(e) => trocarCondicao(i, { ...c, valor: Number(e.target.value) })}
            className={classesEntrada}
          >
            {KMS.map((k) => (
              <option key={k} value={k}>
                {k} km da vaga
              </option>
            ))}
          </Seletor>
        </>
      );
    } else if (c.campo === "combina" || c.campo === "teste") {
      resto = (
        <>
          <Seletor
            aria-label="Pelo menos ou menos de"
            value={c.op}
            onChange={(e) => trocarCondicao(i, { ...c, op: e.target.value as "maior_igual" | "menor" })}
            className={classesEntrada}
          >
            <option value="maior_igual">{c.campo === "teste" ? "acertou pelo menos" : "combina pelo menos"}</option>
            <option value="menor">{c.campo === "teste" ? "acertou menos de" : "combina menos de"}</option>
          </Seletor>
          <Seletor
            aria-label="Porcentagem"
            value={String(c.valor)}
            onChange={(e) => trocarCondicao(i, { ...c, valor: Number(e.target.value) })}
            className={classesEntrada}
          >
            {PORCENTOS.map((k) => (
              <option key={k} value={k}>
                {k}%
              </option>
            ))}
          </Seletor>
        </>
      );
    } else {
      const opcoes: Record<string, [string, string][]> = {
        triagem: [
          ["atende", "atende os obrigatórios"],
          ["nao_atende", "não atende um obrigatório"],
        ],
        curriculo: [
          ["tem", "tem currículo"],
          ["nao_tem", "não tem currículo"],
        ],
        origem: [
          ["publike", "achou a vaga no Publike"],
          ["chamado", "foi chamado por você"],
        ],
      };
      resto = (
        <Seletor
          aria-label="Qual"
          value={c.op}
          onChange={(e) => trocarCondicao(i, { ...c, op: e.target.value } as Condicao)}
          className={classesEntrada}
        >
          {opcoes[c.campo].map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </Seletor>
      );
    }
    return (
      <div key={`c${i}`} className={linha} id={rotulo}>
        {i > 0 && <span className="px-1 text-label text-ink-muted">e</span>}
        {campo}
        {resto}
        <span className="ml-auto">
          <Tirar
            rotulo={`Tirar a condição ${i + 1}`}
            onClick={() => mudar({ condicoes: regra.condicoes.filter((_, j) => j !== i) })}
          />
        </span>
      </div>
    );
  }

  // ------------------------------------------------------------------------- as ações
  function trocarAcao(i: number, a: Acao) {
    mudar({ acoes: regra.acoes.map((x, j) => (j === i ? a : x)) });
  }

  function editorDaAcao(a: Acao, i: number) {
    let resto: ReactNode = null;
    if (a.tipo === "mover") {
      resto = (
        <Seletor
          aria-label="Etapa"
          value={a.etapa}
          onChange={(e) => trocarAcao(i, { ...a, etapa: e.target.value as EtapaDaRegra })}
          className={classesEntrada}
        >
          {(Object.keys(NOME_ETAPA_DA_REGRA) as EtapaDaRegra[]).map((k) => (
            <option key={k} value={k}>
              {NOME_ETAPA_DA_REGRA[k]}
            </option>
          ))}
        </Seletor>
      );
    } else if (a.tipo === "mensagem") {
      resto = (
        <div className="flex w-full flex-col gap-2">
          <label htmlFor={`${base}-m${i}`} className="sr-only">
            A mensagem
          </label>
          <textarea
            id={`${base}-m${i}`}
            value={a.texto}
            rows={3}
            maxLength={1500}
            onChange={(e) => trocarAcao(i, { ...a, texto: e.target.value })}
            className={`${classesEntrada} min-h-20 [field-sizing:content]`}
          />
          <div className="flex flex-wrap items-center gap-2 text-caption text-ink-muted">
            <span>
              Dá para usar {"{nome}"}, {"{vaga}"} e {"{empresa}"}. Sai
            </span>
            <Seletor
              aria-label="Quando sai"
              value={a.esperar}
              onChange={(e) => trocarAcao(i, { ...a, esperar: e.target.value as "agora" | "1h" | "amanha" })}
              className={classesEntrada}
            >
              {(Object.keys(ESPERAS) as (keyof typeof ESPERAS)[]).map((k) => (
                <option key={k} value={k}>
                  {ESPERAS[k]}
                </option>
              ))}
            </Seletor>
            <span>(das 8h às 20h; se a pessoa mudar de etapa antes, não sai)</span>
          </div>
        </div>
      );
    } else if (a.tipo === "teste") {
      resto = ctx.testes.length ? (
        <Seletor
          aria-label="Teste"
          value={a.modelo}
          onChange={(e) => trocarAcao(i, { ...a, modelo: e.target.value })}
          className={classesEntrada}
          envoltorio="w-full sm:max-w-xs"
        >
          {ctx.testes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </Seletor>
      ) : (
        <Link href="/painel/testes" className="text-label underline underline-offset-2">
          Escolher um teste primeiro
        </Link>
      );
    } else if (a.tipo === "horarios") {
      const f = FORMATOS_ENTREVISTA[a.formato];
      resto = (
        <div className="flex w-full flex-wrap items-center gap-2">
          <Seletor
            aria-label="Como vai ser"
            value={a.formato}
            onChange={(e) => {
              const formato = e.target.value as FormatoEntrevista;
              trocarAcao(i, { ...a, formato, local: formato === "presencial" ? ctx.endereco || null : null });
            }}
            className={classesEntrada}
          >
            {ctx.formatos.map((k) => (
              <option key={k} value={k}>
                {FORMATOS_ENTREVISTA[k].nome}
              </option>
            ))}
          </Seletor>
          <Seletor
            aria-label="Duração"
            value={String(a.duracao)}
            onChange={(e) => trocarAcao(i, { ...a, duracao: Number(e.target.value) })}
            className={classesEntrada}
          >
            {DURACOES.map((d) => (
              <option key={d} value={d}>
                {d} minutos
              </option>
            ))}
          </Seletor>
          {f.campo && (
            <input
              aria-label={f.campo}
              value={a.local ?? ""}
              maxLength={300}
              placeholder={f.exemplo}
              onChange={(e) => trocarAcao(i, { ...a, local: e.target.value })}
              className={`${classesEntrada} min-w-0 flex-1 basis-56`}
            />
          )}
          <span className="w-full text-caption text-ink-muted">
            Precisa dos seus horários livres cadastrados em{" "}
            <Link href="/painel/configuracoes?aba=entrevistas#horarios" className="underline underline-offset-2">
              Configurações
            </Link>
            . A pessoa escolhe um de 3 horários vagos.
          </span>
        </div>
      );
    } else if (a.tipo === "avisar") {
      resto = (
        <Seletor
          aria-label="Quem recebe o aviso"
          value={a.quem}
          onChange={(e) => trocarAcao(i, { ...a, quem: e.target.value })}
          className={classesEntrada}
        >
          <option value="eu">você</option>
          {ctx.equipe.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </Seletor>
      );
    }
    return (
      <div key={`a${i}`} className={linha}>
        {i > 0 && <span className="px-1 text-label text-ink-muted">e</span>}
        <Seletor
          aria-label={`Ação ${i + 1}`}
          value={a.tipo}
          onChange={(e) => trocarAcao(i, acaoPadrao(e.target.value as TipoAcao, ctx))}
          className={classesEntrada}
          envoltorio="w-full sm:w-auto"
        >
          {ACOES.map((k) => (
            <option key={k.tipo} value={k.tipo}>
              {k.nome}
            </option>
          ))}
        </Seletor>
        {resto}
        <span className="ml-auto">
          <Tirar
            rotulo={`Tirar a ação ${i + 1}`}
            onClick={() => mudar({ acoes: regra.acoes.filter((_, j) => j !== i) })}
          />
        </span>
      </div>
    );
  }

  const g = regra.gatilho;
  const iaDispensa = dispensa && regra.condicoes.some((c) => c.campo === "triagem");

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-line bg-surface-200 px-4 sm:px-5">
        <Parte nome="Quando" id={`${base}-quando`}>
          <div className="flex flex-wrap items-center gap-2">
            <Seletor
              aria-label="Quando a regra age"
              value={g.tipo}
              onChange={(e) => mudar({ gatilho: gatilhoPadrao(e.target.value as TipoGatilho) })}
              className={classesEntrada}
              envoltorio="w-full sm:w-auto"
            >
              {GATILHOS.map((x) => (
                <option key={x.tipo} value={x.tipo}>
                  {x.nome}
                </option>
              ))}
            </Seletor>
            {g.tipo === "entrou_etapa" && (
              <Seletor
                aria-label="Etapa"
                value={g.etapa}
                onChange={(e) => mudar({ gatilho: { ...g, etapa: e.target.value as EtapaDaRegra } })}
                className={classesEntrada}
              >
                {(Object.keys(NOME_ETAPA_DA_REGRA) as EtapaDaRegra[]).map((k) => (
                  <option key={k} value={k}>
                    em {NOME_ETAPA_DA_REGRA[k]}
                  </option>
                ))}
              </Seletor>
            )}
            {g.tipo === "parado" && (
              <>
                <Seletor
                  aria-label="Etapa parada"
                  value={g.etapa}
                  onChange={(e) => mudar({ gatilho: { ...g, etapa: e.target.value as EtapaParada } })}
                  className={classesEntrada}
                >
                  {(Object.keys(NOME_ETAPA_PARADA) as EtapaParada[]).map((k) => (
                    <option key={k} value={k}>
                      em {NOME_ETAPA_PARADA[k]}
                    </option>
                  ))}
                </Seletor>
                <Seletor
                  aria-label="Dias parado"
                  value={String(g.dias)}
                  onChange={(e) => mudar({ gatilho: { ...g, dias: Number(e.target.value) } })}
                  className={classesEntrada}
                >
                  {DIAS.map((d) => (
                    <option key={d} value={d}>
                      por {d} {d === 1 ? "dia" : "dias"}
                    </option>
                  ))}
                </Seletor>
              </>
            )}
            {g.tipo === "entrevista_passou" && (
              <Seletor
                aria-label="Horas depois"
                value={String(g.horas)}
                onChange={(e) => mudar({ gatilho: { ...g, horas: Number(e.target.value) } })}
                className={classesEntrada}
              >
                {HORAS.map((h) => (
                  <option key={h} value={h}>
                    há {h} horas
                  </option>
                ))}
              </Seletor>
            )}
          </div>
        </Parte>

        <Parte nome="Se" id={`${base}-se`}>
          {regra.condicoes.length === 0 && (
            <p className="text-body-sm text-ink-muted">Sem condição: a regra vale para todo mundo nessa situação.</p>
          )}
          {regra.condicoes.map((c, i) => editorDaCondicao(c, i))}
          <Mais
            disabled={regra.condicoes.length >= LIMITES_DA_REGRA.condicoes}
            onClick={() =>
              mudar({ condicoes: [...regra.condicoes, condicaoNova(perguntas.length ? "pergunta" : "distancia")] })
            }
          >
            {regra.condicoes.length ? "E mais uma condição" : "Pôr uma condição"}
          </Mais>
        </Parte>

        <Parte nome="Então" id={`${base}-entao`}>
          {regra.acoes.map((a, i) => editorDaAcao(a, i))}
          <Mais
            disabled={regra.acoes.length >= LIMITES_DA_REGRA.acoes}
            onClick={() => mudar({ acoes: [...regra.acoes, acaoPadrao(regra.acoes.length ? "avisar" : "mover", ctx)] })}
          >
            {regra.acoes.length ? "E mais uma ação" : "Escolher o que fazer"}
          </Mais>
          {iaDispensa && (
            <p role="alert" className="flex items-start gap-1.5 text-body-sm text-danger">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />A Triagem com IA não dispensa ninguém: use
              ela para levar adiante ou avisar.
            </p>
          )}
        </Parte>

        <Parte nome="Vale em" id={`${base}-vale`}>
          <div className="flex flex-wrap items-center gap-2">
            <Seletor
              aria-label="Onde a regra vale"
              value={regra.vale_em}
              onChange={(e) => {
                const vale = e.target.value as RegraMontada["vale_em"];
                mudar({
                  vale_em: vale,
                  anuncio_id: vale === "vaga" ? (regra.anuncio_id ?? ctx.vagas[0]?.id ?? null) : null,
                  cliente_id: vale === "cliente" ? (regra.cliente_id ?? ctx.clientes[0]?.id ?? null) : null,
                });
              }}
              className={classesEntrada}
            >
              <option value="vaga">uma vaga</option>
              <option value="todas">todas as vagas, inclusive as novas</option>
              {ctx.clientes.length > 0 && <option value="cliente">as vagas de um cliente</option>}
            </Seletor>
            {regra.vale_em === "vaga" && (
              <Seletor
                aria-label="Vaga"
                value={regra.anuncio_id ?? ""}
                onChange={(e) => mudar({ anuncio_id: e.target.value })}
                className={classesEntrada}
                envoltorio="w-full sm:max-w-xs"
              >
                {ctx.vagas.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.titulo}
                  </option>
                ))}
              </Seletor>
            )}
            {regra.vale_em === "cliente" && (
              <Seletor
                aria-label="Cliente"
                value={regra.cliente_id ?? ""}
                onChange={(e) => mudar({ cliente_id: e.target.value })}
                className={classesEntrada}
              >
                {ctx.clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Seletor>
            )}
          </div>
          {regra.vale_em !== "vaga" && regra.condicoes.some((c) => c.campo === "pergunta") && (
            <p className="text-caption text-ink-muted">
              A pergunta vale nas vagas que têm uma pergunta com o mesmo texto.
            </p>
          )}
        </Parte>
      </div>

      <section
        aria-labelledby={`${base}-previa`}
        className="flex flex-col gap-2 rounded-lg border border-line bg-surface-100 p-4 sm:p-5"
      >
        <h3 id={`${base}-previa`} className="flex items-center gap-2 text-label">
          <Workflow aria-hidden className="size-4 text-ink-muted" />A regra
        </h3>
        <p className="text-body">{frase}</p>
        <p aria-live="polite" className="flex min-h-6 items-center gap-1.5 text-body-sm text-ink-muted">
          {lendo ? (
            <>
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
              Contando quem ela pegaria…
            </>
          ) : contagem ? (
            contagem.total === 0 ? (
              "Ainda não há ninguém nessa situação nas vagas em que ela vale."
            ) : (
              <span>
                {deTempo ? "Hoje" : "Nos últimos 30 dias"}, esta regra pegaria{" "}
                <strong className="text-ink">
                  {contagem.pegaria} de {contagem.total}
                </strong>{" "}
                {contagem.total === 1 ? "pessoa" : "pessoas"}
                {contagem.nomes.length
                  ? `: ${contagem.nomes.join(", ")}${contagem.pegaria > contagem.nomes.length ? ` e mais ${contagem.pegaria - contagem.nomes.length}` : ""}`
                  : ""}
                .
              </span>
            )
          ) : null}
        </p>
      </section>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${base}-nome`} className="text-label">
          Nome da regra
        </label>
        <input
          id={`${base}-nome`}
          value={nome}
          maxLength={80}
          onChange={(e) => {
            setNomeMexido(true);
            mudar({ nome: e.target.value });
          }}
          className={classesEntrada}
        />
      </div>

      {!deTempo && (
        <label className="flex min-h-10 items-center gap-2 text-body-sm">
          <input
            type="checkbox"
            checked={rodarAgora}
            onChange={(e) => setRodarAgora(e.target.checked)}
            className="size-5 accent-[var(--pk-ink)]"
          />
          Também para quem já está nas vagas{contagem?.pegaria ? ` (${contagem.pegaria} hoje)` : ""}
        </label>
      )}

      {confirmar && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-surface-200 p-4">
          <p className="text-body">
            Esta regra dispensa sozinha, com o retorno.{" "}
            {contagem
              ? `Na prévia, ela pegaria ${contagem.pegaria === 1 ? "1 pessoa" : `${contagem.pegaria} pessoas`}.`
              : ""}{" "}
            O retorno diz que a resposta foi automática e convida a pessoa a responder se houve engano.
          </p>
          <div className="flex flex-wrap gap-2">
            <Botao variante="perigo" disabled={pendente} onClick={() => salvar(true)}>
              Ligar mesmo assim
            </Botao>
            <Botao variante="fantasma" onClick={() => setConfirmar(false)}>
              Voltar
            </Botao>
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}

      {ctx.liberado ? (
        !confirmar && (
          <div className="flex flex-wrap items-center gap-2">
            <Botao variante="primario" disabled={pendente || iaDispensa} onClick={() => salvar(true)}>
              {pendente ? "Salvando…" : "Salvar e ligar"}
            </Botao>
            <Botao variante="secundario" disabled={pendente || iaDispensa} onClick={() => salvar(false)}>
              Salvar desligada
            </Botao>
            <Link
              href={voltar}
              className="inline-flex min-h-11 items-center px-2 text-label text-ink-muted hover:text-ink"
            >
              Cancelar
            </Link>
          </div>
        )
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-line-strong bg-surface-200 p-4">
          <p className="text-body">
            Montar e ver a prévia é livre. Para salvar e ligar as suas regras, use as Automações personalizadas.
          </p>
          {ctx.podeExperimentar ? (
            <BotaoExperimentar recurso="automacoes" acao="experimentar" />
          ) : (
            <Link href="/painel/automacoes" className="text-label underline underline-offset-2">
              Ver como liberar
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
