import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { PrepararMaterias } from "@/components/admin/preparar-materias";
import { Numero, Secao } from "@/components/admin/ui";
import { Aviso, Vazio } from "@/components/ui/basicos";
import { classesBotao } from "@/components/ui/botao";
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
  /** quando o robô contou (migração 20270725120000; antes dela, a conta era na hora) */
  calculado_em?: string | null;
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
    // só a função que não existe é migração faltando; o resto (o tempo do banco, por exemplo) diz o que foi
    if (error.code === "PGRST202") {
      return (
        <Aviso tipo="alerta" titulo="Rode a migração da base da Receita">
          Falta a migração 20270602120000_empresas_da_receita.sql neste banco.
        </Aviso>
      );
    }
    console.error(`Publike: o resumo da Base da Receita não abriu: ${error.code} ${error.message}`);
    return (
      <Aviso tipo="alerta" titulo="O resumo da Base da Receita não abriu">
        {error.code === "57014"
          ? "O banco demorou demais para contar a base. Tente de novo em alguns segundos."
          : `O banco respondeu: ${error.message}`}
      </Aviso>
    );
  }
  const r = data as unknown as Resumo;
  const ultima = r.cargas[0];
  // a rota do currículo e o mês passado (migração 20270606120000; sem ela, a seção não aparece)
  const [{ data: dRota }, { data: dMes }] = await Promise.all([
    c.rpc("admin_numeros_da_rota"),
    c.rpc("admin_numeros_do_mes_receita", { p_mes: null }),
  ]);
  const rota = dRota as unknown as Record<string, number> | null;
  const mes = dMes as unknown as { mes: string; por_cidade: { cidade: string; empresas: number; meis: number }[] } | null;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2">Base da Receita</h1>
        <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
          As empresas abertas nas cidades das praças e as agências de RH de Goiás, dos dados abertos do CNPJ. O robô
          carrega todo mês. O MEI entra marcado, sem rua nem número, e só aparece para a equipe.
        </p>
        {r.calculado_em && (
          <p className="mt-1 text-body-sm text-ink-muted">
            Números contados em {formatarDataHora(r.calculado_em)}; o robô reconta a cada 6 horas e depois de cada carga.
          </p>
        )}
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

          {rota && (
            <Secao
              titulo="Quem contrata perto"
              descricao="Quem montou a rota, as cópias entregues, os QR codes abertos e os comércios que publicaram vaga depois de abrir."
            >
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Numero rotulo="Rotas montadas" valor={rota.rotas} detalhe={`${formatarNumero(rota.rotas_7_dias)} nos últimos 7 dias, de ${formatarNumero(rota.pessoas)} pessoas`} />
                <Numero rotulo="Cópias" valor={rota.copias} detalhe={`${formatarNumero(rota.entregues)} marcadas como entregues`} />
                <Numero rotulo="QR codes abertos" valor={rota.abertas} detalhe={`${pct(rota.abertas, rota.copias)} das cópias`} />
                <Numero rotulo="Publicaram vaga" valor={rota.publicaram} detalhe="depois de abrir o QR (pelo CNPJ da conta)" />
                <Numero rotulo="Alguém te chamou?" valor={rota.chamaram} detalhe={`responderam "sim", de ${formatarNumero(rota.responderam)} respostas`} />
              </div>
            </Secao>
          )}

          {mes && (
            <Secao
              titulo={`As matérias de ${mesCurto(mes.mes)}`}
              descricao="Os negócios que abriram no mês (fora o MEI) e o que mais contratou, pelo Caged. A IA escreve a partir dos números e as duas entram como rascunho em Admin › Notícias."
            >
              {mes.por_cidade.length ? (
                <ul className="grid gap-x-6 gap-y-1 text-body-sm sm:grid-cols-2">
                  {mes.por_cidade.slice(0, 8).map((x) => (
                    <li key={x.cidade} className="flex justify-between gap-3 border-b border-line py-1">
                      <span>{x.cidade}</span>
                      <span className="tabular-nums text-ink-muted">
                        {formatarNumero(x.empresas)} {x.empresas === 1 ? "empresa" : "empresas"}, {formatarNumero(x.meis)} MEI
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-sm text-ink-muted">Nenhuma abertura no mês na base ainda.</p>
              )}
              <div className="flex flex-wrap items-start gap-3">
                <PrepararMaterias mes={mes.mes} />
                {mes.por_cidade.length > 0 && (
                  <a href="/admin/receita/story?baixar=1" className={classesBotao("secundario")}>
                    Baixar o story
                  </a>
                )}
              </div>
            </Secao>
          )}

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
