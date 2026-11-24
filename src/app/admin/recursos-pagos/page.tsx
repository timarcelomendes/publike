import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Numero, Secao } from "@/components/admin/ui";
import { Aviso, Selo } from "@/components/ui/basicos";
import {
  formatarDataCurta,
  formatarMoeda,
  formatarNumero,
  rotuloConta,
} from "@/lib/formato";
import {
  ehProduto,
  NOME_CICLO,
  NOME_PRODUTO,
  type Ciclo,
} from "@/lib/pagamentos";
import { exigirAdminLocal } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Recursos pagos" };

// Quem usa os recursos pagos (23/11/2026; Marcelo: "Quero ver quem usa as features pagas, que habilitaram"; migração
// 20270917120000): quem tem cada recurso liberado e como, as assinaturas, quem usa o grátis do mês e os impulsos.

type Como = "assinatura" | "15_dias" | "publike";

type Liberado = {
  recurso: string;
  conta_id: string;
  nome: string;
  tipo: string;
  desde: string;
  ate: string | null;
  ativo: boolean;
  como: Como;
  sandbox: boolean | null;
  valor: number | null;
  ciclo: Ciclo | null;
  situacao_assinatura: string | null;
  conta_de_teste: boolean;
  /** Triagem: os currículos lidos no mês; Entrevista em vídeo: os pedidos do mês; os outros, null */
  uso_no_mes: number | null;
};

type Assinatura = {
  conta_id: string;
  nome: string;
  recurso: string;
  ciclo: Ciclo;
  valor: number;
  forma: string;
  situacao: string;
  sandbox: boolean;
  criada_em: string;
  cancelada_em: string | null;
  conta_de_teste: boolean;
};

type Gratis = {
  conta_id: string;
  nome: string;
  tipo: string;
  /** null: a conta tem a Triagem paga (não conta no grátis) */
  lidos: number | null;
  /** null: a conta tem a Entrevista em vídeo paga */
  pedidas: number | null;
  enviadas: number;
  conta_de_teste: boolean;
};

type Impulsos = {
  conta_id: string;
  nome: string;
  tipo: string;
  total: number;
  compra: number;
  credito: number;
  cortesia: number;
  admin: number;
  automaticos: number;
  valor: number;
  gasto: number;
  ultimo: string;
};

type Dados = {
  mes_desde: string;
  limite_triagem: number;
  limite_gravadas: number;
  liberados: Liberado[];
  assinaturas: Assinatura[];
  gratis: Gratis[];
  impulsos: Impulsos[];
};

const OUTROS_RECURSOS: Record<string, string> = {
  contato_no_convite: "Contato no convite",
  visoes: "Visões das vagas",
};

function nomeDoRecurso(r: string) {
  return ehProduto(r) ? NOME_PRODUTO[r] : (OUTROS_RECURSOS[r] ?? r);
}

const NOME_COMO: Record<Como, string> = {
  assinatura: "Assinatura",
  "15_dias": "15 dias grátis",
  publike: "Liberado pelo Publike",
};

export default function RecursosPagos() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

function Conta({
  id,
  nome,
  tipo,
  teste,
}: {
  id: string;
  nome: string;
  tipo?: string;
  teste?: boolean;
}) {
  return (
    <span className="flex flex-col">
      <Link
        href={`/admin/usuarios/${id}`}
        className="font-semibold underline-offset-2 hover:underline"
      >
        {nome}
      </Link>
      <span className="flex flex-wrap items-center gap-1 text-caption text-ink-muted">
        {tipo && rotuloConta(tipo)}
        {teste && <Selo variante="contorno">Conta de teste</Selo>}
      </span>
    </span>
  );
}

function Como({ l }: { l: Liberado }) {
  if (l.como !== "assinatura") return <span>{NOME_COMO[l.como]}</span>;
  return (
    <span className="flex flex-col">
      <span>
        Assinatura{l.valor !== null && `, ${formatarMoeda(l.valor)}`}
        {l.ciclo && ` ${NOME_CICLO[l.ciclo].toLowerCase()}`}
      </span>
      {(l.sandbox || l.situacao_assinatura === "cancelada") && (
        <span className="text-caption text-ink-muted">
          {[
            l.sandbox && "sandbox",
            l.situacao_assinatura === "cancelada" && "cancelada",
          ]
            .filter(Boolean)
            .join(", ")}
        </span>
      )}
    </span>
  );
}

