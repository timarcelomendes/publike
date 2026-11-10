"use client";

import { LoaderCircle, Mail, Video } from "lucide-react";
import { useEffect, useId, useState, useTransition } from "react";
import { criarReuniaoDaConversa } from "@/lib/acoes/google-meet";
import { emailValido } from "@/lib/email-valido";
import { BotaoCopiar } from "@/components/painel/pagina-de-vagas";
import { classesBotao } from "@/components/ui/botao";
import { Botao } from "@/components/ui/botao";
import { Campo, classesEntrada, MensagemErro, Seletor } from "@/components/ui/campo";

// Agendar uma conversa com um prospect (Admin › E-mails › Agendar conversa). Com o Google Meet ligado no servidor, um
// toque cria o evento na Google Agenda com a sala do Meet e o Google manda o convite ao prospect. Sem ele (ou para usar
// outra agenda), os textos ficam prontos para copiar no evento, e o e-mail de acompanhamento também.

const GUARDADO = "publike_admin_convite_conversa";

const PAUTA_PADRAO = [
  "O que vocês precisam contratar agora",
  "Como o Publike funciona na prática: a vaga, os candidatos perto e a conversa pelo chat",
  "Próximos passos",
].join("\n");

const DURACOES = ["15", "20", "30", "45", "60"];

type Guardado = { link: string; pauta: string; assina: string; duracao: string };

function amanhaAs10() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return { data: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hora: "10:00" };
}

