"use client";

import { Bell, Mail, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { mandarMensagemDaEquipe, verRespostasDaEquipe } from "@/lib/acoes/admin-contas";
import { formatarDataHora } from "@/lib/formato";
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

      {enviadas.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-label">Já mandadas</h3>
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {enviadas.map((m) => (
              <li key={m.id} className="flex flex-col gap-1 p-3 text-body-sm">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong>{m.assunto}</strong>
                  <span className="text-ink-muted">
                    {formatarDataHora(m.criado_em)} · {m.por_email ? "sino e e-mail" : "só sino"} ·{" "}
                    {m.lida_em ? `lida ${formatarDataHora(m.lida_em)}` : "não lida"}
                  </span>
                </span>
                <span className="whitespace-pre-line text-ink-muted">{m.texto}</span>
                {m.respostas.map((r) => (
                  <span key={r.id} className="mt-1 ml-4 flex flex-col gap-0.5 rounded-md bg-surface-300 px-3 py-2">
                    <span className="text-ink-muted">
                      {nome} respondeu · {formatarDataHora(r.criado_em)}
                      {!r.vista_em && <span className="ml-2 rounded-pill bg-ipe px-2 py-0.5 text-on-ipe">Nova</span>}
                    </span>
                    <span className="whitespace-pre-line text-ink">{r.texto}</span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
