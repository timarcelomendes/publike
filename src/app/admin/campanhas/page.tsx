import { Megaphone } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Filtros, linkCom, Secao } from "@/components/admin/ui";
import { Vazio } from "@/components/ui/basicos";
import { origensDasContas, type OrigemContas } from "@/lib/admin/dados";
import { formatarDataCurta, formatarNumero, primeiro } from "@/lib/formato";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Campanhas" };

const PERIODOS = [
  { valor: "7", nome: "7 dias" },
  { valor: "30", nome: "30 dias" },
  { valor: "tudo", nome: "Tudo" },
];

const DIA = 24 * 60 * 60 * 1000;

export default function Campanhas({ searchParams }: PageProps<"/admin/campanhas">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/campanhas">["searchParams"] }) {
  const c = await exigirAdminLocal();
  const sp = await searchParams;
  const pedido = primeiro(sp.periodo) ?? "7";
  const periodo = PERIODOS.some((p) => p.valor === pedido) ? pedido : "7";
  const agora = await agoraDaRequisicao();
  const desde = periodo === "tudo" ? null : new Date(agora - Number(periodo) * DIA).toISOString();
  const linhas = await origensDasContas(c, desde);
  const campanhas = linhas.filter((l) => l.origem !== "direto");
  const direto = linhas.find((l) => l.origem === "direto");

  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Contas por campanha"
        descricao={
          <>
            Conta nova que chegou pelo link de um anúncio com <code>?utm_source=google&amp;utm_campaign=servicos</code>{" "}
            aparece aqui como <strong>google:servicos</strong>. Anúncio do Google sem utm (só a marcação automática do
            Google Ads) aparece como <strong>google-ads</strong>, com o número da campanha. Divida o gasto da campanha
            pelas contas que publicaram e você tem o custo de cada vaga ou vitrine. Quem abriu o link do e-mail em outro
            navegador entra como “direto”.
          </>
        }
      >
        <Filtros
          rotulo="Período"
          opcoes={PERIODOS}
          atual={periodo}
          link={(v) => linkCom("/admin/campanhas", {}, { periodo: v === "7" ? null : v })}
        />
        {campanhas.length === 0 ? (
          <Vazio icone={Megaphone} titulo="Nenhuma conta de campanha neste período">
            Quando alguém criar a conta depois de clicar num anúncio com utm no link, ela aparece aqui.
          </Vazio>
        ) : (
          <Tabela linhas={campanhas} />
        )}
        {direto && (
          <p className="text-body-sm text-ink-muted">
            Sem campanha no período: {formatarNumero(direto.contas)} {direto.contas === 1 ? "conta" : "contas"},{" "}
            {formatarNumero(direto.publicaram_servico)} com serviço e {formatarNumero(direto.publicaram_vaga)} com vaga.
          </p>
        )}
      </Secao>
    </div>
  );
}

function Tabela({ linhas }: { linhas: OrigemContas[] }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[40rem] text-left text-body-sm">
        <thead className="text-label text-ink-muted">
          <tr className="border-b border-line">
            <th scope="col" className="py-2 pr-3 font-medium">
              Campanha
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Contas novas
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Com serviço
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Com vaga
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Anúncios no ar
            </th>
            <th scope="col" className="py-2 font-medium">
              Período
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {linhas.map((l) => (
            <tr key={l.origem}>
              <th scope="row" className="py-2 pr-3 font-medium">
                {l.origem}
              </th>
              <td className="py-2 pr-3 text-right tabular-nums">{formatarNumero(l.contas)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatarNumero(l.publicaram_servico)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatarNumero(l.publicaram_vaga)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatarNumero(l.anuncios_no_ar)}</td>
              <td className="py-2 whitespace-nowrap text-ink-muted">
                {formatarDataCurta(l.primeira)}
                {formatarDataCurta(l.ultima) !== formatarDataCurta(l.primeira) && ` a ${formatarDataCurta(l.ultima)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
