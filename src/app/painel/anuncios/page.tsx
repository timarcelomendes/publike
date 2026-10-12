import { Heart, Megaphone, MessageCircleHeart, Plus, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { AcoesAnuncio } from "@/components/painel/acoes";
import { ChipFiltro } from "@/components/painel/fluxo";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { LIMITES_CONTA, STATUS_ANUNCIO } from "@/lib/constantes";
import { listarMeusAnuncios, obterMeuPerfil } from "@/lib/dados";
import { formatarData, formatarLugar, primeiro, rotuloModalidade, tempoRelativo } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { StatusAnuncio, TipoAnuncio } from "@/lib/tipos";

export const metadata: Metadata = { title: "Meus anúncios" };

const CINCO_DIAS = 5 * 24 * 3600 * 1000;

const TITULOS: Record<"todos" | TipoAnuncio, { titulo: string; texto: string }> = {
  todos: {
    titulo: "Meus anúncios",
    texto: "Tudo o que você publicou. Quem se interessar curte; toque no número para ver quem foi e responder.",
  },
  vaga: {
    titulo: "Vagas que você publicou",
    texto: "Quem curtir a vaga aparece nela. Toque em “candidatos” para ver quem foi e responder.",
  },
  servico: {
    titulo: "Seus serviços na vitrine",
    texto: "Quem precisa pede o serviço. Toque em “pedidos” para ver quem foi e responder.",
  },
};

export default function MeusAnuncios({ searchParams }: PageProps<"/painel/anuncios">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/anuncios">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const sp = await searchParams;
  await exigirUsuario("/painel/anuncios");
  const [anuncios, perfil] = await Promise.all([listarMeusAnuncios(), obterMeuPerfil()]);
  const agora = await agoraDaRequisicao();
  const suspensa = Boolean(perfil?.suspenso_ate && new Date(perfil.suspenso_ate).getTime() > agora);
  // o banco conta no limite o que está no ar, pausado ou em análise
  const noAr = anuncios.filter((a) => ["ativo", "pausado", "em_analise"].includes(a.status)).length;

  const pedido = primeiro(sp.tipo);
  const tipo: TipoAnuncio | null = pedido === "vaga" || pedido === "servico" ? pedido : null;
  const vagas = anuncios.filter((a) => a.tipo === "vaga").length;
  const servicos = anuncios.length - vagas;
  const lista = tipo ? anuncios.filter((a) => a.tipo === tipo) : anuncios;
  const { titulo, texto } = TITULOS[tipo ?? "todos"];

  return (
    <div className="flex flex-col gap-4">
      {suspensa && (
        <Aviso tipo="alerta" titulo="Sua conta está suspensa">
          Seus anúncios estão fora do ar e não dá para publicar, curtir ou editar. Veja o motivo no e-mail que enviamos.
        </Aviso>
      )}
      {primeiro(sp.excluido) === "1" && <Aviso tipo="sucesso" titulo="Anúncio excluído." />}
      {perfil?.tipo === "agencia" &&
        (perfil.verificado ? (
          <Aviso tipo="info" titulo="Agência verificada">
            Você pode ter até {LIMITES_CONTA.agenciaVerificada.noAr} vagas no ar e publicar até{" "}
            {LIMITES_CONTA.agenciaVerificada.porDia} por dia. Agora: {noAr} no ar.
          </Aviso>
        ) : (
          <Aviso tipo="info" titulo="Agência aguardando verificação">
            A equipe do Publike está conferindo o CNPJ. Até lá, vale o limite de todas as contas:{" "}
            {LIMITES_CONTA.comum.noAr} vagas no ar e {LIMITES_CONTA.comum.porDia} por dia. Depois, até{" "}
            {LIMITES_CONTA.agenciaVerificada.noAr} no ar e {LIMITES_CONTA.agenciaVerificada.porDia} por dia. Agora:{" "}
            {noAr} no ar.
          </Aviso>
        ))}
      {anuncios.length === 0 ? (
        <Vazio
          icone={Megaphone}
          titulo="Você ainda não publicou nada"
          acao={<BotaoLink href="/publicar">Publicar vaga grátis</BotaoLink>}
        >
          Precisa de alguém para trabalhar? Publique a vaga de graça e veja quem curte. Se você oferece serviços, monte
          sua vitrine em “Meus serviços”.
        </Vazio>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
              <h2 className="text-h2">{titulo}</h2>
              <p className="mt-1 text-body text-ink-muted">{texto}</p>
            </div>
            {tipo === "servico" ? (
              <BotaoLink href="/painel/servicos" tamanho="sm">
                <Store aria-hidden />
                Editar vitrine
              </BotaoLink>
            ) : (
              <BotaoLink href="/publicar" tamanho="sm">
                <Plus aria-hidden />
                Publicar vaga
              </BotaoLink>
            )}
          </div>
          {(tipo || (vagas > 0 && servicos > 0)) && (
            <nav aria-label="Filtrar anúncios" className="flex flex-wrap gap-2">
              <ChipFiltro
                href={tipo === "vaga" ? "/painel/anuncios" : "/painel/anuncios?tipo=vaga"}
                ativo={tipo === "vaga"}
                nome="Vagas"
                numero={vagas}
              />
              <ChipFiltro
                href={tipo === "servico" ? "/painel/anuncios" : "/painel/anuncios?tipo=servico"}
                ativo={tipo === "servico"}
                nome="Serviços"
                numero={servicos}
              />
            </nav>
          )}
          {lista.length === 0 ? (
            <Vazio
              icone={tipo === "servico" ? Store : Megaphone}
              titulo={tipo === "servico" ? "Nenhum serviço na vitrine ainda" : "Nenhuma vaga publicada ainda"}
              acao={
                tipo === "servico" ? (
                  <BotaoLink href="/painel/servicos">Montar minha vitrine</BotaoLink>
                ) : (
                  <BotaoLink href="/publicar">Publicar vaga grátis</BotaoLink>
                )
              }
            >
              {tipo === "servico"
                ? "Diga o que você faz e onde atende. Quem precisa vê seus serviços perto de casa e chama você."
                : "Publique a vaga de graça e veja quem curte. Você escolhe com quem conversar."}
            </Vazio>
          ) : (
            <ul aria-label="Lista de anúncios" className="flex flex-col gap-4">
              {lista.map((a) => {
                const status = a.status as StatusAnuncio;
                const venceLogo = status === "ativo" && new Date(a.expira_em).getTime() - agora < CINCO_DIAS;
                const podeRenovar = status === "expirado" || status === "encerrado" || venceLogo;
                return (
                  <li
                    key={a.id}
                    className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Selo
                        variante={
                          status === "ativo"
                            ? "match"
                            : status === "em_analise" || status === "removido"
                              ? "perigo"
                              : "contorno"
                        }
                      >
                        {STATUS_ANUNCIO[status]?.nome ?? status}
                      </Selo>
                      <Selo>{rotuloModalidade(a.tipo, a.regime)}</Selo>
                    </div>
                    <h3 className="text-h3">
                      <Link href={`/anuncio/${a.id}`} className="underline-offset-2 hover:underline">
                        {a.titulo}
                      </Link>
                    </h3>
                    <p className="text-body-sm text-ink-muted">
                      {formatarLugar(a.bairro, a.cidade)} · publicado {tempoRelativo(a.criado_em, agora)} ·{" "}
                      {status === "ativo"
                        ? `no ar até ${formatarData(a.expira_em)}`
                        : (STATUS_ANUNCIO[status]?.ajuda ?? "")}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <Link href={`/painel/anuncio/${a.id}`} className={classesBotao("secundario", "sm")}>
                        <Heart aria-hidden className="text-like" fill={a.curtidas_total ? "currentColor" : "none"} />
                        {a.curtidas_total}{" "}
                        {a.tipo === "servico"
                          ? a.curtidas_total === 1
                            ? "pedido"
                            : "pedidos"
                          : a.curtidas_total === 1
                            ? "candidato"
                            : "candidatos"}
                        {a.curtidas_novas > 0 && (
                          <Selo variante="like">
                            {a.curtidas_novas} {a.curtidas_novas === 1 ? "nova" : "novas"}
                          </Selo>
                        )}
                      </Link>
                      {a.matches > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-label text-cerrado-text">
                          <MessageCircleHeart aria-hidden className="size-[18px]" />
                          {a.matches} {a.matches === 1 ? "match" : "matches"}
                        </span>
                      )}
                    </div>
                    <div className="border-t border-line pt-3">
                      <AcoesAnuncio id={a.id} tipo={a.tipo} status={status} podeRenovar={podeRenovar} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
