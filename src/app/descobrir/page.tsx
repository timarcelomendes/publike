import { Flame, Heart, House, Sparkles, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CardAnuncio } from "@/components/card-anuncio";
import { PilhaDeVagas, type CartaVaga } from "@/components/descobrir/pilha";
import { EditorProcuro, EscolherBairro, TirarSalva } from "@/components/descobrir/extras";
import { Aviso, Container, Esqueleto, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import {
  listarVagasParaDescobrir,
  obterMeuCurriculo,
  obterMeuPerfil,
  obterProcuro,
  obterUsuario,
} from "@/lib/dados";
import { calorDaVaga, pontuar, type QuemProcura, type VagaIndicada } from "@/lib/descobrir";
import { formatarDistancia, formatarLugar, primeiro, rotuloConta, rotuloModalidade, valorDoAnuncio } from "@/lib/formato";
import { obterLocal } from "@/lib/local";
import { nomeDaArea, pontoDoLocal } from "@/lib/regioes";
import { notasDaIA } from "@/lib/servidor/indicacoes";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { DadosCard } from "@/lib/tipos";

export const metadata: Metadata = {
  title: "Descobrir vagas",
  description:
    "Deslize para o lado e ache trabalho perto de casa: vagas que combinam com você, no seu bairro e em alta em Goiânia e região.",
};

const ABAS = [
  { valor: "para-voce", nome: "Para você", icone: Sparkles },
  { valor: "perto", nome: "No seu bairro", icone: House },
  { valor: "em-alta", nome: "Em alta", icone: Flame },
  { valor: "salvas", nome: "Salvas", icone: Star },
] as const;
type Aba = (typeof ABAS)[number]["valor"];

export default function Descobrir({ searchParams }: PageProps<"/descobrir">) {
  return (
    <Container className="max-w-6xl py-6 sm:py-8">
      <h1 className="text-h2 sm:text-h1">Descobrir</h1>
      <p className="mt-1 hidden text-body text-ink-muted sm:block">
        Vagas que combinam com você, uma de cada vez. Gostou, curta. Não é para você, passe.
      </p>
      <Suspense fallback={<Esqueleto className="mt-6 h-[40rem] w-full rounded-lg" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

function paraCard(v: VagaIndicada): DadosCard {
  return {
    id: v.id,
    tipo: "vaga",
    titulo: v.titulo,
    categoria: v.categoria,
    regime: v.regime,
    pagamento_valor: v.pagamento_valor,
    pagamento_unidade: v.pagamento_unidade,
    beneficios: v.beneficios,
    cidade: v.cidade,
    bairro: v.bairro,
    criado_em: v.criado_em,
    autor_id: v.autor_id,
    autor_nome: v.autor_nome,
    autor_tipo: v.autor_tipo,
    autor_verificado: v.autor_verificado,
    minha_curtida: v.minha_curtida,
    distancia_km: v.distanciaKm,
  };
}

function paraCarta(v: VagaIndicada): CartaVaga {
  const resumo = v.descricao.replace(/\s+/g, " ").trim();
  return {
    id: v.id,
    titulo: v.titulo,
    quem: v.autor_nome,
    quemTipo: rotuloConta(v.autor_tipo),
    verificado: v.autor_verificado,
    contratante: v.contratante ?? (v.contratante_confidencial ? "empresa confidencial" : null),
    valor: valorDoAnuncio({ ...v, tipo: "vaga" }),
    regime: rotuloModalidade("vaga", v.regime),
    lugar: formatarLugar(v.bairro, v.cidade),
    distancia: formatarDistancia(v.distanciaKm),
    nota: v.nota,
    motivos: v.motivos,
    pedeCurriculo: v.pede_curriculo,
    resumo: resumo.length > 260 ? `${resumo.slice(0, 257)}…` : resumo,
    curtidasSemana: v.curtidas_7d,
  };
}

function numero(valor: string | undefined) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/descobrir">["searchParams"] }) {
  const sp = await searchParams;
  const pedida = primeiro(sp.aba) ?? "para-voce";
  const aba: Aba = ABAS.some((a) => a.valor === pedida) ? (pedida as Aba) : "para-voce";
  const [usuario, vagas, local, agora] = await Promise.all([
    obterUsuario(),
    listarVagasParaDescobrir(),
    obterLocal(),
    agoraDaRequisicao(),
  ]);
  const [perfil, curriculo, procuro] = usuario
    ? await Promise.all([obterMeuPerfil(), obterMeuCurriculo(), obterProcuro()])
    : [null, null, null];

  // de onde medir a distância: o GPS ("Perto de mim") ou o centro da região de quem mora
  const lat = numero(primeiro(sp.lat));
  const lng = numero(primeiro(sp.lng));
  const ponto = lat != null && lng != null ? { lat, lng } : local ? pontoDoLocal(local) : null;

  const quem: QuemProcura | null = usuario
    ? {
        servicos: perfil?.servicos ?? [],
        cargos: curriculo?.experiencias.map((e) => e.cargo) ?? [],
        cursos: curriculo?.cursos ?? [],
        curso: curriculo?.curso ?? null,
        escolaridade: curriculo?.escolaridade ?? null,
        cnh: curriculo?.cnh ?? null,
        disponibilidade: curriculo?.disponibilidade ?? [],
        procuro,
        temCurriculo: Boolean(curriculo),
      }
    : null;

  const todas = vagas.map((v) => pontuar(v, quem, local, ponto, agora));
  const salvas = todas.filter((v) => v.salva);
  const passadas = todas.filter((v) => v.dispensada).length;

  let paraVoce = todas.filter((v) => !v.dispensada && !v.minha_curtida).sort((a, b) => b.nota - a.nota);
  if (aba === "para-voce" && usuario && quem) {
    const ia = await notasDaIA(quem, paraVoce, usuario.id);
    if (ia) {
      paraVoce = paraVoce
        .map((v) => (ia.has(v.id) ? { ...v, nota: Math.max(1, Math.min(99, Math.round(0.6 * ia.get(v.id)! + 0.4 * v.nota))) } : v))
        .sort((a, b) => b.nota - a.nota);
    }
  }

  const contagem: Record<Aba, number | null> = {
    "para-voce": null,
    perto: null,
    "em-alta": null,
    salvas: usuario ? salvas.length : null,
  };

  const lateral = (
    <aside className="order-last flex flex-col gap-3 lg:order-none lg:col-start-2 lg:row-start-1">
      {usuario ? (
        <>
          <EditorProcuro inicial={procuro} />
          {!curriculo && !MODO_DEMO && (
            <Aviso tipo="info" titulo="Indicações melhores com currículo">
              Com suas experiências, cursos e horários, as vagas certas vêm primeiro.{" "}
              <Link href="/perfil/curriculo" className="underline">
                Preencher currículo
              </Link>
            </Aviso>
          )}
        </>
      ) : (
        <Aviso tipo="info" titulo="Entre para curtir e receber vagas que combinam com você">
          Sem senha: é só o e-mail, o Google ou o celular.{" "}
          <Link href="/entrar?next=/descobrir" className="underline">
            Entrar
          </Link>
        </Aviso>
      )}

      <div className="hidden rounded-md border border-line p-4 text-body-sm text-ink-muted lg:block">
        <p className="text-label text-ink">Atalhos</p>
        <p className="mt-1">→ curte · ← passa · ↑ salva</p>
        <p className="mt-2">Curtiu e gostaram de você também? Dá match e o WhatsApp de vocês aparece.</p>
      </div>
    </aside>
  );

  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      {lateral}
      <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
      <nav aria-label="Seções do Descobrir" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2">
          {ABAS.map(({ valor, nome, icone: Icone }) => {
            const atual = aba === valor;
            const n = contagem[valor];
            return (
              <li key={valor}>
                <Link
                  href={valor === "para-voce" ? "/descobrir" : `/descobrir?aba=${valor}`}
                  aria-current={atual ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-pill border px-4 text-label whitespace-nowrap transition-colors ${
                    atual ? "border-ink bg-ink text-surface-100" : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
                  }`}
                >
                  <Icone aria-hidden className="size-4" />
                  {nome}
                  {n != null && n > 0 && <span className={atual ? "text-surface-100/80" : "text-ink-muted"}>{n}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {aba === "para-voce" && (
        <PilhaDeVagas
          key={procuro ?? ""}
          cartas={paraVoce.slice(0, 40).map(paraCarta)}
          logado={Boolean(usuario)}
          temCurriculo={Boolean(curriculo)}
          passadas={passadas}
        />
      )}

      {aba === "perto" && <Perto vagas={todas} local={local} agora={agora} usuarioId={usuario?.id ?? null} />}

      {aba === "em-alta" && <EmAlta vagas={todas} agora={agora} usuarioId={usuario?.id ?? null} />}

      {aba === "salvas" &&
        (!usuario ? (
          <Vazio icone={Star} titulo="Entre para salvar vagas" acao={<BotaoLink href="/entrar?next=/descobrir?aba=salvas">Entrar</BotaoLink>}>
            Deslize a vaga para cima (ou toque na estrela) e ela fica guardada aqui.
          </Vazio>
        ) : salvas.length === 0 ? (
          <Vazio icone={Star} titulo="Nenhuma vaga salva ainda" acao={<BotaoLink href="/descobrir">Descobrir vagas</BotaoLink>}>
            Viu uma vaga boa mas quer pensar? Deslize para cima ou toque na estrela.
          </Vazio>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {salvas.map((v) => (
              <div key={v.id} className="flex flex-col gap-1">
                <CardAnuncio anuncio={paraCard(v)} agora={agora} usuarioId={usuario.id} />
                <TirarSalva anuncioId={v.id} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Perto({
  vagas,
  local,
  agora,
  usuarioId,
}: {
  vagas: VagaIndicada[];
  local: Awaited<ReturnType<typeof obterLocal>>;
  agora: number;
  usuarioId: string | null;
}) {
  if (!local) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 sm:p-6">
        <div>
          <p className="font-display text-h3">Onde você mora?</p>
          <p className="mt-1 text-body text-ink-muted">
            Diga o seu bairro e mostramos primeiro as vagas dele, depois as da sua região e as da cidade. Trabalhar
            perto de casa economiza tempo e passagem.
          </p>
        </div>
        <EscolherBairro local={null} />
      </div>
    );
  }
  const grupos = [
    { titulo: local.bairro ? `No ${local.bairro}` : "No seu bairro", vagas: vagas.filter((v) => v.perto === 0) },
    { titulo: local.regiao ? `Na região ${local.regiao}` : "Na sua região", vagas: vagas.filter((v) => v.perto === 1) },
    { titulo: `Em ${local.cidade}`, vagas: vagas.filter((v) => v.perto === 2) },
    { titulo: "Mais longe", vagas: vagas.filter((v) => v.perto === 3) },
  ].map((g) => ({ ...g, vagas: g.vagas.sort((a, b) => (a.distanciaKm ?? 99) - (b.distanciaKm ?? 99)) }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-ink-muted">
          Perto de {local.bairro || local.cidade} ({nomeDaArea(local)}).
        </p>
        <EscolherBairro local={local} />
      </div>
      {grupos
        .filter((g) => g.vagas.length > 0)
        .map((g) => (
          <section key={g.titulo}>
            <h2 className="flex items-baseline gap-2 text-h3">
              {g.titulo}
              <span className="text-body-sm font-normal text-ink-muted">
                {g.vagas.length} {g.vagas.length === 1 ? "vaga" : "vagas"}
              </span>
            </h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {g.vagas.slice(0, 30).map((v) => (
                <CardAnuncio key={v.id} anuncio={paraCard(v)} agora={agora} usuarioId={usuarioId} pertoDeCasa={v.perto <= 1 ? v.perto : null} />
              ))}
            </div>
          </section>
        ))}
      {grupos[0].vagas.length === 0 && (
        <p className="text-body-sm text-ink-muted">
          Ainda não há vaga no seu bairro. Quando aparecer, ela vem primeiro aqui.
        </p>
      )}
    </div>
  );
}

function EmAlta({ vagas, agora, usuarioId }: { vagas: VagaIndicada[]; agora: number; usuarioId: string | null }) {
  const lista = [...vagas]
    .map((v) => ({ v, calor: calorDaVaga(v, agora) }))
    .sort((a, b) => b.calor - a.calor || b.v.criado_em.localeCompare(a.v.criado_em))
    .slice(0, 24);
  if (!lista.length) {
    return (
      <Vazio icone={Flame} titulo="Nada em alta por enquanto">
        As vagas mais curtidas e salvas da semana aparecem aqui.
      </Vazio>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-ink-muted">As vagas mais curtidas e salvas dos últimos 7 dias.</p>
      <ol className="grid gap-4 sm:grid-cols-2">
        {lista.map(({ v }, i) => (
          <li key={v.id} className="flex flex-col gap-1.5">
            <p className="flex items-center gap-1.5 text-label text-terra-text">
              <span className="font-display text-h3 text-ink">{i + 1}º</span>
              {v.curtidas_7d + v.salvas_7d > 0 && (
                <>
                  <Heart aria-hidden className="size-4 text-like" fill="currentColor" />
                  {v.curtidas_7d} {v.curtidas_7d === 1 ? "curtida" : "curtidas"}
                  {v.salvas_7d > 0 && ` · ${v.salvas_7d} ${v.salvas_7d === 1 ? "salva" : "salvas"}`} na semana
                </>
              )}
            </p>
            <CardAnuncio anuncio={paraCard(v)} agora={agora} usuarioId={usuarioId} />
          </li>
        ))}
      </ol>
    </div>
  );
}
