"use client";

import { Flag, MessageSquareText, Pencil, Trash2, EyeOff, Eye, CornerDownRight, Heart } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useState, type FormEvent } from "react";
import { Avatar } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import { DicaDeNovidade, usarDica } from "@/components/ui/dica-de-novidade";
import { useAcao } from "@/components/ui/usar-acao";
import {
  apagarComentario,
  comentar,
  denunciarComentario,
  editarComentario,
  esconderComentario,
  ligarComentarios,
} from "@/lib/acoes/comentarios";
import {
  contarComentarios,
  MAXIMO_COMENTARIO,
  MINUTOS_PARA_EDITAR,
  organizarComentarios,
  pareceCandidatura,
  type Comentario,
  type ComentariosDaVaga,
} from "@/lib/comentarios";
import { MOTIVOS_DENUNCIA } from "@/lib/constantes";
import { tempoRelativo } from "@/lib/formato";
import { pedirEntrar } from "../folha-de-entrar";

// Os comentários da vaga (claude/plano-comentarios-e-indicar-por-email.md, parte 2): perguntas sobre a vaga e a
// resposta de quem publicou, em destaque, um nível só. Comentário não é candidatura: se o texto parecer candidatura,
// antes de mandar o site lembra de tocar em Curtir. Sem telefone, e-mail ou link (o banco confere de novo).

const MOSTRAR = 5;
/** No feed, as primeiras conversas (o resto fica na página da vaga). */
const MOSTRAR_NO_FEED = 3;

/**
 * Depois de comentar, editar, apagar, esconder ou denunciar: no feed, a conversa é lida de novo (na página da vaga,
 * o refresh() das ações já redesenha tudo).
 */
const Recarregar = createContext<(() => void) | null>(null);
/** No feed (a conversa aberta embaixo do cartão da vaga ou na janela do cartão) ou na página da vaga. */
const NoFeed = createContext(false);
/** Na janela do cartão: o "Curtir a vaga" do lembrete fecha a janela e mostra o cartão (com o Curtir). */
const AoCurtir = createContext<(() => void) | null>(null);

/**
 * Leva ao Curtir: no feed, o cartão da vaga logo acima; na página da vaga, no celular, o quadro logo abaixo do
 * título, e no computador, a coluna ao lado (fixa no topo).
 */
