import type { Metadata } from "next";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { BuscaDeNoticias, FilaDeNoticias } from "@/components/admin/noticias";
import { Secao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import type { Noticia } from "@/lib/noticias";
import { situacaoFilas } from "@/lib/servidor/filas";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";
import { PRACA_PADRAO } from "@/lib/pracas";

export const metadata: Metadata = { title: "Notícias" };

export default function Noticias() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const c = await exigirAdminLocal();
  const [{ data, error }, { data: cfg }, agora] = await Promise.all([
    c.from("noticias").select("*").order("criado_em", { ascending: false }).limit(300),
    c.from("config_site").select("*").limit(1).maybeSingle(),
    agoraDaRequisicao(),
  ]);
  const filas = situacaoFilas();
  const falta = !filas.ia
    ? "Falta a chave da IA (OPENAI_API_KEY ou ANTHROPIC_API_KEY) no .env.local."
    : !filas.acesso
      ? "Falta a chave do servidor (PUBLIKE_CHAVE_SERVIDOR) ou a chave secreta do Supabase no .env.local."
      : null;

  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Notícias"
        descricao={`A IA procura notícias sobre trabalho em ${PRACA_PADRAO.nome} (feirões, cursos gratuitos, concursos, direitos) e escreve um resumo com a fonte. Nada vai para o site sem você aprovar: publique agora ou agende para o próximo horário livre (8h, 12h ou 18h).`}
      >
        {error ? (
          <Aviso tipo="erro" titulo="Não deu para ler as notícias">
            Confira se a migração 20261015210000_noticias.sql já rodou no Supabase.
          </Aviso>
        ) : (
          <BuscaDeNoticias
            ligada={Boolean(cfg?.ia_noticias)}
            ultimaBusca={cfg?.noticias_ultima_busca ?? null}
            aviso={cfg?.noticias_ultimo_erro ?? null}
            falta={falta}
          />
        )}
      </Secao>
      {!error && (
        <Secao
          titulo="Fila"
          descricao="Edite o que precisar antes de publicar. A notícia sai no site com o link da fonte."
        >
          <FilaDeNoticias noticias={(data ?? []) as Noticia[]} agora={agora} />
        </Secao>
      )}
    </div>
  );
}
