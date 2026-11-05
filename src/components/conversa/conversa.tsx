"use client";

import { Bot, Check, CheckCheck, FileText, Paperclip, SendHorizontal } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { chamarAcao } from "@/lib/acao-segura";
import {
  anexarCurriculoNaConversa,
  enviarMensagemPara,
  linkDoAnexo,
  marcarConversaLidaCom,
  responderEntrevistaNaConversa,
  responderPerguntaDoChat,
} from "@/lib/acoes/mensagens";
import { MAX_PDF_MB } from "@/lib/constantes";
import type { MensagemConversa } from "@/lib/dados";
import { lerEntrevistaDaMensagem } from "@/lib/entrevista-na-conversa";
import { lerPerguntaDaMensagem } from "@/lib/perguntas-do-match";
import { criarClienteNavegador, ouvirAoVivo } from "@/lib/supabase/navegador";
import { MensagemErro } from "../ui/campo";
import { EntrevistaNaConversa, type RespostaDaEntrevista } from "./entrevista-na-conversa";

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function dia(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
}

/**
 * A conversa com uma pessoa, dentro do Publike: uma só, com as mensagens das vagas em comum e da
 * conexão juntas. As mensagens novas chegam na hora (Supabase Realtime); só os dois leem.
 */
export function Conversa({
  outroId,
  conversaId,
  euId,
  outroNome,
  iniciais,
  compacto = false,
  vagaDoCurriculo = null,
  conexao = false,
  verLida = true,
}: {
  /** a outra conta da conversa */
  outroId: string;
  /** a conversa da dupla (para ouvir as mensagens novas) */
  conversaId: string;
  euId: string;
  outroNome: string;
  iniciais: MensagemConversa[];
  /** na janela de mensagens do canto: ocupa a altura dela, sem borda própria */
  compacto?: boolean;
  /** a vaga em que curti (sou o candidato): dá para anexar o currículo (PDF) */
  vagaDoCurriculo?: string | null;
  /** a conversa vem só da conexão (sem vaga em comum): muda o texto da conversa vazia */
  conexao?: boolean;
  /** a confirmação de leitura da minha conta: desligada, as minhas mensagens não mostram o "lida" */
  verLida?: boolean;
}) {
  const idCampo = useId();
  const [mensagens, setMensagens] = useState<MensagemConversa[]>(iniciais);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const lista = useRef<HTMLDivElement>(null);
  const primeiroNome = outroNome.split(" ")[0];

  const ler = useEffectEvent(() => {
    marcarConversaLidaCom(outroId).catch(() => undefined);
  });

  // ao abrir: marca como lida e passa a ouvir as mensagens novas (de qualquer vaga ou da conexão)
  useEffect(() => {
    ler();
    const supabase = criarClienteNavegador();
    const filtro = `conversa_id=eq.${conversaId}`;
    // o canal entra já com o login (sem ele, o Realtime recusa o filtro)
    const fechar = ouvirAoVivo(supabase, (s) =>
      s
        .channel(`conversa-${conversaId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "mensagens", filter: filtro },
          (mudanca) => {
            const nova = mudanca.new as MensagemConversa;
            setMensagens((atual) => (atual.some((m) => m.id === nova.id) ? atual : [...atual, nova]));
            if (nova.autor_id !== euId) ler();
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "mensagens", filter: filtro },
          (mudanca) => {
            const mudou = mudanca.new as MensagemConversa;
            // "lida" aparece na hora em que a outra pessoa abre a conversa
            // e o currículo anexado (entra logo depois da mensagem)
            setMensagens((atual) =>
              atual.map((m) =>
                m.id === mudou.id
                  ? {
                      ...m,
                      lida_em: verLida ? mudou.lida_em : null,
                      anexo: mudou.anexo ?? m.anexo,
                      anexo_nome: mudou.anexo_nome ?? m.anexo_nome,
                      // a pergunta do match respondida (o botão escolhido)
                      pergunta: mudou.pergunta ?? m.pergunta,
                      // a entrevista confirmada, remarcada ou cancelada
                      entrevista: mudou.entrevista ?? m.entrevista,
                    }
                  : m,
              ),
            );
          },
        ),
    );
    return fechar;
  }, [conversaId, euId, verLida]);

  // desce até a última mensagem
  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensagens.length]);

  function enviar(e?: FormEvent) {
    e?.preventDefault();
    const t = texto.trim();
    if (!t || pendente) return;
    setErro(null);
    iniciar(async () => {
      // sem chegar ao servidor, o texto fica no campo e o aviso aparece
      const r = await chamarAcao(() => enviarMensagemPara(outroId, t));
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setTexto("");
      setMensagens((atual) => (atual.some((m) => m.id === r.mensagem.id) ? atual : [...atual, r.mensagem]));
    });
  }

  // as perguntas do match: um toque responde (a resposta e a próxima pergunta voltam da ação)
  const [respondendo, setRespondendo] = useState<number | null>(null);

  /** As mensagens que voltam de uma resposta: a mudada fica no lugar, a nova entra na ordem. */
  function juntar(novas: MensagemConversa[]) {
    setMensagens((atual) => {
      const porId = new Map(novas.map((x) => [x.id, x]));
      const juntas = atual.map((x) => porId.get(x.id) ?? x);
      for (const x of novas) if (!atual.some((y) => y.id === x.id)) juntas.push(x);
      return juntas.sort((a, b) => a.criado_em.localeCompare(b.criado_em) || a.id - b.id);
    });
  }

  async function responder(m: MensagemConversa, opcao: number) {
    if (respondendo !== null) return;
    setErro(null);
    setRespondendo(m.id);
    try {
      const r = await chamarAcao(() => responderPerguntaDoChat(m.id, opcao));
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      juntar(r.mensagens);
    } finally {
      setRespondendo(null);
    }
  }

  // a entrevista na conversa: confirmar, pedir outro horário ou escolher um horário (a resposta entra na conversa)
  async function responderEntrevista(m: MensagemConversa, r: RespostaDaEntrevista) {
    if (respondendo !== null) return;
    setErro(null);
    setRespondendo(m.id);
    try {
      const feito = await chamarAcao(() => responderEntrevistaNaConversa(m.id, r.resposta, r.quando));
      if (!feito.ok) {
        setErro(feito.erro);
        return;
      }
      juntar(feito.mensagens);
    } finally {
      setRespondendo(null);
    }
  }

  // currículo pelo chat: só quem curtiu uma vaga da outra pessoa (vai para a curtida dela)
  const podeAnexar = Boolean(vagaDoCurriculo);
  const [enviandoPdf, setEnviandoPdf] = useState(false);

  async function anexar(e: ChangeEvent<HTMLInputElement>) {
    const pdf = e.target.files?.[0];
    e.target.value = "";
    if (!pdf) return;
    setErro(null);
    if (pdf.type !== "application/pdf") return setErro("Anexe o currículo em PDF.");
    if (pdf.size > MAX_PDF_MB * 1024 * 1024) return setErro(`O PDF pode ter no máximo ${MAX_PDF_MB} MB.`);
    setEnviandoPdf(true);
    try {
      const caminho = `${euId}/${Date.now()}.pdf`;
      const { error } = await criarClienteNavegador()
        .storage.from("curriculos")
        .upload(caminho, pdf, { contentType: "application/pdf", upsert: false });
      if (error) throw error;
      if (!vagaDoCurriculo) return;
      const r = await anexarCurriculoNaConversa(vagaDoCurriculo, caminho, pdf.name);
      if (!r.ok) return setErro(r.erro);
      setMensagens((atual) => (atual.some((m) => m.id === r.mensagem.id) ? atual : [...atual, r.mensagem]));
    } catch {
      setErro("Não deu para enviar o PDF agora. Tente de novo.");
    } finally {
      setEnviandoPdf(false);
    }
  }

  /** Abre o currículo anexado (link que vale pouco tempo, pedido na hora). */
  async function abrirAnexo(id: number) {
    // a aba abre já no toque (o navegador bloqueia janela aberta depois de esperar)
    const aba = window.open("", "_blank");
    const link = await linkDoAnexo(id).catch(() => null);
    if (link && aba) aba.location.href = link;
    else {
      aba?.close();
      setErro("Não deu para abrir o currículo agora.");
    }
  }

  return (
    <div
      className={
        compacto
          ? "flex min-h-0 flex-1 flex-col bg-surface-200"
          : "flex flex-col overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card"
      }
    >
      <div
        ref={lista}
        role="log"
        aria-live="polite"
        aria-label={`Conversa com ${outroNome}`}
        className={`flex flex-col gap-2 overflow-y-auto p-3 ${compacto ? "min-h-0 flex-1" : "h-[min(60dvh,32rem)] sm:p-4"}`}
      >
        {mensagens.length === 0 ? (
          <p className="m-auto max-w-sm text-center text-body-sm text-ink-muted">
            {conexao
              ? `Vocês estão conectados! Mande a primeira mensagem para ${primeiroNome}: conte o que procura e combinem os próximos passos.`
              : `Deu match! Mande a primeira mensagem para ${primeiroNome}: combinem horário, endereço e o que mais precisar.`}
          </p>
        ) : (
          mensagens.map((m, i) => {
            const minha = m.autor_id === euId;
            const novoDia = i === 0 || dia(mensagens[i - 1].criado_em) !== dia(m.criado_em);
            const pergunta = m.automatica ? lerPerguntaDaMensagem(m.pergunta) : null;
            const entrevista = lerEntrevistaDaMensagem(m.entrevista);
            return (
              <div key={m.id} className="flex flex-col">
                {novoDia && (
                  <p className="my-2 self-center rounded-pill bg-surface-300 px-3 py-0.5 text-caption text-ink-muted">
                    {dia(m.criado_em)}
                  </p>
                )}
                <div
                  className={`max-w-[85%] rounded-md px-3 py-2 text-body whitespace-pre-wrap break-words ${
                    minha
                      ? "self-end rounded-br-sm bg-ink text-surface-100"
                      : "self-start rounded-bl-sm bg-surface-300 text-ink"
                  }`}
                >
                  <span className="sr-only">{minha ? "Você" : primeiroNome}: </span>
                  {m.automatica && (
                    <span
                      className={`mb-0.5 flex items-center gap-1 text-caption ${minha ? "text-surface-100/70" : "text-ink-muted"}`}
                    >
                      <Bot aria-hidden className="size-3.5 shrink-0" />
                      {pergunta ? "Pergunta automática" : "Mensagem automática"}
                    </span>
                  )}
                  {m.anexo ? (
                    <button
                      type="button"
                      onClick={() => abrirAnexo(m.id)}
                      className={`flex min-h-11 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-label underline-offset-2 hover:underline ${
                        minha ? "bg-surface-100/15" : "bg-surface-200"
                      }`}
                    >
                      <FileText aria-hidden className="size-5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block break-all">{m.anexo_nome ?? "Currículo.pdf"}</span>
                        <span className={`block text-caption ${minha ? "text-surface-100/70" : "text-ink-muted"}`}>
                          Currículo em PDF · abrir
                        </span>
                      </span>
                    </button>
                  ) : (
                    m.texto
                  )}
                  {pergunta && (
                    <BotoesDaPergunta
                      opcoes={pergunta.opcoes}
                      resposta={pergunta.resposta}
                      // quem responde é quem recebeu a pergunta; quem publicou vê os botões e o que foi escolhido
                      podeResponder={!minha}
                      ocupado={respondendo !== null}
                      escolher={(opcao) => void responder(m, opcao)}
                      escuro={minha}
                      esperando={`Esperando a resposta de ${primeiroNome}.`}
                    />
                  )}
                  {entrevista && (
                    <EntrevistaNaConversa
                      e={entrevista}
                      candidato={!minha}
                      nome={primeiroNome}
                      empresa={outroNome}
                      anuncioId={m.anuncio_id ?? null}
                      ocupado={respondendo !== null}
                      responder={(r) => void responderEntrevista(m, r)}
                    />
                  )}
                  <span
                    className={`mt-0.5 flex items-center justify-end gap-1 text-[12px] ${minha ? "text-surface-100/70" : "text-ink-muted"}`}
                  >
                    {hora(m.criado_em)}
                    {/* as minhas: um tique enviada, dois (coloridos) lida, na hora em que a outra pessoa abre */}
                    {minha &&
                      (m.lida_em ? (
                        <CheckCheck aria-hidden className="size-4 text-lida" />
                      ) : (
                        <Check aria-hidden className="size-4" />
                      ))}
                    {minha && <span className="sr-only">{m.lida_em ? ", lida" : ", enviada"}</span>}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form onSubmit={enviar} className="flex flex-col gap-2 border-t border-line p-3">
        {erro && <MensagemErro>{erro}</MensagemErro>}
        <div className="flex items-end gap-2">
          {podeAnexar && (
            <label
              title="Anexar currículo (PDF)"
              className={`inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line-strong text-ink-muted hover:bg-surface-300 hover:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
                enviandoPdf ? "pointer-events-none opacity-60" : ""
              }`}
            >
              <Paperclip aria-hidden className="size-5" />
              <span className="sr-only">{enviandoPdf ? "Enviando o currículo…" : "Anexar currículo (PDF)"}</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={anexar}
                disabled={enviandoPdf}
                className="sr-only"
              />
            </label>
          )}
          <label htmlFor={idCampo} className="sr-only">
            Mensagem para {primeiroNome}
          </label>
          <textarea
            id={idCampo}
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              // Enter manda; Shift+Enter pula linha (no celular, o botão manda)
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                window.matchMedia("(pointer: fine)").matches
              ) {
                e.preventDefault();
                enviar();
              }
            }}
            rows={compacto ? 1 : 2}
            placeholder={`Escreva para ${primeiroNome}…`}
            className="min-h-11 flex-1 resize-none rounded-sm border border-line-strong bg-surface-100 px-3 py-2 text-body text-ink placeholder:text-ink-muted/80"
          />
          <button
            type="submit"
            disabled={pendente || !texto.trim()}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md bg-terra px-4 text-label text-on-terra transition-colors hover:bg-terra-hover disabled:opacity-50"
          >
            <SendHorizontal aria-hidden className="size-4" />
            <span className={compacto ? "sr-only" : ""}>Enviar</span>
          </button>
        </div>
      </form>
    </div>
  );
}

/** Os botões de uma pergunta do match: um toque responde; depois, o escolhido fica marcado. */
function BotoesDaPergunta({
  opcoes,
  resposta,
  podeResponder,
  ocupado,
  escolher,
  escuro,
  esperando,
}: {
  opcoes: string[];
  resposta: number | null;
  podeResponder: boolean;
  ocupado: boolean;
  escolher: (opcao: number) => void;
  /** a bolha escura (de quem publicou) */
  escuro: boolean;
  esperando: string;
}) {
  if (!podeResponder) {
    return (
      <span className="mt-2 flex flex-col gap-1.5 whitespace-normal">
        <span className="flex flex-wrap gap-1.5">
          {opcoes.map((o, i) => (
            <span
              key={o}
              className={`inline-flex items-center gap-1 rounded-pill border px-2.5 py-0.5 text-caption ${
                i === resposta
                  ? escuro
                    ? "border-surface-100 bg-surface-100 text-ink"
                    : "border-ink bg-ink text-surface-100"
                  : escuro
                    ? "border-surface-100/30 text-surface-100/80"
                    : "border-line-strong text-ink-muted"
              }`}
            >
              {i === resposta && <Check aria-hidden className="size-3.5" />}
              {o}
              {i === resposta && <span className="sr-only"> (a resposta)</span>}
            </span>
          ))}
        </span>
        {resposta === null && (
          <span className={`text-caption ${escuro ? "text-surface-100/70" : "text-ink-muted"}`}>{esperando}</span>
        )}
      </span>
    );
  }
  return (
    <span role="group" aria-label="Responda com um toque" className="mt-2 flex flex-wrap gap-2 whitespace-normal">
      {opcoes.map((o, i) => {
        const escolhida = i === resposta;
        return (
          <button
            key={o}
            type="button"
            disabled={resposta !== null || ocupado}
            aria-pressed={escolhida}
            onClick={() => escolher(i)}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
              escolhida
                ? "border-ink bg-ink text-surface-100"
                : resposta !== null
                  ? "border-line text-ink-muted opacity-60"
                  : "border-line-strong bg-surface-100 text-ink hover:border-ink hover:bg-surface-200 disabled:opacity-60"
            }`}
          >
            {escolhida && <Check aria-hidden className="size-4" />}
            {o}
          </button>
        );
      })}
    </span>
  );
}
