"use client";

import {
  CalendarCheck,
  Check,
  CircleAlert,
  CircleCheckBig,
  ClipboardCheck,
  Copy,
  Hourglass,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  MailCheck,
  MessageSquareText,
  PartyPopper,
  Plus,
  Reply,
  Sparkles,
  Video,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { copiarAutomacoes, salvarRegrasAutomacao, usarNasVagasNovas } from "@/lib/acoes/automacoes";
import { salvarModeloMensagem } from "@/lib/acoes/recrutamento";
import {
  ETAPAS_COM_MENSAGEM,
  faltaParaSalvar,
  ENCERRAR_PRONTO,
  montarRecado,
  PARADO_PRONTO,
  RECADO_PADRAO,
  regrasLigadas,
  TOTAL_DE_REGRAS,
  type Automacoes,
  type EtapaComMensagem,
  type RegraFeita,
  type RegrasDaVaga,
} from "@/lib/automacoes";
import type { EtapaPropria } from "@/lib/etapas-proprias";
import { FORMATOS_ENTREVISTA, type FormatoEntrevista } from "@/lib/recrutamento";
import { Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
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
  };
}

const vezes = (n: number) => (n === 1 ? "1 vez" : `${n} vezes`);

/** O que só as Automações sob medida mudam: o cadeado e o porquê (a oferta fica no alto da página). */
function Trava({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-start gap-1.5 text-body-sm text-ink-muted">
      <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </span>
  );
}

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

/** Os botões que põem {nome}, {vaga} e {empresa} no texto, onde está o cursor. */
function Marcadores({
  campo,
  mudar,
}: {
  campo: React.RefObject<HTMLTextAreaElement | null>;
  mudar: (t: string) => void;
}) {
  function por(marca: string) {
    const t = campo.current;
    if (!t) return;
    const ini = t.selectionStart ?? t.value.length;
    const fim = t.selectionEnd ?? t.value.length;
    const novo = `${t.value.slice(0, ini)}${marca}${t.value.slice(fim)}`;
    mudar(novo);
    requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-caption text-ink-muted">
      Pôr no texto:
      {[
        ["{nome}", "o nome"],
        ["{vaga}", "a vaga"],
        ["{empresa}", "a empresa"],
      ].map(([marca, nome]) => (
        <button
          key={marca}
          type="button"
          onClick={() => por(marca)}
          className="inline-flex min-h-8 items-center rounded-pill border border-line-strong px-2.5 text-caption text-ink hover:bg-surface-300"
        >
          {nome}
        </button>
      ))}
    </div>
  );
}

/** Criar uma mensagem pronta ali mesmo, sem sair das automações. */
function NovaMensagem({ aoCriar, primeira }: { aoCriar: () => void; primeira: boolean }) {
  const [aberta, setAberta] = useState(false);
  const [nome, setNome] = useState("");
  const [texto, setTexto] = useState("");
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  if (!aberta) {
    return (
      <button
        type="button"
        onClick={() => setAberta(true)}
        className="inline-flex min-h-10 items-center gap-1.5 text-label underline-offset-2 hover:underline"
      >
        <Plus aria-hidden className="size-4" />
        {primeira ? "Criar a primeira mensagem pronta" : "Criar outra mensagem pronta"}
      </button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2 rounded-md bg-surface-300 p-3">
      <label htmlFor={`${id}-nome`} className="text-label">
        Nome da mensagem
      </label>
      <input
        id={`${id}-nome`}
        value={nome}
        maxLength={60}
        placeholder="Ex.: Chamar para a entrevista"
        onChange={(e) => setNome(e.target.value)}
        className={classesEntrada}
      />
      <label htmlFor={`${id}-texto`} className="text-label">
        Texto
      </label>
      <textarea
        id={`${id}-texto`}
        ref={campo}
        value={texto}
        rows={3}
        maxLength={1800}
        placeholder="Oi, {nome}! Gostamos do seu perfil para {vaga}…"
        onChange={(e) => setTexto(e.target.value)}
        className={classesEntrada}
      />
      <Marcadores campo={campo} mudar={setTexto} />
      <div className="flex flex-wrap gap-2">
        <Botao
          tamanho="sm"
          variante="primario"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const r = await chamarAcao(() => salvarModeloMensagem(nome, texto));
              if (!r.ok) return setErro(r.erro);
              setAberta(false);
              setNome("");
              setTexto("");
              aoCriar();
            })
          }
        >
          {pendente ? "Criando…" : "Criar a mensagem"}
        </Botao>
        <Botao tamanho="sm" variante="fantasma" onClick={() => setAberta(false)}>
          Voltar
        </Botao>
      </div>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
    </div>
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