function irParaCurtir(anuncioId: string, noFeed: boolean) {
  if (noFeed) {
    document.getElementById(`anuncio-${anuncioId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const celular = document.getElementById("quadro-celular");
  if (celular && celular.offsetParent !== null) celular.scrollIntoView({ behavior: "smooth", block: "start" });
  else window.scrollTo({ top: 0, behavior: "smooth" });
}

function Formulario({
  anuncioId,
  respostaA,
  dono,
  logado,
  aoTerminar,
  rotulo,
  placeholder,
}: {
  anuncioId: string;
  respostaA?: string;
  dono: boolean;
  logado: boolean;
  aoTerminar?: () => void;
  rotulo: string;
  placeholder: string;
}) {
  const [texto, setTexto] = useState("");
  const [lembrar, setLembrar] = useState(false);
  const { rodar, pendente, mensagem } = useAcao();
  const recarregar = useContext(Recarregar);
  const noFeed = useContext(NoFeed);
  const aoCurtir = useContext(AoCurtir);

  function mandar(e?: FormEvent) {
    e?.preventDefault();
    if (!lembrar && !dono && pareceCandidatura(texto)) {
      setLembrar(true);
      return;
    }
    setLembrar(false);
    rodar(
      () => comentar(anuncioId, texto, respostaA ?? null),
      (r) => {
        if (!r.ok) return;
        setTexto("");
        usarDica(dono ? "comentarios-empresa" : "comentarios");
        aoTerminar?.();
        recarregar?.();
      },
    );
  }

  return (
    <form onSubmit={mandar} className="flex flex-col gap-2" noValidate>
      <label className="flex flex-col gap-1">
        <span className="sr-only">{rotulo}</span>
        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setLembrar(false);
          }}
          maxLength={MAXIMO_COMENTARIO}
          rows={respostaA || noFeed ? 2 : 3}
          placeholder={placeholder}
          className={`${classesEntrada} resize-y`}
        />
      </label>
      {lembrar && (
        <div role="status" className="flex flex-col gap-2 rounded-md border border-line bg-terra-soft p-3 text-body-sm">
          <p>
            <strong>Comentário não chega como candidatura.</strong> Para a empresa receber seu currículo, toque em
            Curtir na vaga.
          </p>
          <div className="flex flex-wrap gap-2">
            <Botao tamanho="sm" onClick={() => (aoCurtir ? aoCurtir() : irParaCurtir(anuncioId, noFeed))}>
              <Heart aria-hidden />
              Curtir a vaga
            </Botao>
            <Botao tamanho="sm" variante="secundario" onClick={() => mandar()} disabled={pendente}>
              Comentar mesmo assim
            </Botao>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" tamanho="sm" disabled={pendente || texto.trim().length < 2 || !logado}>
          {pendente ? "Mandando…" : respostaA ? "Responder" : "Comentar"}
        </Botao>
        {aoTerminar && (
          <button type="button" onClick={aoTerminar} className="text-label text-ink-muted underline-offset-2 hover:underline">
            Cancelar
          </button>
        )}
        <span className="ml-auto text-caption text-ink-muted tabular-nums">
          {texto.length}/{MAXIMO_COMENTARIO}
        </span>
      </div>
      {mensagem}
    </form>
  );
}

function Denunciar({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const { rodar, pendente, mensagem } = useAcao();
  const recarregar = useContext(Recarregar);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-100 p-3">
      <p className="text-label">Por que denunciar?</p>
      <div className="flex flex-col gap-1">
        {MOTIVOS_DENUNCIA.map((m) => (
          <label key={m.valor} className="flex min-h-9 items-center gap-2 text-body-sm">
            <input type="radio" name={`motivo-${id}`} value={m.valor} onChange={() => setMotivo(m.valor)} />
            {m.nome}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Botao
          tamanho="sm"
          variante="perigo"
          disabled={!motivo || pendente}
          onClick={() =>
            rodar(
              () => denunciarComentario(id, motivo),
              (r) => {
                if (!r.ok) return;
                setTimeout(() => {
                  aoFechar();
                  recarregar?.();
                }, 1500);
              },
            )
          }
        >
          Denunciar
        </Botao>
        <Botao tamanho="sm" variante="secundario" onClick={aoFechar}>
          Cancelar
        </Botao>
      </div>
      {mensagem}
    </div>
  );
}

function Item({
  c,
  agora,
  dados,
  anuncioId,
  podeResponder,
  resposta = false,
}: {
  c: Comentario;
  agora: number;
  dados: ComentariosDaVaga;
  anuncioId: string;
  podeResponder: boolean;
  resposta?: boolean;
}) {
  const [modo, setModo] = useState<"ver" | "editar" | "responder" | "denunciar">("ver");
  const [texto, setTexto] = useState(c.texto);
  const { rodar, pendente, mensagem } = useAcao();
  const recarregar = useContext(Recarregar);
  const depois = (r: { ok: boolean }) => {
    if (r.ok) recarregar?.();
  };
  const podeEditar = c.meu && agora - new Date(c.criado_em).getTime() < MINUTOS_PARA_EDITAR * 60_000;
  const dono = dados.dono;

  return (
    <div
      id={`comentario-${c.id}`}
      className={`flex scroll-mt-24 gap-3 ${c.de_quem_publicou && resposta ? "rounded-md bg-cerrado/10 p-3" : ""}`}
    >
      <Avatar nome={c.nome} foto={c.foto} tamanho={resposta ? 32 : 40} forma={c.tipo === "pessoa" ? "redonda" : "quadrada"} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body-sm">
          <span className="font-semibold text-ink">{c.nome}</span>
          {c.de_quem_publicou && (
            <span className="rounded-pill bg-cerrado px-2 py-0.5 text-[12px] leading-4 font-bold text-on-terra">
              Quem publicou
            </span>
          )}
          <span className="text-ink-muted" title={new Date(c.criado_em).toLocaleString("pt-BR")}>
            {tempoRelativo(c.criado_em, agora)}
            {c.editado_em ? " · editado" : ""}
          </span>
        </p>

        {c.status === "revisao" && (
          <p className="text-body-sm text-ink-muted">Em revisão: aparece para todo mundo em alguns segundos.</p>
        )}
        {c.status === "retido" && (
          <p className="text-body-sm text-danger">Não publicado. {c.motivo ?? "A moderação vai olhar."}</p>
        )}
        {c.status === "escondido" && (
          <p className="text-body-sm text-ink-muted">
            {c.meu ? "Quem publicou a vaga escondeu este comentário." : "Você escondeu este comentário: só você e a moderação veem."}
          </p>
        )}

        {modo === "editar" ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={MAXIMO_COMENTARIO}
              rows={3}
              className={`${classesEntrada} resize-y`}
              aria-label="Editar comentário"
            />
            <div className="flex flex-wrap gap-2">
              <Botao
                tamanho="sm"
                disabled={pendente || texto.trim().length < 2}
                onClick={() =>
                  rodar(
                    () => editarComentario(c.id, texto),
                    (r) => {
                      if (!r.ok) return;
                      setModo("ver");
                      recarregar?.();
                    },
                  )
                }
              >
                Salvar
              </Botao>
              <Botao tamanho="sm" variante="secundario" onClick={() => setModo("ver")}>
                Cancelar
              </Botao>
            </div>
          </div>
        ) : (
          <p className="text-body break-words whitespace-pre-line text-ink">{c.texto}</p>
        )}

        {modo === "ver" && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-muted">
            {podeResponder && !resposta && c.status === "no_ar" && (
              <button type="button" className="inline-flex min-h-9 items-center gap-1 hover:text-ink" onClick={() => setModo("responder")}>
                <CornerDownRight aria-hidden className="size-4" />
                Responder
              </button>
            )}
            {podeEditar && c.status !== "escondido" && (
              <button type="button" className="inline-flex min-h-9 items-center gap-1 hover:text-ink" onClick={() => setModo("editar")}>
                <Pencil aria-hidden className="size-4" />
                Editar
              </button>
            )}
            {c.meu && (
              <button
                type="button"
                className="inline-flex min-h-9 items-center gap-1 hover:text-danger"
                disabled={pendente}
                onClick={() => rodar(() => apagarComentario(c.id), depois)}
              >
                <Trash2 aria-hidden className="size-4" />
                Apagar
              </button>
            )}
            {dono && !c.meu && (c.status === "no_ar" || c.status === "escondido") && (
              <button
                type="button"
                className="inline-flex min-h-9 items-center gap-1 hover:text-ink"
                disabled={pendente}
                onClick={() => rodar(() => esconderComentario(c.id, c.status === "no_ar"), depois)}
              >
                {c.status === "no_ar" ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
                {c.status === "no_ar" ? "Esconder" : "Mostrar de novo"}
              </button>
            )}
            {dados.logado && !c.meu && !dono && c.status === "no_ar" && (
              <button type="button" className="inline-flex min-h-9 items-center gap-1 hover:text-danger" onClick={() => setModo("denunciar")}>
                <Flag aria-hidden className="size-4" />
                Denunciar
              </button>
            )}
          </div>
        )}
        {modo === "denunciar" && <Denunciar id={c.id} aoFechar={() => setModo("ver")} />}
        {modo === "responder" && (
          <div className="mt-1">
            <Formulario
              anuncioId={anuncioId}
              respostaA={c.id}
              dono={dono}
              logado={dados.logado}
              aoTerminar={() => setModo("ver")}
              rotulo={`Responder a ${c.nome}`}
              placeholder={dono ? "Responda para todo mundo ver" : "Escreva a sua resposta"}
            />
          </div>
        )}
        {mensagem}
      </div>
    </div>
  );
}

export function ComentariosDaVaga({
  anuncioId,
  dados,
  agora,
  compacto = false,
  aoMudar,
  aoCurtir,
}: {
  anuncioId: string;
  dados: ComentariosDaVaga;
  agora: number;
  /** no feed: sem o título, com as primeiras conversas e o link para ver todas na vaga */
  compacto?: boolean;
  /** no feed: lê a conversa de novo depois de cada ação */
  aoMudar?: () => void;
  /** na janela do cartão: o que o "Curtir a vaga" do lembrete faz */
  aoCurtir?: () => void;
}) {
  const [todos, setTodos] = useState(false);
  const { rodar, pendente, mensagem } = useAcao();
  const lista = organizarComentarios(dados.itens);
  const limite = compacto ? MOSTRAR_NO_FEED : MOSTRAR;
  const visiveis = todos ? lista : lista.slice(0, limite);
  const total = contarComentarios(dados);
  const podeEscrever = dados.aberta && dados.ligados;
  const voltar = `/anuncio/${anuncioId}#comentarios`;
  const placeholder = dados.dono
    ? "Escreva um comentário para quem vê a vaga: como é o dia a dia, o que mais comentam…"
    : "Escreva um comentário: horário, transporte, se precisa de experiência…";

  const formulario = dados.logado ? (
    <Formulario anuncioId={anuncioId} dono={dados.dono} logado rotulo="Escreva um comentário" placeholder={placeholder} />
  ) : (
    <p className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-200 p-3 text-body-sm">
      <MessageSquareText aria-hidden className="size-4 text-ink-muted" />
      Ficou com dúvida?
      <Link
        href={`/entrar?next=${encodeURIComponent(voltar)}`}
        // a folha de entrar sobe por cima da página (sem a folha, segue para o /entrar)
        onClick={(e) => {
          if (pedirEntrar({ proximo: voltar })) e.preventDefault();
        }}
        className="font-semibold underline underline-offset-2"
      >
        Entre para comentar
      </Link>
    </p>
  );

  const conteudo = (
    <>
      {podeEscrever &&
        (compacto ? (
          formulario
        ) : (
          <DicaDeNovidade chave={dados.dono ? "comentarios-empresa" : "comentarios"} logado={dados.logado}>
            {formulario}
          </DicaDeNovidade>
        ))}
      {!dados.aberta && (
        <p className="text-body-sm text-ink-muted">A vaga foi fechada: os comentários ficam, mas ninguém escreve mais.</p>
      )}
      {dados.aberta && !dados.ligados && (
        <p className="text-body-sm text-ink-muted">
          {dados.dono ? "Você desligou os comentários desta vaga." : "Quem publicou desligou os comentários desta vaga."}
        </p>
      )}

      {lista.length === 0 ? (
        podeEscrever && (
          <p className="text-body-sm text-ink-muted">
            Ainda sem comentários. {dados.dono ? "Quando alguém comentar, você recebe o aviso." : "Seja o primeiro a comentar."}
          </p>
        )
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {visiveis.map((c) => (
            <li key={c.id} className={`flex flex-col gap-3 first:pt-0 ${compacto ? "py-3" : "py-4"}`}>
              <Item c={c} agora={agora} dados={dados} anuncioId={anuncioId} podeResponder={podeEscrever && dados.logado} />
              {c.respostas.length > 0 && (
                <ul className="ml-6 flex flex-col gap-3 border-l-2 border-line pl-4 sm:ml-12">
                  {c.respostas.map((r) => (
                    <li key={r.id}>
                      <Item c={r} agora={agora} dados={dados} anuncioId={anuncioId} podeResponder={false} resposta />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {!todos &&
        lista.length > limite &&
        (compacto ? (
          <Link
            href={`/anuncio/${anuncioId}#comentarios`}
            className="self-start text-label underline underline-offset-2 hover:text-terra-text"
          >
            Ver todos os {total} comentários na vaga
          </Link>
        ) : (
          <Botao variante="secundario" tamanho="sm" className="self-start" onClick={() => setTodos(true)}>
            Ver mais comentários ({lista.length - limite})
          </Botao>
        ))}

      {!compacto && dados.dono && dados.aberta && (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <button
            type="button"
            disabled={pendente}
            onClick={() => rodar(() => ligarComentarios(anuncioId, !dados.ligados))}
            className="self-start text-label text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            {dados.ligados ? "Desligar os comentários desta vaga" : "Ligar os comentários desta vaga"}
          </button>
          {mensagem}
        </div>
      )}
    </>
  );

  return (
    <Recarregar.Provider value={aoMudar ?? null}>
      <AoCurtir.Provider value={aoCurtir ?? null}>
      <NoFeed.Provider value={compacto}>
        {compacto ? (
          <div className="flex flex-col gap-3">{conteudo}</div>
        ) : (
          <section id="comentarios" aria-labelledby="comentarios-titulo" className="mt-8 flex scroll-mt-24 flex-col gap-4">
            <h2 id="comentarios-titulo" className="text-h2">
              Comentários{total > 0 && <span className="ml-2 text-body font-normal text-ink-muted">{total}</span>}
            </h2>
            {conteudo}
          </section>
        )}
      </NoFeed.Provider>
      </AoCurtir.Provider>
    </Recarregar.Provider>
  );
}
