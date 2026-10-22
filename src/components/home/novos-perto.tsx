import { Sparkles } from "lucide-react";
import Link from "next/link";
import { obterUsuario } from "@/lib/dados";
import { distanciaKm } from "@/lib/descobrir";
import { formatarLugar, tempoRelativo } from "@/lib/formato";
import { obterLocal } from "@/lib/local";
import { chaveBairro, regiaoDoBairro, type Local } from "@/lib/regioes";
import { MODO_DEMO } from "@/lib/config";
import { estadosDeConexao } from "@/lib/servidor/conexoes";
import { anunciosNoAr } from "@/lib/servidor/paginas-busca";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import { BotaoConectarCompacto } from "../conexoes/botao-conectar-compacto";
import { SeloVerificado } from "../selo-verificado";
import { Avatar, Container } from "../ui/basicos";
import { cidadeDaVisita } from "@/lib/servidor/cidade";

const DIAS = 30;

/**
 * Onde a lista aparece: "coluna", embaixo do cartão da conta (computador); "faixa", uma linha que
 * rola de lado (no meio da linha do tempo no celular e na home de quem contrata); "vitrine", a
 * seção da home do visitante (o Conectar leva a entrar na conta).
 */
type Jeito = "coluna" | "faixa" | "vitrine";
const QUANTOS: Record<Jeito, number> = { coluna: 6, faixa: 10, vitrine: 10 };

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
 * Quem entrou no Publike nos últimos 30 dias, do mais perto para o mais longe, com o Conectar.
 * Sem as contas suspensas e sem a própria conta. `total`: quantas contas novas no mês.
 */
async function contasNovas(quantos: number) {
  const [usuario, local, agora] = await Promise.all([obterUsuario(), obterLocal(), agoraDaRequisicao()]);
  const desde = new Date(agora - DIAS * 24 * 3600 * 1000).toISOString();
  const supabase = await criarClienteServidor();
  let consulta = supabase
    .from("perfis")
    .select("id, nome, tipo, foto, cidade, bairro, verificado, criado_em, suspenso_ate")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(80);
  if (usuario) consulta = consulta.neq("id", usuario.id).neq("id", usuario.pessoaId);
  const [{ data }, meios] = await Promise.all([
    consulta,
    meiosDosBairros().catch(() => new Map<string, { lat: number; lng: number }>()),
  ]);
  const ativos = (data ?? []).filter((p) => !p.suspenso_ate || new Date(p.suspenso_ate).getTime() < agora);
  const novos = ativos
    .map((p) => ({ p, km: distancia(p, local, meios) }))
    // do mais perto para o mais longe; na mesma distância, o mais novo antes
    .sort((a, b) => a.km - b.km || Date.parse(b.p.criado_em) - Date.parse(a.p.criado_em))
    .slice(0, quantos)
    .map(({ p }) => p);
  // o visitante não tem conexões (o Conectar leva a entrar)
  const estados = usuario ? await estadosDeConexao(novos.map((n) => n.id)) : new Map();
  return { novos, total: ativos.length, estados, agora, logado: Boolean(usuario) };
}

/** "8 contas novas nos últimos 30 dias" (só quando há mais do que a lista mostra). */
function textoDoTotal(total: number, mostrados: number) {
  return total > mostrados ? `${total} contas novas nos últimos ${DIAS} dias.` : null;
}

export async function NovosPerto({ jeito = "coluna" }: { jeito?: Jeito }) {
  if (MODO_DEMO) return null;
  const { novos, total, estados, agora, logado } = await contasNovas(QUANTOS[jeito]);
  // a coluna e a faixa são de quem entrou; a vitrine, de quem ainda não entrou
  if ((jeito === "vitrine") === logado || !novos.length) return null;
  const totalTexto = textoDoTotal(total, novos.length);

  if (jeito === "coluna") {
    return (
      <section
        aria-labelledby="novos-perto"
        className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card"
      >
        <div>
          <h2 id="novos-perto" className="flex items-center gap-1.5 text-label">
            <Sparkles aria-hidden className="size-4 text-terra-text" />
            Chegaram perto de você
          </h2>
          {totalTexto && <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">{totalTexto}</p>}
        </div>
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
                  <span className="block truncate text-[12px] leading-4 text-ink-muted">
                    chegou {tempoRelativo(n.criado_em, agora)}
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

  const vitrine = jeito === "vitrine";
  const cartoes = (
    <ul
      className={`sem-barra -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 ${
        vitrine ? "mt-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5" : "mt-3"
      }`}
    >
      {novos.map((n) => (
        <li
          key={n.id}
          className={`flex shrink-0 flex-col items-center gap-2 rounded-lg border border-line bg-surface-200 p-3.5 text-center shadow-card ${
            vitrine ? "w-44 sm:w-auto" : "w-40"
          }`}
        >
          <Link
            href={`/perfil/${n.id}`}
            className="flex min-w-0 flex-col items-center gap-1.5 self-stretch hover:underline"
          >
            <Avatar
              nome={n.nome}
              foto={n.foto}
              tamanho={56}
              forma={n.tipo === "pessoa" ? "redonda" : "quadrada"}
              colorida
            />
            <span className="flex max-w-full items-center justify-center gap-1 text-body-sm font-semibold">
              <span className="truncate">{nomeNaLista(n)}</span>
              {n.verificado && <SeloVerificado agencia={n.tipo === "agencia"} />}
            </span>
            <span className="-mt-1 block max-w-full truncate text-[13px] leading-[18px] text-ink-muted">
              {oQueE(n.tipo)} · {formatarLugar(n.bairro, n.cidade)}
            </span>
            <span className="-mt-1 block text-[12px] text-ink-muted">chegou {tempoRelativo(n.criado_em, agora)}</span>
          </Link>
          <div className="mt-auto">
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
  );

  if (vitrine) {
    // a praça toda (a lista vem de todas as cidades dela): "Goiânia e região"
    const { praca } = await cidadeDaVisita();
    return (
      <Container className="mt-12 sm:mt-16">
        <section aria-labelledby="novos-no-publike">
          <h2 id="novos-no-publike" className="text-h2 sm:text-[28px] sm:leading-[34px]">
            Chegaram no Publike em {praca.nome}
          </h2>
          <p className="mt-1 text-body text-ink-muted">
            {totalTexto ?? "Gente e empresas que entraram nos últimos 30 dias."} Conecte-se para conversar e indicar
            trabalho.
          </p>
          {cartoes}
        </section>
      </Container>
    );
  }

  return (
    <section aria-labelledby="novos-perto-faixa" className="flex flex-col">
      <h2 id="novos-perto-faixa" className="flex items-center gap-1.5 text-h3">
        <Sparkles aria-hidden className="size-5 text-terra-text" />
        Chegaram perto de você
      </h2>
      {totalTexto && <p className="mt-0.5 text-body-sm text-ink-muted">{totalTexto}</p>}
      {cartoes}
    </section>
  );
}
