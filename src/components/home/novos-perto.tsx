import Link from "next/link";
import { obterUsuario } from "@/lib/dados";
import { distanciaKm } from "@/lib/descobrir";
import { formatarLugar } from "@/lib/formato";
import { obterLocal } from "@/lib/local";
import { chaveBairro, regiaoDoBairro, type Local } from "@/lib/regioes";
import { MODO_DEMO } from "@/lib/config";
import { estadosDeConexao } from "@/lib/servidor/conexoes";
import { anunciosNoAr } from "@/lib/servidor/paginas-busca";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import { BotaoConectarCompacto } from "../conexoes/botao-conectar-compacto";
import { SeloVerificado } from "../selo-verificado";
import { Avatar } from "../ui/basicos";
import { cidadeDaVisita } from "@/lib/servidor/cidade";

const DIAS = 30;
const QUANTOS = 5;

type Novo = {
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
function oQueE(tipo: string) {
  if (tipo === "pessoa") return "Pessoa";
  if (tipo === "agencia") return "Agência";
  if (tipo === "comercio") return "Comércio";
  return "Empresa";
}

/** Pessoa: "Maria S." (o nome inteiro só aparece na conexão aceita); empresa: o nome todo. */
function nomeNaLista(n: Novo) {
  if (n.tipo !== "pessoa") return n.nome;
  const [primeiro, ...resto] = n.nome.trim().split(/\s+/);
  const ultimo = resto.at(-1);
  return ultimo ? `${primeiro} ${ultimo.charAt(0).toLocaleUpperCase("pt-BR")}.` : primeiro;
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
 * Quão longe está a conta nova: pelo meio do bairro dela (quando há anúncio no bairro) até a casa
 * ou o bairro de quem vê; sem isso, pelo bairro, pela região e pela cidade (mesmo bairro primeiro).
 */
function distancia(n: Novo, local: Local | null, meios: Map<string, { lat: number; lng: number }>) {
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
 * Embaixo do cartão da conta (computador): quem entrou no Publike nos últimos 30 dias, do mais
 * perto para o mais longe, com o Conectar. Sem as contas suspensas e sem a própria conta.
 */
export async function NovosPerto() {
  if (MODO_DEMO) return null;
  const [usuario, local, agora] = await Promise.all([obterUsuario(), obterLocal(), agoraDaRequisicao()]);
  if (!usuario) return null;
  const desde = new Date(agora - DIAS * 24 * 3600 * 1000).toISOString();
  const supabase = await criarClienteServidor();
  const [{ data }, meios] = await Promise.all([
    supabase
      .from("perfis")
      .select("id, nome, tipo, foto, cidade, bairro, verificado, criado_em, suspenso_ate")
      .gte("criado_em", desde)
      .neq("id", usuario.id)
      .neq("id", usuario.pessoaId)
      .order("criado_em", { ascending: false })
      .limit(80),
    meiosDosBairros().catch(() => new Map<string, { lat: number; lng: number }>()),
  ]);
  const ativos = (data ?? []).filter((p) => !p.suspenso_ate || new Date(p.suspenso_ate).getTime() < agora);
  if (!ativos.length) return null;
  const novos = ativos
    .map((p) => ({ p, km: distancia(p, local, meios) }))
    // do mais perto para o mais longe; na mesma distância, o mais novo antes
    .sort((a, b) => a.km - b.km || Date.parse(b.p.criado_em) - Date.parse(a.p.criado_em))
    .slice(0, QUANTOS)
    .map(({ p }) => p);
  const estados = await estadosDeConexao(novos.map((n) => n.id));

  return (
    <section
      aria-labelledby="novos-perto"
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card"
    >
      <h2 id="novos-perto" className="text-label">
        Chegaram perto de você
      </h2>
      <ul className="flex flex-col gap-3.5">
        {novos.map((n) => (
          <li key={n.id} className="flex flex-col gap-1.5">
            <Link href={`/perfil/${n.id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
              <Avatar
                nome={n.nome}
                foto={n.foto}
                tamanho={36}
                forma={n.tipo === "pessoa" ? "redonda" : "quadrada"}
                colorida
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-body-sm font-semibold">
                  <span className="truncate">{nomeNaLista(n)}</span>
                  {n.verificado && <SeloVerificado agencia={n.tipo === "agencia"} />}
                </span>
                <span className="block truncate text-[13px] leading-[18px] text-ink-muted">
                  {oQueE(n.tipo)} · {formatarLugar(n.bairro, n.cidade)}
                </span>
              </span>
            </Link>
            <div className="pl-[46px]">
              <BotaoConectarCompacto
                outro={{ id: n.id, nome: n.nome, tipo: n.tipo }}
                estado={estados.get(n.id) ?? null}
                voltar="/"
                jeito="pilula"
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
