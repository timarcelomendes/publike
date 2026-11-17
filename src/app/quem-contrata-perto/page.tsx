import { MapPinned, Printer, Route, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Filtros, linkCom } from "@/components/admin/ui";
import { CardAnuncio } from "@/components/card-anuncio";
import { EscolherLugares, type LugarDaRota } from "@/components/rota/escolher-lugares";
import { EscolherFuncao } from "@/components/rota/escolher-funcao";
import { OndeMoraDaRota } from "@/components/rota/onde-mora-da-rota";
import { Container, Esqueleto, Vazio } from "@/components/ui/basicos";
import { obterMeuCurriculo, obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { formatarNumero, primeiro, tempoRelativo } from "@/lib/formato";
import { ocupacao } from "@/lib/cbo";
import { funcoesComuns, tituloDaFuncao } from "@/lib/funcao-cbo";
import { caminhoDaFuncao, funcaoDaListaPeloCbo } from "@/lib/funcoes-das-paginas";
import { obterLocal } from "@/lib/local";
import { RAIOS_DA_ROTA } from "@/lib/rota-curriculo";
import { funcoesParaARota, nomeDoLugarAqui, origemDaRota, vagasDaFuncaoPerto } from "@/lib/servidor/funcoes-da-rota";
import { NOTA_DO_RAMO, ramoNaCidade } from "@/lib/servidor/ramo-na-cidade";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = {
  title: "Quem contrata perto de você: os lugares que contratam a sua função, no mapa",
  description:
    "Veja no mapa os comércios perto de você que costumam contratar a sua função e as vagas abertas no Publike. Diga que quer trabalhar lá em um toque ou leve o currículo impresso, com QR code. Grátis.",
  alternates: { canonical: "/quem-contrata-perto" },
};

// Quem contrata perto, antes "Rota do currículo" (claude/plano-base-de-empresas-da-receita.md, parte 2; migração
// 20270605120000; o nome mudou em 16/11/2026, e /rota-do-curriculo leva para cá, next.config.ts): escolher a
// função e a distância, marcar os comércios dos ramos que mais contratam essa função e imprimir uma cópia para cada um.
// Aberta também sem conta (migração 20270613120000). Desde 16/11/2026 (migração 20270622120000; Marcelo: "quero essa
// funcionalidade mais estratégica e que as pessoas vejam o mapa de cara"): o mapa abre na hora, mesmo sem saber onde a
// pessoa mora (conta do centro da cidade) nem a função (uma comum), e mostra junto as vagas no ar no Publike da função.

/** Sem função no currículo nem escolhida: o mapa abre com uma função comum, que a pessoa troca. */
const FUNCAO_PADRAO = "521110";
/** Nenhum lugar para a função: as funções que mais aparecem no comércio, para tentar. */
const PARA_TENTAR = ["521110", "521140", "421125", "513505", "521125", "513405"];

// imprimir é a opção de quem vai passar lá (16/11/2026, Marcelo: "pode ser uma opção secundária")
const PASSOS = [
  { icone: MapPinned, titulo: "Veja quem contrata perto", texto: "No mapa, os lugares perto de você que costumam contratar a sua função e as vagas abertas no Publike." },
  { icone: Send, titulo: "Diga que quer trabalhar lá", texto: "Um toque em “Quero trabalhar aqui”: o lugar que está no Publike recebe o seu currículo; os outros mostram o WhatsApp e o telefone." },
  { icone: Printer, titulo: "Vai passar lá? Leve impresso", texto: "Marque os lugares e imprima uma cópia do currículo para cada um, com QR code. O Publike avisa quando alguém ler." },
];

const MES_ANO = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });

