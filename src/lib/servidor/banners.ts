import "server-only";
import { cookies } from "next/headers";
import {
  ATRASO_PADRAO,
  COOKIE_BANNERS,
  diaDeHoje,
  juntarVistos,
  lerBannersVistos,
  linkDaBusca,
  PAGINAS_BANNER,
  podeMostrar,
  type AcaoBanner,
  type BannerNoAr,
  type PaginaBanner,
  type Visto,
} from "@/lib/banners";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { obterIntencao } from "@/lib/servidor/intencao";
import { criarClientePublico, criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

/** A área de quem vê, para a busca do banner: o "o que você faz" do currículo ou o primeiro cargo. */
async function areaDaConta(contaId: string): Promise<string | null> {
  const { data } = await (
    await criarClienteServidor()
  )
    .from("curriculos")
    .select("titulo, experiencias")
    .eq("perfil_id", contaId)
    .maybeSingle();
  if (!data) return null;
  const titulo = data.titulo?.trim();
  if (titulo && titulo.length >= 2) return titulo.slice(0, 60);
  const experiencias = Array.isArray(data.experiencias) ? data.experiencias : [];
  for (const e of experiencias) {
    const cargo = e && typeof e === "object" && !Array.isArray(e) ? String(e.cargo ?? "").trim() : "";
    if (cargo.length >= 2) return cargo.slice(0, 60);
  }
  return null;
}

/**
 * Os banners que podem aparecer para quem chega, do mais novo para o mais antigo: ligados (dentro das
 * datas), para o público dela (visitante, conta de pessoa ou de empresa) e que ela ainda pode ver (nunca
 * visto, ou com repetição e já passados os dias, sem ter tocado no botão). Conta o que o navegador e a
 * conta (em qualquer aparelho) já viram. O navegador escolhe o primeiro da página aberta.
 */
export async function bannersDaVisita(): Promise<BannerNoAr[]> {
  if (MODO_DEMO) return [];
  const [usuario, jar, agora] = await Promise.all([obterUsuario(), cookies(), agoraDaRequisicao()]);
  const perfil = usuario ? await obterMeuPerfil().catch(() => null) : null;
  const publicos = ["todos"];
  // o visitante que já respondeu "O que você quer fazer" também vê o banner do público dele
  if (!usuario) {
    publicos.push("visitantes");
    const intencao = await obterIntencao().catch(() => null);
    if (intencao) publicos.push(intencao === "contratar_pessoa" ? "empresas" : "pessoas");
  } else if (perfil) publicos.push(perfil.tipo === "pessoa" ? "pessoas" : "empresas");
  // o banco só devolve os ligados e dentro das datas (RLS)
  const consulta = (colunas: string) =>
    criarClientePublico()
      .from("banners")
      .select(colunas)
      .in("publico", publicos)
      .order("criado_em", { ascending: false })
      .limit(30);
  type Linha = {
    id: string;
    titulo: string;
    texto: string | null;
    botao: string;
    acao: string;
    link: string | null;
    repetir_dias: number | null;
    paginas?: string[];
    atraso_segundos?: number;
    busca_da_area?: boolean;
    imagem?: string | null;
  };
  const basicas = "id, titulo, texto, botao, acao, link, repetir_dias";
  const comPaginas = `${basicas}, paginas, atraso_segundos, busca_da_area`;
  let { data, error } = await consulta(`${comPaginas}, imagem`).returns<Linha[]>();
  // sem a migração 20261213120000: sem imagem; sem a 20261117120000: só a inicial, em 3 segundos
  if (error?.code === "42703") ({ data, error } = await consulta(comPaginas).returns<Linha[]>());
  if (error?.code === "42703") ({ data, error } = await consulta(basicas).returns<Linha[]>());
  if (error || !data?.length) return []; // sem a migração dos banners: nenhum
  const doNavegador = lerBannersVistos(jar.get(COOKIE_BANNERS)?.value);
  const daConta = new Map<string, Visto>();
  if (usuario) {
    const { data: vistos } = await (
      await criarClienteServidor()
    )
      .from("banners_vistos")
      .select("banner_id, visto_em, clicou")
      .in(
        "banner_id",
        data.map((b) => b.id),
      );
    for (const v of vistos ?? [])
      daConta.set(v.banner_id, { dia: diaDeHoje(Date.parse(v.visto_em)), clicou: v.clicou });
  }
  const hoje = diaDeHoje(agora);
  const podem = data
    .filter((b) => podeMostrar(b.repetir_dias, juntarVistos(doNavegador.get(b.id), daConta.get(b.id)), hoje))
    .slice(0, 8);
  // a busca pela área de quem vê (só lida quando algum banner pede)
  const area =
    usuario && podem.some((b) => b.acao === "busca" && b.busca_da_area) ? await areaDaConta(usuario.id) : null;
  return podem.map((b) => ({
    id: b.id,
    titulo: b.titulo,
    texto: b.texto,
    botao: b.botao,
    acao: b.acao as AcaoBanner,
    link: b.acao === "busca" && b.busca_da_area && area ? linkDaBusca(area) : b.link,
    repetir_dias: b.repetir_dias,
    paginas: (b.paginas?.length ? b.paginas : ["inicio"]).filter((x): x is PaginaBanner => x in PAGINAS_BANNER),
    atraso: b.atraso_segundos ?? ATRASO_PADRAO,
    imagem: b.imagem ?? null,
  }));
}
