"use client";

import { Check, Clock, Handshake, MessageCircle, Send, UserPlus } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { desfazerConexao, pedirConexao } from "@/lib/acoes/conexoes";
import { caminhoConexao, MAX_RECADO_CONEXAO, type EstadoConexao } from "@/lib/conexoes";
import { caminhoConversa } from "@/lib/conversas";
import { Botao, classesBotao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

/**
 * Conectar com uma conta, sem precisar de vaga: a empresa com quem está na aba Talentos ou o
 * talento com a empresa. No cartão da aba, o pedido sai direto; na página, dá para mandar um
 * recado. Depois do pedido o botão mostra como está: enviado, para responder ou conectados.
 */
export function BotaoConectar({
  outroId,
  outroNome,
  estado: inicial,
  logado,
  voltar,
  para,
  jeito = "pagina",
  principal = false,
}: {
  outroId: string;
  outroNome: string;
  estado: EstadoConexao | null;
  logado: boolean;
  /** para onde voltar depois de entrar na conta */
  voltar: string;
  /** quem recebe o pedido (muda os textos) */
  para: "talento" | "empresa";
  /** "cartao": botão pequeno nos cartões da aba Talentos; "pagina": com recado */
  jeito?: "cartao" | "pagina";
  /** a ação principal da tela (botão terra) */
  principal?: boolean;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [estado, setEstado] = useState<EstadoConexao | null>(inicial);
  const [aberto, setAberto] = useState(false);
  const [recado, setRecado] = useState("");
  const idRecado = useId();
  // pessoa: o primeiro nome; empresa: o nome inteiro ("Mercado Bom Preço")
  const primeiroNome = para === "talento" ? outroNome.split(" ")[0] : outroNome;
  const cartao = jeito === "cartao";
  const tamanho = cartao ? "sm" : "md";

  // o estado novo vem da própria resposta (sem esperar a página recarregar)
  function pedirComEstado(texto: string | null) {
    rodar(
      async () => {
        const r = await pedirConexao(outroId, texto, voltar);
        if (r.ok) setEstado(r.estado);
        // na página, o próprio botão já diz como ficou; no cartão, vai o aviso embaixo
        return r.ok ? { ok: true, mensagem: cartao ? r.mensagem : undefined } : r;
      },
      (r) => {
        if (r.ok) {
          setAberto(false);
          setRecado("");
        }
      },
    );
  }

  if (!logado) {
    return (
      <Link
        href={`/entrar?next=${encodeURIComponent(voltar)}`}
        className={classesBotao(principal ? "primario" : "secundario", tamanho)}
      >
        <UserPlus aria-hidden />
        Conectar
      </Link>
    );
  }

  if (estado?.status === "aceita") {
    return (
      <div className="flex flex-col items-start gap-1">
        <Link href={caminhoConversa(outroId)} className={classesBotao("sucesso", tamanho)}>
          <Check aria-hidden />
          Conectados
          <span aria-hidden>·</span>
          <MessageCircle aria-hidden />
          Conversar
        </Link>
        {mensagem}
      </div>
    );
  }

  if (estado?.status === "pendente" && !estado.pedi) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Link href={caminhoConexao(outroId)} className={classesBotao("primario", tamanho)}>
          <Handshake aria-hidden />
          Responder pedido
        </Link>
        {!cartao && (
          <p className="text-body-sm text-ink-muted">{primeiroNome} pediu conexão com você. Aceite ou recuse.</p>
        )}
      </div>
    );
  }

  if (estado?.status === "pendente" && estado.pedi) {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className={classesBotao("secundario", tamanho, "pointer-events-none text-ink-muted")} role="status">
          <Clock aria-hidden />
          Pedido enviado
        </span>
        {!cartao && (
          <>
            <p className="text-body-sm text-ink-muted">
              Esperando {primeiroNome} responder. Avisamos quando {para === "talento" ? "aceitar" : "aceitarem"}.
            </p>
            <button
              type="button"
              disabled={pendente}
              onClick={() =>
                rodar(
                  () => desfazerConexao(estado.id),
                  (r) => {
                    if (r.ok) setEstado(null);
                  },
                )
              }
              className="min-h-11 text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink disabled:opacity-60"
            >
              Cancelar pedido
            </button>
          </>
        )}
        {mensagem}
      </div>
    );
  }

  if (estado?.status === "recusada") {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className={classesBotao("secundario", tamanho, "pointer-events-none text-ink-muted")} role="status">
          Pedido não aceito
        </span>
        {!cartao && <p className="text-body-sm text-ink-muted">Dá para pedir de novo 30 dias depois da resposta.</p>}
      </div>
    );
  }

  // ainda sem conexão
  if (cartao || !aberto) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Botao
          variante={principal ? "primario" : "secundario"}
          tamanho={tamanho}
          disabled={pendente}
          aria-label={cartao ? `Conectar com ${outroNome}` : undefined}
          onClick={() => (cartao ? pedirComEstado(null) : setAberto(true))}
        >
          <UserPlus aria-hidden />
          {pendente ? "Enviando…" : "Conectar"}
        </Botao>
        {mensagem}
      </div>
    );
  }

  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        pedirComEstado(recado.trim() || null);
      }}
    >
      <label htmlFor={idRecado} className="text-label">
        Recado para {primeiroNome} <span className="font-normal text-ink-muted">(opcional)</span>
      </label>
      <textarea
        id={idRecado}
        value={recado}
        maxLength={MAX_RECADO_CONEXAO}
        rows={3}
        onChange={(e) => setRecado(e.target.value)}
        placeholder={
          para === "talento"
            ? "Ex.: Olá! Gostamos do seu currículo e sempre temos vagas parecidas. Vamos conversar?"
            : "Ex.: Olá! Trabalhei 3 anos em padaria e gostaria de fazer parte da equipe de vocês."
        }
        className={`${classesEntrada} resize-y`}
      />
      <p className="text-body-sm text-ink-muted">
        Sem telefone ou e-mail: o contato aparece para os dois quando {primeiroNome}{" "}
        {para === "talento" ? "aceitar" : "aceitarem"}. {recado.length}/{MAX_RECADO_CONEXAO}
      </p>
      <div className="flex flex-wrap gap-2">
        <Botao type="submit" variante={principal ? "primario" : "secundario"} disabled={pendente}>
          <Send aria-hidden />
          {pendente ? "Enviando…" : "Enviar pedido"}
        </Botao>
        <Botao variante="fantasma" onClick={() => setAberto(false)} disabled={pendente}>
          Cancelar
        </Botao>
      </div>
      {mensagem}
    </form>
  );
}
