import { Eye, EyeOff, Globe } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { ChipFiltro } from "@/components/painel/fluxo";
import { SeloVerificado } from "@/components/selo-verificado";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Avatar, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { OpcoesVisitas } from "@/components/visitas/opcoes-visitas";
import { MarcarVisitasVistas } from "@/components/visitas/registrar-visita";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { formatarLugar, plural, primeiro, tempoRelativo } from "@/lib/formato";
import { nomeNaLista, oQueE } from "@/lib/servidor/contas-perto";
import { minhasOpcoesDeVisitas, quemViuMeuPerfil, resumoDasVisitas, type Visitante } from "@/lib/servidor/visitas";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Quem viu seu perfil", robots: { index: false } };

// Quem abriu o perfil, o currículo (página do talento) ou a candidatura da conta nos últimos 30 dias,
// do mais recente para o mais antigo. Empresas aparecem sempre pelo nome; pessoas, pelo nome curto, a
// não ser que naveguem sem aparecer (ou que a própria conta navegue sem aparecer). No fim, as opções.

const FILTROS = [
  { valor: "empresas", nome: "Empresas" },
  { valor: "pessoas", nome: "Pessoas" },
] as const;

const LISTA =
  "flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card";

export default function QuemViu({ searchParams }: PageProps<"/painel/visitas">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

/** O que a visita abriu, para a frase da linha. */
function oQueViu(v: Visitante, pessoa: boolean) {
  if (v.onde === "candidatura")
    return v.anuncio_titulo ? `viu sua candidatura para ${v.anuncio_titulo}` : "viu sua candidatura";
  if (v.onde === "talento") return "viu seu currículo";
  return pessoa ? "viu seu perfil" : "viu sua página";
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/visitas">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/visitas");
  const sp = await searchParams;
  const [perfil, visitantes, resumo, opcoes, agora] = await Promise.all([
    obterMeuPerfil().catch(() => null),
    quemViuMeuPerfil(30),
    resumoDasVisitas(),
    minhasOpcoesDeVisitas(),
    agoraDaRequisicao(),
  ]);
  const pessoa = !perfil || perfil.tipo === "pessoa";
  const comNome = visitantes.filter((v) => v.visitante_id !== null);
  const escondidos = visitantes.length - comNome.length;
  const empresas = comNome.filter((v) => v.tipo !== "pessoa");
  const pessoas = comNome.filter((v) => v.tipo === "pessoa");
  const numeros: Record<string, number> = { empresas: empresas.length, pessoas: pessoas.length };
  const pedido = primeiro(sp.f) ?? null;
  const f = FILTROS.some((x) => x.valor === pedido) ? pedido : null;
  const lista = f === "empresas" ? empresas : f === "pessoas" ? pessoas : comNome;
  const filtros = FILTROS.filter((x) => f === x.valor || (numeros[x.valor] > 0 && numeros[x.valor] < comNome.length));

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <MarcarVisitasVistas />
      <div>
        <h2 className="text-h2">Quem viu seu perfil</h2>
        <p className="mt-1 text-body text-ink-muted">
          {pessoa
            ? "Empresas e pessoas que abriram seu perfil, seu currículo ou sua candidatura nos últimos 30 dias."
            : "Pessoas e empresas que abriram a página da sua conta nos últimos 30 dias."}
        </p>
      </div>

      {visitantes.length > 0 || resumo.anonimas > 0 ? (
        <p className="text-body">
          <strong className="font-semibold">{plural(resumo.semana, "visita", "visitas")}</strong> nos últimos 7 dias
          {resumo.semana_passada > 0 && (
            <span className="text-ink-muted"> ({resumo.semana_passada} na semana anterior)</span>
          )}
          .
        </p>
      ) : null}

      {opcoes.sem_aparecer && (
        <p className="rounded-lg bg-surface-300 px-4 py-3 text-body-sm">
          Você navega sem aparecer, então não vê o nome das pessoas que viram seu perfil. As empresas aparecem sempre.{" "}
          <Link href="#opcoes" className="font-semibold underline underline-offset-2">
            Mudar
          </Link>
        </p>
      )}

      {visitantes.length === 0 ? (
        <Vazio
          icone={Eye}
          titulo="Ninguém viu seu perfil nos últimos 30 dias"
          acao={
            pessoa ? (
              <BotaoLink href="/perfil/curriculo">Completar o currículo</BotaoLink>
            ) : (
              <BotaoLink href="/publicar">Publicar uma vaga</BotaoLink>
            )
          }
        >
          {pessoa
            ? "Com o currículo completo, você aparece para as empresas da região e na aba Talentos. Quando alguém abrir, aparece aqui."
            : "Quem vê uma vaga sua costuma abrir a página da empresa. Quando alguém abrir, aparece aqui."}
        </Vazio>
      ) : (
        <>
          {filtros.length > 0 && (
            <nav aria-label="Filtrar" className="flex flex-wrap gap-2">
              {filtros.map((x) => (
                <ChipFiltro
                  key={x.valor}
                  href={f === x.valor ? "/painel/visitas" : `/painel/visitas?f=${x.valor}`}
                  ativo={f === x.valor}
                  nome={x.nome}
                  numero={numeros[x.valor]}
                />
              ))}
            </nav>
          )}
          {lista.length > 0 && (
            <ul aria-label="Quem viu seu perfil" className={LISTA}>
              {lista.map((v) => (
                <LinhaDoVisitante key={v.visitante_id} v={v} pessoa={pessoa} agora={agora} />
              ))}
            </ul>
          )}
          {!f && escondidos > 0 && (
            <p className="flex items-center gap-2 text-body-sm text-ink-muted">
              <EyeOff aria-hidden className="size-4 shrink-0" />
              {escondidos === 1
                ? "1 pessoa viu seu perfil sem aparecer."
                : `${escondidos} pessoas viram seu perfil sem aparecer.`}
            </p>
          )}
        </>
      )}
      {resumo.anonimas > 0 && !f && (
        <p className="flex items-center gap-2 text-body-sm text-ink-muted">
          <Globe aria-hidden className="size-4 shrink-0" />
          {resumo.anonimas === 1
            ? "E 1 visita de quem não entrou no Publike."
            : `E ${resumo.anonimas} visitas de quem não entrou no Publike.`}
        </p>
      )}

      <OpcoesVisitas avisar={opcoes.avisar} semAparecer={opcoes.sem_aparecer} pessoa={pessoa} />
    </div>
  );
}

