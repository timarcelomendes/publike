import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Numero, Secao } from "@/components/admin/ui";
import { Aviso, Vazio } from "@/components/ui/basicos";
import { formatarDataHora, formatarNumero } from "@/lib/formato";
import { mesCurto } from "@/lib/salarios";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Base da Receita" };

// A base de empresas da Receita (claude/plano-base-de-empresas-da-receita.md, parte 0; migração 20270602120000): o que
// o robô do GitHub carregou no último mês. No computador do dono e, no site no ar, para a equipe publike.org.

type Carga = {
  mes: string;
  situacao: "carregando" | "pronta";
  comecou_em: string;
  terminou_em: string | null;
  estabelecimentos: number;
  resumo: Record<string, number>;
};
type Resumo = {
  cargas: Carga[];
  ativas: number;
  na_praca: number;
  com_ponto: number;
  agencias: number;
  abertas_60_dias: number;
  por_cidade: { cidade: string; quantas: number }[];
  meis: number;
  meis_60_dias: number;
  meis_na_base: number;
  agencias_mei: number;
  ramos_funcoes: number;
  ramos_com_nome: number;
};

export default function Receita() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

const pct = (parte: number, todo: number) => (todo ? `${Math.round((parte / todo) * 100)}%` : "—");

async function Conteudo() {
  const admin = await ehAdminLocal();
  if (!admin && !(await possoVerTela("/admin/receita"))) notFound();
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const { data, error } = await c.rpc("admin_empresas_receita");
  if (error) {
    return (
      <Aviso tipo="alerta" titulo="Rode a migração da base da Receita">
        Falta a migração 20270602120000_empresas_da_receita.sql neste banco.
      </Aviso>
    );
  }
  const r = data as unknown as Resumo;
  const ultima = r.cargas[0];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2">Base da Receita</h1>
        <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
          As empresas abertas nas cidades das praças e as agências de RH de Goiás, dos dados abertos do CNPJ. O robô
          carrega todo mês. O MEI entra marcado, sem rua nem número, e só aparece para a equipe.
        </p>
      </div>

      {!ultima ? (
        <Vazio icone={Building2} titulo="Nenhuma carga ainda">
          Rode o robô em GitHub › Actions › Empresas da Receita › Run workflow.
        </Vazio>
      ) : (
        <>
          {ultima.situacao === "carregando" && (
            <Aviso tipo="info" titulo={`Carregando ${mesCurto(ultima.mes)}`}>
              Começou {formatarDataHora(ultima.comecou_em)}. Os números abaixo ainda não estão completos.
            </Aviso>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Numero rotulo="Empresas ativas" valor={r.ativas} detalhe={`${formatarNumero(r.na_praca)} nas praças, fora o MEI`} />
            <Numero
              rotulo="No mapa"
              valor={r.com_ponto}
              detalhe={`${pct(r.com_ponto, r.ativas)} com ponto (número ou CEP)`}
            />
            <Numero rotulo="Abriram em 60 dias" valor={r.abertas_60_dias} detalhe="nas praças, fora o MEI" />
            <Numero
              rotulo="Agências de RH"
              valor={r.agencias}
              detalhe={`Goiás inteiro; ${formatarNumero(r.agencias_mei ?? 0)} são MEI`}
            />
            <Numero
              rotulo="MEI na base"
              valor={r.meis_na_base ?? 0}
              detalhe={`${formatarNumero(r.meis_60_dias)} abertos em 60 dias; sem rua nem número, só para a equipe`}
            />
            <Numero
              rotulo="Ramo × função (Caged)"
              valor={r.ramos_funcoes}
              detalhe={r.ramos_funcoes ? "o que cada ramo contrata" : "vem com o robô dos salários"}
            />
            <Numero rotulo="Ramos com nome" valor={r.ramos_com_nome} detalhe="a tabela de CNAE" />
          </div>

          <Secao titulo="Por cidade" descricao="As empresas ativas nas cidades das praças.">
            <ul className="grid gap-x-6 gap-y-1 text-body-sm sm:grid-cols-2 lg:grid-cols-3">
              {r.por_cidade.map((x) => (
                <li key={x.cidade} className="flex justify-between gap-3 border-b border-line py-1">
                  <span>{x.cidade}</span>
                  <span className="tabular-nums text-ink-muted">{formatarNumero(x.quantas)}</span>
                </li>
              ))}
            </ul>
          </Secao>

          <Secao titulo="Cargas" descricao="Cada mês que o robô carregou.">
            <ul className="flex flex-col gap-2 text-body-sm">
              {r.cargas.map((g) => (
                <li key={g.mes} className="flex flex-wrap justify-between gap-2 border-b border-line py-1">
                  <span>
                    {mesCurto(g.mes)} · {g.situacao === "pronta" ? "pronta" : "carregando"}
                  </span>
                  <span className="text-ink-muted">
                    {formatarNumero(g.estabelecimentos)} ativas
                    {g.resumo?.fora ? `, ${formatarNumero(g.resumo.fora)} saíram` : ""}
                    {g.terminou_em ? ` · ${formatarDataHora(g.terminou_em)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Secao>
        </>
      )}
    </div>
  );
}
