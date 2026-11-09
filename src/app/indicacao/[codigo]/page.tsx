import { Briefcase, MapPin, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FormEntrar } from "@/components/form-entrar";
import { NomeDaConta } from "@/components/indicacao/nome-da-conta";
import { Aviso, Avatar, Container, Esqueleto } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { LOGIN_CELULAR, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { CODIGO_INDICACAO_EMAIL } from "@/lib/indicacao-email";
import { redesParaEntrar } from "@/lib/login-social-servidor";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Uma vaga para você", robots: { index: false, follow: false } };

// O link do e-mail "Fulano indicou uma vaga para você" (claude/plano-comentarios-e-indicar-por-email.md, parte 1).
// Abrir a página não faz nada sozinho (leitores de link de e-mail e antivírus abrem os links para conferir). Quem não
// tem conta cria em um toque: com o Google, ou com o link de entrar que chega neste mesmo e-mail. Depois de entrar, a
// pessoa passa por /indicacao/<código>/pronto e chega na vaga com a indicação guardada (?i=p.<quem indicou>).

export default function PaginaIndicacao({ params }: PageProps<"/indicacao/[codigo]">) {
  return (
    <Container className="max-w-xl py-8 sm:py-10">
      <Suspense fallback={<Esqueleto className="h-96 w-full rounded-lg" />}>
        {params.then(({ codigo }) => (
          <Conteudo codigo={codigo} />
        ))}
      </Suspense>
    </Container>
  );
}

function LinkQueNaoVale() {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-6 shadow-card">
      <h1 className="text-h2">Este link não vale mais</h1>
      <p className="text-body text-ink-muted">
        A vaga pode ter saído do ar, ou o link foi copiado pela metade. As outras vagas continuam no Publike.
      </p>
      <BotaoLink href="/?tipo=vaga" className="self-start">
        Ver vagas
      </BotaoLink>
    </section>
  );
}

async function Conteudo({ codigo }: { codigo: string }) {
  if (MODO_DEMO || !CODIGO_INDICACAO_EMAIL.test(codigo)) return <LinkQueNaoVale />;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("ver_indicacao_email", { p_codigo: codigo });
  if (error) {
    return error.code === "PGRST202" ? (
      <LinkQueNaoVale />
    ) : (
      <Aviso tipo="alerta" titulo="Não deu para abrir a indicação agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  const d = data?.[0];
  if (!d) return <LinkQueNaoVale />;

  const usuario = await obterUsuario();
  const linkDaVaga = `/anuncio/${d.anuncio_id}?i=p.${d.indicador_id}`;
  const pronto = `/indicacao/${codigo}/pronto`;
  const podeCriar = !usuario && d.valida && d.no_ar && d.email;
  const redes = podeCriar ? await redesParaEntrar() : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Avatar nome={d.quem} tamanho={52} />
        <h1 className="text-h2 break-words">
          {d.quem} indicou uma vaga para {d.nome ? d.nome.split(" ")[0] : "você"}
        </h1>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
        <h2 className="font-display text-[22px] leading-7 font-bold break-words">{d.titulo}</h2>
        <ul className="flex flex-col gap-1.5 text-body text-ink-muted">
          <li className="flex items-center gap-2">
            <Briefcase aria-hidden className="size-4 shrink-0" />
            {d.empresa}
          </li>
          <li className="flex items-center gap-2">
            <MapPin aria-hidden className="size-4 shrink-0" />
            {d.lugar}
          </li>
          {d.valor && (
            <li className="flex items-center gap-2 text-ink">
              <Wallet aria-hidden className="size-4 shrink-0" />
              {d.valor}
            </li>
          )}
        </ul>
        {d.no_ar ? (
          <Link href={linkDaVaga} className="self-start text-label underline underline-offset-2 hover:text-terra-text">
            Ver a vaga completa
          </Link>
        ) : (
          <Aviso tipo="info" titulo="Essa vaga já foi fechada">
            Ela saiu do ar.{" "}
            <Link href={`/anuncio/${d.anuncio_id}/parecidas`} className="underline underline-offset-2">
              Veja as vagas parecidas
            </Link>
            .
          </Aviso>
        )}
      </section>

      {d.no_ar && usuario && (
        <div className="flex flex-col gap-2">
          <BotaoLink href={pronto} className="self-stretch sm:self-start">
            Ver a vaga e me candidatar
          </BotaoLink>
          <p className="text-body-sm text-ink-muted">Candidatar-se é grátis: é só tocar em Curtir na vaga.</p>
        </div>
      )}

      {podeCriar && (
        <section
          aria-labelledby="criar-conta"
          className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card"
        >
          <div className="flex flex-col gap-1">
            <h2 id="criar-conta" className="text-h3">
              Crie sua conta em um toque
            </h2>
            <p className="text-body-sm text-ink-muted">
              Com o Google, a conta fica pronta na hora. Com o e-mail, chega um link em {d.email}: abra neste aparelho e
              você entra sozinho, já na vaga.
            </p>
          </div>
          <NomeDaConta inicial={d.nome ?? ""} />
          <FormEntrar
            proximo={pronto}
            origem="email:indicacao"
            redes={redes}
            celular={LOGIN_CELULAR}
            emailInicial={d.email ?? undefined}
          />
          <p className="text-body-sm text-ink-muted">
            Ao entrar, você aceita as{" "}
            <Link href="/regras" className="underline underline-offset-2 hover:text-ink">
              regras
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" className="underline underline-offset-2 hover:text-ink">
              política de privacidade
            </Link>
            . Já usa o Publike com o celular?{" "}
            <Link href={`/entrar?next=${encodeURIComponent(pronto)}`} className="underline underline-offset-2 hover:text-ink">
              Entre com ele
            </Link>
            .
          </p>
        </section>
      )}

      {d.no_ar && !usuario && !podeCriar && (
        <div className="flex flex-wrap gap-2">
          <BotaoLink href={`/entrar?next=${encodeURIComponent(pronto)}`}>Entrar e me candidatar</BotaoLink>
          <BotaoLink href={linkDaVaga} variante="secundario">
            Só ver a vaga
          </BotaoLink>
        </div>
      )}
    </div>
  );
}
