import {
  ArrowLeft,
  Building2,
  Download,
  KanbanSquare,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Plus,
  UserRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AcoesCliente } from "@/components/painel/acoes-cliente";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo } from "@/components/ui/basicos";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { formatarCnpj } from "@/lib/cnpj";
import { dataBR, hojeEmBrasilia, resumoDasColocacoes, situacaoDaColocacao, type Colocacao } from "@/lib/colocacoes";
import { MODO_DEMO } from "@/lib/config";
import { STATUS_ANUNCIO } from "@/lib/constantes";
import { listarMeusAnuncios, listarMeusCandidatos } from "@/lib/dados";
import {
  ateQuando,
  formatarLugar,
  formatarMoeda,
  formatarTelefone,
  plural,
  primeiro,
  rotuloModalidade,
} from "@/lib/formato";
import { clientesDasVagas, numerosDosClientes, obterMeuCliente } from "@/lib/servidor/clientes";
import { colocacoesDasVagas } from "@/lib/servidor/colocacoes";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { StatusAnuncio } from "@/lib/tipos";

export const metadata: Metadata = { title: "Cliente" };

export default function FichaDoCliente({ params, searchParams }: PageProps<"/painel/clientes/[id]">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: PageProps<"/painel/clientes/[id]">["params"];
  searchParams: PageProps<"/painel/clientes/[id]">["searchParams"];
}) {
  if (MODO_DEMO) return <SoComSupabase />;
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const usuario = await exigirUsuario(`/painel/clientes/${id}`);
  const cliente = await obterMeuCliente(id);
  if (!cliente) notFound();
  const [anuncios, todos, clienteDe] = await Promise.all([
    listarMeusAnuncios(),
    listarMeusCandidatos(),
    clientesDasVagas(usuario.id),
  ]);
  const agora = await agoraDaRequisicao();
  const vagas = anuncios.filter((a) => a.tipo === "vaga" && clienteDe.get(a.id) === id);
  const colocacoes = [...(await colocacoesDasVagas(vagas.map((v) => v.id))).values()];
  const candidatos = (todos ?? []).filter((c) => clienteDe.get(c.anuncio_id) === id);
  const n = numerosDosClientes(clienteDe, vagas, candidatos, agora).get(id);
  const arquivado = Boolean(cliente.arquivado_em);
  const lugar = cliente.bairro || cliente.cidade ? formatarLugar(cliente.bairro, cliente.cidade ?? "Goiânia") : null;
  const base = `/painel/candidatos?cliente=${id}`;
  const passos = [
    { nome: "Vagas no ar", numero: n?.noAr ?? 0, href: `/painel/anuncios?tipo=vaga&cliente=${id}` },
    { nome: "Candidatos", numero: n?.candidatos ?? 0, href: base },
    { nome: "Para responder", numero: n?.responder ?? 0, href: `${base}&situacao=responder`, destaque: true },
    {
      nome: "Entrevista",
      numero: candidatos.filter((c) => c.etapa === "entrevista").length,
      href: `${base}&etapa=entrevista`,
    },
    { nome: "Contratados", numero: n?.contratados ?? 0, href: `${base}&etapa=contratado`, final: true },
  ];
  const temContato = Boolean(cliente.responsavel || cliente.telefone || cliente.email);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/painel/clientes"
        className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Clientes
      </Link>
      {primeiro(sp.salvo) === "1" && <Aviso tipo="sucesso" titulo="Cliente salvo." />}
      {arquivado && (
        <Aviso tipo="info" titulo="Cliente arquivado">
          Ele não aparece na lista ao publicar. As vagas dele continuam como estão.
        </Aviso>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-surface-300 text-ink">
            <Building2 aria-hidden className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-h2 break-words">{cliente.nome}</h2>
            <p className="text-body-sm text-ink-muted">
              {[cliente.cnpj ? `CNPJ ${formatarCnpj(cliente.cnpj)}` : null, lugar].filter(Boolean).join(" · ") ||
                "Cliente da agência"}
            </p>
            {cliente.confidencial && (
              <p className="mt-2">
                <Selo variante="contorno">
                  <Lock aria-hidden />
                  Vagas confidenciais
                </Selo>
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!arquivado && (
            <BotaoLink href={`/publicar?cliente=${id}`} variante="primario">
              <Plus aria-hidden />
              Publicar vaga para este cliente
            </BotaoLink>
          )}
          {candidatos.length > 0 && (
            <a href={`/painel/candidatos/planilha?cliente=${id}`} className={classesBotao("secundario", "md")}>
              <Download aria-hidden />
              Planilha dos candidatos
            </a>
          )}
        </div>
      </div>

      <ol aria-label={`Contratação para ${cliente.nome}`} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {passos.map((p) => {
          const tem = p.numero > 0;
          const cor = !tem
            ? "text-ink-muted"
            : p.destaque
              ? "text-terra-text"
              : p.final
                ? "text-cerrado-text"
                : "text-ink";
          return (
            <li key={p.nome} className={p.nome === "Vagas no ar" ? "col-span-2 sm:col-span-1" : ""}>
              <Link
                href={p.href}
                className={`flex h-full min-h-16 flex-col justify-center rounded-md border px-3 py-2 transition-colors hover:border-line-strong ${
                  tem && p.destaque ? "border-transparent bg-terra-soft" : "border-line bg-surface-200"
                }`}
              >
                <span className={`font-display text-h3 leading-none ${cor}`}>{p.numero}</span>
                <span className={`mt-1 text-body-sm leading-tight ${tem ? "text-ink" : "text-ink-muted"}`}>
                  {p.nome}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      <ColocacoesDoCliente
        colocacoes={colocacoes}
        nomes={new Map((todos ?? []).map((c) => [`${c.anuncio_id}:${c.perfil_id}`, c.nome]))}
        titulos={new Map(vagas.map((v) => [v.id, v.titulo]))}
        agora={agora}
      />

      <section aria-labelledby="vagas-do-cliente" className="flex flex-col gap-3">
        <h3 id="vagas-do-cliente" className="text-h3">
          Vagas deste cliente
        </h3>
        {vagas.length === 0 ? (
          <p className="rounded-md bg-surface-300 px-4 py-3 text-body-sm text-ink">
            Nenhuma vaga para este cliente ainda.
            {!arquivado && (
              <>
                {" "}
                <Link href={`/publicar?cliente=${id}`} className="font-semibold underline underline-offset-2">
                  Publicar a primeira
                </Link>
              </>
            )}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {vagas.map((v) => {
              const status = v.status as StatusAnuncio;
              return (
                <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <Selo variante={status === "ativo" ? "match" : "contorno"}>
                        {STATUS_ANUNCIO[status]?.nome ?? status}
                      </Selo>
                      <Selo>{rotuloModalidade(v.tipo, v.regime)}</Selo>
                    </p>
                    <p className="mt-1.5 text-label break-words">
                      <Link href={`/painel/anuncio/${v.id}/quadro`} className="underline-offset-2 hover:underline">
                        {v.titulo}
                      </Link>
                    </p>
                    <p className="text-body-sm text-ink-muted">
                      {formatarLugar(v.bairro, v.cidade)}
                      {status === "ativo" ? ` · no ar ${ateQuando(v.expira_em)}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/painel/anuncio/${v.id}/quadro`}
                    className="inline-flex min-h-10 items-center gap-2 text-label underline-offset-2 hover:underline"
                  >
                    <KanbanSquare aria-hidden className="size-4 text-ink-muted" />
                    {plural(v.curtidas_total, "candidato", "candidatos")}
                    {v.curtidas_novas > 0 && (
                      <Selo variante="like">
                        {v.curtidas_novas} {v.curtidas_novas === 1 ? "nova" : "novas"}
                      </Selo>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="contato-do-cliente" className="flex flex-col gap-3">
        <h3 id="contato-do-cliente" className="flex items-center gap-2 text-h3">
          Contato e anotações
          <span className="text-body-sm font-normal text-ink-muted">(só você vê)</span>
        </h3>
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 text-body-sm sm:p-5">
          {temContato ? (
            <ul className="flex flex-col gap-2">
              {cliente.responsavel && (
                <li className="flex items-center gap-2">
                  <UserRound aria-hidden className="size-4 shrink-0 text-ink-muted" />
                  {cliente.responsavel}
                </li>
              )}
              {cliente.telefone && (
                <li className="flex items-center gap-2">
                  <MessageCircle aria-hidden className="size-4 shrink-0 text-ink-muted" />
                  <a
                    href={`https://wa.me/${cliente.telefone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    {formatarTelefone(cliente.telefone)}
                  </a>
                </li>
              )}
              {cliente.email && (
                <li className="flex items-center gap-2">
                  <Mail aria-hidden className="size-4 shrink-0 text-ink-muted" />
                  <a href={`mailto:${cliente.email}`} className="break-all underline underline-offset-2">
                    {cliente.email}
                  </a>
                </li>
              )}
            </ul>
          ) : (
            <p className="text-ink-muted">
              Nenhum contato anotado. Guarde em “Editar dados” com quem falar no cliente.
            </p>
          )}
          {cliente.endereco && (
            <p className="flex items-start gap-2">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
              {cliente.endereco}
              {lugar ? `, ${lugar}` : ""}
            </p>
          )}
          {cliente.nota && <p className="border-t border-line pt-3 whitespace-pre-line">{cliente.nota}</p>}
        </div>
      </section>

      <AcoesCliente id={id} arquivado={arquivado} podeExcluir={vagas.length === 0} />
    </div>
  );
}

/** As colocações deste cliente: quem começou, a taxa (recebida ou a receber) e a garantia. */
function ColocacoesDoCliente({
  colocacoes,
  nomes,
  titulos,
  agora,
}: {
  colocacoes: Colocacao[];
  nomes: Map<string, string>;
  titulos: Map<string, string>;
  agora: number;
}) {
  const hoje = hojeEmBrasilia(agora);
  const r = resumoDasColocacoes(colocacoes, hoje);
  return (
    <section aria-labelledby="colocacoes-do-cliente" className="flex flex-col gap-3">
      <h3 id="colocacoes-do-cliente" className="flex items-center gap-2 text-h3">
        Colocações
        <span className="text-body-sm font-normal text-ink-muted">(só você vê)</span>
      </h3>
      {colocacoes.length === 0 ? (
        <p className="rounded-md bg-surface-300 px-4 py-3 text-body-sm text-ink">
          Quem você contratar para este cliente aparece aqui, com a taxa e a garantia de reposição. Registre no quadro
          da vaga: abra o cartão de quem está em Contratados.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Taxas", formatarMoeda(r.taxas)],
              ["A receber", formatarMoeda(r.aReceber)],
              ["Em garantia", String(r.emGarantia)],
              ["Reposição", String(r.reposicoes)],
            ].map(([nome, valor]) => (
              <div key={nome} className="flex flex-col rounded-md border border-line bg-surface-200 px-3 py-2">
                <dt className="text-body-sm text-ink-muted">{nome}</dt>
                <dd className="font-display text-h3">{valor}</dd>
              </div>
            ))}
          </dl>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {colocacoes.map((c) => {
              const s = situacaoDaColocacao(c, hoje);
              return (
                <li key={`${c.anuncio_id}:${c.perfil_id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-label break-words">
                      {nomes.get(`${c.anuncio_id}:${c.perfil_id}`) ?? "Candidato"}
                    </p>
                    <p className="text-body-sm text-ink-muted">
                      {titulos.get(c.anuncio_id) ?? "Vaga"} · começou em {dataBR(c.inicio)}
                    </p>
                    <p
                      className={`text-body-sm ${s.tipo === "reposicao" ? "font-semibold text-danger" : s.tipo === "garantia" ? "text-terra-text" : "text-ink-muted"}`}
                    >
                      {s.texto}
                    </p>
                  </div>
                  {c.taxa != null && (
                    <Selo variante={c.paga ? "match" : "aviso"}>
                      {formatarMoeda(c.taxa)} {c.paga ? "recebida" : "a receber"}
                    </Selo>
                  )}
                  <Link
                    href={`/painel/anuncio/${c.anuncio_id}/quadro?candidato=${c.perfil_id}`}
                    className="inline-flex min-h-10 items-center gap-2 text-label underline-offset-2 hover:underline"
                  >
                    <KanbanSquare aria-hidden className="size-4 text-ink-muted" />
                    Abrir
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
