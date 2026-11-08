"use client";

import { Check, Link2, Plus, RotateCcw, Users, X } from "lucide-react";
import { useId, useState } from "react";
import { cancelarPedidoPeloLink, responderPedido, type AcaoDoPedido } from "@/lib/acoes/pedidos-do-cliente";
import type { Pedido } from "@/lib/pedidos-do-cliente";
import { Botao, BotaoLink } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

// Os botões do pedido no painel da agência e o "Cancelar pedido" do link do cliente.

/** O que a agência faz com o pedido, pela situação. */
export function AcoesDoPedido({
  p,
  prazoSugerido,
  hoje,
  vagas,
}: {
  p: Pedido;
  /** "Finalistas até" que já vem no aceite (7 dias úteis) */
  prazoSugerido: string;
  hoje: string;
  /** as vagas no ar da agência, para ligar ao pedido (as do mesmo cliente primeiro) */
  vagas: { id: string; titulo: string }[];
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [data, setData] = useState(p.finalistas_ate ?? prazoSugerido);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ligando, setLigando] = useState(false);
  const [vaga, setVaga] = useState(vagas[0]?.id ?? "");
  const id = useId();
  const fazer = (acao: AcaoDoPedido, extra?: Parameters<typeof responderPedido>[2]) =>
    rodar(() => responderPedido(p.id, acao, extra));
  const publicar = `/publicar?cliente=${p.cliente_id ?? ""}&pedido=${p.id}`;

  if (p.situacao === "recebido") {
    return (
      <div className="flex flex-col gap-3 border-t border-line pt-3">
        {recusando ? (
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-motivo`} className="text-label">
              Por que não dá para atender? O cliente vê.
            </label>
            <textarea
              id={`${id}-motivo`}
              value={motivo}
              maxLength={300}
              rows={2}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: não trabalhamos com esse cargo; o salário está abaixo do mercado"
              className={`${classesEntrada} min-h-16 py-2`}
            />
            <div className="flex flex-wrap gap-2">
              <Botao
                tamanho="sm"
                variante="primario"
                disabled={pendente || !motivo.trim()}
                onClick={() => fazer("recusar", { motivo })}
              >
                Recusar o pedido
              </Botao>
              <Botao tamanho="sm" variante="fantasma" onClick={() => setRecusando(false)}>
                Voltar
              </Botao>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-prazo`} className="text-body-sm text-ink-muted">
                Finalistas até
              </label>
              <input
                id={`${id}-prazo`}
                type="date"
                min={hoje}
                value={data}
                onChange={(e) => setData(e.target.value)}
                className={`${classesEntrada} w-44`}
              />
            </div>
            <Botao variante="primario" disabled={pendente || !data} onClick={() => fazer("aceitar", { data })}>
              <Check aria-hidden />
              Aceitar com este prazo
            </Botao>
            <Botao variante="secundario" onClick={() => setRecusando(true)}>
              <X aria-hidden />
              Recusar
            </Botao>
          </div>
        )}
        {mensagem}
      </div>
    );
  }

  if (p.situacao === "em_selecao") {
    return (
      <div className="flex flex-col gap-3 border-t border-line pt-3">
        <div className="flex flex-wrap gap-2">
          {!p.vaga && (
            <BotaoLink href={publicar} tamanho="sm" variante="primario">
              <Plus aria-hidden />
              Publicar a vaga
            </BotaoLink>
          )}
          {!p.vaga && vagas.length > 0 && (
            <Botao tamanho="sm" variante="secundario" onClick={() => setLigando((x) => !x)}>
              <Link2 aria-hidden />
              Ligar a uma vaga já publicada
            </Botao>
          )}
          <Botao tamanho="sm" variante="secundario" disabled={pendente} onClick={() => fazer("finalistas")}>
            <Users aria-hidden />
            Finalistas enviados
          </Botao>
          <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={() => fazer("concluir")}>
            Concluir
          </Botao>
          <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={() => fazer("cancelar")}>
            Cancelar
          </Botao>
        </div>
        {ligando && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${id}-vaga`} className="sr-only">
              A vaga do pedido
            </label>
            <Seletor
              id={`${id}-vaga`}
              value={vaga}
              onChange={(e) => setVaga(e.target.value)}
              className={classesEntrada}
              envoltorio="min-w-0 flex-1 sm:max-w-md"
            >
              {vagas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.titulo}
                </option>
              ))}
            </Seletor>
            <Botao tamanho="sm" disabled={pendente || !vaga} onClick={() => fazer("ligar", { anuncio: vaga })}>
              Ligar
            </Botao>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-novo-prazo`} className="text-body-sm text-ink-muted">
              Mudar o prazo
            </label>
            <input
              id={`${id}-novo-prazo`}
              type="date"
              min={hoje}
              value={data}
              onChange={(e) => setData(e.target.value)}
              className={`${classesEntrada} w-44`}
            />
          </div>
          <Botao
            tamanho="sm"
            variante="secundario"
            disabled={pendente || !data || data === p.finalistas_ate}
            onClick={() => fazer("prazo", { data })}
          >
            Salvar o prazo
          </Botao>
        </div>
        <p className="text-body-sm text-ink-muted">
          Quando você criar o link dos finalistas da vaga, o pedido muda sozinho para “Finalistas enviados”.
        </p>
        {mensagem}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
      {p.situacao === "finalistas" && (
        <Botao tamanho="sm" variante="primario" disabled={pendente} onClick={() => fazer("concluir")}>
          <Check aria-hidden />
          Concluir o pedido
        </Botao>
      )}
      {p.situacao !== "recusado" && (
        <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={() => fazer("reabrir")}>
          <RotateCcw aria-hidden />
          Abrir de novo
        </Botao>
      )}
      {mensagem}
    </div>
  );
}

/** No link do cliente: desistir de um pedido que ainda não terminou. */
export function CancelarPedido({ token, pedido }: { token: string; pedido: string }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [certeza, setCerteza] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
      {certeza ? (
        <>
          <span className="text-body-sm">Cancelar este pedido?</span>
          <Botao tamanho="sm" variante="secundario" disabled={pendente} onClick={() => rodar(() => cancelarPedidoPeloLink(token, pedido))}>
            Sim, cancelar
          </Botao>
          <Botao tamanho="sm" variante="fantasma" onClick={() => setCerteza(false)}>
            Não
          </Botao>
        </>
      ) : (
        <Botao tamanho="sm" variante="fantasma" onClick={() => setCerteza(true)}>
          Cancelar o pedido
        </Botao>
      )}
      {mensagem}
    </div>
  );
}
