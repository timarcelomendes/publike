import { MapPinned, Printer, QrCode, Route } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Filtros, linkCom } from "@/components/admin/ui";
import { EscolherLugares, type LugarDaRota } from "@/components/rota/escolher-lugares";
import { EscolherFuncao } from "@/components/rota/escolher-funcao";
import { OndeMoraDaRota } from "@/components/rota/onde-mora-da-rota";
import { Aviso, Container, Esqueleto, Vazio } from "@/components/ui/basicos";
import { obterMeuCurriculo, obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { formatarNumero, primeiro, tempoRelativo } from "@/lib/formato";
import { funcoesComuns } from "@/lib/funcao-cbo";
import { obterLocal } from "@/lib/local";
import { RAIOS_DA_ROTA } from "@/lib/rota-curriculo";
import { funcoesParaARota, pontoDaPessoa } from "@/lib/servidor/funcoes-da-rota";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = {
  title: "Rota do currículo: onde deixar o seu currículo perto de casa",
  description:
    "Escolha a sua função e veja no mapa os comércios perto de casa que costumam contratar. Imprima uma cópia do currículo para cada lugar, com QR code, e saiba quando alguém ler. Grátis.",
  alternates: { canonical: "/rota-do-curriculo" },
};

// Rota do currículo (claude/plano-base-de-empresas-da-receita.md, parte 2; migração 20270605120000): escolher a
// função e a distância, marcar os comércios dos ramos que mais contratam essa função e imprimir uma cópia para cada um.
// Aberta também sem conta (migração 20270613120000): quem visita vê como funciona e os lugares no mapa; montar e
// imprimir pedem a conta.

const PASSOS = [
  { icone: MapPinned, titulo: "Escolha onde entregar", texto: "Veja no mapa os lugares perto de casa que costumam contratar a sua função e toque nos que quer visitar." },
  { icone: Printer, titulo: "Imprima uma cópia para cada lugar", texto: "Cada cópia sai com o nome do lugar no alto. Junto vem a lista dos endereços, do mais perto ao mais longe." },
  { icone: QrCode, titulo: "Saiba quem leu", texto: "Cada cópia tem um QR code. Quando alguém do lugar escaneia, o Publike te avisa." },
];

export default function RotaDoCurriculo({ searchParams }: PageProps<"/rota-do-curriculo">) {
  return (
    <Container className="max-w-3xl py-8">
      <h1 className="text-h2 sm:text-h1">Rota do currículo</h1>
      <p className="mt-2 max-w-2xl text-body text-ink-muted">
        Vai entregar currículo de porta em porta? Veja os lugares perto de casa que costumam contratar a sua função,
        escolha onde vai passar e imprima uma cópia para cada um. Grátis.
      </p>
      <ol className="mt-6 grid gap-3 sm:grid-cols-3">
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
      <Suspense fallback={<Esqueleto className="mt-6 h-96 w-full rounded-lg" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

type MinhaRota = { id: string; funcao: string; raio_km: number; criada_em: string; copias: number; entregues: number; abertas: number };

async function Conteudo({ searchParams }: { searchParams: PageProps<"/rota-do-curriculo">["searchParams"] }) {
  const sp = await searchParams;
  const usuario = await obterUsuario().catch(() => null);
  const [perfil, curriculo, local, agora] = await Promise.all([
    usuario ? obterMeuPerfil() : Promise.resolve(null),
    usuario ? obterMeuCurriculo() : Promise.resolve(null),
    obterLocal(),
    agoraDaRequisicao(),
  ]);
  const banco = await criarClienteServidor();
  const rotas = usuario ? (((await banco.rpc("minhas_rotas_curriculo")).data ?? []) as unknown as MinhaRota[]) : [];

  const minhas =
    rotas.length > 0 ? (
      <section className="mt-10 flex flex-col gap-3">
        <h2 className="text-h3">Minhas rotas</h2>
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
          {rotas.map((r) => (
            <li key={r.id}>
              <Link href={`/rota-do-curriculo/${r.id}`} className="flex flex-wrap justify-between gap-2 p-4 hover:bg-surface-300">
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
    ) : null;

  if (usuario && perfil && perfil.tipo !== "pessoa") {
    return (
      <Aviso tipo="info" titulo="A rota é para quem procura trabalho" className="mt-6">
        Entre com a sua conta de pessoa para montar a rota do seu currículo.
      </Aviso>
    );
  }

  const doCurriculo = await funcoesParaARota(curriculo);
  const comuns = funcoesComuns();
  const pedida = primeiro(sp.cbo);
  const escolhida =
    doCurriculo.find((f) => f.cbo === pedida) ?? comuns.find((f) => f.cbo === pedida) ?? doCurriculo[0] ?? null;
  const raioPedido = Number(primeiro(sp.raio));
  const raio = (RAIOS_DA_ROTA as readonly number[]).includes(raioPedido) ? raioPedido : 2;
  // o CEP de casa, o bairro escolhido neste aparelho ou, com conta, o meio do bairro do perfil
  const ponto = local?.ponto ?? local?.centro ?? (usuario ? ((await pontoDaPessoa(perfil))?.ponto ?? null) : null);
  const atuais = { cbo: escolhida?.cbo, raio: String(raio) };
  // para onde vai o botão: sem conta, entrar (e voltar aqui); sem currículo, preencher
  const aqui = linkCom("/rota-do-curriculo", atuais, {});
  const falta = !usuario
    ? { href: `/entrar?next=${encodeURIComponent(aqui)}`, texto: "Entrar para montar e imprimir" }
    : !curriculo
      ? { href: `/perfil/curriculo?next=${encodeURIComponent(aqui)}`, texto: "Preencher o currículo para imprimir" }
      : null;

  let lugares: LugarDaRota[] = [];
  if (escolhida && ponto) {
    const { data } = await banco.rpc("lugares_da_rota", {
      p_cbo: escolhida.cbo,
      p_lat: ponto.lat,
      p_lng: ponto.lng,
      p_raio_km: raio,
      p_limite: 60,
    });
    lugares = (data ?? []) as LugarDaRota[];
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
        <section className="flex flex-col gap-2">
          <h2 className="text-label text-ink">Sua função</h2>
          {doCurriculo.length > 0 && (
            <Filtros
              rotulo="Função"
              opcoes={doCurriculo.map((f) => ({ valor: f.cbo, nome: f.titulo }))}
              atual={escolhida?.cbo ?? ""}
              link={(v) => linkCom("/rota-do-curriculo", atuais, { cbo: v })}
            />
          )}
          <EscolherFuncao
            funcoes={comuns}
            atual={escolhida && !doCurriculo.some((f) => f.cbo === escolhida.cbo) ? escolhida.cbo : ""}
            raio={raio}
            rotulo={doCurriculo.length ? "Ou outra:" : "Qual você procura?"}
          />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-label text-ink">Saindo de</h2>
          <OndeMoraDaRota local={local} />
          {local && !local.ponto && (
            <p className="text-body-sm text-ink-muted">Sem o CEP, contamos a distância do meio do bairro. Com ele, fica exata. Ninguém mais vê.</p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-label text-ink">Até onde você vai</h2>
          <Filtros
            rotulo="Distância"
            opcoes={RAIOS_DA_ROTA.map((r) => ({ valor: String(r), nome: r === 1 ? "1 km (a pé)" : `${r} km` }))}
            atual={String(raio)}
            link={(v) => linkCom("/rota-do-curriculo", atuais, { raio: v })}
          />
        </section>
      </div>

      {!escolhida ? (
        <Aviso tipo="info" titulo="Escolha a função">
          {curriculo
            ? "Não achamos a função no seu currículo. Escolha acima a que você procura."
            : "Escolha acima a função que você procura: padeiro, operador de caixa, auxiliar de cozinha…"}
        </Aviso>
      ) : !ponto ? (
        <Aviso tipo="info" titulo="Diga onde você mora">
          A rota sai de casa. Diga o CEP ou o bairro em “Saindo de”, acima. Ninguém mais vê.
        </Aviso>
      ) : lugares.length === 0 ? (
        <Vazio icone={Route} titulo={`Nenhum lugar para ${escolhida.titulo.toLowerCase()} a até ${raio} km`}>
          {raio < 5 ? "Tente uma distância maior. " : ""}A lista vem dos comércios abertos na Receita e do que cada ramo
          costuma contratar; ela cresce a cada mês.
        </Vazio>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-h3">
            {lugares.length} {lugares.length === 1 ? "lugar" : "lugares"} para {escolhida.titulo.toLowerCase()} a até{" "}
            {raio} km
          </h2>
          <p className="max-w-2xl text-body-sm text-ink-muted">
            São lugares dos ramos que mais contratam a sua função, do mais perto ao mais longe. Não quer dizer que têm vaga
            agora. Toque nos pontos do mapa ou em “Vou entregar aqui” para escolher onde passar, até 15.
          </p>
          <EscolherLugares
            key={`${escolhida.cbo}-${raio}`}
            lugares={lugares}
            cbo={escolhida.cbo}
            funcao={escolhida.titulo}
            raio={raio}
            casa={ponto}
            falta={falta}
          />
        </section>
      )}
      {minhas}
    </div>
  );
}
