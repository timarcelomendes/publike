import { FileUp, ImageIcon, List } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ImportarConvites, ImportarPorImagens, ListaConvites } from "@/components/admin/convites";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import type { Convite } from "@/lib/convites";
import { primeiro } from "@/lib/formato";
import { urlDosEmails } from "@/lib/servidor/ambiente";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Convites" };

// sub-abas: a lista, importar pelas imagens dos anúncios e importar pelo arquivo
const ABAS = [
  { id: "lista", nome: "Convidados", icone: List },
  { id: "imagens", nome: "Importar pelas imagens", icone: ImageIcon },
  { id: "arquivo", nome: "Importar arquivo", icone: FileUp },
] as const;
type Aba = (typeof ABAS)[number]["id"];

export default function Convites({ searchParams }: PageProps<"/admin/convites">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      {searchParams.then((sp) => {
        const pedida = primeiro(sp.aba);
        const aba: Aba = ABAS.some((a) => a.id === pedida) ? (pedida as Aba) : "lista";
        return <Conteudo aba={aba} />;
      })}
    </Suspense>
  );
}

function SubAbas({ ativa, total }: { ativa: Aba; total: number | null }) {
  return (
    <nav aria-label="Convites" className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {ABAS.map(({ id, nome, icone: Icone }) => {
        const atual = id === ativa;
        return (
          <Link
            key={id}
            href={id === "lista" ? "/admin/convites" : `/admin/convites?aba=${id}`}
            aria-current={atual ? "page" : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-pill border px-3.5 text-label transition-colors ${
              atual
                ? "border-ink bg-ink text-surface-100"
                : "border-line bg-surface-300 text-ink hover:border-line-strong"
            }`}
          >
            <Icone aria-hidden className="size-4" />
            {nome}
            {id === "lista" && total != null && <span className="tabular-nums opacity-70">{total}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

async function Conteudo({ aba }: { aba: Aba }) {
  const c = await exigirAdminLocal();
  const [{ data, error }, agora] = await Promise.all([
    c.from("convites").select("*").order("criado_em").order("nome").limit(1000),
    agoraDaRequisicao(),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <SubAbas ativa={aba} total={error ? null : (data?.length ?? 0)} />
      {aba === "lista" && (
        <Secao
          titulo="Convites"
          descricao="Empresas anunciando vagas e prestadores anunciando serviços em outros lugares. Mande o convite pelo WhatsApp ou e-mail: o link leva a vaga (ou a vitrine de serviços) pronta e, quando a pessoa publica por ele, o convite vira Autorizou sozinho. Respondeu “sim” sem abrir o link? Publique por ela daqui."
        >
          {error ? (
            <Aviso tipo="erro" titulo="Não deu para ler os convites">
              Confira se as migrações dos convites já rodaram no Supabase.
            </Aviso>
          ) : (
            <ListaConvites
              convites={(data ?? []) as unknown as Convite[]}
              agora={agora}
              site={urlDosEmails() ?? "https://publike.org"}
            />
          )}
        </Secao>
      )}
      {aba === "imagens" && (
        <Secao
          id="importar-imagens"
          titulo="Importar pelas imagens dos anúncios"
          descricao="Viu vagas ou serviços anunciados nas redes? Salve as imagens dos anúncios e escolha aqui: a IA lê quem anunciou, o contato e a vaga (ou o serviço), e o convite já vai pronto."
        >
          <ImportarPorImagens />
        </Secao>
      )}
      {aba === "arquivo" && (
        <Secao
          id="importar"
          titulo="Importar pelo arquivo"
          descricao="Transforme a lista em arquivo pelo modelo e importe aqui. Dá para importar quantas vezes quiser."
        >
          <ImportarConvites />
        </Secao>
      )}
    </div>
  );
}
