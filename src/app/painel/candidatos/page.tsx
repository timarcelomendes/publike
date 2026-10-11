import { BadgeCheck, Download, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BotoesContato } from "@/components/contato";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { EtapaDoCandidato } from "@/components/painel/etapa-candidato";
import { FiltroVaga } from "@/components/painel/filtro-vaga";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Avatar, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { ETAPAS_CANDIDATO, type EtapaCandidato } from "@/lib/constantes";
import { listarMeusCandidatos } from "@/lib/dados";
import { formatarLugar, primeiro, rotuloConta, tempoRelativo } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Candidatos" };

const SITUACAO: Record<string, { nome: string; variante: "match" | "contorno" | "neutro" }> = {
  pendente: { nome: "Aguardando sua resposta", variante: "neutro" },
  match: { nome: "Deu match", variante: "match" },
  dispensada: { nome: "Dispensado", variante: "contorno" },
  desfeito: { nome: "Match desfeito", variante: "contorno" },
};

export default function Candidatos({ searchParams }: PageProps<"/painel/candidatos">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/candidatos">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/candidatos");
  const sp = await searchParams;
  const pedidaVaga = primeiro(sp.vaga);
  const pedidaEtapa = primeiro(sp.etapa);
  const todos = await listarMeusCandidatos();
  const agora = await agoraDaRequisicao();

  if (!todos) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para carregar os candidatos agora">
        Tente de novo em instantes. Enquanto isso, cada vaga mostra quem curtiu em “Meus anúncios”.
      </Aviso>
    );
  }
  if (todos.length === 0) {
    return (
      <Vazio
        icone={Users}
        titulo="Ninguém curtiu suas vagas ainda"
        acao={<BotaoLink href="/publicar">Publicar vaga grátis</BotaoLink>}
      >
        Quem curtir qualquer vaga sua aparece aqui, de todas as vagas juntas. Você marca a etapa de cada pessoa, anota o
        que combinou e baixa a lista numa planilha.
      </Vazio>
    );
  }

  // as vagas com candidatos, para o filtro
  const vagas = new Map<string, { id: string; titulo: string; total: number }>();
  for (const c of todos) {
    const v = vagas.get(c.anuncio_id) ?? { id: c.anuncio_id, titulo: c.anuncio_titulo, total: 0 };
    v.total++;
    vagas.set(c.anuncio_id, v);
  }
  const vaga = pedidaVaga && UUID.test(pedidaVaga) && vagas.has(pedidaVaga) ? pedidaVaga : null;
  const etapa = pedidaEtapa && pedidaEtapa in ETAPAS_CANDIDATO ? (pedidaEtapa as EtapaCandidato) : null;
  const daVaga = vaga ? todos.filter((c) => c.anuncio_id === vaga) : todos;
  const contagem = new Map<EtapaCandidato, number>();
  for (const c of daVaga) contagem.set(c.etapa, (contagem.get(c.etapa) ?? 0) + 1);
  const lista = etapa ? daVaga.filter((c) => c.etapa === etapa) : daVaga;

  const link = (e: EtapaCandidato | null) => {
    const q = new URLSearchParams();
    if (vaga) q.set("vaga", vaga);
    if (e) q.set("etapa", e);
    const s = q.toString();
    return `/painel/candidatos${s ? `?${s}` : ""}`;
  };
  const planilha = (() => {
    const q = new URLSearchParams();
    if (vaga) q.set("vaga", vaga);
    if (etapa) q.set("etapa", etapa);
    const s = q.toString();
    return `/painel/candidatos/planilha${s ? `?${s}` : ""}`;
  })();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-h2">Candidatos</h2>
        <p className="mt-1 max-w-2xl text-body text-ink-muted">
          Quem curtiu suas vagas, todas juntas. Marque a etapa de cada pessoa e anote o que combinou: só você vê. Para
          ver o currículo ou dar match, abra a pessoa na vaga.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {vagas.size > 1 && <FiltroVaga vagas={[...vagas.values()]} vaga={vaga} etapa={etapa} />}
        <nav aria-label="Filtrar por etapa" className="flex flex-wrap gap-2">
          {[null, ...(Object.keys(ETAPAS_CANDIDATO) as EtapaCandidato[])].map((e) => {
            const ativo = etapa === e;
            return (
              <Link
                key={e ?? "todos"}
                href={link(e)}
                scroll={false}
                aria-current={ativo ? "page" : undefined}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
                  ativo
                    ? "border-ink bg-ink text-surface-100"
                    : "border-line bg-surface-300 text-ink hover:border-line-strong"
                }`}
              >
                {e ? ETAPAS_CANDIDATO[e].nome : "Todos"}
                <span className={ativo ? "text-surface-100/80" : "text-ink-muted"}>
                  {e ? (contagem.get(e) ?? 0) : daVaga.length}
                </span>
              </Link>
            );
          })}
        </nav>
        <a
          href={planilha}
          className="inline-flex min-h-10 items-center gap-1.5 self-start text-label text-ink underline underline-offset-2"
        >
          <Download aria-hidden className="size-4" />
          Baixar planilha{etapa ? ` (${ETAPAS_CANDIDATO[etapa].nome})` : ""}
        </a>
      </div>

      {lista.length === 0 ? (
        <p className="text-body text-ink-muted">Ninguém nesta etapa.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lista.map((c) => {
            const situacao = SITUACAO[c.status] ?? SITUACAO.pendente;
            const primeiroNome = c.nome.split(" ")[0];
            return (
              <li
                key={`${c.anuncio_id}-${c.perfil_id}`}
                className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card"
              >
                <div className="flex gap-3">
                  <Avatar nome={c.nome} foto={c.foto} tamanho={48} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 text-label">
                      <Link href={`/perfil/${c.perfil_id}`} className="truncate underline-offset-2 hover:underline">
                        {c.nome}
                      </Link>
                      {c.verificado && (
                        <BadgeCheck aria-label="Perfil verificado" className="size-4 shrink-0 text-cerrado-text" />
                      )}
                    </p>
                    <p className="text-body-sm text-ink-muted">
                      Curtiu{" "}
                      <Link href={`/painel/anuncio/${c.anuncio_id}`} className="text-ink underline underline-offset-2">
                        {c.anuncio_titulo}
                      </Link>{" "}
                      {tempoRelativo(c.curtido_em, agora)}
                    </p>
                    <p className="text-body-sm text-ink-muted">
                      {rotuloConta(c.tipo)} · {formatarLugar(c.bairro, c.cidade)}
                      {c.tem_curriculo ? " · tem currículo" : ""}
                    </p>
                    <span className="mt-1.5 block sm:hidden">
                      <Selo variante={situacao.variante}>{situacao.nome}</Selo>
                    </span>
                  </div>
                  {/* no celular o selo vai embaixo do nome, para não espremer o texto */}
                  <span className="hidden self-start sm:block">
                    <Selo variante={situacao.variante}>{situacao.nome}</Selo>
                  </span>
                </div>
                {c.mensagem && (
                  <blockquote className="line-clamp-2 rounded-md bg-surface-300 p-3 text-body-sm">
                    “{c.mensagem}”
                  </blockquote>
                )}
                <EtapaDoCandidato anuncioId={c.anuncio_id} perfilId={c.perfil_id} etapa={c.etapa} nota={c.nota} />
                <div className="flex flex-wrap items-center gap-3">
                  {c.status === "match" && (
                    <BotoesContato
                      whatsapp={c.whatsapp}
                      email={c.email}
                      mensagem={`Olá, ${primeiroNome}! Vi que você curtiu “${c.anuncio_titulo}” no Publike. Vamos conversar?`}
                    />
                  )}
                  <Link
                    href={`/painel/anuncio/${c.anuncio_id}`}
                    className="inline-flex min-h-10 items-center text-label text-ink underline underline-offset-2"
                  >
                    {c.status === "pendente" ? "Responder na vaga" : "Abrir na vaga"}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
