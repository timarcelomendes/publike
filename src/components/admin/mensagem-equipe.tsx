"use client";

import { Bell, ChevronDown, Mail, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { mandarMensagemDaEquipe, verRespostasDaEquipe } from "@/lib/acoes/admin-contas";
import { formatarDataHora, plural } from "@/lib/formato";
import { EMAIL_DA_EQUIPE, LIMITES_MENSAGEM_EQUIPE, type RespostaDaConta } from "@/lib/mensagem-equipe";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

export type MensagemEnviada = {
  id: number;
  assunto: string;
  texto: string;
  por_email: boolean;
  criado_em: string;
  lida_em: string | null;
  respostas: RespostaDaConta[];
};

/**
 * Admin › Conta › Mensagem da equipe: escreve para a conta. Vai sempre para o sino ("Equipe Publike: …",
 * que abre a mensagem inteira em /painel/mensagens-da-equipe) e, marcado, também para o e-mail; a
 * resposta do e-mail chega em development@publike.org. Pede confirmação antes de mandar.
 */
export function MensagemDaEquipe({
  contaId,
  nome,
  temEmail,
  enviadas,
}: {
  contaId: string;
  nome: string;
  /** a conta tem e-mail (de login ou de contato) */
  temEmail: boolean;
  enviadas: MensagemEnviada[];
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [assunto, setAssunto] = useState("");
  const [texto, setTexto] = useState("");
  const [email, setEmail] = useState(temEmail);
  const [confirmar, setConfirmar] = useState(false);
  const pronto = assunto.trim().length >= 3 && texto.trim().length >= 3;
  const novas = enviadas.some((m) => m.respostas.some((r) => !r.vista_em));
  // abriu a conta: as respostas dela deixam de ser novas (a marca "nova" fica nesta visita)
  useEffect(() => {
    if (novas) verRespostasDaEquipe(contaId).catch(() => {});
  }, [novas, contaId]);

  return (
    <div className="flex flex-col gap-4">
      <Campo rotulo="Assunto" nome="mensagem-assunto" ajuda="Aparece no sino e no assunto do e-mail.">
        <input
          id="mensagem-assunto"
          value={assunto}
          onChange={(e) => {
            setAssunto(e.target.value);
            setConfirmar(false);
          }}
          maxLength={LIMITES_MENSAGEM_EQUIPE.assunto}
          placeholder="Ex.: Sua vaga voltou ao ar"
          className={classesEntrada}
        />
      </Campo>
      <Campo rotulo="Mensagem" nome="mensagem-texto">
        <textarea
          id="mensagem-texto"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setConfirmar(false);
          }}
          maxLength={LIMITES_MENSAGEM_EQUIPE.texto}
          rows={5}
          placeholder="Escreva como se fosse um e-mail. O site já põe o “Oi, nome.” no começo do e-mail."
          className={`${classesEntrada} min-h-32 py-2`}
        />
      </Campo>
      <label className={`flex items-start gap-2 text-body-sm ${temEmail ? "cursor-pointer" : "text-ink-muted"}`}>
        <input
          type="checkbox"
          checked={email && temEmail}
          disabled={!temEmail}
          onChange={(e) => {
            setEmail(e.target.checked);
            setConfirmar(false);
          }}
          className="mt-0.5 size-4"
        />
        <span>
          Mandar também por e-mail
          <span className="block text-ink-muted">
            {temEmail
              ? `A resposta do e-mail chega em ${EMAIL_DA_EQUIPE}.`
              : "Esta conta não tem e-mail: vai só para o sino."}
          </span>
        </span>
      </label>

      {pronto && (
        <div className="flex flex-col gap-2 rounded-md bg-surface-300 p-3 text-body-sm">
          <p className="flex items-start gap-2">
            <Bell aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              No sino: <strong>Equipe Publike: {assunto.trim()}</strong>
            </span>
          </p>
          {email && temEmail && (
            <p className="flex items-start gap-2">
              <Mail aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>No e-mail, com o assunto “{assunto.trim()}” e o botão “Abrir o Publike”.</span>
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col items-start gap-2">
        {confirmar ? (
          <div className="flex flex-wrap items-center gap-2 text-body-sm">
            <span>
              Mandar para <strong>{nome}</strong>
              {email && temEmail ? " no sino e no e-mail" : " no sino"}?
            </span>
            <Botao
              variante="primario"
              disabled={pendente}
              onClick={() =>
                rodar(
                  () => mandarMensagemDaEquipe(contaId, assunto.trim(), texto.trim(), email && temEmail),
                  (r) => {
                    setConfirmar(false);
                    if (r.ok) {
                      setAssunto("");
                      setTexto("");
                    }
                  },
                )
              }
            >
              <Send aria-hidden />
              {pendente ? "Mandando…" : "Sim, mandar"}
            </Botao>
            <Botao variante="fantasma" onClick={() => setConfirmar(false)}>
              Cancelar
            </Botao>
          </div>
        ) : (
          <Botao disabled={!pronto || pendente} onClick={() => setConfirmar(true)}>
            <Send aria-hidden />
            Mandar mensagem
          </Botao>
        )}
        {mensagem}
      </div>

      {enviadas.length > 0 && <JaMandadas enviadas={enviadas} nome={nome} />}
    </div>
  );
}

/** Quantas aparecem antes do "Ver todas". */
const NA_FRENTE = 5;

/**
 * As mensagens já mandadas, uma linha por mensagem (assunto, quando, por onde, se leu e as respostas); o texto
 * abre no toque. A que tem resposta nova já vem aberta. As mais velhas ficam atrás do "Ver todas".
 */
function JaMandadas({ enviadas, nome }: { enviadas: MensagemEnviada[]; nome: string }) {
  const [todas, setTodas] = useState(false);
  const lista = todas ? enviadas : enviadas.slice(0, NA_FRENTE);
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-label">
        Já mandadas <span className="font-normal text-ink-muted">({enviadas.length})</span>
      </h3>
      <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
        {lista.map((m) => {
          const novas = m.respostas.filter((r) => !r.vista_em).length;
          return (
            <li key={m.id}>
              <details open={novas > 0} className="group text-body-sm">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 hover:bg-surface-300 [&::-webkit-details-marker]:hidden">
                  <ChevronDown
                    aria-hidden
                    className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{m.assunto}</span>
                    <span className="text-body-sm font-normal text-ink-muted sm:hidden">
                      {formatarDataHora(m.criado_em)} · {m.lida_em ? "lida" : "não lida"}
                    </span>
                  </span>
                  {m.respostas.length > 0 && (
                    <span
                      className={`shrink-0 rounded-pill px-2 py-0.5 text-caption ${novas ? "bg-ipe text-on-ipe" : "bg-surface-300 text-ink-muted"}`}
                    >
                      {novas
                        ? plural(novas, "resposta nova", "respostas novas")
                        : plural(m.respostas.length, "resposta", "respostas")}
                    </span>
                  )}
                  <span className="hidden shrink-0 text-ink-muted sm:inline">
                    {formatarDataHora(m.criado_em)} · {m.por_email ? "sino e e-mail" : "só sino"} ·{" "}
                    {m.lida_em ? "lida" : "não lida"}
                  </span>
                </summary>
                <div className="flex flex-col gap-2 px-3 pb-3 pl-10">
                  <span className="text-ink-muted sm:hidden">
                    {m.por_email ? "Foi para o sino e o e-mail." : "Foi só para o sino."}
                  </span>
                  {m.lida_em && <span className="text-ink-muted">Lida {formatarDataHora(m.lida_em)}.</span>}
                  <span className="whitespace-pre-line text-ink-muted">{m.texto}</span>
                  {m.respostas.map((r) => (
                    <span key={r.id} className="flex flex-col gap-0.5 rounded-md bg-surface-300 px-3 py-2">
                      <span className="text-ink-muted">
                        {nome} respondeu · {formatarDataHora(r.criado_em)}
                        {!r.vista_em && <span className="ml-2 rounded-pill bg-ipe px-2 py-0.5 text-on-ipe">Nova</span>}
                      </span>
                      <span className="whitespace-pre-line text-ink">{r.texto}</span>
                    </span>
                  ))}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      {enviadas.length > NA_FRENTE && (
        <Botao variante="fantasma" tamanho="sm" className="self-start" onClick={() => setTodas(!todas)}>
          {todas ? "Mostrar só as mais novas" : `Ver todas (${enviadas.length})`}
        </Botao>
      )}
    </div>
  );
}
