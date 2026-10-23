import { MessageCircleHeart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Filtros, linkCom, Secao } from "@/components/admin/ui";
import { Vazio } from "@/components/ui/basicos";
import { inicioDeHoje, matchesRecentes, type MatchAdmin } from "@/lib/admin/dados";
import { formatarNumero, primeiro, rotuloConta, tempoRelativo } from "@/lib/formato";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Matches" };

// Quem deu match com quem: a pessoa que curtiu, o anúncio e quem publicou (só no admin, no
// computador do dono). Cada nome leva à ficha da conta ou do anúncio no admin.

const PERIODOS = [
  { valor: "hoje", nome: "Hoje" },
  { valor: "7", nome: "7 dias" },
  { valor: "30", nome: "30 dias" },
  { valor: "tudo", nome: "Tudo" },
];

const DIA = 24 * 60 * 60 * 1000;

export default function Matches({ searchParams }: PageProps<"/admin/matches">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/matches">["searchParams"] }) {
  const c = await exigirAdminLocal();
  const sp = await searchParams;
  const pedido = primeiro(sp.periodo) ?? "7";
  const periodo = PERIODOS.some((p) => p.valor === pedido) ? pedido : "7";
  const agora = await agoraDaRequisicao();
  const desde =
    periodo === "tudo"
      ? null
      : periodo === "hoje"
        ? inicioDeHoje(agora)
        : new Date(agora - Number(periodo) * DIA).toISOString();
  const matches = await matchesRecentes(c, desde);
  const nome = PERIODOS.find((p) => p.valor === periodo)?.nome.toLowerCase();

  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Matches"
        descricao="Quem curtiu, o anúncio e quem publicou, do mais novo para o mais antigo. O match é quando quem publicou aceita a curtida (ou na hora, no contato direto)."
      >
        <Filtros
          rotulo="Período"
          opcoes={PERIODOS}
          atual={periodo}
          link={(v) => linkCom("/admin/matches", {}, { periodo: v === "7" ? null : v })}
        />
        {matches.length === 0 ? (
          <Vazio icone={MessageCircleHeart} titulo="Nenhum match neste período">
            Quando quem publicou aceitar uma curtida, o match aparece aqui.
          </Vazio>
        ) : (
          <>
            <p className="text-body-sm text-ink-muted">
              {formatarNumero(matches.length)} {matches.length === 1 ? "match" : "matches"}
              {periodo === "tudo" ? "" : periodo === "hoje" ? " hoje" : ` em ${nome}`}
              {matches.length >= 300 ? " (os 300 mais novos)" : ""}.
            </p>
            <Tabela linhas={matches} agora={agora} />
          </>
        )}
      </Secao>
    </div>
  );
}

function Conta({ c }: { c: { id: string; nome: string; tipo: string } | null }) {
  if (!c) return <span className="text-ink-muted">Conta excluída</span>;
  return (
    <span className="flex min-w-0 flex-col">
      <Link href={`/admin/usuarios/${c.id}`} className="font-medium underline-offset-2 hover:underline">
        {c.nome}
      </Link>
      <span className="text-caption text-ink-muted">{rotuloConta(c.tipo)}</span>
    </span>
  );
}

function Tabela({ linhas, agora }: { linhas: MatchAdmin[]; agora: number }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[44rem] text-left text-body-sm">
        <thead className="text-label text-ink-muted">
          <tr className="border-b border-line">
            <th scope="col" className="py-2 pr-3 font-medium">
              Quando
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Quem curtiu
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Anúncio
            </th>
            <th scope="col" className="py-2 font-medium">
              Quem publicou
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {linhas.map((m, i) => (
            <tr key={`${m.anuncio?.id ?? "x"}-${m.curtiu?.id ?? i}`} className="align-top">
              <td
                className="py-2 pr-3 whitespace-nowrap text-ink-muted"
                title={new Date(m.quando).toLocaleString("pt-BR")}
              >
                {tempoRelativo(m.quando, agora)}
              </td>
              <td className="py-2 pr-3">
                <Conta c={m.curtiu} />
              </td>
              <td className="py-2 pr-3">
                {m.anuncio ? (
                  <span className="flex min-w-0 flex-col">
                    <Link
                      href={`/admin/anuncios/${m.anuncio.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {m.anuncio.titulo}
                    </Link>
                    <span className="text-caption text-ink-muted">
                      {m.anuncio.tipo === "servico" ? "Serviço" : "Vaga"}
                    </span>
                  </span>
                ) : (
                  <span className="text-ink-muted">Anúncio excluído</span>
                )}
              </td>
              <td className="py-2">
                <Conta c={m.publicou} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
