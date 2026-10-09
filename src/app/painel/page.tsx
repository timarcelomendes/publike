import { Heart, Megaphone, MessageCircleHeart } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { AcoesAnuncio } from "@/components/painel/acoes";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { STATUS_ANUNCIO } from "@/lib/constantes";
import { listarMeusAnuncios, obterMeuPerfil } from "@/lib/dados";
import { formatarData, formatarLugar, primeiro, rotuloModalidade, tempoRelativo } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { StatusAnuncio } from "@/lib/tipos";

const CINCO_DIAS = 5 * 24 * 3600 * 1000;

export default function MeusAnuncios({ searchParams }: PageProps<"/painel">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const sp = await searchParams;
  await exigirUsuario("/painel");
  const [anuncios, perfil] = await Promise.all([listarMeusAnuncios(), obterMeuPerfil()]);
  const agora = await agoraDaRequisicao();
  const suspensa = Boolean(perfil?.suspenso_ate && new Date(perfil.suspenso_ate).getTime() > agora);

  return (
    <div className="flex flex-col gap-4">
      {suspensa && (
        <Aviso tipo="alerta" titulo="Sua conta está suspensa">
          Seus anúncios estão fora do ar e não dá para publicar, curtir ou editar. Veja o motivo no e-mail que enviamos.
        </Aviso>
      )}
      {primeiro(sp.excluido) === "1" && <Aviso tipo="sucesso" titulo="Anúncio excluído." />}
      {anuncios.length === 0 ? (
        <Vazio
          icone={Megaphone}
          titulo="Você ainda não publicou nada"
          acao={<BotaoLink href="/publicar">Publicar grátis</BotaoLink>}
        >
          Precisa de alguém para trabalhar ou para um serviço? Publique de graça e veja quem curte.
        </Vazio>
      ) : (
        <ul className="flex flex-col gap-4">
          {anuncios.map((a) => {
            const status = a.status as StatusAnuncio;
            const venceLogo = status === "ativo" && new Date(a.expira_em).getTime() - agora < CINCO_DIAS;
            const podeRenovar = status === "expirado" || status === "encerrado" || venceLogo;
            return (
              <li key={a.id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Selo
                    variante={
                      status === "ativo" ? "match" : status === "em_analise" || status === "removido" ? "perigo" : "contorno"
                    }
                  >
                    {STATUS_ANUNCIO[status]?.nome ?? status}
                  </Selo>
                  <Selo>{rotuloModalidade(a.tipo, a.regime)}</Selo>
                </div>
                <h2 className="text-h3">
                  <Link href={`/anuncio/${a.id}`} className="underline-offset-2 hover:underline">
                    {a.titulo}
                  </Link>
                </h2>
                <p className="text-body-sm text-ink-muted">
                  {formatarLugar(a.bairro, a.cidade)} · publicado {tempoRelativo(a.criado_em, agora)} ·{" "}
                  {status === "ativo"
                    ? `no ar até ${formatarData(a.expira_em)}`
                    : (STATUS_ANUNCIO[status]?.ajuda ?? "")}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/painel/anuncio/${a.id}`} className={classesBotao("secundario", "sm")}>
                    <Heart aria-hidden className="text-like" fill={a.curtidas_total ? "currentColor" : "none"} />
                    {a.curtidas_total} {a.curtidas_total === 1 ? "curtida" : "curtidas"}
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
                  <AcoesAnuncio id={a.id} status={status} podeRenovar={podeRenovar} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
