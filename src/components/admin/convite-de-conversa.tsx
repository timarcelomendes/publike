"use client";

import { Mail } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { BotaoCopiar } from "@/components/painel/pagina-de-vagas";
import { classesBotao } from "@/components/ui/botao";
import { Campo, classesEntrada, Seletor } from "@/components/ui/campo";

// Agendar uma conversa com um prospect (Admin › E-mails › Agendar conversa). O convite sai pela agenda do e-mail
// profissional (Titan): aqui só se montam os textos. A pessoa preenche nome, e-mail, dia e hora; copia o título e a
// descrição para o evento da agenda (com o prospect como convidado) e, se quiser, o e-mail de acompanhamento.

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

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";
const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

export function ConviteDeConversa() {
  const id = useId();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [{ data, hora }, setQuando] = useState(amanhaAs10);
  const [duracao, setDuracao] = useState("20");
  const [link, setLink] = useState("");
  const [pauta, setPauta] = useState(PAUTA_PADRAO);
  const [assina, setAssina] = useState("Marcelo, do Publike");

  // o link da sala, a pauta, a duração e a assinatura ficam neste aparelho para o próximo convite
  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(GUARDADO) ?? "null") as Partial<Guardado> | null;
      if (!g) return;
      /* eslint-disable react-hooks/set-state-in-effect -- lido do navegador depois de montar */
      if (g.link) setLink(g.link);
      if (g.pauta) setPauta(g.pauta);
      if (g.assina) setAssina(g.assina);
      if (g.duracao && DURACOES.includes(g.duracao)) setDuracao(g.duracao);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(GUARDADO, JSON.stringify({ link, pauta, assina, duracao } satisfies Guardado));
    } catch {}
  }, [link, pauta, assina, duracao]);

  const pronto = nome.trim().length >= 2 && emailValido(email) && Boolean(data && hora);
  const quem = empresa.trim() || nome.trim();
  const dia = diaPorExtenso(data);
  const as = horaCurta(hora);
  const itens = pauta
    .split("\n")
    .map((l) => l.replace(/^[-•*\s]+/, "").trim())
    .filter(Boolean);
  const linhaDoLink = link.trim() ? `Link da conversa: ${link.trim()}` : "O link da conversa vai neste convite.";

  const titulo = `Publike + ${quem}: conversa de ${duracao} min`;
  const descricao = [
    `Oi, ${primeiroNome(nome)}!`,
    "",
    `Uma conversa rápida para ver como o Publike ajuda ${empresa.trim() ? `a ${empresa.trim()}` : "você"} a contratar.`,
    ...(itens.length ? ["", "O que vamos ver:", ...itens.map((i) => `- ${i}`)] : []),
    "",
    linhaDoLink,
    "",
    "Se o horário não der, é só responder este convite com outro.",
    "",
    assina.trim(),
  ].join("\n");

  const assunto = `Nossa conversa sobre o Publike: ${dia}, às ${as}`;
  const corpo = [
    `Oi, ${primeiroNome(nome)}, tudo bem?`,
    "",
    `Obrigado pelo interesse no Publike. Mandei o convite para a nossa conversa de ${duracao} minutos na ${dia}, às ${as} (horário de Brasília).`,
    ...(link.trim() ? ["", `Link da conversa: ${link.trim()}`] : []),
    "",
    "Se outro horário for melhor, me responda com duas opções que eu ajusto.",
    "",
    "Abraço,",
    assina.trim(),
  ].join("\n");

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
        <Campo
          rotulo="Link da conversa"
          nome={`${id}-link`}
          opcional
          ajuda="O link do Google Meet ou do Zoom. A agenda da Titan não cria a sala; fica guardado para o próximo convite."
        >
          <input
            id={`${id}-link`}
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://meet.google.com/…"
            className={classesEntrada}
          />
        </Campo>
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
            no evento da agenda.
          </p>
        ) : (
          <>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-body-sm text-ink-muted">
              <li>Na agenda da Titan, crie o evento na {dia}, às {as}, com {duracao} minutos.</li>
              <li>Cole o título e a descrição abaixo.</li>
              <li>
                Em Convidados, ponha <b className="font-semibold text-ink">{email.trim()}</b> e salve enviando o convite.
              </li>
            </ol>
            <Bloco rotulo="Título do evento" texto={titulo} copiar="Copiar título" principal />
            <Bloco rotulo="Descrição do evento" texto={descricao} copiar="Copiar descrição" principal />
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
