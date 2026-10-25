import "server-only";
import { obterUsuario } from "@/lib/dados";
import { distanciaKm } from "@/lib/descobrir";
import { obterLocal } from "@/lib/local";
import { chaveBairro, regiaoDoBairro, type Local } from "@/lib/regioes";
import { cidadeDaVisita } from "@/lib/servidor/cidade";
import { anunciosNoAr } from "@/lib/servidor/paginas-busca";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

/** Uma conta numa lista de "perto de você" (contas novas, pessoas e empresas das Conexões). */
export type ContaPerto = {
  id: string;
  nome: string;
  tipo: string;
  foto: string | null;
  cidade: string;
  bairro: string | null;
  verificado: boolean;
  criado_em: string;
};

/** O que a conta faz, numa palavra (ao lado do bairro). */
export function oQueE(tipo: string) {
  if (tipo === "pessoa") return "Pessoa";
  if (tipo === "agencia") return "Agência";
  if (tipo === "comercio") return "Comércio";
  return "Empresa";
}

// "da", "de", "do"... não viram inicial (a mesma lista de privado.nome_curto, no banco)
const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e", "di", "du", "del"]);

/**
 * Pessoa: "Maria S." (o nome inteiro só aparece na conexão aceita); empresa: o nome todo. A mesma regra do
 * banco (privado.nome_curto, a aba Talentos): a inicial é a da primeira palavra depois do nome, pulando
 * "da, de, do…" ("Maria da Silva Souza" → "Maria S.") e cortando o negócio depois de " - " ou " | ".
 */
export function nomeNaLista(n: Pick<ContaPerto, "nome" | "tipo">) {
  if (n.tipo !== "pessoa") return n.nome;
  // sem o negócio escrito junto ("Thiago B. Silva - Cuidados de Enfermagem" → "Thiago B.")
  const limpo = n.nome.trim().replace(/\s+/g, " ");
  const semNegocio = limpo.replace(/ [-|–—] .*$/, "").trim() || limpo;
  const [primeiro, ...resto] = semNegocio.split(" ");
  const sobrenome = resto.find((x) => !PARTICULAS.has(x.toLowerCase()));
  return sobrenome ? `${primeiro} ${sobrenome.charAt(0).toLocaleUpperCase("pt-BR")}.` : primeiro;
}

/**
 * O meio de cada bairro, pelos anúncios no ar (vagas e serviços, que têm o ponto): a média dos
 * pontos. Sai do cache das listas, sem perguntar ao mapa a cada visita.
 */
async function meiosDosBairros() {
  // os da praça de quem vê
  const { cidade } = await cidadeDaVisita();
  const [vagas, servicos] = await Promise.all([anunciosNoAr("vaga", cidade), anunciosNoAr("servico", cidade)]);
  const somas = new Map<string, { lat: number; lng: number; n: number }>();
  for (const a of [...vagas, ...servicos]) {
    if (!a.bairro || a.lat == null || a.lng == null) continue;
    const chave = `${a.cidade}|${chaveBairro(a.bairro)}`;
    const s = somas.get(chave) ?? { lat: 0, lng: 0, n: 0 };
    s.lat += a.lat;
    s.lng += a.lng;
    s.n += 1;
    somas.set(chave, s);
  }
  return new Map([...somas].map(([k, s]) => [k, { lat: s.lat / s.n, lng: s.lng / s.n }]));
}

/**
 * Quão longe está a conta: pelo meio do bairro dela (quando há anúncio no bairro) até a casa ou o
 * bairro de quem vê; sem isso, pelo bairro, pela região e pela cidade (mesmo bairro primeiro).
 */
function distancia(n: ContaPerto, local: Local | null, meios: Map<string, { lat: number; lng: number }>) {
  if (!local) return 50;
  const chave = n.bairro ? chaveBairro(n.bairro) : "";
  const meu = local.ponto ?? local.centro ?? meios.get(`${local.cidade}|${chaveBairro(local.bairro)}`) ?? null;
  const dele = chave ? meios.get(`${n.cidade}|${chave}`) : undefined;
  if (meu && dele) return distanciaKm(meu.lat, meu.lng, dele.lat, dele.lng);
  if (n.cidade === local.cidade && chave && chave === chaveBairro(local.bairro)) return 1;
  const regiao = n.bairro ? regiaoDoBairro(n.cidade, n.bairro) : null;
  if (regiao && regiao === local.regiao) return 6;
  if (n.cidade === local.cidade) return 15;
  return 30;
}

/**
 * Contas do Publike, da mais perto para a mais longe (na mesma distância, a mais nova antes), sem
 * as suspensas e sem a própria conta. `quem`: só pessoas, só comércio, empresa e agência, ou todas;
 * `dias`: só as que entraram nesse tempo. `total`: quantas passaram no filtro (antes de cortar).
 */
export async function contasPerto({
  quem = "todas",
  dias,
  quantos,
}: {
  quem?: "pessoas" | "empresas" | "todas";
  dias?: number;
  quantos: number;
}) {
  const [usuario, local, agora] = await Promise.all([obterUsuario(), obterLocal(), agoraDaRequisicao()]);
  const supabase = await criarClienteServidor();
  let consulta = supabase
    .from("perfis")
    .select("id, nome, tipo, foto, cidade, bairro, verificado, criado_em, suspenso_ate")
    .order("criado_em", { ascending: false })
    .limit(dias ? 80 : 300);
  if (dias) consulta = consulta.gte("criado_em", new Date(agora - dias * 24 * 3600 * 1000).toISOString());
  if (quem === "pessoas") consulta = consulta.eq("tipo", "pessoa");
  if (quem === "empresas") consulta = consulta.neq("tipo", "pessoa");
  if (usuario) consulta = consulta.neq("id", usuario.id).neq("id", usuario.pessoaId);
  const [{ data }, meios] = await Promise.all([
    consulta,
    meiosDosBairros().catch(() => new Map<string, { lat: number; lng: number }>()),
  ]);
  const ativos = (data ?? []).filter((p) => !p.suspenso_ate || new Date(p.suspenso_ate).getTime() < agora);
  const contas: ContaPerto[] = ativos
    .map((p) => ({ p, km: distancia(p, local, meios) }))
    .sort((a, b) => a.km - b.km || Date.parse(b.p.criado_em) - Date.parse(a.p.criado_em))
    .slice(0, quantos)
    .map(({ p }) => ({
      id: p.id,
      nome: p.nome,
      tipo: p.tipo,
      foto: p.foto,
      cidade: p.cidade,
      bairro: p.bairro,
      verificado: p.verificado,
      criado_em: p.criado_em,
    }));
  return { contas, total: ativos.length, agora, usuario };
}
