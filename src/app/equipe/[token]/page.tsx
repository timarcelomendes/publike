import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AceitarEquipe, AgirComo } from "@/components/equipe/aceitar-equipe";
import { SeloVerificado } from "@/components/selo-verificado";
import { Aviso, Avatar, Container, Esqueleto } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { LOGIN_CELULAR, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { PAPEIS_EQUIPE, TOKEN_EQUIPE, type DadosConviteEquipe } from "@/lib/equipe";
import { formatarDataCurta } from "@/lib/formato";
import { comoEntrarPeloConvite } from "@/lib/login-social";
import { conviteEquipeDoToken } from "@/lib/servidor/equipe";

export const metadata: Metadata = { title: "Convite para a equipe", robots: { index: false, follow: false } };

// O link que a agência manda para quem vai entrar na equipe: a pessoa entra com o próprio celular
// e passa a agir pela agência.

export default function ConviteEquipe({ params }: PageProps<"/equipe/[token]">) {
  return (
    <Container className="max-w-2xl py-8">
      <Suspense fallback={<Esqueleto className="h-80 w-full rounded-lg" />}>
        {params.then(({ token }) => (
          <Conteudo token={token} />
        ))}
      </Suspense>
    </Container>
  );
}

async function Conteudo({ token }: { token: string }) {
  if (MODO_DEMO || !TOKEN_EQUIPE.test(token)) return <LinkQueNaoVale />;
  let d: DadosConviteEquipe | null;
  try {
    d = await conviteEquipeDoToken(token);
  } catch {
    return (
      <Aviso tipo="alerta" titulo="Não deu para abrir o convite agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  if (!d) return <LinkQueNaoVale />;
  const usuario = await obterUsuario();
  const papel = PAPEIS_EQUIPE[d.papel];
  const agencia = d.agencia.nome;
  const aqui = `/equipe/${token}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Avatar nome={agencia} foto={d.agencia.foto} tamanho={56} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-label break-words">
            {agencia}
            {d.agencia.verificado && <SeloVerificado agencia />}
          </p>
          <p className="text-body-sm text-ink-muted">Agência de emprego e RH</p>
        </div>
      </div>
      <h1 className="text-h2 sm:text-h1">
        {d.nome ? `${d.nome.split(" ")[0]}, entre` : "Entre"} na equipe da {agencia}
      </h1>
      <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
        <p className="flex items-center gap-2 text-caption text-ink-muted uppercase">
          <Users aria-hidden className="size-4" />
          Papel: {papel.nome}
        </p>
        <p className="text-body">{papel.ajuda}</p>
        <p className="text-body-sm text-ink-muted">
          Você entra com o seu celular e age pela agência. O que você fizer fica anotado com o seu nome para a equipe.
        </p>
      </section>

      {d.sou_a_agencia ? (
        <Aviso tipo="info" titulo="Este convite é para outra pessoa">
          Mande o link para quem vai entrar na sua equipe. Cada link serve para uma pessoa.
        </Aviso>
      ) : d.ja_sou_da_equipe && usuario ? (
        <section className="flex flex-col gap-3">
          <Aviso tipo="sucesso" titulo="Você já é da equipe">
            {usuario.id === d.agencia.id
              ? `Você já está agindo pela ${agencia}.`
              : `Para cuidar das vagas da ${agencia}, troque de conta.`}
          </Aviso>
          {usuario.id === d.agencia.id ? (
            <div>
              <BotaoLink href="/painel" variante="primario">
                Ir para o painel
              </BotaoLink>
            </div>
          ) : (
            <AgirComo contaId={d.agencia.id} nome={agencia} />
          )}
        </section>
      ) : d.situacao !== "valido" ? (
        <Aviso tipo="alerta" titulo="Este convite não vale mais">
          {d.situacao === "vencido"
            ? `Venceu em ${formatarDataCurta(d.expira_em)}.`
            : d.situacao === "aceito"
              ? "Ele já foi usado."
              : "A agência cancelou o convite."}{" "}
          Peça um link novo para a {agencia}.
        </Aviso>
      ) : usuario ? (
        <section className="flex flex-col gap-3">
          <p className="text-body-sm text-ink-muted">Vale até {formatarDataCurta(d.expira_em)}.</p>
          <AceitarEquipe token={token} agencia={agencia} />
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <p className="text-body">
            {/* só fala em celular quando a entrada pelo código por SMS está ligada (LOGIN_CELULAR) */}
            {LOGIN_CELULAR
              ? "Entre com o número do seu celular (chega um código por SMS)."
              : `${comoEntrarPeloConvite()}.`}{" "}
            Se ainda não tem conta no Publike, ela é criada na hora, de graça.
          </p>
          <div>
            <BotaoLink href={`/entrar?next=${encodeURIComponent(aqui)}`} variante="primario">
              {LOGIN_CELULAR ? "Entrar com o celular" : "Entrar para aceitar"}
            </BotaoLink>
          </div>
        </section>
      )}
    </div>
  );
}

function LinkQueNaoVale() {
  return (
    <Aviso tipo="alerta" titulo="Este link não vale">
      Confira se copiou o link inteiro ou peça um novo para a agência.{" "}
      <Link href="/" className="text-label underline">
        Ir para o início
      </Link>
    </Aviso>
  );
}
