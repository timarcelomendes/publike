"use client";

import { useState, useTransition } from "react";
import {
  contaDeTestePagamentos,
  procurarContasParaTeste,
  salvarConfigPagamentos,
  sandboxDaContaDeTeste,
  type ContaAchada,
} from "@/lib/acoes/admin-pagamentos";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

// Admin › Pagamentos: abrir para todos, as contas de teste e o serviço da nota (os preços: tabela-de-precos.tsx).

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

/**
 * Pôr uma conta no teste: procura pelo nome, celular ou e-mail (só as que podem assinar) e escolhe. Marcado
 * "no sandbox", ela paga na conta sandbox do Asaas, mesmo com o site em produção.
 */
export function ContaDeTeste() {
  const [texto, setTexto] = useState("");
  const [sandbox, setSandbox] = useState(true);
  const [achadas, setAchadas] = useState<ContaAchada[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [procurando, iniciar] = useTransition();
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          iniciar(async () => {
            const r = await procurarContasParaTeste(texto);
            if (r.ok) setAchadas(r.contas);
            else {
              setAchadas(null);
              setErro(r.erro);
            }
          });
        }}
      >
        <label htmlFor="conta-teste-pag" className="text-label">
          Pôr uma conta no teste
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="conta-teste-pag"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="nome, celular ou e-mail"
            className={`${classesEntrada} max-w-sm`}
          />
          <Botao type="submit" tamanho="sm" variante="secundario" disabled={procurando}>
            Procurar
          </Botao>
        </div>
        <label className="flex items-start gap-2 text-body-sm">
          <input
            type="checkbox"
            checked={sandbox}
            onChange={(e) => setSandbox(e.target.checked)}
            className="mt-0.5 size-4"
          />
          <span>
            Pagar no sandbox
            <span className="block text-ink-muted">
              Nada é cobrado de verdade: use os cartões de teste do Asaas. Desmarcado, a cobrança é real.
            </span>
          </span>
        </label>
        {erro && <p className="text-body-sm text-danger">{erro}</p>}
      </form>
      {achadas && achadas.length === 0 && (
        <p className="text-body-sm text-ink-muted">
          Nenhum comércio, empresa ou agência com esse nome, celular ou e-mail.
        </p>
      )}
      {achadas && achadas.length > 0 && (
        <ul aria-label="Contas achadas" className="flex flex-col divide-y divide-line rounded-md border border-line">
          {achadas.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-body-sm">
              <span>
                {c.nome}
                <span className="text-ink-muted">
                  {" "}
                  · {NOME_DO_TIPO[c.tipo] ?? c.tipo}
                  {c.contato ? ` · ${c.contato}` : ""}
                </span>
              </span>
              <Botao
                tamanho="sm"
                disabled={pendente}
                aria-label={`Pôr ${c.nome} no teste`}
                onClick={() =>
                  rodar(
                    () => contaDeTestePagamentos(c.id, true, sandbox),
                    (r) => {
                      if (r.ok) {
                        setAchadas(null);
                        setTexto("");
                      }
                    },
                  )
                }
              >
                Pôr no teste
              </Botao>
            </li>
          ))}
        </ul>
      )}
      {mensagem}
    </div>
  );
}

const NOME_DO_TIPO: Record<string, string> = { comercio: "comércio", empresa: "empresa", agencia: "agência" };

/** Na lista das contas de teste: paga no sandbox ou na produção. */
export function SandboxDaConta({ conta, nome, sandbox }: { conta: string; nome: string; sandbox: boolean }) {
  const [marcado, setMarcado] = useState(sandbox);
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <span className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-body-sm">
        <input
          type="checkbox"
          checked={marcado}
          disabled={pendente}
          aria-label={`${nome} paga no sandbox`}
          onChange={(e) => {
            const v = e.target.checked;
            setMarcado(v);
            rodar(
              () => sandboxDaContaDeTeste(conta, v),
              (r) => !r.ok && setMarcado(!v),
            );
          }}
          className="size-4"
        />
        No sandbox
      </label>
      {mensagem}
    </span>
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

/** Um valor para copiar (o endereço do webhook, o token). `segredo`: escondido até tocar em Mostrar. */
export function Copiar({ valor, rotulo, segredo = false }: { valor: string; rotulo: string; segredo?: boolean }) {
  const [ver, setVer] = useState(!segredo);
  const [copiado, setCopiado] = useState(false);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <code className="rounded-sm bg-surface-300 px-2 py-1 text-body-sm break-all">
        {ver ? valor : "•".repeat(Math.min(valor.length, 24))}
      </code>
      {segredo && (
        <Botao variante="fantasma" tamanho="sm" onClick={() => setVer((v) => !v)}>
          {ver ? "Esconder" : "Mostrar"}
        </Botao>
      )}
      <Botao
        variante="secundario"
        tamanho="sm"
        aria-label={`Copiar ${rotulo}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(valor);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
          } catch {
            setVer(true);
          }
        }}
      >
        {copiado ? "Copiado" : "Copiar"}
      </Botao>
    </span>
  );
}

/** Um token novo, feito aqui no navegador (não fica guardado): para pôr na Vercel e no Asaas, o mesmo nos dois. */
export function GerarToken({ variavel = "ASAAS_WEBHOOK_TOKEN" }: { variavel?: string }) {
  const [token, setToken] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-start gap-2">
      <Botao
        variante="secundario"
        tamanho="sm"
        onClick={() => {
          const b = new Uint8Array(32);
          crypto.getRandomValues(b);
          setToken(Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""));
        }}
      >
        Gerar um token
      </Botao>
      {token && (
        <>
          <Copiar valor={token} rotulo="o token novo" />
          <span className="text-body-sm text-ink-muted">
            Ponha este mesmo valor em {variavel} na Vercel (e no .env.local) e no campo Token do webhook no Asaas. Ele
            não fica guardado aqui.
          </span>
        </>
      )}
    </span>
  );
}
