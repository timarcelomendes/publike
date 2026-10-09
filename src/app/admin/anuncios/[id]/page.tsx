import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AcoesModeracaoAnuncio, ApagarAnuncioDeVez } from "@/components/admin/acoes-anuncio";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Dado, Secao, SeloStatus } from "@/components/admin/ui";
import { Aviso, Avatar, Selo } from "@/components/ui/basicos";
import { fichaAnuncio } from "@/lib/admin/dados";
import { CATEGORIAS_IA, descreverAcao } from "@/lib/admin/textos";
import { categoria, MOTIVOS_DENUNCIA } from "@/lib/constantes";
import {
  ehParaSempre,
  formatarDataCurta,
  formatarDataHora,
  formatarLugar,
  formatarValor,
  primeiro,
  rotuloConta,
  rotuloModalidade,
  tempoRelativo,
} from "@/lib/formato";
import { acessoDaEquipe } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Anúncio" };

const NOME_MOTIVO: Record<string, string> = Object.fromEntries(MOTIVOS_DENUNCIA.map((m) => [m.valor, m.nome]));
const STATUS_DENUNCIA: Record<string, string> = { aberta: "Aberta", procedente: "Confirmada", improcedente: "Dispensada" };

export default function AnuncioAdmin({ params, searchParams }: PageProps<"/admin/anuncios/[id]">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: PageProps<"/admin/anuncios/[id]">["params"];
  searchParams: PageProps<"/admin/anuncios/[id]">["searchParams"];
}) {
  const acesso = await acessoDaEquipe();
  if (!acesso) notFound();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const [{ data: anuncio }, ficha, agora] = await Promise.all([
    acesso.cliente.rpc("obter_anuncio", { p_id: id }).maybeSingle(),
    fichaAnuncio(acesso.cliente, id),
    agoraDaRequisicao(),
  ]);
  if (!anuncio || !ficha) notFound();
  const abertas = ficha.denuncias.filter((d) => d.status === "aberta").length;
  const autorSuspenso = ficha.autor.suspenso_ate;
  // a lista da IA vem da mais nova para a mais antiga
  const iaFalhou = ficha.ia[0]?.decisao === "erro" && (ficha.status === "ativo" || ficha.status === "pausado");

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/anuncios" className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Anúncios
      </Link>

      {primeiro(sp.salvo) === "1" && <Aviso tipo="sucesso" titulo="Correção salva." />}

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SeloStatus status={ficha.status} />
          <Selo>{rotuloModalidade(anuncio.tipo, anuncio.regime)}</Selo>
          {abertas > 0 && (
            <Selo variante="perigo">
              {abertas} {abertas === 1 ? "denúncia aberta" : "denúncias abertas"}
            </Selo>
          )}
        </div>
        <h2 className="text-h2 break-words">{anuncio.titulo}</h2>
        <p className="text-body-sm text-ink-muted">
          {formatarLugar(anuncio.bairro, anuncio.cidade)} · {categoria(anuncio.categoria).nome} · publicado{" "}
          {tempoRelativo(anuncio.criado_em, agora)} · {ficha.curtidas} {ficha.curtidas === 1 ? "curtida" : "curtidas"} ·{" "}
          {ficha.matches} {ficha.matches === 1 ? "match" : "matches"}
        </p>
      </header>

      <Secao
        titulo="Moderação"
        acoes={
          ficha.status === "ativo" ? (
            <Link href={`/anuncio/${id}`} className="inline-flex min-h-10 items-center gap-1.5 text-label underline">
              Ver no site
              <ExternalLink aria-hidden className="size-4" />
            </Link>
          ) : null
        }
      >
        {ficha.status === "removido" && ficha.nota_moderacao && (
          <p className="text-body-sm">Motivo da remoção: {ficha.nota_moderacao}</p>
        )}
        {iaFalhou && (
          <p className="text-body-sm">A IA não conseguiu revisar este anúncio. Leia e, se estiver tudo certo, marque como revisado.</p>
        )}
        <AcoesModeracaoAnuncio anuncioId={id} status={ficha.status} denunciasAbertas={abertas} iaFalhou={iaFalhou} />
      </Secao>

      <Secao titulo="O anúncio">
        <dl className="flex flex-col gap-3">
          <Dado rotulo="Valor">{formatarValor(anuncio.pagamento_valor, anuncio.pagamento_unidade, anuncio.beneficios)}</Dado>
          {anuncio.horario && <Dado rotulo="Horário">{anuncio.horario}</Dado>}
          {anuncio.tipo === "vaga" && <Dado rotulo="Vagas">{anuncio.vagas}</Dado>}
          <Dado rotulo="No ar até">{formatarDataCurta(anuncio.expira_em)}</Dado>
          <Dado rotulo="Última mudança">{formatarDataHora(anuncio.atualizado_em)}</Dado>
        </dl>
        <p className="rounded-md bg-surface-300 p-4 text-body whitespace-pre-line">{anuncio.descricao}</p>
      </Secao>

      <Secao titulo="Quem publicou">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar nome={ficha.autor.nome} foto={ficha.autor.foto} tamanho={48} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-label">
              {acesso.admin ? (
                <Link href={`/admin/usuarios/${ficha.autor.id}`} className="underline">
                  {ficha.autor.nome}
                </Link>
              ) : (
                ficha.autor.nome
              )}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
              {rotuloConta(ficha.autor.tipo)}
              {ficha.autor.verificado && <Selo variante="match">Verificado</Selo>}
              {autorSuspenso &&
                (ehParaSempre(autorSuspenso, agora) ? (
                  <Selo variante="perigo">Banida</Selo>
                ) : (
                  <Selo variante="aviso">Suspensa até {formatarDataCurta(autorSuspenso)}</Selo>
                ))}
            </span>
            {ficha.autor.email && <span className="text-body-sm text-ink-muted">{ficha.autor.email}</span>}
          </div>
        </div>
        <p className="text-body-sm text-ink-muted">
          {ficha.autor.anuncios} {ficha.autor.anuncios === 1 ? "anúncio" : "anúncios"} no Publike
          {ficha.autor.removidos > 0 && `, ${ficha.autor.removidos} removido(s) pela moderação`}.
          {acesso.admin && !autorSuspenso && (
            <>
              {" "}
              Para suspender ou banir, abra a{" "}
              <Link href={`/admin/usuarios/${ficha.autor.id}`} className="underline">
                ficha da conta
              </Link>
              .
            </>
          )}
        </p>
      </Secao>

      <Secao titulo={`Denúncias (${ficha.denuncias.length})`}>
        {ficha.denuncias.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Nenhuma denúncia.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ficha.denuncias.map((d) => (
              <li key={d.id} className="flex flex-col gap-1 rounded-md bg-surface-300 p-3 text-body-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-label">{NOME_MOTIVO[d.motivo] ?? d.motivo}</span>
                  <Selo variante={d.status === "aberta" ? "aviso" : "contorno"}>{STATUS_DENUNCIA[d.status] ?? d.status}</Selo>
                </span>
                {d.detalhes && <span>“{d.detalhes}”</span>}
                <span className="text-ink-muted">
                  {d.quem ?? "Conta apagada"} · {tempoRelativo(d.criado_em, agora)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {ficha.ia.length > 0 && (
        <Secao titulo="Moderação automática (IA)">
          <ul className="flex flex-col gap-2">
            {ficha.ia.map((r, i) => (
              <li key={i} className="flex flex-col gap-1 rounded-md bg-surface-300 p-3 text-body-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <Selo variante={r.decisao === "retido" ? "aviso" : r.decisao === "erro" ? "contorno" : "match"}>
                    {r.decisao === "retido" ? "Reteve" : r.decisao === "erro" ? "Não conseguiu analisar" : "Aprovou"}
                  </Selo>
                  {r.categorias.map((cat) => (
                    <Selo key={cat} variante="contorno">
                      {CATEGORIAS_IA[cat] ?? cat}
                    </Selo>
                  ))}
                </span>
                {r.explicacao && <span>{r.explicacao}</span>}
                <span className="text-ink-muted">
                  {tempoRelativo(r.criado_em, agora)}
                  {r.modelo && ` · ${r.modelo}`}
                </span>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {ficha.registro.length > 0 && (
        <Secao titulo="Registro da equipe">
          <ul className="flex flex-col divide-y divide-line">
            {ficha.registro.map((r, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5 text-body-sm">
                <span>
                  <strong className="font-semibold">{r.quem ?? "Admin"}</strong> {descreverAcao(r.acao, true)}
                  {typeof r.detalhes?.nota === "string" && ` · “${r.detalhes.nota}”`}
                </span>
                <span className="text-ink-muted">{formatarDataHora(r.criado_em)}</span>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {acesso.admin && <ApagarAnuncioDeVez anuncioId={id} />}
    </div>
  );
}
