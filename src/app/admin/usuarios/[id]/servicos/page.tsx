import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { FormServicos, type ValoresServicos } from "@/components/form-servicos";
import { Aviso } from "@/components/ui/basicos";
import { salvarServicosEmNomeDe } from "@/lib/acoes/admin-contas";
import { fichaUsuario } from "@/lib/admin/dados";
import { regiaoDoBairro } from "@/lib/regioes";
import { contatoDiretoDosServicos } from "@/lib/servidor/contato-direto";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Vitrine de serviços da conta" };

export default function ServicosEmNomeDe({ params }: PageProps<"/admin/usuarios/[id]/servicos">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/admin/usuarios/[id]/servicos">["params"] }) {
  const c = await exigirAdminLocal();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const u = await fichaUsuario(c, id);
  if (!u) notFound();

  const voltar = (
    <Link
      href={`/admin/usuarios/${id}`}
      className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink"
    >
      <ArrowLeft aria-hidden className="size-4" />
      Voltar à conta
    </Link>
  );
  if (!u.perfil) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        {voltar}
        <Aviso tipo="alerta" titulo="Esta conta ainda não tem perfil">
          Sem perfil (nome, tipo e WhatsApp), não dá para montar a vitrine.
        </Aviso>
      </div>
    );
  }

  const [{ data: servicos, error }, direto] = await Promise.all([
    c.rpc("admin_servicos_de", { p_usuario: id }),
    contatoDiretoDosServicos(c, id),
  ]);
  if (error) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        {voltar}
        <Aviso tipo="erro" titulo="Não deu para abrir os serviços da conta">
          Confira se a migração 20261015180000_servicos_pelo_admin.sql já rodou no Supabase.
        </Aviso>
      </div>
    );
  }

  const p = u.perfil;
  const lista = servicos ?? [];
  // o que é igual para todos (onde fica, onde atende, quando) vem do primeiro serviço, como em "Meus serviços"
  const base = lista.find((s) => s.status !== "em_analise" && s.status !== "removido") ?? lista[0];
  const regiao = regiaoDoBairro(p.cidade, p.bairro ?? "");
  const inicial: ValoresServicos = {
    servicos: lista.map((s) => ({
      id: s.id,
      oficio: s.oficio,
      categoria: s.categoria,
      titulo: s.titulo,
      descricao: s.descricao,
      pagamento_valor: s.pagamento_valor,
      pagamento_unidade: s.pagamento_unidade,
      fotos: s.fotos,
      status: s.status,
    })),
    cidade: base?.cidade ?? p.cidade,
    bairro: base?.bairro ?? p.bairro ?? "",
    lat: base?.lat ?? null,
    lng: base?.lng ?? null,
    atende: base?.atende.length ? base.atende : [regiao ? `Goiânia: ${regiao}` : p.cidade],
    horario: base?.horario ?? null,
    contato_direto: direto ?? true,
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {voltar}
      <h2 className="text-h2">Vitrine de serviços de {p.nome}</h2>
      <FormServicos
        inicial={inicial}
        usuarioId={id}
        acaoSalvar={salvarServicosEmNomeDe.bind(null, id)}
        emNomeDe={p.nome}
      />
    </div>
  );
}
