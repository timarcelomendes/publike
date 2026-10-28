import { Building2, ChevronDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AcoesDaEmpresa, ParRepetido } from "@/components/admin/empresas";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Busca, Filtros, linkCom, Paginacao, Secao, Situacao } from "@/components/admin/ui";
import { Avatar, Aviso, Selo, Vazio } from "@/components/ui/basicos";
import {
  empresasRepetidas,
  FILTROS_EMPRESAS,
  listarEmpresasDoAdmin,
  resumoDasEmpresas,
  type FiltroEmpresas,
  type ResumoEmpresas,
} from "@/lib/admin/dados";
import { formatarNumero, plural, primeiro } from "@/lib/formato";
import { exigirAdminLocal } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Empresas" };

// O cadastro de empresas (parte A do plano dos colegas de trabalho; migração 20261209120000_empresas_catalogo.sql):
// cada empresa uma vez, com os jeitos de escrever o nome. O admin junta as repetidas, marca o que não é empresa e
// liga ao perfil da empresa no Publike. Em cima, o número que decide a parte B (os colegas).

const POR_PAGINA = 50;
const NOMES_FILTROS: Record<FiltroEmpresas, string> = {
  todas: "Todas",
  sem_conta: "Sem conta no Publike",
  com_conta: "Com conta no Publike",
  nao_empresa: "Não é empresa",
};
/** a parte B (colegas de trabalho) começa quando pelo menos esta parte dos currículos teria um colega */
const REGUA_DA_PARTE_B = 0.1;

