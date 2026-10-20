import { ArrowLeft, KanbanSquare, Send, UserRoundX, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  AdicionarFinalistas,
  LinkDoCliente,
  ParecerDoFinalista,
  TirarFinalista,
} from "@/components/finalistas/finalistas-agencia";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { LinhaDoCliente } from "@/components/painel/linha-do-cliente";
import { NotaAderencia } from "@/components/painel/nota-aderencia";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Avatar, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { ajudaDaIADisponivel, obterAnuncio } from "@/lib/dados";
import { DECISOES_CLIENTE, resumoDasRespostas } from "@/lib/finalistas";
import { formatarLugar, plural, tempoRelativo } from "@/lib/formato";
import { finalistasDaVaga, linkDosFinalistas } from "@/lib/servidor/finalistas";
import { montarQuadro } from "@/lib/servidor/quadro";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Finalistas para o cliente" };

// A agência monta a lista de finalistas de uma vaga para o cliente: o link que vai para ele,
// o parecer de cada pessoa, a resposta do cliente e quem mais (com match) pode ir.

export default function Finalistas({ params }: PageProps<"/painel/anuncio/[id]/finalistas">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      {params.then(({ id }) => (
        <Conteudo id={id} />
      ))}
    </Suspense>
  );
}

async function Conteudo({ id }: { id: string }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/finalistas`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") notFound();
  const agora = await agoraDaRequisicao();
  const [{ cartoes }, finalistas, link, comIA] = await Promise.all([
    montarQuadro(anuncio, agora),
    finalistasDaVaga(id),
    linkDosFinalistas(id),
    ajudaDaIADisponivel(),
  ]);
  const cartaoDe = new Map(cartoes.map((c) => [c.perfil_id, c]));
  const lista = [...finalistas.values()].flatMap((f) => {
    const c = cartaoDe.get(f.perfil_id);
    return c ? [{ f, c }] : [];
  });
  // quem o cliente vê: só quem continua com match
  const visiveis = lista.filter(({ c }) => c.status === "match");
  const podemIr = cartoes.filter((c) => c.status === "match" && !finalistas.has(c.perfil_id));
  const vencido = link ? new Date(link.expira_em).getTime() < agora : false;
  const aberto =
    link?.aberto_em && link.aberturas > 0
      ? `o cliente abriu ${link.aberturas === 1 ? "1 vez" : `${link.aberturas} vezes`}, a última ${tempoRelativo(link.aberto_em, agora)}`
      : link
        ? "o cliente ainda não abriu"
        : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/painel/anuncio/${id}/quadro`}
          className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Quadro de candidatos
        </Link>
        <h2 className="mt-1 text-h2">Finalistas para o cliente</h2>
        <p className="mt-1 text-body text-ink-muted">{anuncio.titulo}</p>
        {anuncio.autor_tipo === "agencia" && (
          <LinhaDoCliente anuncioId={anuncio.id} confidencial={anuncio.contratante_confidencial} />
        )}
      </div>

      <section
        aria-labelledby="link-cliente"
        className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5"
      >
        <h3 id="link-cliente" className="flex items-center gap-2 text-h3">
          <Send aria-hidden className="size-5 text-ink-muted" />
          Link para o cliente
        </h3>
        <p className="text-body-sm text-ink-muted">
          O cliente abre sem criar conta e vê de cada finalista o currículo, as respostas da vaga e o seu parecer. Ele
          responde “Quero entrevistar” ou “Não seguir”, com um comentário, e você recebe o aviso. Telefone, e-mail,
          WhatsApp e o PDF do currículo não aparecem para ele: o contato fica com você. A página dá para imprimir ou
          salvar em PDF.
        </p>
        <LinkDoCliente
          anuncioId={id}
          site={SITE_URL}
          vaga={anuncio.titulo}
          agencia={anuncio.autor_nome}
          link={link ? { token: link.token, expira_em: link.expira_em } : null}
          vencido={vencido}
          aberto={aberto}
        />
      </section>

      <section aria-labelledby="lista-finalistas" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="lista-finalistas" className="text-h3">
            {lista.length ? plural(lista.length, "finalista", "finalistas") : "Finalistas"}
          </h3>
          {visiveis.length > 0 && (
            <p className="text-body-sm text-ink-muted">{resumoDasRespostas(visiveis.map(({ f }) => f))}</p>
          )}
        </div>
        {lista.length === 0 ? (
          <Vazio
            icone={Users}
            titulo="Ninguém na lista ainda"
            acao={
              <BotaoLink href={`/painel/anuncio/${id}/quadro`} tamanho="sm">
                <KanbanSquare aria-hidden />
                Abrir o quadro
              </BotaoLink>
            }
          >
            Escolha aqui embaixo quem vai para o cliente, ou marque no quadro e toque em “Enviar ao cliente”. Só quem
            deu match pode ir.
          </Vazio>
        ) : (
          <ol className="flex flex-col gap-3">
            {lista.map(({ f, c }) => {
              const decisao = f.decisao ? DECISOES_CLIENTE[f.decisao] : null;
              const saiu = c.status !== "match";
              return (
                <li
                  key={f.perfil_id}
                  id={`finalista-${f.perfil_id}`}
                  className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-4 sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <Avatar nome={c.nome} foto={c.foto} tamanho={48} />
                    <div className="min-w-0 flex-1">
                      <p className="text-label break-words">{c.nome}</p>
                      <p className="text-body-sm text-ink-muted">{formatarLugar(c.bairro, c.cidade)}</p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-2">
                        <NotaAderencia a={c.aderencia} />
                        {saiu ? (
                          <Selo variante="perigo">
                            <UserRoundX aria-hidden />
                            Desfez o match
                          </Selo>
                        ) : decisao ? (
                          <Selo variante={decisao.selo}>{decisao.nome}</Selo>
                        ) : (
                          <Selo variante="contorno">Sem resposta do cliente</Selo>
                        )}
                      </p>
                    </div>
                  </div>
                  {saiu && (
                    <p className="text-body-sm text-ink-muted">
                      {c.nome.split(" ")[0]} desfez o match e não aparece mais para o cliente.
                    </p>
                  )}
                  {(f.comentario || (f.decisao && f.quem)) && (
                    <blockquote className="rounded-md bg-surface-300 p-3 text-body-sm">
                      {f.comentario && <p>“{f.comentario}”</p>}
                      <p className="mt-1 text-caption text-ink-muted">
                        {f.quem ?? "O cliente"}
                        {f.decidido_em ? `, ${tempoRelativo(f.decidido_em, agora)}` : ""}
                      </p>
                    </blockquote>
                  )}
                  <ParecerDoFinalista
                    anuncioId={id}
                    perfilId={f.perfil_id}
                    nome={c.nome}
                    inicial={f.parecer}
                    comIA={comIA && c.temCurriculo}
                  />
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <BotaoLink
                      href={`/painel/anuncio/${id}/quadro?candidato=${f.perfil_id}`}
                      tamanho="sm"
                      variante="fantasma"
                    >
                      <KanbanSquare aria-hidden />
                      Abrir no quadro
                    </BotaoLink>
                    <TirarFinalista anuncioId={id} perfilId={f.perfil_id} nome={c.nome} />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="podem-ir" className="flex flex-col gap-3">
        <h3 id="podem-ir" className="text-h3">
          Quem mais pode ir
        </h3>
        {podemIr.length === 0 ? (
          <p className="text-body-sm text-ink-muted">
            {cartoes.some((c) => c.status === "pendente")
              ? "Só quem deu match pode ir para o cliente. Responda os candidatos no quadro: quem você aceitar aparece aqui."
              : "Todos os que deram match já estão na lista."}
          </p>
        ) : (
          <AdicionarFinalistas
            anuncioId={id}
            candidatos={podemIr.map((c) => ({
              perfil_id: c.perfil_id,
              nome: c.nome,
              foto: c.foto,
              detalhe: [
                formatarLugar(c.bairro, c.cidade),
                c.aderencia.eliminado
                  ? "eliminado na triagem"
                  : c.aderencia.nota != null
                    ? `${c.aderencia.nota}% de aderência`
                    : "",
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
        )}
      </section>
    </div>
  );
}
