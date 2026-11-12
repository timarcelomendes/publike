import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { ConfigImpulsos, ImpulsionarPeloAdmin, PararImpulso, TestarGoogleAds } from "@/components/admin/impulsos";
import { Numero, Secao, Situacao } from "@/components/admin/ui";
import { Aviso, Selo } from "@/components/ui/basicos";
import type { ConfigImpulso, PrecoImpulso } from "@/lib/acoes/admin-impulsos";
import { formatarMoeda, tempoRelativo } from "@/lib/formato";
import { contaDeAnuncios, situacaoGoogleAds } from "@/lib/servidor/google-ads-api";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Impulsos" };

// O impulso da vaga no Google (claude/plano-impulsionar-vaga.md, migração 20270423120000): a ligação com o Google Ads,
// os preços e o que está no ar. O robô (lib/servidor/impulsos.ts) faz o resto sozinho, pela fila.

type Impulso = {
  id: string;
  conta: string;
  conta_id: string;
  anuncio_id: string;
  titulo: string;
  situacao: string;
  origem: "compra" | "credito" | "cortesia" | "admin";
  dias: number;
  valor: number;
  verba: number;
  gasto: number | null;
  campanha_id: string | null;
  criado_em: string;
  aprovado_em: string | null;
  ate: string | null;
  pausar: boolean;
  erro: string | null;
  erro_desde: string | null;
  motivo: string | null;
  sandbox: boolean;
  totais: { impressoes: number; cliques: number; visitas: number; curtidas: number };
};

type Dados = {
  precos: PrecoImpulso[];
  config: ConfigImpulso;
  mes: { entrou: number; verba: number; gasto: number; impulsos: number };
  impulsos: Impulso[];
};

const SITUACAO: Record<string, string> = {
  pago: "Pago, criando",
  em_revisao: "Em revisão no Google",
  no_ar: "No ar",
  encerrado: "Encerrado",
  credito: "Virou crédito",
  devolvido: "Devolvido",
};

const ORIGEM: Record<Impulso["origem"], string> = {
  compra: "Pago",
  credito: "Crédito",
  cortesia: "Grátis",
  admin: "Pelo admin",
};