export default function Empresas({ searchParams }: PageProps<"/admin/empresas">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      {searchParams.then((sp) => {
        const f = primeiro(sp.f);
        const filtro: FiltroEmpresas = (FILTROS_EMPRESAS as readonly string[]).includes(f ?? "")
          ? (f as FiltroEmpresas)
          : "todas";
        const pagina = Math.max(1, Number(primeiro(sp.p)) || 1);
        return <Conteudo busca={primeiro(sp.q)?.slice(0, 80) ?? ""} filtro={filtro} pagina={pagina} />;
      })}
    </Suspense>
  );
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((100 * n) / d)}%` : "—");

function NumeroDaParteB({ r }: { r: ResumoEmpresas }) {
  const parte = r.curriculos > 0 ? r.com_colega / r.curriculos : 0;
  const passou = parte >= REGUA_DA_PARTE_B;
  return (
    <Secao
      titulo="Colegas de trabalho: dá para começar?"
      descricao="Quantos currículos teriam pelo menos um possível colega pelas regras da parte B: uma empresa em comum, sem contar o emprego atual; em empresa com 30 pessoas ou mais no Publike, só com a mesma época ou a mesma unidade. Só o número, sem nomes."
    >
      <div className="flex flex-col gap-1">
        <span className="font-display text-h1">{pct(r.com_colega, r.curriculos)}</span>
        <span className="text-body-sm text-ink-muted">
          {formatarNumero(r.com_colega)} de {plural(r.curriculos, "currículo", "currículos")}
        </span>
      </div>
      <Situacao ok={passou}>
        {passou
          ? "Passou de 10% dos currículos: dá para seguir para a parte B (o piloto dos colegas)."
          : "Abaixo de 10% dos currículos: a parte B espera a base crescer, senão a aba Colegas ficaria quase vazia."}
      </Situacao>
      <dl className="grid grid-cols-2 gap-3 text-body-sm sm:grid-cols-3 lg:grid-cols-5">
        {[
          ["Empresas no cadastro", formatarNumero(r.empresas)],
          ["Com conta no Publike", formatarNumero(r.com_conta)],
          ["Não é empresa", formatarNumero(r.nao_empresas)],
          ["Currículos com empresa", `${formatarNumero(r.curriculos_com_empresa)} de ${formatarNumero(r.curriculos)}`],
          ["Trabalhos já juntos", pct(r.trabalhos_juntos, r.trabalhos_em_empresa)],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="flex flex-col">
            <dt className="text-ink-muted">{rotulo}</dt>
            <dd className="font-display text-h3">{valor}</dd>
          </div>
        ))}
      </dl>
      <p className="text-body-sm text-ink-muted">
        Trabalhos já juntos: os trabalhos numa empresa que está em 2 currículos ou mais. Juntar as repetidas aqui
        embaixo faz esse número (e o de cima) subir.
        {r.grandes > 0 && ` ${plural(r.grandes, "empresa tem", "empresas têm")} 30 pessoas ou mais.`}
      </p>
    </Secao>
  );
}

async function Conteudo({ busca, filtro, pagina }: { busca: string; filtro: FiltroEmpresas; pagina: number }) {
  const c = await exigirAdminLocal();
  const resumo = await resumoDasEmpresas(c);
  if (!resumo) {
    return (
      <Aviso tipo="alerta" titulo="Falta a migração">
        Rode a migração 20261209120000_empresas_catalogo.sql para ver o cadastro de empresas.
      </Aviso>
    );
  }
  const [repetidas, lista] = await Promise.all([
    empresasRepetidas(c),
    listarEmpresasDoAdmin(c, { busca, filtro, pagina, limite: POR_PAGINA }),
  ]);
  const atuais = { q: busca || null, f: filtro === "todas" ? null : filtro };

  return (
    <div className="flex flex-col gap-6">
      <NumeroDaParteB r={resumo} />

      {repetidas.length > 0 && (
        <Secao
          titulo="Podem ser a mesma empresa"
          descricao="Nomes parecidos, ou um que começa com o outro. Juntar leva os currículos e os jeitos de escrever para a que fica; a com conta no Publike fica sempre."
        >
          <ul className="flex flex-col gap-3">
            {repetidas.map((par) => (
              <ParRepetido key={`${par.a.id}-${par.b.id}`} par={par} />
            ))}
          </ul>
        </Secao>
      )}

      <Secao
        titulo="Empresas"
        descricao="Cada empresa uma vez, das mais citadas nos currículos para as menos. O nome vem do perfil da empresa ou do primeiro currículo que escreveu."
      >
        <Busca acao="/admin/empresas" valor={busca} placeholder="Procurar pelo nome" ocultos={{ f: atuais.f }} />
        <Filtros
          rotulo="Filtrar empresas"
          opcoes={FILTROS_EMPRESAS.map((v) => ({ valor: v, nome: NOMES_FILTROS[v] }))}
          atual={filtro}
          link={(v) => linkCom("/admin/empresas", atuais, { f: v === "todas" ? null : v, p: null })}
        />
        <p className="text-body-sm text-ink-muted">{plural(lista.total, "empresa", "empresas")}</p>
        {lista.itens.length === 0 ? (
          <Vazio icone={Building2} titulo="Nenhuma empresa aqui">
            {busca ? "Tente outro nome." : "As empresas aparecem quando alguém salva o currículo com onde trabalhou."}
          </Vazio>
        ) : (
          <ul className="flex flex-col">
            {lista.itens.map((e) => (
              <li key={e.id} className="border-t border-line py-3 first:border-t-0">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
                    {e.perfil ? (
                      <Avatar nome={e.perfil.nome} foto={e.perfil.foto_url} tamanho={32} forma="quadrada" />
                    ) : (
                      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-300">
                        <Building2 className="size-4 text-ink-muted" />
                      </span>
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-label">{e.nome}</span>
                        {e.perfil && <Selo variante="match">Com conta</Selo>}
                        {e.tipo === "nao_empresa" && <Selo variante="contorno">Não é empresa</Selo>}
                      </span>
                      <span className="text-body-sm text-ink-muted">
                        {plural(e.pessoas, "currículo", "currículos")}
                        {e.nomes.length > 0 &&
                          ` · também escrito ${e.nomes
                            .slice(0, 3)
                            .map((n) => `“${n}”`)
                            .join(", ")}`}
                        {e.nomes.length > 3 && ` e mais ${e.nomes.length - 3}`}
                      </span>
                    </span>
                    <span className="inline-flex min-h-10 shrink-0 items-center gap-1 text-label text-ink-muted group-open:text-ink">
                      Mudar
                      <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  <AcoesDaEmpresa e={e} />
                  {e.perfil && (
                    <Link
                      href={`/admin/usuarios/${e.perfil.id}`}
                      className="mt-3 inline-block text-body-sm underline underline-offset-2"
                    >
                      Abrir a conta da empresa no admin
                    </Link>
                  )}
                </details>
              </li>
            ))}
          </ul>
        )}
        <Paginacao
          pagina={pagina}
          total={lista.total}
          porPagina={POR_PAGINA}
          link={(p) => linkCom("/admin/empresas", atuais, { p: p > 1 ? String(p) : null })}
        />
      </Secao>
    </div>
  );
}
