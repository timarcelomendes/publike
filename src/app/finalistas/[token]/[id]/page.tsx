import { ArrowLeft, CircleCheck, CircleHelp, CircleX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CurriculoResumo } from "@/components/curriculo-resumo";
import { BotaoImprimir } from "@/components/finalistas/resposta-cliente";
import { Aviso, Avatar, Container, Esqueleto } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { lerDadosDoLink, lerMarca } from "@/lib/finalistas";
import { formatarLugar } from "@/lib/formato";
import { corLegivel } from "@/lib/marca";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import { UUID } from "@/lib/validacao";
import { TemVoltarProprio } from "@/components/voltar";

export const metadata: Metadata = { title: "Dossiê do finalista", robots: { index: false, follow: false } };

// O dossiê de um finalista (migração 20270411120000; Plano Agência): o que a agência mostra ao cliente sobre a
// pessoa, numa página para ver ou salvar em PDF, com a marca dela. A Triagem por critério, o resumo do currículo
// (o que a agência gerou no quadro), o Teste Prático e a Entrevista em vídeo, mais o currículo e o parecer. Sem contato.

export default function DossieDoFinalista({ params }: PageProps<"/finalistas/[token]/[id]">) {
  return (
    <Container className="max-w-3xl py-8" data-imprimir>
      <Suspense fallback={<Esqueleto className="h-96 w-full rounded-lg" />}>
        {params.then(({ token, id }) => (
          <Conteudo token={token} id={id} />
        ))}
      </Suspense>
    </Container>
  );
}

type Dossie = {
  liberado: boolean;
  triagem: { texto: string; obrigatorio: boolean; resultado: "atende" | "nao_atende" | "sem_info"; explicacao: string }[] | null;
  resumo: { resumo: string | null; fortes: string[] | null; conferir: string[] | null } | null;
  teste: { titulo: string | null; pontos: number | null; maximo: number | null } | null;
  video: { resumo: string | null; fortes: string[] | null; conferir: string[] | null } | null;
};

const lista = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string" && v.trim() !== "") : []);