export default function QuemContrataPerto({ searchParams }: PageProps<"/quem-contrata-perto">) {
  return (
    <Container className="py-6 sm:py-8">
      <h1 className="text-h2 sm:text-h1">Quem contrata perto de você</h1>
      <p className="mt-1 max-w-2xl text-body text-ink-muted">
        No mapa, os lugares perto de você que costumam contratar a sua função e as vagas abertas no Publike. Grátis.
      </p>
      <Suspense fallback={<EsqueletoDaRota />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
      <section aria-labelledby="como-funciona" className="mt-12 flex flex-col gap-3">
        <h2 id="como-funciona" className="text-h3">
          Como funciona
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {PASSOS.map(({ icone: Icone, titulo, texto }, i) => (
            <li key={titulo} className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-200 p-4">
              <span className="flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-terra text-[13px] font-semibold text-white">
                  {i + 1}
                </span>
                <Icone aria-hidden className="size-5 text-terra-text" />
              </span>
              <span className="text-label text-ink">{titulo}</span>
              <span className="text-body-sm text-ink-muted">{texto}</span>
            </li>
          ))}
        </ol>
      </section>
    </Container>
  );
}

function EsqueletoDaRota() {
  return (
    <div className="mt-5 flex flex-col gap-3">
      <Esqueleto className="h-11 w-full max-w-md" />
      <Esqueleto className="h-10 w-72" />
      <Esqueleto className="mt-2 h-[min(62vh,34rem)] min-h-80 w-full rounded-lg" />
    </div>
  );
}

/** O bairro de onde a pessoa está, no botão "Saindo de" (sem achar, fica "Onde você está"). */
async function NomeDoLugarAqui({ ponto }: { ponto: { lat: number; lng: number } }) {
  return (await nomeDoLugarAqui(ponto)) ?? "Onde você está";
}

type MinhaRota = { id: string; funcao: string; raio_km: number; criada_em: string; copias: number; entregues: number; abertas: number };

async function Conteudo({ searchParams }: { searchParams: PageProps<"/quem-contrata-perto">["searchParams"] }) {
  const sp = await searchParams;
  const usuario = await obterUsuario().catch(() => null);
  const [perfil, curriculo, local, agora] = await Promise.all([
    usuario ? obterMeuPerfil() : Promise.resolve(null),
    usuario ? obterMeuCurriculo() : Promise.resolve(null),
    obterLocal(),
    agoraDaRequisicao(),
  ]);

  // conta de empresa ou agência: vê o mapa como quem visita, sem montar nem imprimir
  const daEmpresa = Boolean(usuario && perfil && perfil.tipo !== "pessoa");

  const doCurriculo = await funcoesParaARota(curriculo);
  const comuns = funcoesComuns();
  const pedida = primeiro(sp.cbo);
  // qualquer função da CBO vale (a busca); o nome que a pessoa escolheu vem junto, se for um nome
  const nomePedido = String(primeiro(sp.nome) ?? "").trim();
  const daCbo = pedida && /^\d{6}$/.test(pedida) ? ocupacao(pedida) : null;
  const pela =
    doCurriculo.find((f) => f.cbo === pedida) ??
    comuns.find((f) => f.cbo === pedida) ??
    (daCbo
      ? {
          cbo: daCbo.cbo,
          titulo: /^[\p{L} ,.'()/-]{2,60}$/u.test(nomePedido) ? nomePedido : (tituloDaFuncao(daCbo.cbo) ?? daCbo.nome),
        }
      : null) ??
    doCurriculo[0] ??
    null;
  const padrao = !pela;
  const escolhida = pela ?? { cbo: FUNCAO_PADRAO, titulo: tituloDaFuncao(FUNCAO_PADRAO) ?? "Vendedor" };
  const funcao = escolhida.titulo.toLowerCase();
  const raioPedido = Number(primeiro(sp.raio));
  const raio = (RAIOS_DA_ROTA as readonly number[]).includes(raioPedido) ? raioPedido : 2;
  const origem = await origemDaRota(perfil);
  const atuais = {
    cbo: padrao ? undefined : escolhida.cbo,
    raio: String(raio),
    nome: !padrao && escolhida.cbo === pedida && nomePedido ? escolhida.titulo : undefined,
  };
  // para onde vai o botão: sem conta, entrar (e voltar aqui); sem currículo, preencher
  const aqui = linkCom("/quem-contrata-perto", atuais, {});
  const falta = daEmpresa
    ? null
    : !usuario
    ? { href: `/entrar?next=${encodeURIComponent(aqui)}`, texto: "Entrar para imprimir" }
    : !curriculo
      ? { href: `/perfil/curriculo?next=${encodeURIComponent(aqui)}`, texto: "Preencher o currículo para imprimir" }
      : null;

  const banco = await criarClienteServidor();
  const [resposta, vagas, rotas] = await Promise.all([
    banco.rpc("lugares_da_rota", {
      p_cbo: escolhida.cbo,
      p_lat: origem.ponto.lat,
      p_lng: origem.ponto.lng,
      p_raio_km: raio,
      p_limite: usuario ? 100 : 30,
    }),
    vagasDaFuncaoPerto(escolhida.cbo, origem.ponto, raio, origem.cidade),
    usuario ? banco.rpc("minhas_rotas_curriculo").then((r) => (r.data ?? []) as unknown as MinhaRota[]) : Promise.resolve([] as MinhaRota[]),
  ]);
  if (resposta.error) console.error("Publike: falha ao ler os lugares da rota:", resposta.error.message);
  const linhas = resposta.data ?? [];
  const umAno = 365 * 24 * 3600_000;
  // os lugares em que a pessoa já disse "quero trabalhar aqui" (abrem com o Desistir; sem a migração, nenhum)
  // e quantas pessoas o ramo de cada um contratou na cidade (Novo Caged; o número é do ramo, não da empresa)
  const [queroLista, noRamo] = await Promise.all([
    usuario && linhas.length
      ? banco.rpc("meus_interesses", { p_cnpjs: linhas.map((l) => l.cnpj) }).then((r) => r.data ?? [])
      : Promise.resolve([] as string[]),
    ramoNaCidade(
      linhas.map((l) => l.cnpj),
      escolhida.cbo,
    ),
  ]);
  const quero = new Set<string>(queroLista);
  const lugares: LugarDaRota[] = linhas.map((l) => ({
    cnpj: l.cnpj,
    nome: l.nome,
    ramo: l.ramo,
    endereco: l.endereco,
    bairro: l.bairro,
    cidade: l.cidade,
    lat: l.lat,
    lng: l.lng,
    distancia_m: l.distancia_m,
    no_publike: Boolean(l.no_publike),
    quero: quero.has(l.cnpj),
    ramo_na_cidade: noRamo.get(l.cnpj) ?? null,
    novo:
      l.aberta_em && agora - Date.parse(l.aberta_em) <= umAno ? `Abriu em ${MES_ANO.format(new Date(l.aberta_em))}` : null,
  }));
  const total = Number(linhas[0]?.total ?? lugares.length) || lugares.length;
  const paginaDaFuncao = funcaoDaListaPeloCbo(escolhida.cbo);
  const linkDasVagas = paginaDaFuncao ? caminhoDaFuncao(origem.cidade, paginaDaFuncao.slug) : null;

  const deOnde = {
    casa: "Contando da sua casa.",
    aqui: "Contando de onde você está agora.",
    bairro: `Contando do meio do bairro ${origem.nome}. Com o CEP, fica exato.`,
    cidade: `Contando do centro de ${origem.cidade}: diga onde você mora para ver os mais perto de você.`,
  }[origem.tipo];
  const rotuloCasa = { casa: "Sua casa", aqui: "Você", bairro: "Seu bairro", cidade: `Centro de ${origem.cidade}` }[origem.tipo];

  const cartoesDasVagas =
    vagas.perto.length > 0 ? (
      <section aria-labelledby="vagas-da-rota" className="flex flex-col gap-3 rounded-lg border border-cerrado/30 bg-cerrado/5 p-3 sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 id="vagas-da-rota" className="text-label text-cerrado-text">
            {vagas.perto.length === 1
              ? `1 vaga de ${funcao} aberta no Publike perto de você`
              : `${vagas.perto.length} vagas de ${funcao} abertas no Publike perto de você`}
          </h3>
          {linkDasVagas && vagas.naPraca > vagas.perto.length && (
            <Link href={linkDasVagas} className="text-body-sm text-ink underline underline-offset-2">
              Ver as {vagas.naPraca} de {origem.cidade}
            </Link>
          )}
        </div>
        <p className="text-body-sm text-ink-muted">Estas estão contratando agora: curta para a empresa ver o seu currículo.</p>
        <ul className="grid gap-3">
          {vagas.perto.slice(0, 6).map((v) => (
            <li key={v.id} id={`vaga-${v.id}`} className="scroll-mt-24 rounded-lg transition-shadow">
              <CardAnuncio anuncio={v} agora={agora} usuarioId={null} />
            </li>
          ))}
        </ul>
      </section>
    ) : linkDasVagas && vagas.naPraca > 0 ? (
      <p className="rounded-lg border border-line bg-surface-200 p-3 text-body-sm text-ink">
        Nenhuma vaga de {funcao} no ar a até {raio} km.{" "}
        <Link href={linkDasVagas} className="underline underline-offset-2">
          Ver as {vagas.naPraca} de {origem.cidade}
        </Link>
      </p>
    ) : null;

  const topo = (
    <>
      <div className="flex flex-col gap-3">
        {doCurriculo.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-body-sm text-ink-muted">Do seu currículo</span>
            <Filtros
              rotulo="Função do currículo"
              opcoes={doCurriculo.map((f) => ({ valor: f.cbo, nome: f.titulo }))}
              atual={padrao ? "" : escolhida.cbo}
              link={(v) => linkCom("/quem-contrata-perto", atuais, { cbo: v, nome: null })}
            />
          </div>
        )}
        <EscolherFuncao
          comuns={comuns}
          atual={!padrao && !doCurriculo.some((f) => f.cbo === escolhida.cbo) ? escolhida.titulo : ""}
          raio={raio}
          rotulo={doCurriculo.length ? "Ou procure outra função" : "Sua função"}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
          <OndeMoraDaRota
            local={local}
            origem={{ tipo: origem.tipo, nome: origem.nome, cidade: origem.cidade }}
            nomeAqui={
              // o bairro de onde a pessoa está chega depois, sem segurar o mapa
              origem.tipo === "aqui" ? (
                <Suspense fallback="Onde você está">
                  <NomeDoLugarAqui ponto={origem.ponto} />
                </Suspense>
              ) : undefined
            }
          />
          <Filtros
            rotulo="Até onde você vai"
            opcoes={RAIOS_DA_ROTA.map((r) => ({ valor: String(r), nome: r === 1 ? "1 km (a pé)" : `até ${r} km` }))}
            atual={String(raio)}
            link={(v) => linkCom("/quem-contrata-perto", atuais, { raio: v })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-h3">
          {total === 0
            ? `Nenhum lugar para ${funcao} a até ${raio} km`
            : `${formatarNumero(total)} ${total === 1 ? "lugar que costuma" : "lugares que costumam"} contratar ${funcao} a até ${raio} km`}
        </h2>
        <p className="max-w-3xl text-body-sm text-ink-muted">
          {padrao && <>Mostrando {funcao}, uma função comum: escolha a sua acima. </>}
          {deOnde} Lugar no mapa não quer dizer vaga aberta
          {vagas.perto.length > 0 ? "; as vagas do Publike estão em verde." : "."}
          {noRamo.size > 0 && <> {NOTA_DO_RAMO}</>}
          {!usuario && total > lugares.length && (
            <>
              {" "}
              Sem conta, aparecem os {lugares.length} mais perto.{" "}
              <Link rel="nofollow" href={`/entrar?next=${encodeURIComponent(aqui)}`} className="text-ink underline underline-offset-2">
                Entre para ver os {formatarNumero(total)}
              </Link>
              .
            </>
          )}
        </p>
      </div>
    </>
  );

  return (
    <div className="mt-5 flex flex-col gap-4">
      <EscolherLugares
        key={`${escolhida.cbo}-${raio}-${origem.ponto.lat},${origem.ponto.lng}`}
        lugares={lugares}
        cbo={escolhida.cbo}
        funcao={escolhida.titulo}
        raio={raio}
        casa={origem.ponto}
        rotuloCasa={rotuloCasa}
        semOrigem={origem.tipo === "cidade"}
        vagas={vagas.perto.map((v) => ({ id: v.id, titulo: v.titulo, lat: v.lat, lng: v.lng }))}
        cartoesDasVagas={cartoesDasVagas}
        vazio={
          <Vazio icone={Route} titulo={`Nenhum lugar para ${funcao} a até ${raio} km`}>
            {raio < 5 ? "Tente uma distância maior ou outra função. " : "Tente outra função. "}A lista vem dos comércios
            abertos na Receita e do que cada ramo costuma contratar; ela cresce a cada mês.
            <span className="mt-3 flex flex-wrap justify-center gap-2">
              {PARA_TENTAR.filter((c) => c !== escolhida.cbo).map((c) => (
                <Link
                  key={c}
                  href={linkCom("/quem-contrata-perto", atuais, { cbo: c, nome: null })}
                  scroll={false}
                  className="inline-flex min-h-9 items-center rounded-pill border border-line-strong bg-surface-100 px-3.5 text-label text-ink hover:bg-surface-300"
                >
                  {tituloDaFuncao(c) ?? c}
                </Link>
              ))}
            </span>
          </Vazio>
        }
        falta={falta}
        topo={topo}
        soVer={daEmpresa ? "Esta página é para quem procura trabalho: com uma conta de pessoa, dá para dizer que quer trabalhar em cada lugar e levar o currículo impresso." : null}
      />

      {rotas.length > 0 && (
        <section className="mt-6 flex flex-col gap-3">
          <h2 className="text-h3">Suas cópias impressas</h2>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {rotas.map((r) => (
              <li key={r.id}>
                <Link href={`/quem-contrata-perto/${r.id}`} className="flex flex-wrap justify-between gap-2 p-4 hover:bg-surface-300">
                  <span className="text-label text-ink">
                    {r.funcao}, até {formatarNumero(r.raio_km)} km
                  </span>
                  <span className="text-body-sm text-ink-muted">
                    {r.entregues} de {r.copias} entregues
                    {r.abertas > 0 && `, ${r.abertas} ${r.abertas === 1 ? "aberta" : "abertas"}`} ·{" "}
                    {tempoRelativo(r.criada_em, agora)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
