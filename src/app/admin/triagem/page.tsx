import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import { formatarDataCurta, formatarNumero, primeiro } from "@/lib/formato";
import { exigirAdminLocal } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Triagem com IA" };

// Quem usa a Triagem com IA (22/11/2026; migração 20270830120000). As 360 chamadas de 30 dias eram quase todas do
// robô (os 5 grátis do mês lidos sozinhos e os critérios montados pela vaga), e não dava para saber quem abria a tela.
// Por conta: as aberturas da tela (só a conta, a vaga e o dia), o que uma pessoa pediu (critérios escritos e leituras
// pedidas) e tudo o que a IA leu.

type Linha = {
  conta_id: string;
  nome: string;
  tipo: string;
  lidos: number;
  vagas_lidas: number;
  ultima_leitura: string | null;
  lidos_pedidos: number;
  criterios: number;
  dias_abertos: number;
  aberturas: number;
  vagas_abertas: number;
  sem_acesso: boolean;
  ultima_abertura: string | null;
  liberado: boolean;
  assinatura: boolean;
};

const PERIODOS = [7, 30, 90];

export default function Triagem({ searchParams }: PageProps<"/admin/triagem">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/triagem">["searchParams"] }) {
  const c = await exigirAdminLocal();
  const sp = await searchParams;
  const pedido = Number(primeiro(sp.dias));
  const dias = PERIODOS.includes(pedido) ? pedido : 30;
  const { data, error } = await c.rpc("admin_uso_da_triagem", { p_dias: dias });
  if (error)
    return (
      <Aviso tipo="erro" titulo="Sem os dados">
        {error.code === "PGRST202" ? "Rode a migração 20270830120000_aberturas_da_triagem.sql primeiro." : error.message}
      </Aviso>
    );
  const linhas = (data ?? []) as unknown as Linha[];
  const abriram = linhas.filter((l) => l.aberturas > 0);
  const pediram = linhas.filter((l) => l.criterios > 0 || l.lidos_pedidos > 0);
  const lidos = linhas.reduce((t, l) => t + l.lidos, 0);
  const chip = (ativo: boolean) =>
    `inline-flex min-h-10 items-center rounded-pill border px-3.5 text-label ${
      ativo ? "border-ink bg-ink text-surface-100" : "border-line-strong bg-surface-200 hover:bg-surface-300"
    }`;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Período" className="flex flex-wrap gap-2">
        {PERIODOS.map((d) => (
          <Link key={d} href={`/admin/triagem?dias=${d}`} aria-current={d === dias ? "page" : undefined} className={chip(d === dias)}>
            {d} dias
          </Link>
        ))}
      </nav>

      <Secao
        titulo="Quem usa a Triagem com IA"
        descricao={
          <>
            Abriu: a conta entrou na aba Triagem de uma vaga (contado desde 22/11/2026; “sem acesso” é quem viu a oferta).
            Pediu: escreveu critérios ou mandou ler. Lidos pela IA: tudo, inclusive o que o robô leu sozinho (os grátis do
            mês e os candidatos que chegam).
          </>
        }
      >
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-body-sm">
          <li>
            <strong className="tabular-nums">{formatarNumero(abriram.length)}</strong>{" "}
            {abriram.length === 1 ? "conta abriu" : "contas abriram"} a tela
          </li>
          <li>
            <strong className="tabular-nums">{formatarNumero(pediram.length)}</strong>{" "}
            {pediram.length === 1 ? "conta pediu" : "contas pediram"} algo
          </li>
          <li>
            <strong className="tabular-nums">{formatarNumero(lidos)}</strong> currículos lidos em{" "}
            {formatarNumero(linhas.filter((l) => l.lidos > 0).length)} contas
          </li>
        </ul>
        {linhas.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Ninguém usou a Triagem neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead className="text-left text-caption text-ink-muted">
                <tr>
                  <th className="py-2 pr-4 font-normal">Conta</th>
                  <th className="py-2 pr-4 font-normal">Abriu</th>
                  <th className="py-2 pr-4 font-normal">Pediu</th>
                  <th className="py-2 pr-4 font-normal">Lidos pela IA</th>
                  <th className="py-2 font-normal">Acesso</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.conta_id} className="border-t border-line align-top">
                    <td className="py-2 pr-4">
                      {l.nome}
                      {l.tipo === "agencia" && <span className="text-caption text-ink-muted"> · agência</span>}
                    </td>
                    <td className="py-2 pr-4">
                      {l.aberturas ? (
                        <>
                          <span className="tabular-nums">
                            {l.aberturas}× em {l.dias_abertos} {l.dias_abertos === 1 ? "dia" : "dias"}
                          </span>
                          <span className="block text-caption text-ink-muted">
                            {l.vagas_abertas} {l.vagas_abertas === 1 ? "vaga" : "vagas"}
                            {l.ultima_abertura && ` · última ${formatarDataCurta(l.ultima_abertura)}`}
                            {l.sem_acesso && " · viu a oferta"}
                          </span>
                        </>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {l.criterios || l.lidos_pedidos ? (
                        <span className="tabular-nums">
                          {[
                            l.criterios && `${l.criterios} ${l.criterios === 1 ? "critério" : "critérios"}`,
                            l.lidos_pedidos && `${l.lidos_pedidos} ${l.lidos_pedidos === 1 ? "leitura" : "leituras"}`,
                          ]
                            .filter(Boolean)
                            .join(" e ")}
                        </span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="tabular-nums">{l.lidos}</span>
                      {l.lidos > 0 && (
                        <span className="block text-caption text-ink-muted">
                          {l.vagas_lidas} {l.vagas_lidas === 1 ? "vaga" : "vagas"}
                          {l.ultima_leitura && ` · última ${formatarDataCurta(l.ultima_leitura)}`}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-ink-muted">
                      {l.assinatura ? "assinatura" : l.liberado ? "liberado" : "grátis do mês"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </div>
  );
}
