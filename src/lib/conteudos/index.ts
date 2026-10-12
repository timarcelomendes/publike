import { textoPuroConteudo } from "./texto";
import type { Conteudo, TemaConteudo } from "./tipos";
import { conteudo as empregoEmGoias2026 } from "./artigos/emprego-em-goias-2026";
import { conteudo as desempregoGoias4PorCento } from "./artigos/desemprego-goias-4-por-cento";
import { conteudo as setoresQueMaisContratamGoiania } from "./artigos/setores-que-mais-contratam-goiania";
import { conteudo as industriaGoianaEmpregos } from "./artigos/industria-goiana-empregos";
import { conteudo as construcaoCivilVagasGoiania } from "./artigos/construcao-civil-vagas-goiania";
import { conteudo as aparecidaDeGoianiaEmpregos } from "./artigos/aparecida-de-goiania-empregos";
import { conteudo as regiaoMetropolitanaGoianiaEmpregos } from "./artigos/regiao-metropolitana-goiania-empregos";
import { conteudo as senadorCanedoGoianiraTrindade } from "./artigos/senador-canedo-goianira-trindade";
import { conteudo as informalidadeGoias } from "./artigos/informalidade-goias";
import { conteudo as salarioDeAdmissao2026 } from "./artigos/salario-de-admissao-2026";
import { conteudo as empregoPertoDeCasaGoiania } from "./artigos/emprego-perto-de-casa-goiania";
import { conteudo as primeiroEmpregoJovensGoiania } from "./artigos/primeiro-emprego-jovens-goiania";
import { conteudo as jovemAprendizGoiania } from "./artigos/jovem-aprendiz-goiania";
import { conteudo as curriculoSimplesQueFunciona } from "./artigos/curriculo-simples-que-funciona";
import { conteudo as entrevistaDeEmpregoDicas } from "./artigos/entrevista-de-emprego-dicas";
import { conteudo as sineEPublike } from "./artigos/sine-e-publike";
import { conteudo as golpeDeEmpregoComoEvitar } from "./artigos/golpe-de-emprego-como-evitar";
import { conteudo as empregoParaMulheresGoiania } from "./artigos/emprego-para-mulheres-goiania";
import { conteudo as cursosGratuitosQualificacaoGoias } from "./artigos/cursos-gratuitos-qualificacao-goias";
import { conteudo as publikeEOsCaminhosPublicos } from "./artigos/publike-e-os-caminhos-publicos";
import { conteudo as comoContratarFuncionarioPequenoComercio } from "./artigos/como-contratar-funcionario-pequeno-comercio";
import { conteudo as contratarPertoDeCasa } from "./artigos/contratar-perto-de-casa";
import { conteudo as publicarVagaGratisGoiania } from "./artigos/publicar-vaga-gratis-goiania";
import { conteudo as contratarJovemAprendiz } from "./artigos/contratar-jovem-aprendiz";
import { conteudo as diaristaPedreiroEletricistaGoiania } from "./artigos/diarista-pedreiro-eletricista-goiania";
import { conteudo as meiGoianiaComoFormalizar } from "./artigos/mei-goiania-como-formalizar";
import { conteudo as rendaExtraBicosGoiania } from "./artigos/renda-extra-bicos-goiania";
import { conteudo as vitrineDeServicosClientes } from "./artigos/vitrine-de-servicos-clientes";
import { conteudo as seguroDesempregoPassoAPasso } from "./artigos/seguro-desemprego-passo-a-passo";
import { conteudo as carteiraAssinadaDireitos } from "./artigos/carteira-assinada-direitos";

export { TEMAS_CONTEUDO } from "./tipos";
export type { Conteudo, TemaConteudo } from "./tipos";

/** Os artigos, na ordem da pauta (a lista do blog mostra por tema). */
export const CONTEUDOS: Conteudo[] = [
  empregoEmGoias2026,
  desempregoGoias4PorCento,
  setoresQueMaisContratamGoiania,
  industriaGoianaEmpregos,
  construcaoCivilVagasGoiania,
  aparecidaDeGoianiaEmpregos,
  regiaoMetropolitanaGoianiaEmpregos,
  senadorCanedoGoianiraTrindade,
  informalidadeGoias,
  salarioDeAdmissao2026,
  empregoPertoDeCasaGoiania,
  primeiroEmpregoJovensGoiania,
  jovemAprendizGoiania,
  curriculoSimplesQueFunciona,
  entrevistaDeEmpregoDicas,
  sineEPublike,
  golpeDeEmpregoComoEvitar,
  empregoParaMulheresGoiania,
  cursosGratuitosQualificacaoGoias,
  publikeEOsCaminhosPublicos,
  comoContratarFuncionarioPequenoComercio,
  contratarPertoDeCasa,
  publicarVagaGratisGoiania,
  contratarJovemAprendiz,
  diaristaPedreiroEletricistaGoiania,
  meiGoianiaComoFormalizar,
  rendaExtraBicosGoiania,
  vitrineDeServicosClientes,
  seguroDesempregoPassoAPasso,
  carteiraAssinadaDireitos,
];

export function conteudoDoSlug(slug: string) {
  return CONTEUDOS.find((c) => c.slug === slug) ?? null;
}

export function conteudosDoTema(tema: TemaConteudo) {
  return CONTEUDOS.filter((c) => c.tema === tema);
}

/** Outros artigos para ler depois: do mesmo tema primeiro. */
export function relacionados(c: Conteudo, quantos = 3) {
  const mesmo = CONTEUDOS.filter((o) => o.tema === c.tema && o.slug !== c.slug);
  const outros = CONTEUDOS.filter((o) => o.tema !== c.tema);
  return [...mesmo, ...outros].slice(0, quantos);
}

/** Minutos de leitura (200 palavras por minuto). */
export function minutosDeLeitura(c: Conteudo) {
  const textos = c.blocos.flatMap((b) =>
    b.t === "lista" ? b.itens : b.t === "numero" ? [b.valor, b.rotulo] : b.t === "chamada" ? [b.titulo, b.texto] : [b.texto],
  );
  const palavras = textos.map(textoPuroConteudo).join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(palavras / 200));
}
