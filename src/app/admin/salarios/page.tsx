import type { Metadata } from "next";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { EnviarSalarios } from "@/components/admin/salarios";
import { Busca, Secao, Situacao } from "@/components/admin/ui";
import { Selo } from "@/components/ui/basicos";
import { buscarOcupacoes } from "@/lib/cbo";
import { formatarNumero, primeiro, tempoRelativo } from "@/lib/formato";
import { mesCurto, nomeDaRegiao, reaisDaFaixa, type RegiaoSalario } from "@/lib/salarios";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Salários" };

// Salário do mercado (claude/plano-salario-e-curriculo.md, parte 1): as faixas do Novo Caged que o robô carregou
// (.github/workflows/salarios.yml), a busca por função para conferir e o upload do plano B.

type Situacao = {
  de: string | null;
  ate: string | null;
  atualizado_em: string | null;
  linhas: number;
  goiania: number;
  anapolis: number;
  go: number;
};

export default function Salarios({ searchParams }: PageProps<"/admin/salarios">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      {searchParams.then((sp) => (
        <Conteudo q={(primeiro(sp.q) ?? "").trim().slice(0, 80)} />
      ))}
    </Suspense>
  );
}

async function Conteudo({ q }: { q: string }) {
  const c = await exigirAdminLocal();
  const agora = await agoraDaRequisicao();
  const { data, error } = await c.rpc("admin_salarios_situacao");
  const semMigracao = error?.code === "PGRST202";
  if (error && !semMigracao) throw new Error(`Publike: falha ao ler os salários (${error.message}).`);
  const s = (data ?? null) as Situacao | null;
  const achadas = q ? buscarOcupacoes(q, 12) : [];
  const { data: faixas } =
    achadas.length && !semMigracao
      ? await c.rpc("admin_salarios_de", { p_cbos: achadas.map((o) => o.cbo) })
      : { data: [] as never[] };
  const porCbo = new Map<string, NonNullable<typeof faixas>>();
  for (const f of faixas ?? []) porCbo.set(f.cbo, [...(porCbo.get(f.cbo) ?? []), f]);

  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Salários do mercado"
        descricao={
          <>
            <Selo variante="novo">Novo</Selo> As faixas de salário por função e região, contadas nos microdados do Novo
            Caged dos 12 últimos meses: só contratações com carteira em Goiás, em jornada integral, sem aprendiz e sem
            intermitente. Aparecem no publicar e no currículo. O robô do GitHub (tarefa “Salários do mercado”) roda toda
            segunda e só carrega quando sai um mês novo.
          </>
        }
      >
        {semMigracao ? (
          <Situacao ok={false}>
            Rode antes a migração <code>20270131120000_salarios_do_mercado.sql</code> no Supabase.
          </Situacao>
        ) : s?.linhas ? (
          <div className="flex flex-col gap-2 text-body-sm">
            <Situacao ok>
              {formatarNumero(s.linhas)} faixas, de {mesCurto(s.de!)} a {mesCurto(s.ate!)}. Última carga{" "}
              {tempoRelativo(s.atualizado_em!, agora)}.
            </Situacao>
            <p className="text-ink-muted">
              Funções com faixa: Goiânia e região, {formatarNumero(s.goiania)}; Anápolis e região,{" "}
              {formatarNumero(s.anapolis)}; Goiás, {formatarNumero(s.go)}. Só entra a função com 30 contratações ou mais
              na região; com menos na praça, vale a de Goiás.
            </p>
          </div>
        ) : (
          <Situacao ok={false}>
            Ainda não há faixas. Para carregar já: no GitHub, Actions › Salários do mercado › Run workflow. Ou rode o
            script no computador e envie o resultado aqui embaixo.
          </Situacao>
        )}
      </Secao>

      {!semMigracao && (
        <Secao
          titulo="Conferir uma função"
          descricao="Busque pelo nome do cargo (“auxiliar de cozinha”, “repositor”): aparecem as ocupações da CBO que mais parecem, com a faixa de cada região."
        >
          <Busca acao="/admin/salarios" valor={q} placeholder="Nome do cargo" />
          {q && !achadas.length && <p className="text-body-sm text-ink-muted">Nenhuma ocupação da CBO parecida.</p>}
          {achadas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-body-sm">
                <thead className="text-caption text-ink-muted">
                  <tr>
                    <th className="px-2 py-2 font-semibold">Ocupação (CBO)</th>
                    <th className="px-2 py-2 font-semibold">Região</th>
                    <th className="px-2 py-2 font-semibold">A maioria paga</th>
                    <th className="px-2 py-2 font-semibold">No meio</th>
                    <th className="px-2 py-2 text-right font-semibold">Contratações</th>
                  </tr>
                </thead>
                <tbody>
                  {achadas.map((o) => {
                    const delas = porCbo.get(o.cbo) ?? [];
                    const nome = (
                      <span className="flex flex-col">
                        <span className="font-semibold">{o.nome}</span>
                        <span className="text-caption text-ink-muted">
                          {o.cbo.slice(0, 4)}-{o.cbo.slice(4)}
                          {o.pelo !== o.nome && ` · “${o.pelo}”`}
                        </span>
                      </span>
                    );
                    if (!delas.length)
                      return (
                        <tr key={o.cbo} className="border-t border-line align-top">
                          <td className="px-2 py-2.5">{nome}</td>
                          <td colSpan={4} className="px-2 py-2.5 text-ink-muted">
                            Sem faixa: menos de 30 contratações em Goiás no período.
                          </td>
                        </tr>
                      );
                    return delas.map((f, i) => (
                      <tr key={`${o.cbo}-${f.regiao}`} className={`align-top ${i === 0 ? "border-t border-line" : ""}`}>
                        <td className="px-2 py-2.5">{i === 0 ? nome : null}</td>
                        <td className="px-2 py-2.5">{nomeDaRegiao(f.regiao as RegiaoSalario)}</td>
                        <td className="px-2 py-2.5 whitespace-nowrap tabular-nums">
                          {reaisDaFaixa(Number(f.p25))} a {reaisDaFaixa(Number(f.p75))}
                        </td>
                        <td className="px-2 py-2.5 whitespace-nowrap tabular-nums">{reaisDaFaixa(Number(f.p50))}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{formatarNumero(f.n)}</td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Secao>
      )}

      {!semMigracao && (
        <Secao
          titulo="Plano B: rodar no computador"
          descricao="Se o robô do GitHub não alcançar o FTP do Ministério, rode o script no seu computador e envie o salarios.json. Ele troca a tabela inteira."
        >
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-body-sm">
            <li>
              No Finder, Ir › Conectar ao Servidor: <code>ftp://ftp.mtps.gov.br</code>. Em{" "}
              <code>pdet/microdados/NOVO CAGED</code>, baixe o <code>CAGEDMOV</code> e o <code>CAGEDFOR</code> de cada
              um dos 12 últimos meses e abra os <code>.7z</code>.
            </li>
            <li>
              Para cada mês, no Terminal, na pasta do Publike:{" "}
              <code>node scripts/salarios/caged.mjs filtrar go-AAAAMM.tsv CAGEDMOVAAAAMM.txt CAGEDFORAAAAMM.txt</code>
            </li>
            <li>
              Depois, com o <code>pracas.json</code> e o <code>ibge.json</code> (veja o começo do script):{" "}
              <code>
                node scripts/salarios/caged.mjs calcular salarios.json --pracas pracas.json --municipios ibge.json
                go-*.tsv
              </code>
            </li>
            <li>Envie o salarios.json aqui:</li>
          </ol>
          <EnviarSalarios />
        </Secao>
      )}
    </div>
  );
}
