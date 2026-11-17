import { aplicarIntencao, lerFiltros } from "@/lib/filtros";
import { tipoPadraoDaVisita } from "@/lib/intencao";
import { obterLocal } from "@/lib/local";
import { partirDoLocal } from "@/lib/servidor/busca-salva";
import { cidadeDaVisita } from "@/lib/servidor/cidade";
import { obterIntencao } from "@/lib/servidor/intencao";
import { comPertoGuardado } from "@/lib/servidor/perto";
import { JanelaDaChegada } from "./janela-da-chegada";

type Parametros = Promise<Record<string, string | string[] | undefined>>;

/**
 * "O que você quer fazer no Publike?" na chegada de quem está sem conta (17/11/2026, "deixe a performance invejável"):
 * num Suspense só dela, no alto da home, fora da lista. Ela só precisa dos cookies e do endereço (nada do banco), e
 * vem no HTML logo depois do esqueleto; dentro da lista, esperava a busca dos anúncios (de 0,4 a 0,8 s no servidor)
 * e, sendo o maior conteúdo da tela na primeira visita, era o LCP da home. As mesmas regras da PerguntasNaLista: sem
 * resposta e sem busca pronta (palavra ou "Recentes").
 */
export async function PerguntaDaChegada({ searchParams }: { searchParams: Parametros }) {
  const [intencao, local, visita, parametros] = await Promise.all([
    obterIntencao().catch(() => null),
    obterLocal(),
    cidadeDaVisita(),
    searchParams,
  ]);
  if (intencao) return null;
  const lidos = lerFiltros(await comPertoGuardado(parametros));
  // os mesmos filtros da lista (Explorar): o "Procuro trabalho" leva para a mesma busca, só trocando a aba
  const filtros = partirDoLocal(aplicarIntencao(lidos, tipoPadraoDaVisita(null, false, lidos.q)), local, visita.praca.cidade);
  if (filtros.meus || filtros.q.trim() || filtros.ordem === "recentes") return null;
  return <JanelaDaChegada filtros={filtros} cidade={visita.cidade} />;
}
