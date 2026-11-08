"use client";

import { Send } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { protegerAcao } from "@/lib/acao-segura";
import { pedirVagaPeloLink } from "@/lib/acoes/pedidos-do-cliente";
import { MAX_CAMPOS } from "@/lib/pedidos-do-cliente";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada, ligarCampo } from "../ui/campo";

const acao = protegerAcao(pedirVagaPeloLink);

/** O formulário do link do cliente: pedir uma vaga para a agência (sem conta). */
export function PedirVaga({ token, local, hoje }: { token: string; local: string | null; hoje: string }) {
  const [estado, enviar, pendente] = useActionState<EstadoForm, FormData>(acao, { ok: false });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  const e = estado.erros ?? {};
  return (
    <form ref={form} action={enviar} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Campo rotulo="Cargo" nome="cargo" erro={e.cargo}>
          <input
            {...ligarCampo("cargo", e.cargo)}
            required
            minLength={3}
            maxLength={MAX_CAMPOS.cargo}
            placeholder="Ex.: Repositor de mercadorias"
            className={classesEntrada}
          />
        </Campo>
        <Campo rotulo="Quantas pessoas" nome="quantidade" erro={e.quantidade}>
          <input
            {...ligarCampo("quantidade", e.quantidade)}
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            defaultValue={1}
            className={classesEntrada}
          />
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Salário e benefícios" nome="salario" opcional>
          <input
            {...ligarCampo("salario")}
            maxLength={MAX_CAMPOS.salario}
            placeholder="Ex.: R$ 1.800 + vale-transporte"
            className={classesEntrada}
          />
        </Campo>
        <Campo rotulo="Horário" nome="horario" opcional>
          <input
            {...ligarCampo("horario")}
            maxLength={MAX_CAMPOS.horario}
            placeholder="Ex.: segunda a sábado, das 7h às 15h"
            className={classesEntrada}
          />
        </Campo>
      </div>
      <Campo rotulo="Local de trabalho" nome="local" opcional ajuda={local ? `Em branco: ${local}.` : undefined}>
        <input
          {...ligarCampo("local", undefined, Boolean(local))}
          maxLength={MAX_CAMPOS.local}
          placeholder={local ?? "Bairro ou endereço"}
          className={classesEntrada}
        />
      </Campo>
      <Campo rotulo="Requisitos" nome="requisitos" opcional>
        <textarea
          {...ligarCampo("requisitos")}
          rows={3}
          maxLength={MAX_CAMPOS.requisitos}
          placeholder="Ex.: ensino médio, 6 meses de experiência, morar perto"
          className={`${classesEntrada} min-h-24 py-2`}
        />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Para quando precisa" nome="para_quando" opcional erro={e.para_quando}>
          <input {...ligarCampo("para_quando", e.para_quando)} type="date" min={hoje} className={classesEntrada} />
        </Campo>
        <Campo rotulo="Seu nome" nome="quem" opcional ajuda="Para a agência saber quem pediu.">
          <input {...ligarCampo("quem", undefined, true)} maxLength={MAX_CAMPOS.quem} className={classesEntrada} />
        </Campo>
      </div>
      <Campo rotulo="Observações" nome="observacoes" opcional>
        <textarea
          {...ligarCampo("observacoes")}
          rows={2}
          maxLength={MAX_CAMPOS.observacoes}
          className={`${classesEntrada} min-h-16 py-2`}
        />
      </Campo>
      {estado.erro && <Aviso tipo="alerta">{estado.erro}</Aviso>}
      {estado.ok && estado.mensagem && <Aviso tipo="sucesso">{estado.mensagem}</Aviso>}
      <Botao type="submit" variante="primario" disabled={pendente} className="self-start">
        <Send aria-hidden />
        {pendente ? "Enviando…" : "Mandar o pedido"}
      </Botao>
    </form>
  );
}
