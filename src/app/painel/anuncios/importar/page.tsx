import type { Metadata } from "next";
import { Suspense } from "react";
import { ImportarDaGupy } from "@/components/anuncio/importar-da-gupy";
import { CabecalhoDaPagina, LinkVoltar } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { importarVagasDaGupy, listarVagasDaGupy } from "@/lib/acoes/importar-gupy";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { exigirUsuario } from "@/lib/sessao";
import { Building2 } from "lucide-react";

export const metadata: Metadata = { title: "Importar vagas da Gupy" };

// Painel › Vagas › "Importar da Gupy" (claude/plano-candidatura-no-site-da-empresa.md): a empresa que recebe os
// candidatos na Gupy cola o link da página de vagas dela e publica as vagas de uma vez, com o botão "Candidatar no site
// da empresa". Cada vaga lida da Gupy de novo e publicada com as regras de sempre leva alguns segundos.
export const maxDuration = 60;

export default function ImportarDaGupyPagina() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/anuncios/importar");
  const perfil = await obterMeuPerfil().catch(() => null);
  return (
    <div className="flex flex-col gap-6">
      <LinkVoltar href="/painel/anuncios?tipo=vaga">Vagas</LinkVoltar>
      <CabecalhoDaPagina
        titulo="Importar vagas da Gupy"
        descricao="Suas vagas estão na Gupy? Cole o link da página de vagas da empresa e escolha quais publicar. No Publike, elas aparecem na busca, no mapa e nos avisos, e o botão “Candidatar no site da empresa” leva cada pessoa à vaga na Gupy."
      />
      {!perfil || perfil.tipo === "pessoa" ? (
        <Vazio
          icone={Building2}
          titulo="A importação é para empresas"
          acao={<BotaoLink href="/publicar">Publicar uma vaga</BotaoLink>}
        >
          Comércios, empresas e agências importam as vagas da Gupy. Para publicar uma vaga, use o Publicar vaga.
        </Vazio>
      ) : (
        <ImportarDaGupy
          listar={listarVagasDaGupy}
          importar={importarVagasDaGupy}
          depois={{ href: "/painel/anuncios?tipo=vaga", rotulo: "Ver minhas vagas" }}
        />
      )}
    </div>
  );
}
