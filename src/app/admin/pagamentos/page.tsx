import type { Metadata } from "next";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { ConfigPagamentos, ContaDeTeste, EditarPlano, TirarDoTeste } from "@/components/admin/pagamentos";
import { Secao } from "@/components/admin/ui";
import { Aviso, Selo } from "@/components/ui/basicos";
import { formatarMoeda } from "@/lib/formato";
import { NOME_CICLO, type Ciclo } from "@/lib/pagamentos";
import { NOME_RECURSO, type RecursoPago } from "@/lib/recursos-pagos";
import { situacaoAsaas } from "@/lib/servidor/asaas";
import { exigirAdminLocal } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Pagamentos" };

// Os pagamentos pelo Asaas (claude/plano-checkout-asaas.md, migração 20261218120000): os preços, abrir para
// todos (fechado até você testar), as contas de teste, a nota fiscal e o que deu erro.

type Dados = {
  config: {
    aberto: boolean;
    servico_nota: string | null;
    servico_nota_e_codigo: boolean;
    descricao_nota: string | null;
  };
  planos: { id: string; recurso: RecursoPago; ciclo: Ciclo; valor: number | null; ligado: boolean }[];
  teste: { conta_id: string; nome: string; email: string | null }[];
  assinaturas: {
    id: string;
    nome: string;
    recurso: RecursoPago;
    ciclo: Ciclo;
    valor: number;
    forma: string;
    situacao: string;
    proxima_cobranca: string | null;
    atrasadas: number;
  }[];
  por_mes: number;
  notas_com_erro: { asaas_id: string; erro: string | null; nome: string; em: string }[];
  eventos_com_erro: { id: string; tipo: string; erro: string | null; em: string }[];
};

export default function Pagamentos() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const c = await exigirAdminLocal();
  const { data, error } = await c.rpc("admin_pagamentos");
  if (error || !data) {
    return (
      <Aviso tipo="alerta" titulo="Rode a migração dos pagamentos">
        Falta a migração 20261218120000_pagamentos.sql neste banco.
      </Aviso>
    );
  }
  const d = data as unknown as Dados;
  const asaas = situacaoAsaas();
  const ativas = d.assinaturas.filter((a) => a.situacao === "ativa");
  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Parceiro de pagamentos"
        descricao="A chave e o token ficam na Vercel (ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN e ASAAS_AMBIENTE), nunca aqui."
      >
        <ul className="flex flex-col gap-1 text-body-sm">
          <li>Ambiente: {asaas.ambiente}</li>
          <li>Chave da API: {asaas.temChave ? "posta" : "falta"}</li>
          <li>Token dos avisos: {asaas.temToken ? "posto" : "falta"}</li>
          <li>
            Endereço dos avisos (cadastre no Asaas): <code>/api/pagamentos/asaas</code> no endereço do site
          </li>
        </ul>
      </Secao>

      <Secao titulo="Preços" descricao="Cada recurso é assinado separado. O trimestral cobra os 3 meses juntos.">
        <div className="flex flex-col divide-y divide-line">
          {d.planos.map((p) => (
            <EditarPlano
              key={p.id}
              id={p.id}
              nome={`${NOME_RECURSO[p.recurso]} · ${NOME_CICLO[p.ciclo].toLowerCase()}`}
              valor={p.valor == null ? null : Number(p.valor)}
              ligado={p.ligado}
            />
          ))}
        </div>
      </Secao>

      <Secao titulo="Quem pode assinar e nota fiscal">
        <ConfigPagamentos
          aberto={d.config.aberto}
          servico={d.config.servico_nota ?? ""}
          eCodigo={d.config.servico_nota_e_codigo}
          descricao={d.config.descricao_nota ?? ""}
        />
      </Secao>

      <Secao
        titulo="Contas de teste"
        descricao="Enquanto está fechado, só estas contas veem o Assinar (comércio, empresa ou agência)."
      >
        <ContaDeTeste />
        {d.teste.length > 0 && (
          <ul className="flex flex-col divide-y divide-line">
            {d.teste.map((t) => (
              <li key={t.conta_id} className="flex items-center justify-between gap-3 py-2 text-body-sm">
                <span>
                  {t.nome}
                  {t.email ? <span className="text-ink-muted"> · {t.email}</span> : null}
                </span>
                <TirarDoTeste conta={t.conta_id} />
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao
        titulo="Assinaturas"
        descricao={`${ativas.length} ativas · ${formatarMoeda(Number(d.por_mes))} por mês (o trimestral dividido por 3)`}
      >
        {d.assinaturas.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Nenhuma ainda.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {d.assinaturas.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-body-sm">
                <span>
                  {a.nome} · {NOME_RECURSO[a.recurso]} · {NOME_CICLO[a.ciclo].toLowerCase()} ·{" "}
                  {formatarMoeda(Number(a.valor))} · {a.forma === "pix" ? "Pix" : "cartão"}
                </span>
                <span className="flex items-center gap-2">
                  {a.atrasadas > 0 && <Selo variante="perigo">Em atraso</Selo>}
                  <Selo variante={a.situacao === "ativa" ? "match" : "contorno"}>{a.situacao}</Selo>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {(d.notas_com_erro.length > 0 || d.eventos_com_erro.length > 0) && (
        <Secao titulo="Com erro" descricao="Notas que a prefeitura recusou e avisos do Asaas que não deram certo.">
          <ul className="flex flex-col gap-2 text-body-sm">
            {d.notas_com_erro.map((n) => (
              <li key={n.asaas_id}>
                Nota de {n.nome}: {n.erro ?? "erro"}
              </li>
            ))}
            {d.eventos_com_erro.map((e) => (
              <li key={e.id}>
                Aviso {e.tipo}: {e.erro}
              </li>
            ))}
          </ul>
        </Secao>
      )}
    </div>
  );
}
