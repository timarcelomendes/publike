import { MessageCircleHeart, Star } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BotoesContato } from "@/components/contato";
import { DesfazerMatch } from "@/components/desfazer-match";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Avatar, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { listarMatches } from "@/lib/dados";
import { formatarLugar, rotuloConta, tempoRelativo } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export default function Matches() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario("/painel/matches");
  const matches = await listarMatches();
  const agora = await agoraDaRequisicao();

  if (matches.length === 0) {
    return (
      <Vazio
        icone={MessageCircleHeart}
        titulo="Nenhum match ainda"
        acao={<BotaoLink href="/">Ver oportunidades</BotaoLink>}
      >
        Dá match quando os dois lados curtem: você curte um anúncio e quem publicou curte você de volta (ou o
        contrário). Aí o WhatsApp aparece aqui.
      </Vazio>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {matches.map((m) => {
        const primeiroNome = m.outro_nome.split(" ")[0];
        const mensagem =
          m.papel === "publiquei"
            ? `Olá, ${primeiroNome}! Vi que você curtiu “${m.anuncio_titulo}” no Publike. Vamos conversar?`
            : `Olá! Deu match no Publike em “${m.anuncio_titulo}”. Podemos conversar?`;
        return (
          <li
            key={`${m.anuncio_id}-${m.outro_id}`}
            className="flex gap-4 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
          >
            <Avatar nome={m.outro_nome} foto={m.outro_foto} tamanho={56} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div>
                <p className="font-display text-h3">
                  <Link href={`/perfil/${m.outro_id}`} className="underline-offset-2 hover:underline">
                    {m.outro_nome}
                  </Link>
                </p>
                <p className="text-body-sm text-ink-muted">
                  {rotuloConta(m.outro_tipo)} · {formatarLugar(m.outro_bairro, m.outro_cidade)} · match{" "}
                  {tempoRelativo(m.match_em, agora)}
                </p>
              </div>
              <p className="text-body-sm">
                {m.papel === "publiquei"
                  ? m.anuncio_tipo === "servico"
                    ? "Pediu o seu serviço "
                    : "Curtiu o seu anúncio "
                  : m.anuncio_tipo === "servico"
                    ? "Você pediu "
                    : "Você curtiu "}
                <Link href={`/anuncio/${m.anuncio_id}`} className="font-semibold underline-offset-2 hover:underline">
                  “{m.anuncio_titulo}”
                </Link>
              </p>
              <BotoesContato whatsapp={m.outro_whatsapp} email={m.outro_email} mensagem={mensagem} />
              {m.papel === "curti" && m.anuncio_tipo === "servico" && (
                <Link
                  href={`/anuncio/${m.anuncio_id}/avaliar`}
                  className="inline-flex min-h-11 items-center gap-2 self-start text-label text-terra-text underline-offset-2 hover:underline"
                >
                  <Star aria-hidden className="size-4 text-ipe" fill="currentColor" strokeWidth={0} />
                  Avaliar o serviço
                </Link>
              )}
              <DesfazerMatch
                anuncioId={m.anuncio_id}
                perfilId={m.papel === "publiquei" ? m.outro_id : usuario.id}
                outroNome={m.outro_nome}
                autorDaVaga={m.papel === "publiquei" && m.anuncio_tipo === "vaga"}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