/** "terça-feira, 10 de novembro" */
function diaPorExtenso(data: string) {
  const [a, m, d] = data.split("-").map(Number);
  if (!a || !m || !d) return "";
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

/** "10h" ou "15h30" */
function horaCurta(hora: string) {
  const [h, m] = hora.split(":");
  if (!h) return "";
  return m && m !== "00" ? `${Number(h)}h${m}` : `${Number(h)}h`;
}

/** O link da reunião, mesmo quando a pessoa cola o convite inteiro (o primeiro link que aparecer). */
export function lerReuniao(texto: string) {
  const url = texto.match(/https?:\/\/[^\s<>"']+/)?.[0]?.replace(/[.,;)]+$/, "") ?? "";
  return { url, meet: /meet\.google\.com\//i.test(url) };
}

/** As linhas da reunião no convite e no e-mail. */
function linhasDaReuniao(r: ReturnType<typeof lerReuniao>) {
  if (!r.url) return [];
  return [r.meet ? `Entrar pelo Google Meet: ${r.url}` : `Entrar na conversa: ${r.url}`];
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";

export function ConviteDeConversa({ meet = false }: { meet?: boolean }) {
  const id = useId();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [empresa, setEmpresa] = useState("");
  // o dia de amanhã só depois de abrir (a data do servidor não vale para a tela)
  const [{ data, hora }, setQuando] = useState({ data: "", hora: "10:00" });
  const [duracao, setDuracao] = useState("20");
  const [link, setLink] = useState("");
  const [pauta, setPauta] = useState(PAUTA_PADRAO);
  const [assina, setAssina] = useState("Marcelo, do Publike");
  // a reunião criada agora no Google: só desta conversa (não fica guardada para o próximo convite)
  const [criada, setCriada] = useState<{ url: string; evento: string; convidou: boolean; para: string } | null>(null);
  const [erroMeet, setErroMeet] = useState<string | null>(null);
  // o Google manda o convite ao prospect (do e-mail da conta Google de quem atende)
  const [convidar, setConvidar] = useState(true);
  const [criando, iniciar] = useTransition();

  // o link da sala, a pauta, a duração e a assinatura ficam neste aparelho para o próximo convite
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a data de hoje, no navegador
    setQuando((q) => (q.data ? q : amanhaAs10()));
    try {
      const g = JSON.parse(localStorage.getItem(GUARDADO) ?? "null") as Partial<Guardado> | null;
      if (!g) return;
      if (g.link) setLink(g.link);
      if (g.pauta) setPauta(g.pauta);
      if (g.assina) setAssina(g.assina);
      if (g.duracao && DURACOES.includes(g.duracao)) setDuracao(g.duracao);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      // a sala fixa (a de sempre) fica guardada; a reunião criada para esta conversa, não
      const salvo = criada ? (JSON.parse(localStorage.getItem(GUARDADO) ?? "{}") as Partial<Guardado>).link ?? "" : link;
      localStorage.setItem(GUARDADO, JSON.stringify({ link: salvo, pauta, assina, duracao } satisfies Guardado));
    } catch {}
  }, [link, pauta, assina, duracao, criada]);

  const pronto = nome.trim().length >= 2 && emailValido(email) && Boolean(data && hora);
  const quem = empresa.trim() || nome.trim();
  const dia = diaPorExtenso(data);
  const as = horaCurta(hora);
  const itens = pauta
    .split("\n")
    .map((l) => l.replace(/^[-•*\s]+/, "").trim())
    .filter(Boolean);
  const horario = `${data}T${hora}/${duracao}`;
  const reuniao = criada ? { url: criada.url, meet: true } : lerReuniao(link);
  const daReuniao = linhasDaReuniao(reuniao);

  const titulo = `Publike + ${quem}: conversa de ${duracao} min`;
  const descricaoDe = (salas: string[]) => [
    `Oi, ${primeiroNome(nome)}!`,
    "",
    // sem o nome da empresa na frase: "a Grupo…" ou "o Loja…" saem errados (o nome já está no título)
    "Uma conversa rápida para ver como o Publike pode ajudar vocês a contratar.",
    ...(itens.length ? ["", "O que vamos ver:", ...itens.map((i) => `- ${i}`)] : []),
    ...(salas.length ? ["", ...salas] : []),
    "",
    "Se o horário não der, é só responder este convite com outro.",
    "",
    assina.trim(),
  ].join("\n");
  const descricao = descricaoDe(daReuniao);

  const assunto = `Nossa conversa sobre o Publike: ${dia}, às ${as}`;
  const corpo = [
    `Oi, ${primeiroNome(nome)}, tudo bem?`,
    "",
    `Obrigado pelo interesse no Publike. Mandei o convite para a nossa conversa de ${duracao} minutos na ${dia}, às ${as} (horário de Brasília).`,
    ...(daReuniao.length ? ["", ...daReuniao] : []),
    "",
    "Se outro horário for melhor, me responda com duas opções que eu ajusto.",
    "",
    "Abraço,",
    assina.trim(),
  ].join("\n");

  function criarNoMeet() {
    setErroMeet(null);
    iniciar(async () => {
      const r = await criarReuniaoDaConversa({
        titulo,
        inicio: `${data}T${hora}`,
        minutos: Number(duracao),
        // a sala do Meet o próprio Google põe no evento
        descricao: descricaoDe([]),
        convidado: convidar && emailValido(email) ? email.trim() : null,
      });
      if (!r.ok) return setErroMeet(r.erro);
      setCriada({ url: r.reuniao.url, evento: r.reuniao.evento, convidou: r.reuniao.convidou, para: horario });
      setLink(r.reuniao.url);
    });
  }

  const mailto = `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Campo rotulo="Nome" nome={`${id}-nome`}>
          <input
            id={`${id}-nome`}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="off"
            className={classesEntrada}
          />
        </Campo>
        <Campo rotulo="E-mail" nome={`${id}-email`} erro={email && !emailValido(email) ? "Confira o e-mail." : undefined}>
          <input
            id={`${id}-email`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            className={classesEntrada}
          />
        </Campo>
        <Campo rotulo="Empresa" nome={`${id}-empresa`} opcional>
          <input
            id={`${id}-empresa`}
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            autoComplete="off"
            className={classesEntrada}
          />
        </Campo>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-2">
          <Campo rotulo="Dia" nome={`${id}-data`} className="col-span-2 sm:col-span-1 lg:col-span-2">
            <input
              id={`${id}-data`}
              type="date"
              value={data}
              onChange={(e) => setQuando((q) => ({ ...q, data: e.target.value }))}
              className={classesEntrada}
            />
          </Campo>
          <Campo rotulo="Hora" nome={`${id}-hora`}>
            <input
              id={`${id}-hora`}
              type="time"
              step={900}
              value={hora}
              onChange={(e) => setQuando((q) => ({ ...q, hora: e.target.value }))}
              className={classesEntrada}
            />
          </Campo>
          <Campo rotulo="Duração" nome={`${id}-duracao`}>
            <Seletor
              id={`${id}-duracao`}
              value={duracao}
              onChange={(e) => setDuracao(e.target.value)}
              className={classesEntrada}
            >
              {DURACOES.map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
            </Seletor>
          </Campo>
        </div>
        {criada ? (
          <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-100 p-3">
            <p className="flex items-center gap-2 text-label">
              <Video aria-hidden className="size-4 shrink-0 text-cerrado" />
              {criada.convidou ? "Evento criado e convite enviado pelo Google" : "Evento criado na Google Agenda"}
            </p>
            <p className="text-body-sm break-all text-ink-muted">{criada.url}</p>
            {criada.para !== horario && (
              <MensagemErro>
                Você mudou o dia, a hora ou a duração: mude também o evento na Google Agenda, ou crie outro.
              </MensagemErro>
            )}
            <div className="flex flex-wrap gap-2">
              {criada.evento && (
                <a href={criada.evento} target="_blank" rel="noopener noreferrer" className={classesBotao("secundario", "sm")}>
                  Abrir na Google Agenda
                </a>
              )}
              {criada.para !== horario && (
                <Botao tamanho="sm" variante="secundario" onClick={criarNoMeet} disabled={criando}>
                  {criando ? <LoaderCircle aria-hidden className="animate-spin" /> : <Video aria-hidden />}
                  Criar outro
                </Botao>
              )}
              <Botao
                tamanho="sm"
                variante="fantasma"
                onClick={() => {
                  setCriada(null);
                  setLink("");
                }}
              >
                Usar outro link
              </Botao>
            </div>
          </div>
        ) : (
          <>
            {meet && (
              <div className="flex flex-col gap-2">
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-body-sm">
                  <input
                    type="checkbox"
                    checked={convidar}
                    onChange={(e) => setConvidar(e.target.checked)}
                    className="size-5 accent-[var(--pk-ink)]"
                  />
                  O Google manda o convite para {emailValido(email) ? email.trim() : "o e-mail do prospect"}
                </label>
                <Botao variante="secundario" onClick={criarNoMeet} disabled={criando || !pronto}>
                  {criando ? <LoaderCircle aria-hidden className="animate-spin" /> : <Video aria-hidden />}
                  {criando ? "Criando no Google…" : "Criar com o Google Meet"}
                </Botao>
                <p className="text-body-sm text-ink-muted">
                  O evento entra na sua Google Agenda no dia e na hora escolhidos, com a sala do Meet e a pauta.
                </p>
                {erroMeet && <MensagemErro>{erroMeet}</MensagemErro>}
              </div>
            )}
            <Campo
              rotulo={meet ? "Ou cole o link da sala" : "Link da conversa"}
              nome={`${id}-link`}
              opcional
              ajuda="O link do Meet (ou o convite inteiro, que o link vai para o lugar certo). A sala fica guardada para o próximo convite."
            >
              <input
                id={`${id}-link`}
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://meet.google.com/abc-defg-hij"
                className={classesEntrada}
              />
            </Campo>
          </>
        )}
        <details className="rounded-md border border-line bg-surface-100 px-3 py-2">
          <summary className="min-h-9 cursor-pointer content-center text-label">Pauta e assinatura</summary>
          <div className="mt-2 flex flex-col gap-3 pb-1">
            <Campo rotulo="O que vamos ver" nome={`${id}-pauta`} ajuda="Um item por linha.">
              <textarea
                id={`${id}-pauta`}
                value={pauta}
                onChange={(e) => setPauta(e.target.value)}
                rows={4}
                className={`${classesEntrada} py-2`}
              />
            </Campo>
            <Campo rotulo="Quem assina" nome={`${id}-assina`}>
              <input
                id={`${id}-assina`}
                value={assina}
                onChange={(e) => setAssina(e.target.value)}
                className={classesEntrada}
              />
            </Campo>
          </div>
        </details>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {!pronto ? (
          <p className="rounded-md border border-dashed border-line-strong p-4 text-body-sm text-ink-muted">
            Escreva o nome e o e-mail do prospect. O título e a descrição do convite aparecem aqui, prontos para colar
            no evento da agenda, se não usar o Google Meet.
          </p>
        ) : (
          <>
            {criada?.convidou ? (
              <p className="text-body-sm text-ink-muted">
                O convite já foi pelo Google. Se quiser, mande também o e-mail de acompanhamento.
              </p>
            ) : (
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-body-sm text-ink-muted">
              <li>Na sua agenda, crie o evento na {dia}, às {as}, com {duracao} minutos.</li>
              <li>Cole o título e a descrição abaixo.</li>
              <li>
                Em Convidados, ponha <b className="font-semibold text-ink">{email.trim()}</b> e salve enviando o convite.
              </li>
            </ol>
            )}
            {!criada?.convidou && (
              <>
            <Bloco rotulo="Título do evento" texto={titulo} copiar="Copiar título" principal />
            <Bloco rotulo="Descrição do evento" texto={descricao} copiar="Copiar descrição" principal />
              </>
            )}
            <Bloco rotulo="E-mail de acompanhamento (opcional)" texto={`Assunto: ${assunto}\n\n${corpo}`} copiar="Copiar e-mail">
              <a href={mailto} className={classesBotao("secundario", "sm")}>
                <Mail aria-hidden />
                Abrir no e-mail
              </a>
            </Bloco>
          </>
        )}
      </div>
    </div>
  );
}

function Bloco({
  rotulo,
  texto,
  copiar,
  principal = false,
  children,
}: {
  rotulo: string;
  texto: string;
  copiar: string;
  principal?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-md border border-line bg-surface-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-label">{rotulo}</h3>
        <div className="flex flex-wrap gap-2">
          {children}
          <BotaoCopiar texto={texto} rotulo={copiar} principal={principal} />
        </div>
      </div>
      <p className="text-body-sm break-words whitespace-pre-wrap text-ink">{texto}</p>
    </section>
  );
}