/** Uma visita: quem foi (com o link para o perfil), o que viu e quando, e o próximo passo. */
function LinhaDoVisitante({ v, pessoa, agora }: { v: Visitante; pessoa: boolean; agora: number }) {
  const id = v.visitante_id as string;
  const nome = v.nome ?? "";
  const empresa = v.tipo !== "pessoa";
  const quem = empresa ? oQueE(v.tipo) : (v.titulo ?? "Pessoa");
  const lugar = v.cidade ? formatarLugar(v.bairro, v.cidade) : null;
  // empresa: ver a página (as vagas); pessoa com currículo aberto, para quem contrata: o currículo
  const proximo = empresa
    ? { href: `/perfil/${id}`, nome: "Ver vagas" }
    : !pessoa && v.curriculo_aberto
      ? { href: `/talentos/${id}`, nome: "Ver currículo" }
      : null;
  return (
    <li className="flex items-center gap-3 p-4">
      <Link href={`/perfil/${id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
        <Avatar nome={nome} foto={v.foto} tamanho={44} forma={empresa ? "quadrada" : "redonda"} colorida />
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-label">
            <span className="truncate">{nomeNaLista({ nome, tipo: v.tipo })}</span>
            {v.verificado && <SeloVerificado agencia={v.tipo === "agencia"} />}
          </span>
          <span className="block truncate text-body-sm text-ink-muted">
            {quem}
            {lugar && ` · ${lugar}`}
          </span>
          <span className="block text-body-sm">
            {oQueViu(v, pessoa)} <span className="text-ink-muted">· {tempoRelativo(v.ultima, agora)}</span>
          </span>
        </span>
      </Link>
      {proximo && (
        <Link
          href={proximo.href}
          className="inline-flex min-h-10 shrink-0 items-center rounded-pill border border-line-strong px-4 text-label hover:bg-surface-300 max-sm:hidden"
        >
          {proximo.nome}
        </Link>
      )}
    </li>
  );
}
