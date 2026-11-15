import { MapPinned, Printer, QrCode, Route } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Filtros, linkCom } from "@/components/admin/ui";
import { EscolherLugares, type LugarDaRota } from "@/components/rota/escolher-lugares";
import { OndeMoraDaRota } from "@/components/rota/onde-mora-da-rota";
import { Aviso, Container, Esqueleto, Vazio } from "@/components/ui/basicos";
import { classesBotao } from "@/components/ui/botao";
import { obterMeuCurriculo, obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { formatarNumero, primeiro, tempoRelativo } from "@/lib/formato";
import { funcoesComuns } from "@/lib/funcao-cbo";
import { obterLocal } from "@/lib/local";
import { funcoesDoCurriculo, RAIOS_DA_ROTA } from "@/lib/rota-curriculo";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = {
  title: "Rota do currículo: onde deixar o seu currículo perto de casa",
  description:
    "Escolha a sua função e veja no mapa os comércios perto de casa que costumam contratar. Imprima uma cópia do currículo para cada lugar, com QR code, e saiba quando abrirem. Grátis.",
  alternates: { canonical: "/rota-do-curriculo" },
};

// Rota do currículo (claude/plano-base-de-empresas-da-receita.md, parte 2; migração 20270605120000): escolher a
// função e a distância, marcar os comércios dos ramos que mais contratam essa função e imprimir uma cópia para cada um.
// Aberta também sem conta (migração 20270613120000): quem visita vê como funciona e os lugares no mapa; montar e
// imprimir pedem a conta.

const PASSOS = [
  { icone: MapPinned, titulo: "Veja os lugares perto de casa", texto: "Os comércios que costumam contratar a sua função, no mapa, com o tempo a pé ou de ônibus." },
  { icone: Printer, titulo: "Imprima uma cópia para cada um", texto: "Com “Para: Padaria X” no alto. A folha com os endereços na ordem sai junto." },
  { icone: QrCode, titulo: "Saiba quando abrirem", texto: "Cada cópia tem um QR code. Quando o dono escaneia, você recebe o aviso." },
];

export default function RotaDoCurriculo({ searchParams }: PageProps<"/rota-do-curriculo">) {
  return (
    <Container className="max-w-3xl py-8">
      <h1 className="text-h2 sm:text-h1">Rota do currículo</h1>
      <p className="mt-2 max-w-2xl text-body text-ink-muted">
        Vai entregar currículo de porta em porta? O Publike mostra os lugares perto de casa que costumam contratar a sua
        função e imprime uma cópia para cada um, com o nome do lugar e um QR code. Você fica sabendo quando abrirem.
      </p>
      <ol className="mt-6 grid gap-3 sm:grid-cols-3">
        {PASSOS.map(({ icone: Icone, titulo, texto }) => (
          <li key={titulo} className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-200 p-4">
            <Icone aria-hidden className="size-5 text-terra-text" />
            <span className="text-label text-ink">{titulo}</span>
            <span className="text-body-sm text-ink-muted">{texto}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-body-sm text-ink-muted">Grátis. Os lugares vêm dos dados abertos da Receita Federal e do que cada ramo contrata (Novo Caged).</p>
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

  const doCurriculo = funcoesDoCurriculo(curriculo);
  const comuns = funcoesComuns();
  const pedida = primeiro(sp.cbo);
  const escolhida =
    doCurriculo.find((f) => f.cbo === pedida) ?? comuns.find((f) => f.cbo === pedida) ?? doCurriculo[0] ?? null;
  const raioPedido = Number(primeiro(sp.raio));
  const raio = (RAIOS_DA_ROTA as readonly number[]).includes(raioPedido) ? raioPedido : 2;
  const ponto = local?.ponto ?? local?.centro ?? null;
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
      <section className="flex flex-col gap-2">
        <h2 className="text-label text-ink">De onde a rota sai</h2>
        <OndeMoraDaRota local={local} />
        {local && !local.ponto && (
          <p className="text-body-sm text-ink-muted">Com o CEP de casa, as distâncias ficam certas. Sem ele, contamos do meio do bairro.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-label text-ink">Para qual função</h2>
        {doCurriculo.length > 0 && (
          <Filtros
            rotulo="Função"
            opcoes={doCurriculo.map((f) => ({ valor: f.cbo, nome: f.titulo }))}
            atual={escolhida?.cbo ?? ""}
            link={(v) => linkCom("/rota-do-curriculo", atuais, { cbo: v })}
          />
        )}
        <form action="/rota-do-curriculo" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="raio" value={raio} />
          <label htmlFor="outra-funcao" className="text-body-sm text-ink-muted">
            {doCurriculo.length ? "Outra função:" : "Sua função:"}
          </label>
          <select
            id="outra-funcao"
            name="cbo"
            defaultValue={escolhida && !doCurriculo.some((f) => f.cbo === escolhida.cbo) ? escolhida.cbo : ""}
            className="min-h-10 rounded-sm border border-line-strong bg-surface-200 px-3 text-body-sm text-ink"
          >
            <option value="">Escolha…</option>
            {comuns.map((f) => (
              <option key={f.cbo} value={f.cbo}>
                {f.titulo}
              </option>
            ))}
          </select>
          <button type="submit" className={classesBotao("secundario", "sm")}>
            Ver lugares
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-label text-ink">Até que distância de casa</h2>
        <Filtros
          rotulo="Distância"
          opcoes={RAIOS_DA_ROTA.map((r) => ({ valor: String(r), nome: `${r} km` }))}
          atual={String(raio)}
          link={(v) => linkCom("/rota-do-curriculo", atuais, { raio: v })}
        />
      </section>

      {!escolhida ? (
        <Aviso tipo="info" titulo="Escolha a função">
          {curriculo
            ? "O seu currículo não diz uma função que a gente conheça. Escolha acima a função que você procura."
            : "Escolha acima a função que você procura: padeiro, operador de caixa, auxiliar de cozinha…"}
        </Aviso>
      ) : !ponto ? (
        <Aviso tipo="info" titulo="Diga onde você mora">
          A rota sai de casa. Use o “Onde você mora?” acima: com o CEP, as distâncias ficam certas. Ninguém mais vê.
        </Aviso>
      ) : lugares.length === 0 ? (
        <Vazio icone={Route} titulo={`Nenhum lugar para ${escolhida.titulo.toLowerCase()} a até ${raio} km`}>
          {raio < 5 ? "Tente uma distância maior. " : ""}A lista vem dos comércios abertos na Receita e do que cada ramo
          costuma contratar; ela cresce a cada mês.
        </Vazio>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-h3">
            {escolhida.titulo}: {lugares.length} {lugares.length === 1 ? "lugar" : "lugares"} a até {raio} km
          </h2>
          <p className="text-body-sm text-ink-muted">
            Lugares que costumam contratar a sua função, do mais perto para o mais longe. Não quer dizer que têm vaga
            aberta agora: é para você deixar o currículo.
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
