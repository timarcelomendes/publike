import type { Metadata } from "next";
import { Suspense } from "react";
import { ImportarConvites, ImportarPorImagens, ListaConvites } from "@/components/admin/convites";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import { classesBotao } from "@/components/ui/botao";
import type { Convite } from "@/lib/convites";
import { urlDosEmails } from "@/lib/servidor/ambiente";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Convites às empresas" };

export default function Convites() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const c = await exigirAdminLocal();
  const [{ data, error }, agora] = await Promise.all([
    c.from("convites").select("*").order("criado_em").order("nome").limit(1000),
    agoraDaRequisicao(),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Convites às empresas"
        descricao="Empresas que estão anunciando vagas em outros lugares. Mande o convite pelo WhatsApp ou e-mail, marque o que aconteceu e, quando a empresa autorizar, crie a conta e publique as vagas em nome dela."
        acoes={
          <a href="#importar" className={classesBotao("secundario", "sm")}>
            Importar empresas
          </a>
        }
      >
        {error ? (
          <Aviso tipo="erro" titulo="Não deu para ler os convites">
            Confira se a migração 20261015200000_convites.sql já rodou no Supabase.
          </Aviso>
        ) : (
          <ListaConvites
            convites={(data ?? []) as unknown as Convite[]}
            agora={agora}
            site={urlDosEmails() ?? "https://publike.org"}
          />
        )}
      </Secao>
      <Secao
        id="importar-imagens"
        titulo="Importar pelas imagens dos anúncios"
        descricao="Viu vagas nas redes? Salve as imagens dos anúncios e escolha aqui: a IA lê a empresa, o contato e a vaga, e o convite leva a vaga pronta para a empresa conferir e publicar."
      >
        <ImportarPorImagens />
      </Secao>
      <Secao
        id="importar"
        titulo="Importar empresas"
        descricao="Transforme a lista em arquivo pelo modelo e importe aqui. Dá para importar quantas vezes quiser."
      >
        <ImportarConvites />
      </Secao>
    </div>
  );
}