function Tabela({
  cabecalho,
  children,
  min = 640,
}: {
  cabecalho: string[];
  children: ReactNode;
  min?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-left text-body-sm"
        style={{ minWidth: min }}
      >
        <thead className="text-caption text-ink-muted">
          <tr>
            {cabecalho.map((c, i) => (
              <th
                key={c}
                className={`px-2 py-2 font-semibold ${i > 0 && /^(Lidos|Gravadas|Total|Valor)/.test(c) ? "text-right" : ""}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

function TabelaDeLiberados({ linhas }: { linhas: Liberado[] }) {
  return (
    <Tabela
      cabecalho={["Empresa", "Recurso", "Como", "Desde", "Até", "Uso no mês"]}
    >
      {linhas.map((l) => (
        <tr key={`${l.conta_id}-${l.recurso}`} className="align-top">
          <td className="px-2 py-2">
            <Conta
              id={l.conta_id}
              nome={l.nome}
              tipo={l.tipo}
              teste={l.conta_de_teste}
            />
          </td>
          <td className="px-2 py-2">{nomeDoRecurso(l.recurso)}</td>
          <td className="px-2 py-2">
            <Como l={l} />
          </td>
          <td className="px-2 py-2 whitespace-nowrap">
            {formatarDataCurta(l.desde)}
          </td>
          <td className="px-2 py-2 whitespace-nowrap">
            {l.ate ? formatarDataCurta(l.ate) : "Sem prazo"}
          </td>
          <td className="px-2 py-2">
            {l.uso_no_mes === null
              ? "—"
              : l.recurso === "copiloto"
                ? `${formatarNumero(l.uso_no_mes)} ${l.uso_no_mes === 1 ? "lido" : "lidos"}`
                : `${formatarNumero(l.uso_no_mes)} ${l.uso_no_mes === 1 ? "pedida" : "pedidas"}`}
          </td>
        </tr>
      ))}
    </Tabela>
  );
}

async function Conteudo() {
  const c = await exigirAdminLocal();
  const { data, error } = await c.rpc("admin_recursos_pagos");
  if (error || !data) {
    if (error && error.code !== "PGRST202")
      throw new Error(
        `Publike: falha ao ler os recursos pagos (${error.message}).`,
      );
    return (
      <Aviso tipo="alerta" titulo="Rode a migração dos recursos pagos">
        Falta a migração 20270917120000_admin_recursos_pagos.sql neste banco.
      </Aviso>
    );
  }
  const d = data as unknown as Dados;
  const ativos = d.liberados.filter((l) => l.ativo);
  const acabaram = d.liberados.filter((l) => !l.ativo);
  const reais = d.assinaturas.filter((a) => !a.sandbox && !a.conta_de_teste);
  const assinaturasAtivas = reais.filter((a) => a.situacao === "ativa");
  const porMes = assinaturasAtivas.reduce(
    (s, a) =>
      s +
      Number(a.valor) /
        (a.ciclo === "YEARLY" ? 12 : a.ciclo === "QUARTERLY" ? 3 : 1),
    0,
  );
  const deFora = (x: { conta_de_teste: boolean }) => !x.conta_de_teste;
  const contasLiberadas = new Set(ativos.filter(deFora).map((l) => l.conta_id))
    .size;
  const noLimite = (g: Gratis) =>
    (g.lidos !== null && d.limite_triagem > 0 && g.lidos >= d.limite_triagem) ||
    (g.pedidas !== null &&
      d.limite_gravadas > 0 &&
      g.pedidas >= d.limite_gravadas);
  const gratisDeFora = d.gratis.filter(deFora);
  const impulsosComprados = d.impulsos.reduce((s, i) => s + i.compra, 0);
  const valorImpulsos = d.impulsos.reduce((s, i) => s + Number(i.valor), 0);
  const mes = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(d.mes_desde));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero
          rotulo="Assinaturas ativas"
          valor={assinaturasAtivas.length}
          detalhe={`${formatarMoeda(porMes)} por mês, sem as de teste`}
        />
        <Numero
          rotulo="Recursos liberados agora"
          valor={ativos.filter(deFora).length}
          detalhe={`${contasLiberadas === 1 ? "em 1 conta" : `em ${contasLiberadas} contas`}, sem as de teste`}
        />
        <Numero
          rotulo={`Usam o grátis de ${mes}`}
          valor={gratisDeFora.length}
          detalhe={`${gratisDeFora.filter(noLimite).length} já chegaram ao limite`}
          alerta={gratisDeFora.some(noLimite)}
        />
        <Numero
          rotulo="Impulsos comprados (60 dias)"
          valor={impulsosComprados}
          detalhe={`${formatarMoeda(valorImpulsos)}; ${d.impulsos.reduce((s, i) => s + i.total, 0)} impulsos ao todo`}
        />
      </div>

      <Secao
        titulo="Liberados agora"
        descricao="Quem tem cada recurso pago ligado hoje e como ganhou: pela assinatura, nos 15 dias grátis ou liberado pelo Publike."
      >
        {ativos.length ? (
          <TabelaDeLiberados linhas={ativos} />
        ) : (
          <p className="text-body-sm text-ink-muted">
            Nenhuma conta tem recurso pago ligado agora.
          </p>
        )}
        {acabaram.length > 0 && (
          <details className="text-body-sm">
            <summary className="cursor-pointer font-semibold">
              Já acabaram ({acabaram.length})
            </summary>
            <div className="mt-3">
              <TabelaDeLiberados linhas={acabaram} />
            </div>
          </details>
        )}
      </Secao>

      <Secao
        titulo="Assinaturas"
        descricao="As do sandbox e as das contas de teste vêm marcadas e não entram na conta de cima."
      >
        {d.assinaturas.length ? (
          <Tabela
            cabecalho={["Empresa", "Plano", "Valor", "Situação", "Desde"]}
          >
            {d.assinaturas.map((a) => (
              <tr
                key={`${a.conta_id}-${a.recurso}-${a.criada_em}`}
                className="align-top"
              >
                <td className="px-2 py-2">
                  <Conta
                    id={a.conta_id}
                    nome={a.nome}
                    teste={a.conta_de_teste}
                  />
                </td>
                <td className="px-2 py-2">{nomeDoRecurso(a.recurso)}</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {formatarMoeda(Number(a.valor))}{" "}
                  {NOME_CICLO[a.ciclo]?.toLowerCase()},{" "}
                  {a.forma === "pix" ? "Pix" : "cartão"}
                </td>
                <td className="px-2 py-2">
                  <span className="flex flex-wrap gap-1">
                    <Selo
                      variante={a.situacao === "ativa" ? "match" : "contorno"}
                    >
                      {a.situacao}
                    </Selo>
                    {a.sandbox && <Selo variante="contorno">Sandbox</Selo>}
                  </span>
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {formatarDataCurta(a.criada_em)}
                  {a.cancelada_em && (
                    <span className="block text-caption text-ink-muted">
                      cancelada {formatarDataCurta(a.cancelada_em)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </Tabela>
        ) : (
          <p className="text-body-sm text-ink-muted">Ninguém assinou ainda.</p>
        )}
      </Secao>

      <Secao
        titulo={`Grátis de ${mes}`}
        descricao={`Quem usa a parte grátis deste mês: a IA lê ${d.limite_triagem} candidatos e a empresa pede ${d.limite_gravadas} entrevistas gravadas. Quem chegou ao limite é quem mais precisa do plano.`}
      >
        {d.gratis.length ? (
          <Tabela
            cabecalho={["Empresa", "Lidos pela IA", "Gravadas pedidas", ""]}
            min={560}
          >
            {d.gratis.map((g) => (
              <tr key={g.conta_id} className="align-top">
                <td className="px-2 py-2">
                  <Conta
                    id={g.conta_id}
                    nome={g.nome}
                    tipo={g.tipo}
                    teste={g.conta_de_teste}
                  />
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {g.lidos === null
                    ? "Paga"
                    : `${g.lidos} de ${d.limite_triagem}`}
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {g.pedidas === null
                    ? "Paga"
                    : `${g.pedidas} de ${d.limite_gravadas}`}
                  {g.pedidas ? (
                    <span className="block text-caption text-ink-muted">
                      {g.enviadas} enviadas
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-2">
                  {noLimite(g) && <Selo variante="aviso">No limite</Selo>}
                </td>
              </tr>
            ))}
          </Tabela>
        ) : (
          <p className="text-body-sm text-ink-muted">
            Ninguém usou o grátis deste mês ainda.
          </p>
        )}
      </Secao>

      <Secao
        titulo="Impulsos dos últimos 60 dias"
        descricao="Por conta: os comprados, os do crédito, as cortesias e os dados pela equipe (com os automáticos)."
      >
        {d.impulsos.length ? (
          <Tabela
            cabecalho={["Empresa", "Total", "Como", "Valor pago", "Último"]}
          >
            {d.impulsos.map((i) => (
              <tr key={i.conta_id} className="align-top">
                <td className="px-2 py-2">
                  <Conta id={i.conta_id} nome={i.nome} tipo={i.tipo} />
                </td>
                <td className="px-2 py-2 text-right">{i.total}</td>
                <td className="px-2 py-2">
                  {[
                    i.compra &&
                      `${i.compra} comprado${i.compra > 1 ? "s" : ""}`,
                    i.credito && `${i.credito} do crédito`,
                    i.cortesia &&
                      `${i.cortesia} cortesia${i.cortesia > 1 ? "s" : ""}`,
                    i.admin &&
                      `${i.admin} pela equipe${i.automaticos ? ` (${i.automaticos} automático${i.automaticos > 1 ? "s" : ""})` : ""}`,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {formatarMoeda(Number(i.valor))}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {formatarDataCurta(i.ultimo)}
                </td>
              </tr>
            ))}
          </Tabela>
        ) : (
          <p className="text-body-sm text-ink-muted">
            Nenhum impulso nos últimos 60 dias.
          </p>
        )}
      </Secao>
    </div>
  );
}
