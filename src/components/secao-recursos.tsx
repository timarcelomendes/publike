import { Suspense } from "react";
import { perfilDaIntencao } from "@/lib/recursos";
import { obterIntencao } from "@/lib/servidor/intencao";
import { RecursosPorPerfil } from "./recursos";

async function RecursosDaPessoa({ linkDetalhes }: { linkDetalhes: boolean }) {
  const inicial = perfilDaIntencao(await obterIntencao());
  return <RecursosPorPerfil key={inicial} inicial={inicial} linkDetalhes={linkDetalhes} />;
}

/** "O que dá para fazer no Publike", abrindo no perfil que a pessoa escolheu. */
export function RecursosDoPublike({ linkDetalhes = false }: { linkDetalhes?: boolean }) {
  return (
    <Suspense fallback={<RecursosPorPerfil inicial="trabalho" linkDetalhes={linkDetalhes} />}>
      <RecursosDaPessoa linkDetalhes={linkDetalhes} />
    </Suspense>
  );
}
