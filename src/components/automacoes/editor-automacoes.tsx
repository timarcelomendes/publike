"use client";

import {
  CalendarCheck,
  Check,
  CircleAlert,
  Hourglass,
  LoaderCircle,
  MailCheck,
  MessageCircleQuestion,
  PartyPopper,
  Reply,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { salvarRegrasAutomacao } from "@/lib/acoes/automacoes";
import {
  faltaParaSalvar,
  ENCERRAR_PRONTO,
  montarRecado,
  PARADO_PRONTO,
  RECADO_PADRAO,
  regrasLigadas,
  TOTAL_DE_REGRAS,
  type Automacoes,
  type RegraFeita,
  type RegrasDaVaga,
} from "@/lib/automacoes";
import { FORMATOS_ENTREVISTA, type FormatoEntrevista } from "@/lib/recrutamento";
import { Selo } from "../ui/basicos";
import { classesEntrada, Seletor } from "../ui/campo";

type Estado = { tipo: "salvando" | "salvo" | "erro" | "falta"; texto?: string } | null;

function soAsRegras(a: Automacoes): RegrasDaVaga {
  return {
    dispensarEliminados: a.dispensarEliminados,
    mensagens: a.mensagens,
    paradoDias: a.paradoDias,
    recado: a.recado,
    triagemParaAnalise: a.triagemParaAnalise,
    encerrarDias: a.encerrarDias,
    encerrarAoPreencher: a.encerrarAoPreencher,
    preencherAoCompletar: a.preencherAoCompletar,
    horarios: a.horarios,
    videoATodos: a.videoATodos,
    perguntarNoMatch: a.perguntarNoMatch,
  };
}

const vezes = (n: number) => (n === 1 ? "1 vez" : `${n} vezes`);

/** O liga-desliga de cada regra (um botão com o papel de "switch"). */
function Interruptor({
  ligado,
  mudar,
  rotulo,
  desabilitado = false,
}: {
  ligado: boolean;
  mudar: (v: boolean) => void;
  /** o id do título da regra */
  rotulo: string;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-labelledby={rotulo}
      disabled={desabilitado}
      onClick={() => mudar(!ligado)}
      className="group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-pill px-1 text-caption text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span className={`hidden w-16 text-right sm:inline ${ligado ? "text-terra-text" : ""}`}>
        {ligado ? "Ligada" : "Desligada"}
      </span>
      <span
        aria-hidden
        className={`relative inline-flex h-7 w-12 items-center rounded-pill transition-colors motion-reduce:transition-none ${
          ligado ? "bg-terra" : "bg-surface-300 ring-1 ring-line-strong ring-inset"
        }`}
      >
        <span
          className={`inline-block size-5 rounded-pill shadow-card transition-transform motion-reduce:transition-none ${
            ligado ? "translate-x-6 bg-surface-100" : "translate-x-1 bg-surface-100 ring-1 ring-line-strong"
          }`}
        />
      </span>
    </button>
  );
}

/** Uma regra: o ícone, o nome, o que faz, o liga-desliga, o que falta, o ajuste e quantas vezes agiu. */
function Regra({
  icone: Icone,
  titulo,
  descricao,
  ligada,
  mudar,
  falta,
  aviso,
  contagem,
  controle,
  novo = false,
  children,
}: {
  icone: LucideIcon;
  titulo: string;
  /** o selo "Novo" ao lado do nome */
  novo?: boolean;
  descricao: ReactNode;
  ligada: boolean;
  mudar?: (v: boolean) => void;
  /** o que falta para a regra valer nesta vaga (com o caminho para resolver) */
  falta?: ReactNode;
  /** um alerta com a regra ligada */
  aviso?: ReactNode;
  contagem?: number;
  /** no lugar do liga-desliga (a regra que mora em outra aba) */
  controle?: ReactNode;
  /** o ajuste, com a regra ligada */
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <li className="flex gap-3 px-4 py-4 sm:gap-4 sm:px-5">
      <span
        aria-hidden
        className={`mt-1 flex size-9 shrink-0 items-center justify-center rounded-md transition-colors ${
          ligada ? "bg-terra-soft text-terra-text" : "bg-surface-300 text-ink-muted"
        }`}
      >
        <Icone className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <h4 id={`${id}-titulo`} className="min-w-0 pt-2.5 text-label">
              {titulo}
              {novo && (
                <>
                  {" "}
                  <Selo variante="novo">Novo</Selo>
                </>
              )}
            </h4>
            {controle ??
              (mudar && (
                <Interruptor
                  ligado={ligada}
                  mudar={mudar}
                  rotulo={`${id}-titulo`}
                  desabilitado={Boolean(falta) && !ligada}
                />
              ))}
          </div>
          <p className="text-body-sm text-ink-muted">{descricao}</p>
        </div>
        {falta && (
          <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-line-strong px-3 py-2.5 text-body-sm">
            {falta}
          </div>
        )}
        {ligada && children && <div className="flex flex-col gap-3">{children}</div>}
        {ligada && aviso && (
          <p className="flex items-start gap-1.5 text-body-sm text-ink">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-terra-text" />
            <span>{aviso}</span>
          </p>
        )}
        {Boolean(contagem) && (
          <p className="flex items-center gap-1.5 text-caption text-ink-muted">
            <Check aria-hidden className="size-3.5" />
            Agiu {vezes(contagem!)} nesta vaga
          </p>
        )}
      </div>
    </li>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="px-1 text-label text-ink-muted">
        {titulo}
      </h3>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">{children}</ul>
    </section>
  );
}

function Caminho({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-label underline underline-offset-2 hover:text-terra-text">
      {children}
    </Link>
  );
}

/** O jeito pronto não serve? A regra das Automações personalizadas, já montada parecida. */
function SeuJeito({ href, children }: { href: string; children: ReactNode }) {
  return (
    <p className="text-body-sm text-ink-muted">
      {children}{" "}
      <Link href={href} className="text-label text-ink underline underline-offset-2 hover:text-terra-text">
        Criar uma regra assim
      </Link>
    </p>
  );
}

function EstadoDoSalvar({ estado }: { estado: Estado }) {
  return (
    <p aria-live="polite" className="flex min-h-6 items-center gap-1.5 text-body-sm">
      {estado?.tipo === "salvando" && (
        <>
          <LoaderCircle aria-hidden className="size-4 animate-spin text-ink-muted motion-reduce:animate-none" />
          <span className="text-ink-muted">Salvando…</span>
        </>
      )}
      {estado?.tipo === "salvo" && (
        <>
          <Check aria-hidden className="size-4 text-cerrado-text" />
          <span className="text-cerrado-text">Tudo salvo</span>
        </>
      )}
      {(estado?.tipo === "erro" || estado?.tipo === "falta") && (
        <>
          <CircleAlert aria-hidden className={`size-4 ${estado.tipo === "erro" ? "text-danger" : "text-terra-text"}`} />
          <span className={estado.tipo === "erro" ? "text-danger" : ""}>
            {estado.tipo === "falta" ? `Ainda não salvo: ${estado.texto}` : estado.texto}
          </span>
        </>
      )}
    </p>
  );
}

const DURACOES = [15, 30, 45, 60, 90];

/** As automações da vaga, pelo momento do processo. Cada mudança é salva na hora. */
export function EditorAutomacoes({
  anuncioId,
  inicial,
  formatos,
  endereco,
  vaga,
  empresa,
  quantas,
}: {
  anuncioId: string;
  inicial: Automacoes;
  /** os formatos de entrevista que esta conta pode usar (o "Pelo Publike" só com a chamada ao vivo) */
  formatos: FormatoEntrevista[];
  /** o endereço da vaga, para a entrevista presencial */
  endereco: string;
  vaga: string;
  empresa: string;
  /** o "Quantas pessoas" da vaga */
  quantas: number;
}) {
  const [regras, setRegras] = useState<RegrasDaVaga>(() => soAsRegras(inicial));
  const [estado, setEstado] = useState<Estado>(null);
  const ultimo = useRef(regras);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const salvando = useRef(false);
  const deNovo = useRef(false);
  // o resumo preso no alto ganha o fundo e a linha só quando a página rolou
  const marco = useRef<HTMLDivElement>(null);
  const [preso, setPreso] = useState(false);
  useEffect(() => {
    const el = marco.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const o = new IntersectionObserver(([e]) => setPreso(!e.isIntersecting), { rootMargin: "-64px 0px 0px 0px" });
    o.observe(el);
    return () => o.disconnect();
  }, []);

  useEffect(() => () => void (espera.current && clearTimeout(espera.current)), []);

  async function enviar() {
    const falta = faltaParaSalvar(ultimo.current);
    if (falta) return setEstado({ tipo: "falta", texto: falta });
    if (salvando.current) {
      deNovo.current = true;
      return;
    }
    salvando.current = true;
    setEstado({ tipo: "salvando" });
    const r = await chamarAcao(() => salvarRegrasAutomacao(anuncioId, ultimo.current));
    salvando.current = false;
    if (deNovo.current) {
      deNovo.current = false;
      return enviar();
    }
    setEstado(r.ok ? { tipo: "salvo" } : { tipo: "erro", texto: r.erro });
  }

  /** muda e salva: na hora (o liga-desliga e as listas) ou depois de parar de escrever (os textos) */
  function mudar(m: Partial<RegrasDaVaga>, demora = 0) {
    const proximas = { ...ultimo.current, ...m };
    ultimo.current = proximas;
    setRegras(proximas);
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => void enviar(), demora);
  }

  const id = anuncioId;
  const semRetorno = !inicial.retornoLigado && (
    <>
      O retorno da conta está desligado: a pessoa sai sem aviso. Ligue em “Retorno a quem não seguir”, no{" "}
      <Caminho href={`/painel/anuncio/${id}/quadro`}>quadro</Caminho>.
    </>
  );
  const ligadas = regrasLigadas(regras);
  const agiu = Object.values(inicial.contagem).reduce((s, n) => s + (n ?? 0), 0);
  const conta = (r: RegraFeita) => inicial.contagem[r] ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* o resumo e o "Tudo salvo" acompanham a rolagem: dá para ver que salvou lá embaixo também */}
      <div ref={marco} aria-hidden className="-mb-6 h-px" />
      <div
        className={`sticky top-16 z-20 -mx-4 px-4 py-2 sm:mx-0 sm:rounded-b-md sm:px-3 ${
          preso ? "border-b border-line bg-surface-100/95 shadow-card backdrop-blur-md" : ""
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Selo variante={ligadas ? "match" : "contorno"}>
            {ligadas} de {TOTAL_DE_REGRAS} ligadas
          </Selo>
          {agiu > 0 && <Selo variante="contorno">Agiram {vezes(agiu)}</Selo>}
          <span className="ml-auto">
            <EstadoDoSalvar estado={estado} />
          </span>
        </div>
      </div>

      <Grupo titulo="Quando alguém se candidata">
        <Regra
          icone={MailCheck}
          titulo="Confirmar que a candidatura chegou"
          descricao="Na hora, a pessoa recebe um recado no Publike, no celular e por e-mail. Ninguém fica sem saber se deu certo."
          ligada={regras.recado !== null}
          mudar={(v) => mudar({ recado: v ? RECADO_PADRAO : null })}
          contagem={conta("recado")}
        >
          <p className="rounded-md bg-surface-300 p-3 text-body-sm">
            <span className="text-ink-muted">Assim chega: </span>
            {montarRecado(RECADO_PADRAO, { nome: "Ana Souza", vaga, empresa })}
          </p>
          <SeuJeito href={`/painel/automacoes/regra?modelo=seu-recado&vaga=${id}`}>Quer o seu texto?</SeuJeito>
        </Regra>
      </Grupo>

      <Grupo titulo="Quando der match">
        <Regra
          icone={MessageCircleQuestion}
          titulo="Perguntar no chat o que a vaga precisa"
          novo
          descricao="Logo depois do match, o chat faz até 3 perguntas curtas, de um toque: o que a vaga pede e o currículo não mostra (CNH, experiência, horário, escolaridade) e quando a pessoa pode começar. As respostas chegam para você num aviso."
          ligada={regras.perguntarNoMatch}
          mudar={(v) => mudar({ perguntarNoMatch: v })}
          contagem={conta("perguntas")}
        >
          <p className="rounded-md bg-surface-300 p-3 text-body-sm">
            <span className="text-ink-muted">Assim começa: </span>
            Deu match em “{vaga}”! Para adiantar, 3 perguntas rápidas.
          </p>
        </Regra>
      </Grupo>

      <Grupo titulo="Quando você move alguém">
        <Regra
          icone={CalendarCheck}
          titulo="Oferecer os seus horários livres ao mover para Entrevista"
          descricao="Quem chega em Entrevista recebe 3 horários vagos da sua semana para escolher. Ninguém pega o horário de outra pessoa."
          ligada={regras.horarios !== null}
          mudar={(v) =>
            mudar({
              horarios: v ? { formato: "presencial", local: endereco || null, duracao: 30 } : null,
            })
          }
          falta={
            !inicial.temHorarios && (
              <>
                <span>Cadastre primeiro os horários da semana em que você entrevista.</span>
                <Caminho href="/painel/etapas#horarios">Cadastrar os horários livres</Caminho>
              </>
            )
          }
          contagem={conta("horarios")}
        >
          {regras.horarios && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-label">
                Como vai ser
                <Seletor
                  value={regras.horarios.formato}
                  onChange={(e) => {
                    const formato = e.target.value as FormatoEntrevista;
                    mudar({
                      horarios: {
                        ...regras.horarios!,
                        formato,
                        local: formato === "presencial" ? endereco || null : null,
                      },
                    });
                  }}
                  className={classesEntrada}
                >
                  {formatos.map((f) => (
                    <option key={f} value={f}>
                      {FORMATOS_ENTREVISTA[f].nome}
                    </option>
                  ))}
                </Seletor>
              </label>
              <label className="flex flex-col gap-1.5 text-label">
                Duração
                <Seletor
                  value={String(regras.horarios.duracao)}
                  onChange={(e) => mudar({ horarios: { ...regras.horarios!, duracao: Number(e.target.value) } })}
                  className={classesEntrada}
                >
                  {DURACOES.map((d) => (
                    <option key={d} value={d}>
                      {d} minutos
                    </option>
                  ))}
                </Seletor>
              </label>
              {FORMATOS_ENTREVISTA[regras.horarios.formato].campo && (
                <label className="flex flex-col gap-1.5 text-label sm:col-span-2">
                  {FORMATOS_ENTREVISTA[regras.horarios.formato].campo}
                  <input
                    value={regras.horarios.local ?? ""}
                    maxLength={300}
                    placeholder={FORMATOS_ENTREVISTA[regras.horarios.formato].exemplo}
                    onChange={(e) => mudar({ horarios: { ...regras.horarios!, local: e.target.value } }, 900)}
                    className={classesEntrada}
                  />
                </label>
              )}
            </div>
          )}
        </Regra>
      </Grupo>

      <Grupo titulo="Com o passar dos dias">
        <Regra
          icone={Hourglass}
          titulo="Lembrar você dos candidatos parados"
          descricao={`Quem ficar ${PARADO_PRONTO} dias parado em Novos, Em análise ou Entrevista gera um aviso para você, uma vez por parada.`}
          ligada={regras.paradoDias !== null}
          mudar={(v) => mudar({ paradoDias: v ? PARADO_PRONTO : null })}
          contagem={conta("parado")}
        >
          <SeuJeito href={`/painel/automacoes/regra?modelo=ninguem-esfria&vaga=${id}`}>Outro prazo?</SeuJeito>
        </Regra>
        <Regra
          icone={Reply}
          titulo="Dar o retorno a quem ficou sem resposta"
          descricao={`Quem ficar ${ENCERRAR_PRONTO} dias em Novos sem a sua resposta vai para Não seguiu e recebe o seu retorno. Ninguém fica esperando para sempre.`}
          ligada={regras.encerrarDias !== null}
          mudar={(v) => mudar({ encerrarDias: v ? ENCERRAR_PRONTO : null })}
          aviso={semRetorno}
          contagem={conta("encerrar")}
        >
          <SeuJeito href={`/painel/automacoes/regra?modelo=retorno-sem-resposta&vaga=${id}`}>Outro prazo?</SeuJeito>
        </Regra>
      </Grupo>

      <Grupo titulo="Quando a vaga fecha">
        <Regra
          icone={PartyPopper}
          titulo="Marcar a vaga como preenchida quando completar"
          novo
          descricao={`Quando ${quantas === 1 ? "você contratar a pessoa da vaga" : `os contratados chegarem a ${quantas}, o “Quantas pessoas” da vaga`}, ela é marcada como preenchida e quem se candidatou recebe o aviso, como no botão.`}
          ligada={regras.preencherAoCompletar}
          mudar={(v) => mudar({ preencherAoCompletar: v })}
          contagem={conta("completa")}
        >
          <label className="flex min-h-10 items-start gap-2 text-body-sm">
            <input
              type="checkbox"
              checked={regras.encerrarAoPreencher}
              onChange={(e) => mudar({ encerrarAoPreencher: e.target.checked })}
              className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
            />
            <span>
              E encerrar o processo de quem ficou: quem não foi contratado sai do quadro para Não seguiu, sem um segundo
              aviso. Vale também quando você marca a vaga como preenchida no botão.
              {conta("preenchida") ? ` (Agiu ${vezes(conta("preenchida"))}.)` : ""}
            </span>
          </label>
        </Regra>
      </Grupo>

      <p className="text-body-sm text-ink-muted">
        Pedir a entrevista em vídeo ou o Teste Prático a todo mundo fica nas abas desses recursos, em Avaliar.
      </p>
    </div>
  );
}