const DIAS_PARADO = [2, 3, 5, 7, 10, 15];
const DIAS_RETORNO = [3, 5, 7, 10, 15, 30];
const DURACOES = [15, 30, 45, 60, 90];

/** As automações da vaga, pelo momento do processo. Cada mudança é salva na hora. */
export function EditorAutomacoes({
  anuncioId,
  inicial,
  modelos,
  etapasProprias,
  formatos,
  endereco,
  vaga,
  empresa,
  quantas,
}: {
  anuncioId: string;
  inicial: Automacoes;
  modelos: { id: string; nome: string }[];
  etapasProprias: EtapaPropria[];
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
  const [comMensagens, setComMensagens] = useState(Object.keys(inicial.mensagens).length > 0);
  const [estado, setEstado] = useState<Estado>(null);
  const ultimo = useRef(regras);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const salvando = useRef(false);
  const deNovo = useRef(false);
  const recado = useRef<HTMLTextAreaElement>(null);
  const [pendenteOutras, iniciarOutras] = useTransition();
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
  const [avisoOutras, setAvisoOutras] = useState<{ ok: boolean; texto: string } | null>(null);

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
  const proprias = (base: string) => etapasProprias.filter((e) => e.base === base);
  const etapasComMensagem = (Object.keys(ETAPAS_COM_MENSAGEM) as EtapaComMensagem[]).flatMap((base) => [
    { chave: base as string, nome: ETAPAS_COM_MENSAGEM[base], dentro: null as string | null },
    ...proprias(base).map((e) => ({ chave: `sub:${e.id}`, nome: e.nome, dentro: ETAPAS_COM_MENSAGEM[base] })),
  ]);
  const semRetorno = !inicial.retornoLigado && (
    <>
      O retorno da conta está desligado: a pessoa sai sem aviso. Ligue em “Retorno a quem não seguir”, no{" "}
      <Caminho href={`/painel/anuncio/${id}/quadro`}>quadro</Caminho>.
    </>
  );
  const ligadas = regrasLigadas({ ...regras, mensagens: comMensagens ? regras.mensagens : {} });
  const agiu = Object.values(inicial.contagem).reduce((s, n) => s + (n ?? 0), 0);
  const conta = (r: RegraFeita) => inicial.contagem[r] ?? 0;
  const padraoDaqui = inicial.padrao?.origem === anuncioId;
  // sem as Automações sob medida: as prontas (o texto e os prazos do Publike); o que já estava salvo continua
  const medida = inicial.sobMedida;
  const soSobMedida = (o_que: string) => !medida && <Trava>{o_que} é das Automações sob medida.</Trava>;

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
          descricao="Na hora, a pessoa recebe um recado seu no Publike, no celular e por e-mail. Ninguém fica sem saber se deu certo."
          ligada={regras.recado !== null}
          mudar={(v) => mudar({ recado: v ? RECADO_PADRAO : null })}
          contagem={conta("recado")}
        >
          <label htmlFor={`${id}-recado`} className="sr-only">
            O recado
          </label>
          <textarea
            id={`${id}-recado`}
            ref={recado}
            value={regras.recado ?? ""}
            rows={3}
            maxLength={400}
            readOnly={!medida}
            onChange={(e) => mudar({ recado: e.target.value }, 900)}
            className={`${classesEntrada} min-h-24 [field-sizing:content] ${medida ? "" : "text-ink-muted"}`}
          />
          {medida ? (
            <Marcadores campo={recado} mudar={(t) => mudar({ recado: t }, 900)} />
          ) : (
            soSobMedida("Escrever o seu recado")
          )}
          {regras.recado && (
            <p className="rounded-md bg-surface-300 p-3 text-body-sm">
              <span className="text-ink-muted">Assim chega: </span>
              {montarRecado(regras.recado, { nome: "Ana Souza", vaga, empresa })}
            </p>
          )}
        </Regra>
        <Regra
          icone={ListFilter}
          titulo="Dispensar quem não passa nas perguntas eliminatórias"
          descricao="Quem responder diferente do que a vaga procura vai para Não seguiu e recebe o retorno 15 minutos depois."
          ligada={regras.dispensarEliminados}
          mudar={(v) => mudar({ dispensarEliminados: v })}
          falta={
            !medida && !regras.dispensarEliminados
              ? soSobMedida("Dispensar pela pergunta eliminatória")
              : !inicial.temEliminatoria && (
                  <>
                    <span>Esta vaga ainda não tem pergunta eliminatória.</span>
                    <Caminho href={`/painel/anuncio/${id}/editar#perguntas-da-vaga`}>
                      Marcar uma nas perguntas da vaga
                    </Caminho>
                  </>
                )
          }
          aviso={semRetorno}
          contagem={conta("dispensar")}
        />
        <Regra
          icone={Sparkles}
          titulo="Levar para Em análise quem a Triagem com IA aprova"
          descricao="Quando a Triagem com IA lê o currículo e a pessoa atende todos os critérios obrigatórios, ela vai sozinha para Em análise. A IA não dispensa ninguém."
          ligada={regras.triagemParaAnalise}
          mudar={(v) => mudar({ triagemParaAnalise: v })}
          falta={
            !medida && !regras.triagemParaAnalise ? (
              soSobMedida("Levar para Em análise pela Triagem")
            ) : !inicial.triagem.liberada ? (
              <>
                <span>Precisa da Triagem com IA, que tem 15 dias grátis para testar.</span>
                <Caminho href={`/painel/anuncio/${id}/copiloto`}>Conhecer a Triagem com IA</Caminho>
              </>
            ) : (
              inicial.triagem.obrigatorios === 0 && (
                <>
                  <span>Marque pelo menos um critério como obrigatório na Triagem desta vaga.</span>
                  <Caminho href={`/painel/anuncio/${id}/copiloto`}>Abrir os critérios</Caminho>
                </>
              )
            )
          }
          contagem={conta("triagem")}
        />
        <Regra
          icone={Video}
          titulo="Pedir a entrevista em vídeo a todo novo candidato"
          descricao="A pessoa grava as respostas pelo celular em até 5 dias, e a IA resume. Quem é dispensado pela eliminatória não recebe o pedido."
          ligada={regras.videoATodos}
          mudar={(v) => mudar({ videoATodos: v })}
          falta={
            !inicial.video.liberado ? (
              <>
                <span>Precisa da Entrevista em vídeo, que tem 15 dias grátis para testar.</span>
                <Caminho href="/painel/video">Conhecer a Entrevista em vídeo</Caminho>
              </>
            ) : (
              inicial.video.perguntas < 2 && (
                <>
                  <span>Monte primeiro as perguntas da entrevista desta vaga.</span>
                  <Caminho href={`/painel/anuncio/${id}/video`}>Montar as perguntas</Caminho>
                </>
              )
            )
          }
        />
        <Regra
          icone={ClipboardCheck}
          titulo="Pedir o Teste Prático a quem se candidata"
          descricao={
            inicial.testes > 0
              ? `Ligada: a vaga pede ${inicial.testes === 1 ? "1 teste" : `${inicial.testes} testes`}, que a pessoa faz pelo celular logo depois de se candidatar.`
              : "A pessoa faz o teste pelo celular logo depois de se candidatar. O teste fica na aba Teste Prático."
          }
          ligada={inicial.testes > 0}
          controle={
            <Link
              href={`/painel/anuncio/${id}/testes`}
              className="inline-flex min-h-10 shrink-0 items-center rounded-md border border-line-strong px-3 text-label hover:bg-surface-300"
            >
              {inicial.testes > 0 ? "Mudar o teste" : "Escolher o teste"}
            </Link>
          }
        />
      </Grupo>

      <Grupo titulo="Quando você move alguém no quadro">
        <Regra
          icone={MessageSquareText}
          titulo="Mandar uma mensagem pronta ao mover"
          descricao="A mensagem da etapa vai na conversa de quem tem match, uma vez só por pessoa. Vale também para as suas etapas próprias."
          ligada={comMensagens}
          mudar={(v) => {
            setComMensagens(v);
            if (!v) mudar({ mensagens: {} });
          }}
          falta={
            !medida && !comMensagens
              ? soSobMedida("A mensagem pronta por etapa")
              : modelos.length === 0 && (
                  <>
                    <span>Você ainda não tem mensagens prontas.</span>
                    <NovaMensagem primeira aoCriar={() => setComMensagens(true)} />
                  </>
                )
          }
          contagem={conta("mensagem")}
        >
          <div className="flex flex-col gap-2">
            {etapasComMensagem.map((e) => (
              <div key={e.chave} className="grid gap-1.5 sm:grid-cols-[12rem_1fr] sm:items-center sm:gap-3">
                <span className="text-body-sm">
                  <span className="text-label">{e.nome}</span>
                  {e.dentro && <span className="text-ink-muted"> · dentro de {e.dentro}</span>}
                </span>
                <Seletor
                  aria-label={`Mensagem ao mover para ${e.nome}`}
                  value={regras.mensagens[e.chave] ?? ""}
                  onChange={(ev) => {
                    const mensagens = { ...regras.mensagens };
                    if (ev.target.value) mensagens[e.chave] = ev.target.value;
                    else delete mensagens[e.chave];
                    mudar({ mensagens });
                  }}
                  className={classesEntrada}
                  envoltorio="w-full sm:max-w-sm"
                >
                  <option value="">Nenhuma</option>
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </Seletor>
              </div>
            ))}
          </div>
          {modelos.length > 0 && <NovaMensagem primeira={false} aoCriar={() => undefined} />}
        </Regra>
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
          descricao="Quem ficar parado em Novos, Em análise ou Entrevista gera um aviso para você, uma vez por parada."
          ligada={regras.paradoDias !== null}
          mudar={(v) => mudar({ paradoDias: v ? PARADO_PRONTO : null })}
          contagem={conta("parado")}
        >
          <label className="flex flex-wrap items-center gap-2 text-body-sm">
            Depois de
            <Seletor
              aria-label="Dias parado"
              disabled={!medida}
              value={String(regras.paradoDias ?? PARADO_PRONTO)}
              onChange={(e) => mudar({ paradoDias: Number(e.target.value) })}
              className={classesEntrada}
              envoltorio="w-32"
            >
              {DIAS_PARADO.map((d) => (
                <option key={d} value={d}>
                  {d} dias
                </option>
              ))}
            </Seletor>
            na mesma etapa
          </label>
          {soSobMedida("Mudar o prazo")}
        </Regra>
        <Regra
          icone={Reply}
          titulo="Dar o retorno a quem ficou sem resposta"
          descricao="Quem ficar em Novos sem a sua resposta vai para Não seguiu e recebe o seu retorno. Ninguém fica esperando para sempre."
          ligada={regras.encerrarDias !== null}
          mudar={(v) => mudar({ encerrarDias: v ? ENCERRAR_PRONTO : null })}
          aviso={semRetorno}
          contagem={conta("encerrar")}
        >
          <label className="flex flex-wrap items-center gap-2 text-body-sm">
            Depois de
            <Seletor
              aria-label="Dias sem resposta"
              disabled={!medida}
              value={String(regras.encerrarDias ?? ENCERRAR_PRONTO)}
              onChange={(e) => mudar({ encerrarDias: Number(e.target.value) })}
              className={classesEntrada}
              envoltorio="w-32"
            >
              {DIAS_RETORNO.map((d) => (
                <option key={d} value={d}>
                  {d} dias
                </option>
              ))}
            </Seletor>
            sem resposta
          </label>
          {soSobMedida("Mudar o prazo")}
          {regras.recado && /\b\d+\s*dias?\b/.test(regras.recado) && (
            <p className="text-caption text-ink-muted">
              Confira se o prazo bate com o que o recado de recebimento promete.
            </p>
          )}
        </Regra>
      </Grupo>

      <Grupo titulo="Quando a vaga fecha">
        <Regra
          icone={PartyPopper}
          titulo="Marcar a vaga como preenchida quando completar"
          novo
          descricao={`Quando ${quantas === 1 ? "você contratar a pessoa da vaga" : `os contratados chegarem a ${quantas}, o “Quantas pessoas” da vaga`}, ela é marcada como preenchida e quem se candidatou recebe o aviso, como no botão. A vaga continua aberta para você.`}
          ligada={regras.preencherAoCompletar}
          mudar={(v) => mudar({ preencherAoCompletar: v })}
          contagem={conta("completa")}
        />
        <Regra
          icone={CircleCheckBig}
          titulo="Encerrar o processo de quem ficou"
          descricao="Ao marcar a vaga como preenchida, todos recebem o aviso de sempre, e quem não foi contratado sai do quadro para Não seguiu, sem um segundo aviso."
          ligada={regras.encerrarAoPreencher}
          mudar={(v) => mudar({ encerrarAoPreencher: v })}
          contagem={conta("preenchida")}
        />
      </Grupo>

      <section
        aria-labelledby={`${id}-outras`}
        className="flex flex-col gap-3 rounded-lg border border-line bg-surface-100 p-4 sm:p-5"
      >
        <h3 id={`${id}-outras`} className="text-h3">
          Usar em outras vagas
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <Botao
            tamanho="sm"
            variante="secundario"
            disabled={!medida || pendenteOutras || inicial.outrasNoAr === 0 || estado?.tipo === "salvando"}
            onClick={() =>
              iniciarOutras(async () => {
                setAvisoOutras(null);
                const r = await chamarAcao(() => copiarAutomacoes(anuncioId));
                setAvisoOutras(r.ok ? { ok: true, texto: r.mensagem ?? "Copiado." } : { ok: false, texto: r.erro });
              })
            }
          >
            <Copy aria-hidden />
            {inicial.outrasNoAr === 0
              ? "Nenhuma outra vaga no ar"
              : `Copiar para ${inicial.outrasNoAr === 1 ? "a outra vaga no ar" : `as outras ${inicial.outrasNoAr} vagas no ar`}`}
          </Botao>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p id={`${id}-novas`} className="text-label">
              Começar as vagas novas com estas regras
            </p>
            <p className="text-body-sm text-ink-muted">
              {padraoDaqui
                ? "Ligado: toda vaga nova já nasce com as regras desta, e o que você mudar aqui vale para as próximas."
                : inicial.padrao?.titulo
                  ? `Hoje as vagas novas começam com as regras de “${inicial.padrao.titulo}”.`
                  : "As vagas novas começam sem automações."}
            </p>
          </div>
          <Interruptor
            ligado={padraoDaqui}
            rotulo={`${id}-novas`}
            desabilitado={pendenteOutras || (!medida && !padraoDaqui)}
            mudar={(v) =>
              iniciarOutras(async () => {
                setAvisoOutras(null);
                const r = await chamarAcao(() => usarNasVagasNovas(anuncioId, v));
                setAvisoOutras(r.ok ? { ok: true, texto: r.mensagem ?? "Pronto." } : { ok: false, texto: r.erro });
              })
            }
          />
        </div>
        {soSobMedida("Usar as regras em outras vagas")}
        {avisoOutras && (
          <p
            role={avisoOutras.ok ? "status" : "alert"}
            className={`text-body-sm ${avisoOutras.ok ? "text-cerrado-text" : "text-danger"}`}
          >
            {avisoOutras.texto}
          </p>
        )}
      </section>
    </div>
  );
}
