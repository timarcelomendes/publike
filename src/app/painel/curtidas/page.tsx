import { Heart } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BotaoCurtir } from "@/components/botao-curtir";
import { BotoesContato } from "@/components/contato";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { STATUS_ANUNCIO } from "@/lib/constantes";
import { listarMinhasCurtidas } from "@/lib/dados";
import { formatarLugar, formatarValor, rotuloConta, rotuloModalidade, tempoRelativo } from "@/lib/formato";
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
  await exigirUsuario("/painel/curtidas");
  const curtidas = await listarMinhasCurtidas();
  const agora = await agoraDaRequisicao();

  if (curtidas.length === 0) {
    return (
      <Vazio icone={Heart} titulo="Você ainda não curtiu nada" acao={<BotaoLink href="/">Ver oportunidades</BotaoLink>}>
        Curta as vagas e os serviços que combinam com você. Se quem publicou curtir de volta, dá match.
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
            <p className="text-label">{formatarValor(c.pagamento_valor, c.pagamento_unidade, c.beneficios)}</p>
            {c.mensagem && <p className="rounded-md bg-surface-300 p-3 text-body-sm italic">Sua mensagem: “{c.mensagem}”</p>}
            {c.status === "match" && (
              <div className="flex flex-col gap-2 rounded-md bg-surface-300 p-3">
                <p className="text-label text-cerrado-text">Deu match! Agora é só conversar.</p>
                <BotoesContato
                  whatsapp={c.autor_whatsapp}
                  email={c.autor_email}
                  mensagem={`Olá! Deu match no Publike em “${c.titulo}”. Podemos conversar?`}
                />
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
