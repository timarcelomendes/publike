import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { FormNovaConta } from "@/components/admin/nova-conta";
import { PublicarVagaAdmin } from "@/components/admin/publicar-vaga-admin";
import type { ValoresAnuncio } from "@/components/form-anuncio";
import { Aviso } from "@/components/ui/basicos";
import { publicarEmNomeDe } from "@/lib/acoes/admin-contas";
import { fichaUsuario } from "@/lib/admin/dados";
import { iaConfigurada } from "@/lib/ia/openai";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { primeiro } from "@/lib/formato";
import { obterTriagem } from "@/lib/servidor/triagem";
import { UUID } from "@/lib/validacao";
import { valoresDoAnuncio } from "@/lib/valores-anuncio";

export const metadata: Metadata = { title: "Publicar em nome da conta" };

type Props = PageProps<"/admin/usuarios/[id]/publicar">;

const SITUACOES: Record<string, string> = {
  ativo: "No ar",
  pausado: "Pausada",
  encerrado: "Encerrada",
  expirado: "Expirada",
  em_analise: "Em análise",
  removido: "Removida",
};

export default function PublicarEmNomeDe({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ params, searchParams }: { params: Props["params"]; searchParams: Props["searchParams"] }) {
  const c = await exigirAdminLocal();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
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
  // a conta entrou mas não terminou o perfil (vai completar depois): a equipe cria o perfil aqui e já publica
  if (!u.perfil) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        {voltar}
        <h2 className="text-h2">Criar o perfil e publicar</h2>
        <Aviso tipo="info" titulo="Esta conta entrou, mas ainda não terminou o perfil">
          Preencha o básico do negócio (nome, tipo, cidade e WhatsApp) para publicar as vagas em nome dela. No próximo
          acesso, a conta confere os dados, completa o resto e aceita as regras.
        </Aviso>
        <FormNovaConta contaId={u.id} />
      </div>
    );
  }

  const p = u.perfil;
  const vazio: ValoresAnuncio = {
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

  // "Copiar": uma vaga desta conta ou o link de qualquer vaga (o código dela no endereço)
  const pedida =
    primeiro(sp.copiar)?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null;
  const [{ data: origem }, { data: daConta }] = await Promise.all([
    pedida ? c.rpc("obter_anuncio", { p_id: pedida }).maybeSingle() : Promise.resolve({ data: null }),
    c
      .from("anuncios")
      .select("id, titulo, status, bairro")
      .eq("autor_id", id)
      .eq("tipo", "vaga")
      .order("criado_em", { ascending: false })
      .limit(8),
  ]);
  const copiavel = origem && origem.tipo === "vaga" ? origem : null;
  let inicial = vazio;
  if (copiavel) {
    const copia = valoresDoAnuncio(copiavel, { copiar: true, triagem: await obterTriagem(copiavel.id, c) });
    // de outra conta: o cliente da agência não vale aqui
    inicial = copiavel.autor_id === id ? copia : { ...copia, cliente_id: null };
  }

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      {voltar}
      <h2 className="text-h2">Publicar vaga em nome de {p.nome}</h2>
      {primeiro(sp.perfil) === "1" && (
        <Aviso tipo="sucesso" titulo="Perfil salvo.">
          {primeiro(sp.contato) === "0"
            ? "Mas o WhatsApp e o e-mail de contato não salvaram: abra a conta e confira antes de publicar."
            : "Agora é só publicar a vaga."}
        </Aviso>
      )}
      {primeiro(sp.copiar) && !copiavel && (
        <Aviso tipo="erro" titulo="Não achei essa vaga">
          Confira o link ou o código. Dá para copiar só vagas (serviços, não).
        </Aviso>
      )}
      <PublicarVagaAdmin
        // outra cópia: o formulário começa de novo
        key={copiavel?.id ?? "nova"}
        contaId={id}
        inicial={inicial}
        copiada={copiavel ? { titulo: copiavel.titulo, de: copiavel.autor_nome ?? "outra conta" } : null}
        vagasDaConta={(daConta ?? []).map((v) => ({
          id: v.id,
          titulo: v.titulo,
          situacao: SITUACOES[v.status] ?? v.status,
          bairro: v.bairro,
        }))}
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
