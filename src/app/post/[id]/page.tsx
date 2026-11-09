import { MessageSquareText } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { BalaoDoRecado } from "@/components/recados/balao-do-recado";
import { Container, Esqueleto, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { obterUsuario } from "@/lib/dados";
import { tempoRelativo } from "@/lib/formato";
import { estadosDeConexao } from "@/lib/servidor/conexoes";
import { umRecado } from "@/lib/servidor/recados";
import { agoraDaRequisicao } from "@/lib/tempo";

// O post sozinho, para compartilhar (antes, /recado/[id]: o endereço velho redireciona, em next.config.ts). Fora do Google: é conversa, não anúncio.

export async function generateMetadata({ params }: PageProps<"/post/[id]">): Promise<Metadata> {
  const { id } = await params;
  const r = await umRecado(id);
  if (!r) return { title: "Post não encontrado", robots: { index: false, follow: false } };
  const titulo = `Post de ${r.autor_nome}`;
  const descricao = r.texto.replace(/\s+/g, " ").slice(0, 160);
  return {
    title: titulo,
    description: descricao,
    robots: { index: false, follow: false },
    openGraph: { title: titulo, description: descricao, type: "article" },
  };
}

export default function PaginaRecado({ params }: PageProps<"/post/[id]">) {
  return (
    <Container className="max-w-2xl py-8 sm:py-12">
      <Suspense fallback={<Esqueleto className="h-48 w-full rounded-lg" />}>
        <Conteudo params={params} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ params }: { params: PageProps<"/post/[id]">["params"] }) {
  const { id } = await params;
  const [r, usuario, agora] = await Promise.all([umRecado(id), obterUsuario(), agoraDaRequisicao()]);
  if (!r) {
    return (
      <Vazio
        icone={MessageSquareText}
        titulo="Esse post não está mais no ar"
        acao={
          <BotaoLink href="/" variante="primario">
            Ver o que tem perto de você
          </BotaoLink>
        }
      >
        Quem escreveu pode ter apagado, ou ele saiu pela moderação.
      </Vazio>
    );
  }
  const logado = usuario !== null;
  const conexao = logado && !r.meu ? ((await estadosDeConexao([r.autor_id])).get(r.autor_id) ?? null) : null;
  return (
    <>
      <h1 className="mb-4 font-display text-h2">Post de {r.autor_nome}</h1>
      <BalaoDoRecado
        r={r}
        logado={logado}
        hora={tempoRelativo(r.quando, agora)}
        comFoto="sempre"
        conexao={conexao}
      />
      <div className="mt-6 flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 sm:flex-row sm:items-center">
        <p className="flex-1 text-body">
          {logado
            ? "Veja os outros posts, vagas e serviços perto de você."
            : "No Publike, quem procura trabalho e quem contrata se encontram, de graça."}
        </p>
        {logado ? (
          <BotaoLink href="/?tipo=recado" variante="secundario">
            Ver os posts
          </BotaoLink>
        ) : (
          <BotaoLink href={`/entrar?next=${encodeURIComponent(`/post/${r.id}`)}`} variante="primario">
            Entrar no Publike
          </BotaoLink>
        )}
      </div>
    </>
  );
}
