import type { Metadata } from "next";
import { Suspense } from "react";
import { ResponderVencimento } from "@/components/vencimento/responder";
import { Aviso, Avatar, Container, Esqueleto } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { escolhaDoVencimento, lerSituacao } from "@/lib/vencimento";

export const metadata: Metadata = { title: "A sua vaga", robots: { index: false, follow: false } };

// O vencimento com um toque (migração 20271010120000; 26/11/2026, Marcelo, com a vaga da Hidraulica Brasil que venceu
// sem ninguém perguntar se foi preenchida): quem publicou prorroga, conta que já preencheu ou encerra, sem entrar. O
// link chega nos avisos do vencimento (e-mail com os três botões, sino e celular). Abrir não responde nada.

export default function VencimentoPeloLink({ params, searchParams }: PageProps<"/vaga-vence/[token]">) {
  return (
    <Container className="max-w-xl py-8 sm:py-10">
      <Suspense fallback={<Esqueleto className="h-[28rem] w-full rounded-lg" />}>
        {Promise.all([params, searchParams]).then(([{ token }, busca]) => (
          <Conteudo token={token} busca={busca} />
        ))}
      </Suspense>
    </Container>
  );
}

async function Conteudo({ token, busca }: { token: string; busca: Record<string, string | string[] | undefined> }) {
  const naoVale = (
    <Aviso tipo="alerta" titulo="Este link não vale">
      Confira se abriu o link inteiro do e-mail. Se preferir, entre no Publike e cuide da vaga pelo painel.
    </Aviso>
  );
  if (MODO_DEMO || !/^[0-9a-f]{64}$/.test(token)) return naoVale;
  const { data, error } = await (await criarClienteServidor()).rpc("vencimento_pelo_link", { p_token: token });
  if (error) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para abrir agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  const s = lerSituacao(data);
  if (!s) return naoVale;
  if (s.removida) {
    return (
      <Aviso tipo="info" titulo="Esta vaga foi removida do Publike">
        Não há mais o que fazer com ela. Obrigado!
      </Aviso>
    );
  }
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 shadow-card sm:p-7">
      <div className="flex items-center gap-3">
        <Avatar nome={s.empresa ?? "Publike"} foto={s.empresa_foto} tamanho={44} />
        <div className="min-w-0">
          <p className="truncate text-label">{s.empresa ?? "Sua empresa"}</p>
          <p className="truncate text-body-sm text-ink-muted">Vaga de {s.titulo}</p>
        </div>
      </div>
      {s.preenchida ? (
        <div className="flex flex-col gap-3">
          <h1 className="text-h2">Esta vaga já está marcada como preenchida</h1>
          <p className="text-body text-ink-muted">Obrigado por contar! Precisa de mais gente? Publique uma vaga nova.</p>
          <BotaoLink href="/publicar" variante="primario" className="self-start">
            Publicar outra vaga
          </BotaoLink>
        </div>
      ) : (
        <ResponderVencimento token={token} situacao={s} escolhida={escolhaDoVencimento(busca)} />
      )}
    </section>
  );
}
