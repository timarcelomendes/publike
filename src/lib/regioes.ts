/**
 * Regiões de Goiânia e o "perto de casa" da busca: primeiro os anúncios do
 * bairro da pessoa, depois os da região dela, depois os da cidade.
 *
 * Fontes: Wikipédia ("Lista de bairros de Goiânia", por região) e, para os
 * bairros que não estão lá, a região dos vizinhos mais próximos no
 * OpenStreetMap (© colaboradores do OpenStreetMap, ODbL).
 * Fora de Goiânia, a cidade inteira conta como uma região só.
 */
import { CENTRO_GOIANIA } from "./config";
import { CIDADES, REGIOES, type Cidade, type Regiao } from "./constantes";

export { REGIOES, type Regiao };

/**
 * Chave de comparação de um bairro: sem acento, minúscula, sem "Setor",
 * "Residencial" etc. no começo. A função chave_bairro do banco faz o mesmo.
 */
export function chaveBairro(bairro: string) {
  return bairro
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^(setor|st\.?|bairro|residencial|res\.?|conjunto|loteamento|vila)\s+/, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Chaves (como em chaveBairro) dos bairros de Goiânia em cada região,
// com as grafias que aparecem nos endereços.
const BAIRROS_POR_REGIAO: Record<Regiao, string> = {
  Centro:
    "abaja;aeroporto;aeroviario;aguiar;aurora;bethel;boa sorte;campinas;canaa;castelo branco;central;centro;centro oeste;chacaras elisios campos;cidade jardim;coimbra;colemar natal e silva;crimeia leste;crimeia oeste;dos funcionarios;elisio campos;elisios campos;esplanada do anicuns;fernandes;froes;funcionarios;goias;guadalajara;industrial mooca;irany;isaura;jacare;jaragua;jardim ana flavia;jardim xavier;leste universitario;leste vila nova;marechal rondon;megale;monticelli;mooca;morada nova;negrao de lima;norte ferroviario;norte ferroviario ii;nossa senhora de fatima;nova;nova canaa;nova vila;ofugi;operario;osvaldo rosa;oswaldo rosa;padre pelagio;paraiso;parque industrial de goiania;perdiz;rodoviaria;rodoviario;romildo f r amaral;santa helena;santa isabel;santa tereza;santana;santo antonio;sao jose;sao luiz;sul;tocafundo;universitario;viana;viandelli",
  Norte:
    "alice barbosa;alice barbosa i;antonio barbosa;antonio carlos pires;asa branca;atalaia;balnario meio ponte;balneario;balneario gran viena;bela goiania;campus universitario;caraibas;chacara bom retiro;chacara retiro;chacara rio branco;chacaras california;chacaras nossa senhora da piedade;chacaras retiro;chacaras samambaia;chacaras shangry la;clemente;condominio samambaia;condominio shangry la;das acacias;dos ipes;dos oficiais;elizene santana;estancias vista alegre;felicidade;gentil meireles;gentil meirelles;goiania 2;goiania ii;granja cruzeiro do sul;granjas brasil;guanabara;guarema;hugo de moraes;hugo de morais;humaita;industrial pedro abraao;italia;itamaraca;itanhanga;itatiai;itatiaia;jao;jardim balneario meia ponte;jardim bom jesus;jardim diamantina;jardim gauanabara;jardim gramado;jardim guanabara;jardim guanabara ii;jardim guanabara iii;jardim guanabara iv;jardim guanabara l;jardim ipe;jardim pompeia;jardim sao judas tadeu;joao paulo ii;jose viandeli;licardino ney;mansoes do campus;mansoes goianas;maria dilce;maria lourenca;maria rosa;militar;morada do bosque;morada do ipe;morada dos sonhos;morumbi;nossa morada;nossa senhora aparecida;orlando de morais;orlando morais;panorama parque;parque balneario;parque das flores;parque das nacoes;parque dos cisnes;parque dos eucaliptos;perim;pindorama;portal da mata;prive elza fronza;prive itanhanga;progresso;residencial campus;roriz;santa cruz;santa genoveva;santa genoveva ii;sao geraldo;sevene;shangri la;sitio de recreio caraibas;sitio de recreio mansoes do campus;sitio de recreio pindorama;sitio de recreio sao geraldo;sitios de recreio paraiso tropical;urias magalhaes;vale da serra;vale dos sonhos;vale dos sonhos i;vale dos sonhos ii;vilage atalaia;vilage casa grande;village atalaia;village casa grande;zona industrial pedro abrao",
  Sul:
    "americano do brasil;areiao;areiao 1;bela vista;bueno;divino pai eterno;dos afonsos;jardim america;jardim das esmeraldas;jardim goias;jardim santo antonio;jd america;jd goias;maria isabel;maria jose;marista;nova suica;oeste;parque amazonas;parque amazonia;pedro ludovico;redencao;santa efigenia;sao joao;sao tomaz;serrinha;teofilo neto",
  Leste:
    "agua branca;aldeia do vale;alphaville araguaia;alphaville flamboyant;alphaville flamboyant residencial araguaia;alto da gloria;anhanguera;arco verde;aruana;aruana complemento;aruana park;bandeirantes;belo horizonte;brisas do cerrado;caicara;carlos de freitas;chacara botafogo;chacara do governador;chacaras alto da gloria;chacaras botafogo;chacaras santa barbara;chacaras sao francisco de assis;clea borges;colonia santa marta;concordia;costa paranhos;estancia vargem bonita;fabiana;fazenda petropolis residencial monte verde;feliz;goiania golfe clube;grande retiro;habitacional aruana i;habitacional aruana ii;havai;hawai;housing flamboyant;ipe;irisville;jardim abaporu;jardim atenas;jardim bela vista;jardim brasil;jardim california;jardim california parque industrial;jardim conquista;jardim da luz;jardim das aroeiras;jardim dom fernando;jardim dom fernando i;jardim dom fernando ii;jardim lageado;jardim lajeado;jardim maria helena;jardim mariliza;jardim novo mundo;jardim novo mundo extensao;jardim novo mundo ii;jardim paris;jardim santa cecilia;jardim valencia;jardim verona;jardim vitoria;jardim vitoria ii;jardins milao;jardins munique;legionarias;lucy pinheiro;mansoes bernardo sayao;mar del plata;maria luiza;martins;martins extensao;matilde;matinha;monte verde;montes claros;morais;olinda;ouro preto;palmares;park lozandes;parque acalanto;parque atheneu;parque das amendoeiras;parque das laranjeiras;parque flamboyant;parque santa cruz;parque santa maria;paulo estrela;pedroso;portal do sol;portal petropolis;portugues;prive dos girassois;recanto das minas gerais;recanto dos buritis;residencial aruana iii;ressidencial ville de france;rio jordao;riviera;romana;santa barbara;santa maria;santa maria extensao;santo hilario;sao francisco de assis;sao leopoldo;sao silvestre;senador paranhos;serra park;sitio de recreio ipe;sonho dourado;sonho verde;sonho verde complemento;tupinamba dos reis;tupynamba dos reis;vale das brisas;vale do araguaia;village campos verdes;ville de france;yate",
  Oeste:
    "14 bis;alto boa vista;ana moraes;anicuns;araguaia park;barra da tijuca;beatriz nascimento;bertim belchior i;bertim belchior ii;bertin belchior ii;bosque dos buritis;buena vista;buena vista 4;buena vista iii;buena vista iv;candida de morais;capuava;capuava residencial prive;carla cristina;carolina parque;celina parque;chacara anhanguera;chacara buritis;chacara maringa;chacara santa rita;chacara sao jose;chacaras anhanguera;chacaras buritis;chacaras cidade pompeu;chacaras sao jose;cidade verde;condominio anhanguera;condominio do lago;condominio reserva san marino;condominio rio branco;coronel alvaro alves junior;costa verde;das nacoes;della pena;della penna;della penna extensao;delta village;dezopi;dom rafael;goia;goiania viva;goyaz park;ipiranga;jardim aritana;jardim bonanza;jardim botanico;jardim clarissa;jardim corte real;jardim das oliveiras;jardim das rosas;jardim imperial;jardim leblon;jardim marques de abreu;jardim mirabel;jardim novo petropolis;jardim petropolis;jardim real;jardim sao jose;jardim sao jose i;jardins do cerrado;jardins do cerrado 1;jardins do cerrado 2;jardins do cerrado 3;jardins do cerrado 4;jardins do cerrado 6;jardins do cerrado 7;joao bueno;joao vaz;junqueira;lirios do campo;london park;lorena park;lorena parque;luana park;luana park extensao;marata;maysa;mendanha;monte pascoal;mundo novo;mundo novo 2;mundo novo 3;nossa senhora auxiliadora;nova aurora;nunes de morais;park solar;parque bom jesus;parque buriti;parque eldorado oeste;parque eldorado oeste extensao;parque industrial joao braz;parque industrial paulista;parque mendanha;parque oeste;parque paraiso;petropolis;pilar dos sonhos;ponta negra;portal anhanguera;portinari;primavera;quinta da boa vista;real;recanto das garcas;recreio sao joaquim;regina;rio branco;rizzo;san marino;santos dumont;sao bernardo;sao francisco;sao joaquim;sao marcos;serra azul;solange parque;solange parque complemento;solange parque extensao;solange parque i;solange parque ii;solange parque iii;solar ville;tempo novo;tropical verde;tropical ville;tuzimoto;vera cruz;vera cruz i;vera cruz ii;village maringa;ytapua",
  Noroeste:
    "alfa;alto do vale;anglo;barravento;boa vista;brisas da mata;candida de moraiss;chacara de recreio sao joaquim;chacara helou;chacara mansoes rosa de ouro;chacara maria dilce;chacaras helou;chacaras maria dilce;chacaras recreio sao joao;cidade universitaria;condominio jacaranda;da vitoria;empresarial;estrela d alva;estrela dalva;finsocial;floresta;fonte das aguas;fortaleza;green park;jardim belvedere;jardim belvedere expansao;jardim camargo;jardim colorado;jardim colorado sul;jardim curitiba;jardim curitiba 4;jardim das hortencias;jardim fonte nova;jardim helou;jardim lago azul;jardim liberdade;jardim nova esperanca;jardim vista bela;jd nova esperanca;juscelino kubitschek;malibu;mansoes paraiso;mansoes rosas de ouro;maraba;maringa;mirante;morada do sol;mutirao;mutirao i;mutirao ii;noroeste;novo planalto;parque aeronautico antonio sebba filho;parque maracana;parque tremendao;paulo pacheco;prive norte;recanto barravento;recanto do bosque;recreio estrela d alva;recreio panorama;residencial paulo pacheco;sao carlos;sao domingos;senador albino boaventura;setor jardim das hortencias;sitio de recreio dos bandeirantes;sitio recreio panorama;sitio sao domingos;solange park;terra nova",
  Sudoeste:
    "adelia;alpes;alphaville residencial;alto oriente;alvorada;amin camargo;ana clara;anchieta;andreia;aquarios;atibaia;baliza;barcelona;bela;boa;bonanza;bosque sumare;brasil central;buena vista i;buena vista ii;cachoeira dourada;campos dourados;canada;celina park;center ville;condominio dakota;condominio das esmeraldas;cristina;das esmeraldas;dona ge;dos alpes;dos dourados;eldorado;eli forte;escocia;espanha;faicalville;fidelis;flamingo;florida;forteville;forteville extensao;garavelo;grajau;granville;habitacional madre germana ii;itaipu;jardim alvaphille;jardim ana lucia;jardim atlantico;jardim barcelona;jardim caravelas;jardim caravelas 1 etapa;jardim eli forte;jardim eli forte complemento;jardim europa;jardim florenca;jardim gardenia;jardim ipanema;jardim itaipu;jardim itaupu;jardim madri;jardim planalto;jardim presidente;jardim sonia maria;jardim tancredo neves;jardim vila boa;jardins lisboa;jardins madri complemento;katia;linda vista;luciana;lucy;madre germana 2;manhattan;maria celeste;maria oliveira;maria oliveira abadia;mariana;marlene;maua;moinho dos ventos;monte carlo;novo horizonte;orientville;parque anhanguera;parque das paineiras;parque oeste industrial;parque santa rita;portal do oriente;portal santa rita;porto seguro;prive atlantico;prive ilhas do caribe;real conquista;recanto das emas;recreio do funcionario publico;rezende;rio formoso;rio verde;rosa;salinos;santa fe;santa fe i;santa rita;sao paulo;sevilha;solar bougainville;solar bouganville;solar santa rita;sudoeste;talisma;tres marias;ulisses guimaraes;uniao;valencia;vereda dos buritis;via nova canaa;vida milao;village green park;village santa rita;village santa rita i;village santa rita ii;village santa rita iii;village veneza",
};

const REGIAO_DO_BAIRRO = new Map<string, Regiao>();
for (const regiao of REGIOES) {
  for (const chave of BAIRROS_POR_REGIAO[regiao].split(";")) REGIAO_DO_BAIRRO.set(chave, regiao);
}

/** Região de um bairro de Goiânia (null se não souber ou se for outra cidade). */
export function regiaoDoBairro(cidade: string, bairro: string): Regiao | null {
  if (cidade !== "Goiânia" || !bairro) return null;
  return REGIAO_DO_BAIRRO.get(chaveBairro(bairro)) ?? null;
}

/** Chaves de todos os bairros da região, para o banco comparar. */
export function chavesDaRegiao(regiao: Regiao) {
  return BAIRROS_POR_REGIAO[regiao].split(";");
}

/** Ponto aproximado de cada região de Goiânia, para medir as distâncias. */
const CENTRO_REGIAO: Record<Regiao, { lat: number; lng: number }> = {
  Centro: { lat: -16.672, lng: -49.262 },
  Norte: { lat: -16.612, lng: -49.262 },
  Sul: { lat: -16.71, lng: -49.262 },
  Leste: { lat: -16.68, lng: -49.2 },
  Oeste: { lat: -16.68, lng: -49.36 },
  Noroeste: { lat: -16.618, lng: -49.33 },
  Sudoeste: { lat: -16.728, lng: -49.33 },
};

/** Centro aproximado de cada cidade da região metropolitana. */
const CENTRO_CIDADE: Record<Cidade, { lat: number; lng: number }> = {
  "Goiânia": CENTRO_GOIANIA,
  "Aparecida de Goiânia": { lat: -16.8198, lng: -49.2469 },
  "Senador Canedo": { lat: -16.7084, lng: -49.0914 },
  "Trindade": { lat: -16.6517, lng: -49.4927 },
  "Goianira": { lat: -16.4947, lng: -49.4262 },
  "Nerópolis": { lat: -16.4047, lng: -49.2227 },
  "Hidrolândia": { lat: -16.9626, lng: -49.2265 },
  "Bela Vista de Goiás": { lat: -16.9729, lng: -48.9533 },
  "Abadia de Goiás": { lat: -16.7573, lng: -49.4412 },
  "Aragoiânia": { lat: -16.9087, lng: -49.4476 },
  "Bonfinópolis": { lat: -16.6173, lng: -48.9616 },
  "Brazabrantes": { lat: -16.4281, lng: -49.3863 },
  "Caldazinha": { lat: -16.7117, lng: -49.0013 },
  "Caturaí": { lat: -16.4447, lng: -49.4936 },
  "Goianápolis": { lat: -16.5098, lng: -49.0234 },
  "Guapó": { lat: -16.8297, lng: -49.5345 },
  "Inhumas": { lat: -16.3611, lng: -49.4961 },
  "Nova Veneza": { lat: -16.3695, lng: -49.3168 },
  "Santo Antônio de Goiás": { lat: -16.4815, lng: -49.3096 },
  "Terezópolis de Goiás": { lat: -16.3945, lng: -49.0797 },
};

/** Onde a pessoa mora: escolhido na busca ou vindo do perfil. */
export type Local = { cidade: Cidade; bairro: string; regiao: Regiao | null; fonte: "busca" | "perfil" };

export function criarLocal(cidade: string, bairro: string, fonte: Local["fonte"]): Local | null {
  if (!(CIDADES as readonly string[]).includes(cidade)) return null;
  const b = bairro.replace(/\s+/g, " ").trim().slice(0, 60);
  return { cidade: cidade as Cidade, bairro: b, regiao: regiaoDoBairro(cidade, b), fonte };
}

/** Ponto de partida das distâncias para quem escolheu onde mora. */
export function pontoDoLocal(local: Local) {
  return local.regiao ? CENTRO_REGIAO[local.regiao] : CENTRO_CIDADE[local.cidade];
}

/** "Região Sul de Goiânia", "Trindade". */
export function nomeDaArea(local: Local) {
  return local.regiao ? `Região ${local.regiao} de Goiânia` : local.cidade;
}

/** Ordem de prioridade, para mostrar: ["Setor Bueno", "Região Sul", "Goiânia"]. */
export function passosDaPrioridade(local: Local) {
  const passos: string[] = [];
  if (local.bairro) passos.push(local.bairro);
  if (local.regiao) passos.push(`Região ${local.regiao}`);
  passos.push(local.cidade);
  return passos;
}
