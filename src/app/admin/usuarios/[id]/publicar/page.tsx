import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { FormAnuncio, type ValoresAnuncio } from "@/components/form-anuncio";
import { Aviso } from "@/components/ui/basicos";
import { publicarEmNomeDe } from "@/lib/acoes/admin-contas";
import { fichaUsuario } from "@/lib/admin/dados";
import { iaConfigurada } from "@/lib/ia/openai";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Publicar em nome da conta" };

export default function PublicarEmNomeDe({ params }: PageProps<"/admin/usuarios/[id]/publicar">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/admin/usuarios/[id]/publicar">["params"] }) {
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
          Sem perfil (nome, tipo e WhatsApp), não dá para publicar em nome dela.
        </Aviso>
      </div>
    );
  }

  const p = u.perfil;
  const inicial: ValoresAnuncio = {
    tipo: "vaga",
    titulo: "",
    descricao: "",
    categoria: "",
    regime: null,
    pagamento_valor: null,
    pagamento_unidade: null,
    beneficios: null,
    horario: null,
    vagas: 1,
    cidade: p.cidade,
    bairro: p.bairro ?? "",
    lat: null,
    lng: null,
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {voltar}
      <h2 className="text-h2">Publicar vaga em nome de {p.nome}</h2>
      <FormAnuncio
        inicial={inicial}
        acaoSalvar={publicarEmNomeDe.bind(null, id)}
        ia={iaConfigurada()}
        agencia={p.tipo === "agencia"}
        contatoAgencia={{ whatsapp: u.contato.whatsapp, email: u.contato.email }}
        enderecoPublico={p.tipo !== "pessoa"}
        emNomeDe={p.nome}
      />
    </div>
  );
}
