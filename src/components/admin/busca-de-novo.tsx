"use client";

import { useEffect, useState, useTransition } from "react";
import {
  conversasSemVaga,
  enviarBuscaDeNovoAgora,
  previaDaBuscaDeNovo,
  type ConversaSemVaga,
} from "@/lib/acoes/busca-de-novo";
import type { BuscaDeNovo as Previa } from "@/lib/servidor/atendimento-whatsapp";
import { classesBotao } from "../ui/botao";
import { TextoDoWhatsapp } from "./conversa-whatsapp-visual";

// Admin › WhatsApp › Conversas: procurar de novo nas conversas que pararam no "não achei vaga" (19/11/2026). A
// mensagem de cada uma aparece antes; só vai a que a equipe mandar.

type Item = ConversaSemVaga & { previa?: Previa; enviada?: boolean; erro?: string };

export function BuscaDeNovo() {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [pendente, iniciar] = useTransition();
  const [vendo, setVendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    conversasSemVaga()
      .then((l) => vivo && setItens(l))
      .catch(() => vivo && setItens([]));
    return () => {
      vivo = false;
    };
  }, []);

  if (!itens?.length) return null;
  const mudar = (chave: string, x: Partial<Item>) =>
    setItens((l) => (l ?? []).map((i) => (i.chave === chave ? { ...i, ...x } : i)));
  const prontas = itens.filter((i) => i.previa?.ok && !i.enviada);

  const enviar = async (i: Item) => {
    if (!i.previa?.ok) return;
    const r = await enviarBuscaDeNovoAgora(i.chave, i.previa.texto, i.previa.botao);
    mudar(i.chave, r.ok ? { enviada: true, erro: undefined } : { erro: r.erro });
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-label">Procurar de novo nas conversas sem vaga</h3>
        <p className="text-body-sm text-ink-muted">
          {itens.length === 1 ? "1 conversa parou" : `${itens.length} conversas pararam`} no “não achei vaga” e ainda
          {itens.length === 1 ? " está" : " estão"} na janela de 24 horas. A busca nova procura a função também nas
          cidades em volta e, sem ela, vagas parecidas, ditas como parecidas. Veja a mensagem de cada uma antes de mandar.
        </p>
      </div>
      {!vendo ? (
        <div>
          <button
            type="button"
            disabled={pendente}
            className={classesBotao("secundario", "sm")}
            onClick={() => {
              setVendo(true);
              iniciar(async () => {
                for (const i of itens) mudar(i.chave, { previa: await previaDaBuscaDeNovo(i.chave, i.nome) });
              });
            }}
          >
            Ver as mensagens
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {itens.map((i) => (
            <li key={i.chave} className="flex flex-col gap-2 border-t border-line pt-3">
              <p className="text-label">
                {i.nome ?? "Sem nome"} <span className="text-caption font-normal text-ink-muted">· {i.final}</span>
              </p>
              {!i.previa ? (
                <p className="text-body-sm text-ink-muted">Procurando…</p>
              ) : !i.previa.ok ? (
                <p className="text-body-sm text-ink-muted">Não vai: {i.previa.motivo}</p>
              ) : (
                <>
                  <div className="max-w-xl rounded-lg bg-tom-servico px-3 py-2 text-body-sm">
                    <TextoDoWhatsapp texto={i.previa.texto} />
                    {i.previa.botao && (
                      <p className="mt-2 border-t border-line pt-1.5 text-center text-label text-cerrado-text">
                        {i.previa.botao.titulo}
                      </p>
                    )}
                  </div>
                  {i.enviada ? (
                    <p role="status" className="text-body-sm text-cerrado-text">
                      Enviada.
                    </p>
                  ) : (
                    <div>
                      <button
                        type="button"
                        disabled={pendente}
                        className={classesBotao("secundario", "sm")}
                        onClick={() => iniciar(() => enviar(i))}
                      >
                        Enviar esta
                      </button>
                    </div>
                  )}
                  {i.erro && (
                    <p role="alert" className="text-body-sm text-danger">
                      {i.erro}
                    </p>
                  )}
                </>
              )}
            </li>
          ))}
          {prontas.length > 1 && (
            <li>
              <button
                type="button"
                disabled={pendente}
                className={classesBotao("primario", "sm")}
                onClick={() =>
                  iniciar(async () => {
                    for (const i of prontas) await enviar(i);
                  })
                }
              >
                Enviar as {prontas.length}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
