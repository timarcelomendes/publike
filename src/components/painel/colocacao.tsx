"use client";

import { Trash2 } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { apagarColocacao, salvarColocacao } from "@/lib/acoes/colocacoes";
import { GARANTIA_PADRAO, GARANTIAS, hojeEmBrasilia, situacaoDaColocacao, type Colocacao } from "@/lib/colocacoes";
import { formatarMoeda } from "@/lib/formato";
import type { EstadoForm } from "@/lib/tipos";
import { Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada, MensagemErro, Seletor } from "../ui/campo";

// Agência: a colocação de quem foi contratado para o cliente (o começo, a taxa e a garantia).

const ESTADO_INICIAL: EstadoForm = { ok: false };

/** "Em garantia até 18/01/2027 (faltam 12 dias)", com a cor da situação. */
export function SeloDaColocacao({ c, agora }: { c: Colocacao; agora: number }) {
  const s = situacaoDaColocacao(c, hojeEmBrasilia(agora));
  const curto =
    s.tipo === "reposicao"
      ? "Reposição"
      : s.tipo === "garantia"
        ? `Garantia: ${s.faltam} ${s.faltam === 1 ? "dia" : "dias"}`
        : "Garantia ok";
  return (
    <Selo variante={s.tipo === "reposicao" ? "perigo" : s.tipo === "garantia" ? "aviso" : "contorno"} title={s.texto}>
      {curto}
    </Selo>
  );
}

export function FormColocacao({
  anuncioId,
  perfilId,
  nome,
  atual,
  agora,
}: {
  anuncioId: string;
  perfilId: string;
  nome: string;
  atual: Colocacao | null;
  agora: number;
}) {
  const [estado, acao, salvando] = useActionState(salvarColocacao.bind(null, anuncioId, perfilId), ESTADO_INICIAL);
  const [apagando, iniciar] = useTransition();
  const [apagou, setApagou] = useState<string | null>(null);
  const hoje = hojeEmBrasilia(agora);
  const erros = estado.erros ?? {};
  const id = (campo: string) => `colocacao-${perfilId}-${campo}`;
  const garantias = [0, ...GARANTIAS, 120, 180];
  if (atual && !garantias.includes(atual.garantia_dias)) garantias.push(atual.garantia_dias);
  const primeiro = nome.split(" ")[0];
  const situacao = atual ? situacaoDaColocacao(atual, hoje) : null;
  const formulario = useRef<HTMLFormElement>(null);

  // depois de um erro, leva até o primeiro campo com problema
  useEffect(() => {
    if (!estado.erros) return;
    formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [estado]);

  // enviar sem limpar o formulário (com action={...} o React apaga o que foi digitado, mesmo se der erro)
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setApagou(null);
    const dados = new FormData(e.currentTarget);
    startTransition(() => acao(dados));
  }

  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="flex flex-col gap-3">
      {situacao ? (
        <p
          className={`text-body-sm ${situacao.tipo === "reposicao" ? "font-semibold text-danger" : situacao.tipo === "garantia" ? "text-terra-text" : "text-ink-muted"}`}
        >
          {situacao.texto}
          {atual?.taxa != null && ` · taxa ${formatarMoeda(atual.taxa)}${atual.paga ? " (recebida)" : " (a receber)"}`}
        </p>
      ) : (
        <p className="text-body-sm text-ink-muted">
          Registre a colocação de {primeiro}: o dia em que começou, a taxa cobrada do cliente e a garantia de reposição.
          Só a agência vê.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("inicio")} className="text-label">
            Começou em
          </label>
          <input
            id={id("inicio")}
            name="inicio"
            type="date"
            defaultValue={atual?.inicio ?? hoje}
            required
            aria-invalid={erros.inicio ? true : undefined}
            className={classesEntrada}
          />
          {erros.inicio && <MensagemErro>{erros.inicio}</MensagemErro>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("garantia")} className="text-label">
            Garantia de reposição
          </label>
          <Seletor
            id={id("garantia")}
            name="garantia"
            defaultValue={String(atual?.garantia_dias ?? GARANTIA_PADRAO)}
            aria-invalid={erros.garantia ? true : undefined}
            className={classesEntrada}
          >
            {garantias
              .sort((a, b) => a - b)
              .map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? "Sem garantia" : `${d} dias`}
                </option>
              ))}
          </Seletor>
          {erros.garantia && <MensagemErro>{erros.garantia}</MensagemErro>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("taxa")} className="text-label">
            Taxa cobrada do cliente <span className="font-normal text-ink-muted">(opcional)</span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body text-ink-muted">
              R$
            </span>
            <input
              id={id("taxa")}
              name="taxa"
              inputMode="decimal"
              defaultValue={atual?.taxa != null ? String(atual.taxa).replace(".", ",") : ""}
              placeholder="1.500"
              aria-invalid={erros.taxa ? true : undefined}
              className={`${classesEntrada} pl-10`}
            />
          </div>
          {erros.taxa && <MensagemErro>{erros.taxa}</MensagemErro>}
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end text-label">
          <input
            type="checkbox"
            name="paga"
            defaultChecked={atual?.paga ?? false}
            className="size-5 accent-[var(--pk-ink)]"
          />
          Taxa já recebida
        </label>
      </div>
      {atual && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("saiu_em")} className="text-label">
            Saiu do emprego em <span className="font-normal text-ink-muted">(só se saiu)</span>
          </label>
          <input
            id={id("saiu_em")}
            name="saiu_em"
            type="date"
            defaultValue={atual.saiu_em ?? ""}
            min={atual.inicio}
            aria-invalid={erros.saiu_em ? true : undefined}
            className={`${classesEntrada} sm:max-w-60`}
          />
          {erros.saiu_em && <MensagemErro>{erros.saiu_em}</MensagemErro>}
          {!erros.saiu_em && (
            <p className="text-body-sm text-ink-muted">Dentro da garantia, vira reposição: o painel lembra você.</p>
          )}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("nota")} className="text-label">
          Anotação <span className="font-normal text-ink-muted">(opcional)</span>
        </label>
        <textarea
          id={id("nota")}
          name="nota"
          rows={2}
          maxLength={500}
          defaultValue={atual?.nota ?? ""}
          placeholder="Ex.: nota fiscal 123, pagamento em 2 vezes."
          aria-invalid={erros.nota ? true : undefined}
          className={`${classesEntrada} resize-y`}
        />
        {erros.nota && <MensagemErro>{erros.nota}</MensagemErro>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" tamanho="sm" disabled={salvando || apagando}>
          {salvando ? "Salvando…" : atual ? "Salvar colocação" : "Registrar colocação"}
        </Botao>
        {atual && (
          <Botao
            tamanho="sm"
            variante="fantasma"
            disabled={salvando || apagando}
            onClick={() =>
              iniciar(async () => {
                const r = await apagarColocacao(anuncioId, perfilId);
                setApagou(r.ok ? (r.mensagem ?? "Apagada.") : (r.erro ?? "Não deu para apagar."));
              })
            }
          >
            <Trash2 aria-hidden />
            Apagar
          </Botao>
        )}
      </div>
      {(estado.mensagem || (estado.erro && !Object.keys(erros).length) || apagou) && (
        <p role="status" className={`text-body-sm ${estado.ok || apagou ? "text-cerrado-text" : "text-danger"}`}>
          {apagou ?? estado.mensagem ?? estado.erro}
        </p>
      )}
    </form>
  );
}
