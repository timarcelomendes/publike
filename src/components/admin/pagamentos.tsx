"use client";

import { useState } from "react";
import { contaDeTestePagamentos, salvarConfigPagamentos, salvarPlano } from "@/lib/acoes/admin-pagamentos";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

// Admin › Pagamentos: o preço de cada plano, abrir para todos, as contas de teste e o serviço da nota.

export function EditarPlano({
  id,
  nome,
  valor,
  ligado,
}: {
  id: string;
  nome: string;
  valor: number | null;
  ligado: boolean;
}) {
  const [preco, setPreco] = useState(valor != null ? valor.toFixed(2).replace(".", ",") : "");
  const [venda, setVenda] = useState(ligado);
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <form
      className="flex flex-wrap items-end gap-3 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvarPlano(id, preco, venda));
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-label">{nome}</span>
        <span className="flex items-center gap-2">
          <span className="text-body-sm text-ink-muted">R$</span>
          <input
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            inputMode="decimal"
            placeholder="sem preço"
            aria-label={`Preço de ${nome}`}
            className={`${classesEntrada} w-32 tabular-nums`}
          />
        </span>
      </label>
      <label className="flex min-h-11 items-center gap-2 text-body-sm">
        <input type="checkbox" checked={venda} onChange={(e) => setVenda(e.target.checked)} className="size-4" />À venda
      </label>
      <Botao type="submit" tamanho="sm" disabled={pendente}>
        Salvar
      </Botao>
      <div className="basis-full">{mensagem}</div>
    </form>
  );
}

export function ConfigPagamentos({
  aberto,
  servico,
  eCodigo,
  descricao,
}: {
  aberto: boolean;
  servico: string;
  eCodigo: boolean;
  descricao: string;
}) {
  const [a, setA] = useState(aberto);
  const [s, setS] = useState(servico);
  const [c, setC] = useState(eCodigo);
  const [d, setD] = useState(descricao);
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvarConfigPagamentos({ aberto: a, servico: s, eCodigo: c, descricao: d }));
      }}
    >
      <label className="flex items-start gap-2 text-body">
        <input type="checkbox" checked={a} onChange={(e) => setA(e.target.checked)} className="mt-1 size-4" />
        <span>
          <span className="text-label">Abrir para todas as contas</span>
          <span className="block text-body-sm text-ink-muted">
            Desligado, só as contas de teste abaixo veem o Assinar.
          </span>
        </span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label">Serviço da nota fiscal</span>
        <span className="text-body-sm text-ink-muted">
          O código do serviço da sua prefeitura, como aparece no Asaas (Notas fiscais › Configurações). Sem ele, a nota
          não sai.
        </span>
        <input
          value={s}
          onChange={(e) => setS(e.target.value)}
          maxLength={60}
          className={`${classesEntrada} max-w-sm`}
        />
      </label>
      <label className="flex items-center gap-2 text-body-sm">
        <input type="checkbox" checked={c} onChange={(e) => setC(e.target.checked)} className="size-4" />É o código do
        serviço (a prefeitura não tem a lista no Asaas)
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label">Texto da nota (opcional)</span>
        <textarea
          value={d}
          onChange={(e) => setD(e.target.value)}
          maxLength={250}
          rows={2}
          className={classesEntrada}
        />
      </label>
      <Botao type="submit" tamanho="sm" disabled={pendente} className="self-start">
        Salvar
      </Botao>
      {mensagem}
    </form>
  );
}

export function ContaDeTeste() {
  const [conta, setConta] = useState("");
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        rodar(
          () => contaDeTestePagamentos(conta, true),
          (r) => r.ok && setConta(""),
        );
      }}
    >
      <label htmlFor="conta-teste-pag" className="text-label">
        Pôr uma conta no teste
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="conta-teste-pag"
          value={conta}
          onChange={(e) => setConta(e.target.value)}
          placeholder="e-mail de login ou código da conta"
          className={`${classesEntrada} max-w-sm`}
        />
        <Botao type="submit" tamanho="sm" disabled={pendente}>
          Pôr no teste
        </Botao>
      </div>
      {mensagem}
    </form>
  );
}

export function TirarDoTeste({ conta }: { conta: string }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <span className="flex flex-col items-end gap-1">
      <Botao
        variante="fantasma"
        tamanho="sm"
        disabled={pendente}
        onClick={() => rodar(() => contaDeTestePagamentos(conta, false))}
      >
        Tirar
      </Botao>
      {mensagem}
    </span>
  );
}
