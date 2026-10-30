"use client";

import { CreditCard, LoaderCircle, LockKeyhole, QrCode } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { assinar, type ResultadoAssinar } from "@/lib/acoes/assinatura";
import { documentoValido, formatarDocumento } from "@/lib/documento";
import { formatarMoeda } from "@/lib/formato";
import { dataDoDia, MESES, NOME_CICLO, NOME_PRODUTO, POR_CICLO, type Plano, type Produto } from "@/lib/pagamentos";
import { Campo, classesEntrada } from "../ui/campo";
import { Botao } from "../ui/botao";

// Assinar (claude/plano-checkout-asaas.md): o plano, a forma de pagar e os dados da nota fiscal. O cartão é
// digitado na página segura do parceiro de pagamentos (o Publike não vê o número); o Pix aparece aqui.

const OPCAO =
  "flex cursor-pointer gap-3 rounded-md border p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink";
const MARCADA = "border-ink bg-surface-300";
const SOLTA = "border-line-strong bg-surface-200 hover:bg-surface-300";

export function FormAssinar({
  recurso,
  planos,
  primeiro,
  inicial,
  troca = false,
}: {
  recurso: Produto;
  planos: Plano[];
  /** a data da 1ª cobrança, quando não é hoje (o fim do teste grátis ou do que já está pago) */
  primeiro: string | null;
  inicial: { documento: string; nome: string; email: string };
  troca?: boolean;
}) {
  const router = useRouter();
  const ordenados = [...planos].sort((a, b) => MESES[a.ciclo] - MESES[b.ciclo]);
  const [plano, setPlano] = useState(ordenados[0]?.id ?? "");
  const [forma, setForma] = useState<"cartao" | "pix">("cartao");
  const [documento, setDocumento] = useState(formatarDocumento(inicial.documento));
  const [nome, setNome] = useState(inicial.nome);
  const [email, setEmail] = useState(inicial.email);
  const [erro, setErro] = useState<string | null>(null);
  const [erroDoc, setErroDoc] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const escolhido = ordenados.find((p) => p.id === plano);
  const mensal = ordenados.find((p) => p.ciclo === "MONTHLY");
  const f = troca ? "cartao" : forma;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!documentoValido(documento)) {
      setErroDoc("Confira o CPF ou o CNPJ.");
      document.getElementById("documento")?.focus();
      return;
    }
    setErroDoc(null);
    iniciar(async () => {
      const r: ResultadoAssinar = await chamarAcao(() => assinar({ plano, forma: f, documento, nome, email, troca }));
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      // o cartão: a página segura do parceiro; o Pix: a fatura, aqui
      if (r.externo) window.location.assign(r.ir);
      else router.push(r.ir);
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-6" noValidate>
      {!troca && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label">Plano</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ordenados.map((p) => {
              const porMes = p.valor / MESES[p.ciclo];
              const economia = p.ciclo === "QUARTERLY" && mensal ? Math.round((1 - porMes / mensal.valor) * 100) : 0;
              return (
                <label key={p.id} className={`${OPCAO} ${plano === p.id ? MARCADA : SOLTA}`}>
                  <input
                    type="radio"
                    name="plano"
                    value={p.id}
                    checked={plano === p.id}
                    onChange={() => setPlano(p.id)}
                    className="mt-1 size-4 accent-terra"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-label">{NOME_CICLO[p.ciclo]}</span>
                    <span className="text-h3 tabular-nums">
                      {formatarMoeda(p.valor)}{" "}
                      <span className="text-body-sm font-normal text-ink-muted">{POR_CICLO[p.ciclo]}</span>
                    </span>
                    {p.ciclo === "QUARTERLY" && (
                      <span className="text-body-sm text-ink-muted">
                        Sai {formatarMoeda(Math.round(porMes * 100) / 100)} por mês
                        {economia > 0 && <span className="text-cerrado-text"> · {economia}% a menos</span>}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {!troca && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label">Como pagar</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={`${OPCAO} ${forma === "cartao" ? MARCADA : SOLTA}`}>
              <input
                type="radio"
                name="forma"
                value="cartao"
                checked={forma === "cartao"}
                onChange={() => setForma("cartao")}
                className="mt-1 size-4 accent-terra"
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-label">
                  <CreditCard aria-hidden className="size-[18px]" />
                  Cartão de crédito
                </span>
                <span className="text-body-sm text-ink-muted">Renova sozinho. Você não precisa fazer nada.</span>
              </span>
            </label>
            <label className={`${OPCAO} ${forma === "pix" ? MARCADA : SOLTA}`}>
              <input
                type="radio"
                name="forma"
                value="pix"
                checked={forma === "pix"}
                onChange={() => setForma("pix")}
                className="mt-1 size-4 accent-terra"
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-label">
                  <QrCode aria-hidden className="size-[18px]" />
                  Pix
                </span>
                <span className="text-body-sm text-ink-muted">A cada fatura, você paga o Pix aqui no Publike.</span>
              </span>
            </label>
          </div>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-label">Dados da nota fiscal</legend>
        <Campo rotulo="CPF ou CNPJ" nome="documento" erro={erroDoc ?? undefined}>
          <input
            id="documento"
            name="documento"
            inputMode="text"
            autoComplete="off"
            value={documento}
            onChange={(e) => setDocumento(formatarDocumento(e.target.value))}
            aria-invalid={Boolean(erroDoc)}
            aria-describedby={erroDoc ? "documento-erro" : undefined}
            className={`${classesEntrada} max-w-xs tabular-nums`}
            required
          />
        </Campo>
        <Campo rotulo="Nome ou razão social" nome="nome">
          <input
            id="nome"
            name="nome"
            autoComplete="organization"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={120}
            className={classesEntrada}
            required
          />
        </Campo>
        <Campo rotulo="E-mail para a nota" nome="email" opcional ajuda="A nota fiscal também fica em Faturas.">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
            aria-describedby="email-ajuda"
            className={classesEntrada}
          />
        </Campo>
      </fieldset>

      {escolhido && (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
          <p className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-body">
              {NOME_PRODUTO[recurso]} · {NOME_CICLO[escolhido.ciclo].toLowerCase()}
            </span>
            <span className="text-h3 tabular-nums">{formatarMoeda(escolhido.valor)}</span>
          </p>
          <p className="text-body-sm text-ink-muted">
            {primeiro
              ? `Nada é cobrado hoje. A primeira cobrança vem em ${dataDoDia(primeiro)}, e depois ${POR_CICLO[escolhido.ciclo]}.`
              : `Cobrado hoje, e depois ${POR_CICLO[escolhido.ciclo]}.`}{" "}
            Cancele quando quiser: o que já foi pago vale até o fim do período.
          </p>
          {erro && (
            <p role="alert" className="text-body-sm text-danger">
              {erro}
            </p>
          )}
          <Botao type="submit" variante="primario" disabled={pendente} className="self-start">
            {pendente ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : f === "cartao" ? (
              <LockKeyhole aria-hidden />
            ) : (
              <QrCode aria-hidden />
            )}
            {troca ? "Pôr o cartão novo" : f === "cartao" ? "Continuar para o cartão" : "Assinar e gerar o Pix"}
          </Botao>
          {f === "cartao" && (
            <p className="text-body-sm text-ink-muted">
              O cartão é digitado na página segura do nosso parceiro de pagamentos. O Publike não vê nem guarda o número
              do cartão.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
