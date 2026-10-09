import { Heart } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BotaoCurtir } from "@/components/botao-curtir";
import { BotoesContato } from "@/components/contato";
import { CurtirDeNovo, DesfazerMatch } from "@/components/desfazer-match";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { motivoParaOutro, nomeMotivoDesfazer, STATUS_ANUNCIO } from "@/lib/constantes";
import { listarMeusDesfeitos, listarMinhasCurtidas } from "@/lib/dados";
import { formatarLugar, rotuloConta, rotuloModalidade, tempoRelativo, valorDoAnuncio } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { StatusAnuncio } from "@/lib/tipos";

export default function MinhasCurtidas() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario("/painel/curtidas");
  const [curtidas, desfeitos] = await Promise.all([listarMinhasCurtidas(), listarMeusDesfeitos()]);
  const agora = await agoraDaRequisicao();

  if (curtidas.length === 0) {
    return (
      <Vazio icone={Heart} titulo="Você ainda não curtiu nada" acao={<BotaoLink href="/">Ver oportunidades</BotaoLink>}>
        Curta as vagas que combinam com você ou peça um serviço a um profissional. Se a outra pessoa aceitar, dá match.
      </Vazio>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {curtidas.map((c) => {
        const noAr = c.anuncio_status === "ativo";
        return (
          <li key={c.anuncio_id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              {c.status === "match" && <Selo variante="match">Deu match</Selo>}
              {c.status === "pendente" && <Selo variante="like">Aguardando resposta</Selo>}
              {c.status === "dispensada" && <Selo variante="contorno">Não foi dessa vez</Selo>}
              {c.status === "desfeito" && <Selo variante="contorno">Match desfeito</Selo>}
              <Selo>{rotuloModalidade(c.tipo, c.regime)}</Selo>
              {!noAr && (
                <Selo variante="contorno">{STATUS_ANUNCIO[c.anuncio_status as StatusAnuncio]?.nome ?? "Fora do ar"}</Selo>
              )}
            </div>
            <h2 className="text-h3">
              {noAr ? (
                <Link href={`/anuncio/${c.anuncio_id}`} className="underline-offset-2 hover:underline">
                  {c.titulo}
                </Link>
              ) : (
                c.titulo
              )}
            </h2>
            <p className="text-body-sm text-ink-muted">
              {c.autor_nome} · {rotuloConta(c.autor_tipo)} · {formatarLugar(c.bairro, c.cidade)}
            </p>
            <p className="text-label">{valorDoAnuncio(c)}</p>
            {c.mensagem && <p className="rounded-md bg-surface-300 p-3 text-body-sm italic">Sua mensagem: “{c.mensagem}”</p>}
            {c.status === "match" && (
              <div className="flex flex-col gap-2 rounded-md bg-surface-300 p-3">
                <p className="text-label text-cerrado-text">Deu match! Agora é só conversar.</p>
                <BotoesContato
                  whatsapp={c.autor_whatsapp}
                  email={c.autor_email}
                  mensagem={`Olá! Deu match no Publike em “${c.titulo}”. Podemos conversar?`}
                />
                <DesfazerMatch anuncioId={c.anuncio_id} perfilId={usuario.id} outroNome={c.autor_nome} />
              </div>
            )}
            {c.status === "desfeito" && (
              <div className="flex flex-col gap-2">
                <p className="text-body-sm text-ink-muted">
                  {desfeitos.get(c.anuncio_id)?.porMim
                    ? `Você desfez o match. Motivo: ${nomeMotivoDesfazer(desfeitos.get(c.anuncio_id)?.motivo).toLowerCase()}.`
                    : `${c.autor_nome.split(" ")[0]} desfez o match. Motivo: ${motivoParaOutro(desfeitos.get(c.anuncio_id)?.motivo)}.`}
                  {desfeitos.get(c.anuncio_id)?.futuro && " Dá para curtir de novo quando quiser."}
                </p>
                {desfeitos.get(c.anuncio_id)?.futuro && noAr && <CurtirDeNovo anuncioId={c.anuncio_id} />}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-body-sm text-ink-muted">
              <span>Você curtiu {tempoRelativo(c.curtido_em, agora)}</span>
              {c.status === "pendente" && noAr && <BotaoCurtir anuncioId={c.anuncio_id} status="pendente" logado />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
