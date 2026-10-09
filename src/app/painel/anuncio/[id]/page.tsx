import { ArrowLeft, BadgeCheck, ChevronDown, FileText, Heart } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BotoesContato } from "@/components/contato";
import { CurriculoResumo } from "@/components/curriculo-resumo";
import { DesfazerMatch } from "@/components/desfazer-match";
import { AcoesInteressado } from "@/components/painel/acoes";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Avatar, Selo, Vazio } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { motivoParaOutro, nomeMotivoDesfazer, STATUS_ANUNCIO } from "@/lib/constantes";
import {
  listarCurriculosDosInteressados,
  listarDesfeitosDoAnuncio,
  listarInteressados,
  obterAnuncio,
} from "@/lib/dados";
import { formatarLugar, formatarMesAno, rotuloConta, tempoRelativo } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { CurriculoDoInteressado, StatusAnuncio } from "@/lib/tipos";

export default function Interessados({ params }: PageProps<"/painel/anuncio/[id]">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/painel/anuncio/[id]">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { id } = await params;
  const usuario = await exigirUsuario(`/painel/anuncio/${id}`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id) notFound();
  const servico = anuncio.tipo === "servico";
  const [interessados, curriculos, desfeitos] = await Promise.all([
    listarInteressados(id),
    servico ? Promise.resolve(new Map<string, CurriculoDoInteressado>()) : listarCurriculosDosInteressados(id),
    listarDesfeitosDoAnuncio(id),
  ]);
  const agora = await agoraDaRequisicao();
  const hoje = new Date(agora).toISOString().slice(0, 7);
  const status = anuncio.status as StatusAnuncio;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/painel" className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" />
          Meus anúncios
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Selo variante={status === "ativo" ? "match" : "contorno"}>{STATUS_ANUNCIO[status]?.nome ?? status}</Selo>
        </div>
        <h2 className="mt-2 text-h2">{anuncio.titulo}</h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          <Link href={`/anuncio/${anuncio.id}`} className="underline">
            Ver anúncio
          </Link>{" "}
          ·{" "}
          <Link href={servico ? "/painel/servicos" : `/painel/anuncio/${anuncio.id}/editar`} className="underline">
            Editar
          </Link>
        </p>
      </div>

      {(status === "em_analise" || status === "removido") && (
        <Aviso tipo="alerta" titulo="Este anúncio está com a moderação">
          Enquanto isso, não dá para {servico ? "aceitar pedidos" : "curtir de volta"} e os contatos ficam escondidos.
        </Aviso>
      )}

      {interessados.length === 0 ? (
        <Vazio icone={Heart} titulo={servico ? "Ninguém pediu ainda" : "Ninguém curtiu ainda"}>
          {servico
            ? "Quando alguém quiser contratar você, chega um aviso e a pessoa aparece aqui. Fotos de trabalhos e preço ajudam a ser escolhido."
            : "Quando alguém curtir, você recebe um aviso e a pessoa aparece aqui. Compartilhar o anúncio no WhatsApp ajuda a chegar em mais gente."}
        </Vazio>
      ) : (
        <>
          <p className="text-body text-ink-muted">
            {servico
              ? "Quem quer contratar você. Aceite quem você pode atender: na hora do match, o WhatsApp dos dois aparece."
              : "Curta de volta quem combina com o que você precisa. Na hora do match, o WhatsApp dos dois aparece."}
          </p>
          <ul className="flex flex-col gap-4">
            {interessados.map((p) => {
              const primeiroNome = p.nome.split(" ")[0];
              const curriculo = curriculos.get(p.perfil_id);
              const desfeito = p.status === "desfeito" ? desfeitos.get(p.perfil_id) : undefined;
              return (
                <li
                  key={p.perfil_id}
                  className={`flex flex-col gap-3 rounded-lg border bg-surface-200 p-4 shadow-card sm:p-5 ${
                    p.status === "match" ? "border-cerrado" : "border-line"
                  } ${p.status === "dispensada" || p.status === "desfeito" ? "opacity-70" : ""}`}
                >
                  <div className="flex gap-3">
                    <Avatar nome={p.nome} foto={p.foto} tamanho={56} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 font-display text-h3">
                        <Link href={`/perfil/${p.perfil_id}`} className="truncate underline-offset-2 hover:underline">
                          {p.nome}
                        </Link>
                        {p.verificado && <BadgeCheck aria-label="Perfil verificado" className="size-4 shrink-0 text-cerrado-text" />}
                      </p>
                      <p className="text-body-sm text-ink-muted">
                        {rotuloConta(p.tipo)} · {formatarLugar(p.bairro, p.cidade)} · no Publike desde{" "}
                        {formatarMesAno(p.membro_desde)}
                      </p>
                      <p className="text-body-sm text-ink-muted">
                        {servico ? "Pediu" : "Curtiu"} {tempoRelativo(p.curtido_em, agora)}
                      </p>
                    </div>
                    {p.status === "match" && <Selo variante="match">Deu match</Selo>}
                    {p.status === "dispensada" && <Selo variante="contorno">{servico ? "Recusado" : "Dispensado"}</Selo>}
                    {p.status === "desfeito" && <Selo variante="contorno">Match desfeito</Selo>}
                  </div>
                  {p.mensagem && <blockquote className="rounded-md bg-surface-300 p-3 text-body-sm">“{p.mensagem}”</blockquote>}
                  {p.servicos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5" aria-label="O que faz">
                      {p.servicos.map((s) => (
                        <Selo key={s} variante="contorno">
                          {s}
                        </Selo>
                      ))}
                    </div>
                  )}
                  {p.sobre && <p className="line-clamp-3 text-body-sm text-ink-muted">{p.sobre}</p>}
                  {!servico &&
                    (curriculo ? (
                      <details className="group rounded-md border border-line bg-surface-100">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-label [&::-webkit-details-marker]:hidden">
                          <FileText aria-hidden className="size-4 shrink-0 text-ink-muted" />
                          Ver currículo
                          <ChevronDown aria-hidden className="ml-auto size-4 text-ink-muted transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="border-t border-line p-3">
                          <CurriculoResumo curriculo={curriculo} linkPdf={curriculo.link_pdf} hoje={hoje} />
                        </div>
                      </details>
                    ) : (
                      anuncio.pede_curriculo && (
                        <p className="flex items-center gap-2 text-body-sm text-ink-muted">
                          <FileText aria-hidden className="size-4 shrink-0" />
                          {primeiroNome} ainda não preencheu o currículo.
                        </p>
                      )
                    ))}
                  <div className="border-t border-line pt-3">
                    {p.status === "desfeito" ? (
                      <p className="text-body-sm text-ink-muted">
                        {desfeito?.porMim
                          ? `Você desfez o match. Motivo: ${nomeMotivoDesfazer(desfeito.motivo).toLowerCase()}.`
                          : `${primeiroNome} desfez o match. Motivo: ${motivoParaOutro(desfeito?.motivo)}.`}
                      </p>
                    ) : p.status === "match" ? (
                      <div className="flex flex-col gap-2">
                      <BotoesContato
                        whatsapp={p.whatsapp}
                        email={p.email}
                        mensagem={
                          servico
                            ? `Olá, ${primeiroNome}! Aceitei seu pedido para “${anuncio.titulo}” no Publike. Vamos combinar?`
                            : `Olá, ${primeiroNome}! Vi que você curtiu “${anuncio.titulo}” no Publike. Vamos conversar?`
                        }
                      />
                      <DesfazerMatch
                        anuncioId={anuncio.id}
                        perfilId={p.perfil_id}
                        outroNome={p.nome}
                        autorDaVaga={!servico}
                      />
                      </div>
                    ) : (
                      <AcoesInteressado anuncioId={anuncio.id} perfilId={p.perfil_id} status={p.status} servico={servico} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
