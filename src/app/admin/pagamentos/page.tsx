import type { Metadata } from "next";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import {
  ConfigPagamentos,
  ContaDeTeste,
  Copiar,
  EditarPlano,
  GerarToken,
  TirarDoTeste,
} from "@/components/admin/pagamentos";
import { Secao, Situacao } from "@/components/admin/ui";
import { Aviso, Selo } from "@/components/ui/basicos";
import { formatarMoeda, tempoRelativo } from "@/lib/formato";
import { NOME_CICLO, NOME_PRODUTO, type Ciclo, type Produto } from "@/lib/pagamentos";
import { tokenParaCopiar } from "@/lib/servidor/asaas";
import { itensPagamentos, situacaoPagamentos } from "@/lib/servidor/situacao-pagamentos";
import { agoraDaRequisicao } from "@/lib/tempo";
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
  planos: { id: string; recurso: Produto; ciclo: Ciclo; valor: number | null; ligado: boolean }[];
  teste: { conta_id: string; nome: string; email: string | null }[];
  assinaturas: {
    id: string;
    nome: string;
    recurso: Produto;
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
  const [sit, agora] = await Promise.all([situacaoPagamentos(c), agoraDaRequisicao()]);
  const noAr = sit.noAr;
  const token = tokenParaCopiar();
  const ativas = d.assinaturas.filter((a) => a.situacao === "ativa");
  return (
    <div className="flex flex-col gap-6">
      <Secao titulo="Está tudo ok?" descricao="O site no ar, perguntado agora, e os avisos do Asaas chegando.">
        <div className="flex flex-col gap-2">
          {itensPagamentos(sit).map((i) => (
            <Situacao key={i.texto} ok={i.ok}>
              {i.texto}
            </Situacao>
          ))}
        </div>
        {sit.avisos?.ultimo_aviso && (
          <p className="text-body-sm text-ink-muted">
            Último aviso: {sit.avisos.ultimo_tipo} {tempoRelativo(sit.avisos.ultimo_aviso, agora)}.
          </p>
        )}
      </Secao>

      <Secao
        titulo="Webhook"
        descricao="No Asaas: Integrações › Webhooks › Adicionar. Cole o endereço e o token, versão v3, fila de sincronização ligada, e marque os eventos de cobranças, assinaturas, checkout e notas fiscais."
      >
        <dl className="flex flex-col gap-3 text-body-sm">
          <div className="flex flex-col gap-1">
            <dt className="text-label">Endereço</dt>
            <dd>
              {sit.webhook ? (
                <Copiar valor={sit.webhook} rotulo="o endereço do webhook" />
              ) : (
                "Ponha PUBLIKE_URL_PUBLICA (o endereço do site no ar) no .env.local."
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-label">Token (ASAAS_WEBHOOK_TOKEN)</dt>
            <dd className="flex flex-col items-start gap-2">
              {token ? (
                <>
                  <Copiar valor={token} rotulo="o token do webhook" segredo />
                  <span className="text-ink-muted">
                    Este é o do .env.local. Na Vercel tem de ser o mesmo valor.
                    {sit.local.problemaNoToken ? ` Atenção: ${sit.local.problemaNoToken}.` : ""}
                  </span>
                </>
              ) : (
                <span className="text-ink-muted">Não está no .env.local deste computador.</span>
              )}
              <GerarToken />
            </dd>
          </div>
        </dl>
      </Secao>

      <Secao
        titulo="Chaves postas"
        descricao="A chave e o token ficam no .env.local e na Vercel, nunca no banco. Aqui aparece só o começo e o fim."
      >
        <table className="w-full text-left text-body-sm">
          <thead className="text-ink-muted">
            <tr>
              <th className="py-1 pr-3 font-normal">Variável</th>
              <th className="py-1 pr-3 font-normal">Neste computador</th>
              <th className="py-1 font-normal">No site no ar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <tr>
              <td className="py-2 pr-3">ASAAS_API_KEY</td>
              <td className="py-2 pr-3 break-all">{sit.local.chaveMascarada ?? "não posta"}</td>
              <td className="py-2">
                {!noAr?.respondeu
                  ? "—"
                  : !noAr.chave
                    ? "não posta"
                    : noAr.chaveAceita === false
                      ? "recusada pelo Asaas"
                      : "posta"}
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-3">ASAAS_WEBHOOK_TOKEN</td>
              <td className="py-2 pr-3 break-all">{sit.local.tokenMascarado ?? "não posto"}</td>
              <td className="py-2">
                {!noAr?.respondeu
                  ? "—"
                  : !noAr.token
                    ? "não posto"
                    : noAr.tokenComProblema
                      ? "fora do padrão"
                      : "posto"}
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-3">ASAAS_AMBIENTE</td>
              <td className="py-2 pr-3">{sit.local.ambiente}</td>
              <td className="py-2">{!noAr?.respondeu ? "—" : noAr.producao ? "produção" : "teste (sandbox)"}</td>
            </tr>
          </tbody>
        </table>
        {!sit.local.temChave && (
          <p className="text-body-sm text-ink-muted">
            A chave do Asaas começa com <code>$</code>. No .env.local, ponha uma barra antes:{" "}
            <code>ASAAS_API_KEY=\$aact_…</code>. Sem a barra, o site lê a chave vazia. Na Vercel, cole sem a barra.
          </p>
        )}
        {!noAr?.respondeu && (
          <p className="text-body-sm text-ink-muted">
            “—”: o site no ar ainda não respondeu (ele só mostra sim ou não, nunca a chave). Faça o push.
          </p>
        )}
      </Secao>

      <Secao titulo="Preços" descricao="Cada recurso é assinado separado. O trimestral cobra os 3 meses juntos.">
        <div className="flex flex-col divide-y divide-line">
          {d.planos.map((p) => (
            <EditarPlano
              key={p.id}
              id={p.id}
              nome={`${NOME_PRODUTO[p.recurso]} · ${NOME_CICLO[p.ciclo].toLowerCase()}`}
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
                  {a.nome} · {NOME_PRODUTO[a.recurso]} · {NOME_CICLO[a.ciclo].toLowerCase()} ·{" "}
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