async function Conteudo({ token, id }: { token: string; id: string }) {
  const naoVale = (
    <Aviso tipo="alerta" titulo="Este link não vale">
      Confira se copiou o link inteiro ou peça um novo para quem mandou.
    </Aviso>
  );
  if (MODO_DEMO || !/^[0-9a-f]{64}$/.test(token) || !UUID.test(id)) return naoVale;
  const supabase = await criarClienteServidor();
  const [{ data: link }, { data: dados }, { data: marcaDoBanco }, agora] = await Promise.all([
    supabase.rpc("finalistas_do_link", { p_token: token }),
    supabase.rpc("dossie_do_finalista", { p_token: token, p_finalista: id }),
    supabase.rpc("marca_dos_finalistas", { p_token: token }),
    agoraDaRequisicao(),
  ]);
  const d = lerDadosDoLink(link);
  const f = d?.finalistas.find((x) => x.id === id);
  const dossie = dados as Dossie | null;
  if (!d || d.situacao !== "valido" || !f || !dossie) return naoVale;
  const voltar = (
    <Link
      href={`/finalistas/${token}`}
      className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink"
      data-nao-imprimir
    >
      <ArrowLeft aria-hidden className="size-4" />
      <TemVoltarProprio />
      Todos os finalistas
    </Link>
  );
  if (!dossie.liberado) {
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <Aviso tipo="info" titulo="O dossiê não está disponível">
          Veja {f.nome} na lista de finalistas.
        </Aviso>
      </div>
    );
  }
  const marca = lerMarca(marcaDoBanco);
  const destaque = marca?.cor ? corLegivel(marca.cor) : undefined;
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(new Date(agora))
    .slice(0, 7);
  const resumo = dossie.resumo?.resumo?.trim() ? dossie.resumo : null;
  const video = dossie.video?.resumo?.trim() ? dossie.video : null;
  const teste = dossie.teste && dossie.teste.maximo ? dossie.teste : null;
  const triagem = dossie.triagem?.length ? dossie.triagem : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {voltar}
        <BotaoImprimir />
      </div>
      <header
        className="flex flex-col gap-4 overflow-hidden rounded-lg border border-line bg-surface-200 p-5 sm:p-6"
        style={marca?.cor && !marca.foto ? { borderTop: `6px solid ${marca.cor}` } : undefined}
      >
        {marca?.foto && (
          // a foto é da Página de carreiras da agência (Storage público), sem o otimizador de imagens
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={marca.foto}
            alt=""
            className="-mx-5 -mt-5 aspect-[4/1] w-[calc(100%+2.5rem)] max-w-none object-cover sm:-mx-6 sm:-mt-6 sm:w-[calc(100%+3rem)]"
            style={marca.cor ? { borderBottom: `4px solid ${marca.cor}` } : undefined}
          />
        )}
        <p className="text-body-sm text-ink-muted">
          {d.agencia.nome} · Dossiê para {d.vaga?.titulo}
          {d.vaga?.cliente ? `, ${d.vaga.cliente}` : ""}
        </p>
        <div className="flex items-center gap-4">
          <Avatar nome={f.nome} foto={f.foto} tamanho={64} />
          <div className="min-w-0">
            <h1 className="text-h1 break-words" style={destaque ? { color: destaque } : undefined}>
              {f.nome}
            </h1>
            <p className="text-body-sm text-ink-muted">{formatarLugar(f.bairro, f.cidade)}</p>
            {f.curriculo?.titulo && <p className="mt-1 text-body">{f.curriculo.titulo}</p>}
          </div>
        </div>
      </header>

      {f.parecer && (
        <Bloco titulo={`O parecer de ${d.agencia.nome}`}>
          <p className="text-body whitespace-pre-line">{f.parecer}</p>
        </Bloco>
      )}

      {triagem && (
        <Bloco titulo="O que a vaga pede">
          <ul className="flex flex-col gap-3">
            {triagem.map((c) => {
              const Icone = c.resultado === "atende" ? CircleCheck : c.resultado === "nao_atende" ? CircleX : CircleHelp;
              return (
                <li key={c.texto} className="flex gap-3">
                  <Icone
                    aria-hidden
                    className={`mt-0.5 size-5 shrink-0 ${c.resultado === "atende" ? "text-cerrado-text" : c.resultado === "nao_atende" ? "text-danger" : "text-ink-muted"}`}
                  />
                  <span className="text-body-sm">
                    <span className="text-label">
                      {c.texto}
                      {c.obrigatorio ? " (obrigatório)" : ""}
                    </span>
                    <span className="block text-ink-muted">
                      {c.resultado === "atende" ? "Atende" : c.resultado === "nao_atende" ? "Não atende" : "O currículo não mostra"}
                      {c.explicacao ? `: ${c.explicacao}` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-caption text-ink-muted">Leitura do currículo pela Triagem com IA. Quem decide é você.</p>
        </Bloco>
      )}

      {resumo && (
        <Bloco titulo="Resumo do currículo">
          <p className="text-body">{resumo.resumo}</p>
          <Pontos titulo="Pontos fortes" itens={lista(resumo.fortes)} />
          <Pontos titulo="Para conferir na entrevista" itens={lista(resumo.conferir)} />
        </Bloco>
      )}

      {teste && (
        <Bloco titulo="Teste Prático">
          <p className="text-body">
            {teste.titulo ? `${teste.titulo}: ` : ""}
            <strong className="text-h3 tabular-nums" style={destaque ? { color: destaque } : undefined}>
              {teste.pontos ?? 0} de {teste.maximo}
            </strong>{" "}
            pontos
          </p>
        </Bloco>
      )}

      {video && (
        <Bloco titulo="Entrevista em vídeo">
          <p className="text-body">{video.resumo}</p>
          <Pontos titulo="Pontos fortes" itens={lista(video.fortes)} />
          <Pontos titulo="Para conferir" itens={lista(video.conferir)} />
        </Bloco>
      )}

      {f.curriculo ? (
        <Bloco titulo="Currículo">
          <CurriculoResumo curriculo={f.curriculo} linkPdf={null} hoje={hoje} />
        </Bloco>
      ) : (
        <p className="text-body-sm text-ink-muted">Sem currículo preenchido no Publike.</p>
      )}

      <p className="text-caption text-ink-muted">
        Sem contato do candidato: {d.agencia.nome} cuida da conversa e das entrevistas. Feito com o Publike.
      </p>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 print:break-inside-avoid sm:p-6">
      <h2 className="text-h3">{titulo}</h2>
      {children}
    </section>
  );
}

function Pontos({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens.length) return null;
  return (
    <div>
      <p className="text-label">{titulo}</p>
      <ul className="mt-1 list-disc pl-5 text-body-sm">
        {itens.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
