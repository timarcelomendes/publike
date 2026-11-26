import type { Metadata } from "next";
import { Suspense } from "react";
import { ResponderQuemContratou } from "@/components/quem-contratou/responder";
import { Aviso, Avatar, Container, Esqueleto } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { escolhaDoLink, lerPergunta } from "@/lib/quem-contratou";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Quem você contratou?", robots: { index: false, follow: false } };

// "Quem você contratou?" pelo link (migração 20271006120000): quem publicou a vaga responde sem entrar no Publike. O
// link chega por e-mail (um botão por pessoa aceita), pelo WhatsApp, no sino e no painel. Abrir não responde nada: a
// resposta é o toque na página (o leitor de e-mail que abre os links sozinho não conta).

export default function QuemContratouPeloLink({ params, searchParams }: PageProps<"/quem-contratou/[token]">) {
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
      Confira se abriu o link inteiro do e-mail ou do WhatsApp. Se preferir, entre no Publike e responda pelo painel.
    </Aviso>
  );
  if (MODO_DEMO || !/^[0-9a-f]{64}$/.test(token)) return naoVale;
  const { data, error } = await (await criarClienteServidor()).rpc("quem_contratou_pelo_link", { p_token: token });
  if (error) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para abrir agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  const pergunta = lerPergunta(data);
  if (!pergunta) return naoVale;
  if (pergunta.removida) {
    return (
      <Aviso tipo="info" titulo="Esta vaga foi removida do Publike">
        Não há mais o que responder sobre ela. Obrigado!
      </Aviso>
    );
  }
  const escolha = escolhaDoLink(busca, pergunta.pessoas);
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 shadow-card sm:p-7">
      <div className="flex items-center gap-3">
        <Avatar nome={pergunta.empresa ?? "Publike"} foto={pergunta.empresa_foto} tamanho={44} />
        <div className="min-w-0">
          <p className="truncate text-label">{pergunta.empresa ?? "Sua empresa"}</p>
          <p className="truncate text-body-sm text-ink-muted">Vaga de {pergunta.titulo}</p>
        </div>
      </div>
      {pergunta.pessoas.length === 0 ? (
        <div className="flex flex-col gap-3">
          <h1 className="text-h2">Ninguém foi aceito nesta vaga ainda</h1>
          <p className="text-body text-ink-muted">
            Quando você aceitar alguém pelo Publike, a pessoa aparece aqui para você contar se contratou.
          </p>
          <BotaoLink href={`/painel/anuncio/${pergunta.anuncio_id}/quadro`} className="self-start">
            Ver os candidatos
          </BotaoLink>
        </div>
      ) : (
        <ResponderQuemContratou token={token} pergunta={pergunta} marcadas={escolha.marcadas} parte={escolha.parte} />
      )}
    </section>
  );
}