export default function Impulsos() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  // o admin do computador do dono ou, no site no ar, a equipe publike.org (Admin › Quem vê cada tela)
  const admin = await ehAdminLocal();
  if (!admin && !(await possoVerTela("/admin/impulsos"))) notFound();
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const { data, error } = await c.rpc("admin_impulsos");
  if (error || !data) {
    return (
      <Aviso tipo="alerta" titulo="Rode a migração do impulso">
        Falta rodar no Supabase as migrações do impulso (20270423120000, 20270424120000 e 20270425120000).
      </Aviso>
    );
  }
  const d = data as unknown as Dados;
  const agora = await agoraDaRequisicao();
  const g = situacaoGoogleAds();
  const conta = contaDeAnuncios();
  const algumAVenda = d.precos.some((p) => p.ligado);
  const comErro = d.impulsos.filter((i) => i.erro && ["pago", "em_revisao", "no_ar"].includes(i.situacao));

  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Está tudo ok?"
        descricao="A vaga vira um anúncio na busca do Google, perto do bairro dela. Quem contrata paga; o robô cria, acompanha a revisão, mede e encerra sozinho. Sem a ligação com o Google Ads, o impulso não aparece para ninguém."
      >
        <div className="flex flex-col gap-2">
          <Situacao ok={g.ligado}>
            {g.ligado
              ? `Google Ads ligado na conta ${conta.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")}.`
              : `Falta pôr no servidor: ${g.falta.join(", ")}.`}
          </Situacao>
          <Situacao ok={algumAVenda}>
            {algumAVenda ? "Há impulso à venda." : "Nenhum impulso à venda: ligue um preço abaixo."}
          </Situacao>
          <Situacao ok={comErro.length === 0}>
            {comErro.length === 0
              ? "Nenhum impulso travado."
              : `${comErro.length} ${comErro.length === 1 ? "impulso travado" : "impulsos travados"}: o robô tenta de novo sozinho (veja a tabela).`}
          </Situacao>
        </div>
        {g.ligado && <TestarGoogleAds />}
        {!g.ligado && (
          <ol className="flex max-w-2xl list-decimal flex-col gap-1 pl-5 text-body-sm text-ink-muted">
            <li>No Google Cloud do Publike, ative a Google Ads API e peça o acesso Explorer (vem na hora).</li>
            <li>
              Gere o refresh token com o escopo https://www.googleapis.com/auth/adwords, entrando com a conta dona do Google
              Ads.
            </li>
            <li>Na Vercel, ponha GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN e GOOGLE_ADS_CONTA.</li>
          </ol>
        )}
      </Secao>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Numero rotulo="Impulsos no mês" valor={d.mes.impulsos} />
        <Numero rotulo="Entrou no mês (R$)" valor={Math.round(d.mes.entrou)} />
        <Numero rotulo="Separado para o Google (R$)" valor={Math.round(d.mes.verba)} />
        <Numero
          rotulo="Gasto no Google (R$)"
          valor={Math.round(d.mes.gasto)}
          detalhe={d.mes.entrou > 0 ? `Sobra ${formatarMoeda(d.mes.entrou - d.mes.gasto)}` : undefined}
        />
      </div>

      <Secao
        titulo="Impulsionar grátis para um cliente"
        descricao="Para ver o retorno: escolha a vaga de qualquer cliente e o Publike paga o anúncio. Não gasta o impulso grátis do cliente e, se a vaga sair do ar, os dias que faltam não viram crédito."
      >
        {g.ligado ? (
          <ImpulsionarPeloAdmin verbaPadrao={d.precos.find((p) => p.dias === 7)?.verba ?? 30} />
        ) : (
          <p className="text-body-sm text-ink-muted">Ligue o Google Ads primeiro (veja acima).</p>
        )}
      </Secao>

      <Secao titulo="Preços e regras" descricao="Os preços valem para as próximas compras; quem já pagou fica como comprou.">
        <ConfigImpulsos precos={d.precos} config={d.config} />
      </Secao>

      <Secao titulo="Os últimos impulsos" descricao="Os 100 mais recentes.">
        {d.impulsos.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Nenhum impulso ainda.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[66rem] text-left text-body-sm">
              <thead className="text-ink-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-2 font-normal sm:pl-6">Vaga</th>
                  <th className="px-3 py-2 font-normal">Situação</th>
                  <th className="px-3 py-2 font-normal">Tipo</th>
                  <th className="px-3 py-2 text-right font-normal">Gasto</th>
                  <th className="px-3 py-2 text-right font-normal">Vistas</th>
                  <th className="px-3 py-2 text-right font-normal">Cliques</th>
                  <th className="px-3 py-2 text-right font-normal">Curtidas</th>
                  <th className="px-3 py-2 font-normal">Quando</th>
                  <th className="relative px-5 py-2 font-normal sm:pr-6">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.impulsos.map((i) => (
                  <tr key={i.id} className="border-b border-line align-top last:border-0">
                    <td className="min-w-56 px-5 py-3 sm:pl-6">
                      <Link href={`/anuncio/${i.anuncio_id}`} className="text-label hover:underline">
                        {i.titulo}
                      </Link>
                      <span className="block text-ink-muted">{i.conta}</span>
                      {(i.erro || i.motivo) && (
                        <span className="mt-1 block max-w-md text-danger">
                          {i.erro ?? i.motivo}
                          {i.erro_desde && ` (desde ${tempoRelativo(i.erro_desde, agora)})`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1 whitespace-nowrap">
                        <Selo variante={i.situacao === "no_ar" ? "match" : i.situacao === "devolvido" ? "aviso" : "neutro"}>
                          {SITUACAO[i.situacao] ?? i.situacao}
                        </Selo>
                        {i.pausar && <Selo variante="novo">Parando</Selo>}
                        {i.sandbox && <Selo variante="contorno">Teste</Selo>}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {ORIGEM[i.origem]}, {i.dias} dias
                      <span className="block text-ink-muted">
                        {i.origem === "compra" ? `${formatarMoeda(i.valor)}, ` : ""}até {formatarMoeda(i.verba)} no Google
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatarMoeda(Number(i.gasto ?? 0))}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{i.totais.impressoes}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{i.totais.cliques}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{i.totais.curtidas}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-ink-muted">
                      {tempoRelativo(i.criado_em, agora)}
                      {i.ate && i.situacao === "no_ar" && (
                        <span className="block">até {new Date(i.ate).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 sm:pr-6">
                      {["pago", "em_revisao", "no_ar"].includes(i.situacao) && !i.pausar && (
                        <PararImpulso id={i.id} noAr={i.situacao === "no_ar"} />
                      )}
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
