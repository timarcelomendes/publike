import { Megaphone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LinhaAnuncio } from "@/components/admin/linha-anuncio";
import { Busca, Filtros, linkCom, Paginacao } from "@/components/admin/ui";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { Aviso, Vazio } from "@/components/ui/basicos";
import { listarAnuncios, POR_PAGINA } from "@/lib/admin/dados";
import { formatarNumero, primeiro } from "@/lib/formato";
import { acessoDaEquipe } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Anúncios" };

const STATUS = [
  { valor: "todos", nome: "Todos" },
  { valor: "ativo", nome: "No ar" },
  { valor: "denunciados", nome: "Com denúncia" },
  { valor: "em_analise", nome: "Em análise" },
  { valor: "retidos_ia", nome: "Retidos pela IA" },
  { valor: "removido", nome: "Removidos" },
  { valor: "pausado", nome: "Pausados" },
  { valor: "expirado", nome: "Expirados" },
  { valor: "encerrado", nome: "Encerrados" },
];

const TIPOS = [
  { valor: "todos", nome: "Vagas e serviços" },
  { valor: "vaga", nome: "Vagas" },
  { valor: "servico", nome: "Serviços" },
];

export default function Anuncios({ searchParams }: PageProps<"/admin/anuncios">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/anuncios">["searchParams"] }) {
  const acesso = await acessoDaEquipe();
  if (!acesso) notFound();
  const sp = await searchParams;
  const q = (primeiro(sp.q) ?? "").trim().slice(0, 80);
  const pedidoStatus = primeiro(sp.status) ?? "todos";
  const status = STATUS.some((s) => s.valor === pedidoStatus) ? pedidoStatus : "todos";
  const pedidoTipo = primeiro(sp.tipo) ?? "todos";
  const tipo = pedidoTipo === "vaga" || pedidoTipo === "servico" ? pedidoTipo : "todos";
  const pagina = Math.max(1, Math.floor(Number(primeiro(sp.pagina))) || 1);
  const [{ itens, total }, agora] = await Promise.all([
    listarAnuncios(acesso.cliente, {
      busca: q || null,
      status,
      tipo: tipo === "todos" ? null : tipo,
      autor: null,
      pagina,
    }),
    agoraDaRequisicao(),
  ]);
  const atuais = { q: q || null, status: status === "todos" ? null : status, tipo: tipo === "todos" ? null : tipo };

  return (
    <div className="flex flex-col gap-4">
      {primeiro(sp.excluido) === "1" && <Aviso tipo="sucesso" titulo="Anúncio apagado." />}
      <Busca acao="/admin/anuncios" valor={q} placeholder="Título, palavra ou código do anúncio" ocultos={{ status: atuais.status, tipo: atuais.tipo }} />
      <Filtros
        rotulo="Situação do anúncio"
        opcoes={STATUS}
        atual={status}
        link={(v) => linkCom("/admin/anuncios", atuais, { status: v === "todos" ? null : v, pagina: null })}
      />
      <Filtros
        rotulo="Tipo de anúncio"
        opcoes={TIPOS}
        atual={tipo}
        link={(v) => linkCom("/admin/anuncios", atuais, { tipo: v === "todos" ? null : v, pagina: null })}
      />
      <p className="text-body-sm text-ink-muted" aria-live="polite">
        {total === 1 ? "1 anúncio" : `${formatarNumero(total)} anúncios`}
        {q && ` para “${q}”`}
      </p>
      {itens.length === 0 ? (
        <Vazio icone={Megaphone} titulo="Nenhum anúncio aqui">
          Tente outra busca ou outro filtro.
        </Vazio>
      ) : (
        <ul className="flex flex-col gap-2">
          {itens.map((a) => (
            <LinhaAnuncio key={a.id} a={a} agora={agora} linkAutor={acesso.admin} />
          ))}
        </ul>
      )}
      <Paginacao
        pagina={pagina}
        total={total}
        porPagina={POR_PAGINA}
        link={(p) => linkCom("/admin/anuncios", atuais, { pagina: p > 1 ? String(p) : null })}
      />
    </div>
  );
}
