import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MessageCircle } from "lucide-react";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { entrarNaOutraConta, ficarComAContaNova, juntarAsContas, naoJuntar } from "@/lib/acoes/juntar-whatsapp";
import { caminhoSeguro, formatarTelefone, primeiro } from "@/lib/formato";
import { CAMINHO_JUNTAR, contasParaJuntar, provaDoNavegador } from "@/lib/servidor/juntar-whatsapp";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Juntar a conta nova do WhatsApp com a conta que já existe (21/11/2026; migração 20270819120000,
// src/lib/servidor/juntar-whatsapp.ts). Três momentos: a pergunta (na conta nova), a confirmação (já na outra conta)
// e o pronto.

export const metadata: Metadata = {
  title: "Vincular o WhatsApp",
  robots: { index: false, follow: false },
};

const ERROS: Record<string, string> = {
  conta_invalida: "Esta conta não pode ter o WhatsApp vinculado (conta da equipe, da moderação ou suspensa). Entre na outra conta.",
  ja_tem_outro: "Esta conta já tem outro WhatsApp vinculado. Para trocar, desvincule o outro em Meu perfil.",
  numero_em_uso: "Esse WhatsApp já está vinculado a outra conta do Publike.",
  conta_nova_invalida: "A conta nova do WhatsApp já foi usada ou passou do tempo. Vincule o WhatsApp em Meu perfil.",
  mesma_conta: "Entre na outra conta, a que já existia, para vincular.",
  numero_invalido: "Não deu para vincular agora. Tente de novo.",
  fora: "Não deu para vincular agora. Tente de novo em instantes.",
};

export default function Juntar({ searchParams }: PageProps<"/entrar/juntar">) {
  return (
    <Container className="max-w-xl pt-6 pb-12 sm:pt-10">
      <Suspense fallback={<Esqueleto className="h-80 w-full rounded-lg" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-6 shadow-card">
      <div className="flex items-start gap-3">
        <MessageCircle aria-hidden className="mt-1 size-6 shrink-0 text-cerrado" />
        <h1 className="text-h2">{titulo}</h1>
      </div>
      {children}
    </section>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/entrar/juntar">["searchParams"] }) {
  const sp = await searchParams;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getUser();
  const usuario = data.user;

  if (primeiro(sp.pronto) === "1") {
    const destino = caminhoSeguro(primeiro(sp.next), "/");
    return (
      <Cartao titulo="Pronto: WhatsApp vinculado">
        <p className="text-body">
          {usuario?.phone ? (
            <>
              O WhatsApp <strong>{formatarTelefone(usuario.phone)}</strong> agora está vinculado a esta conta
              {usuario.email ? ` (${usuario.email})` : ""}.
            </>
          ) : (
            "O WhatsApp agora está vinculado a esta conta."
          )}{" "}
          Da próxima vez, é só tocar em “Entrar com o WhatsApp”. A conta nova que tinha sido criada foi apagada.
        </p>
        <BotaoLink href={destino} variante="primario" className="self-start">
          Continuar
        </BotaoLink>
      </Cartao>
    );
  }

  const prova = await provaDoNavegador();
  if (!prova) {
    return (
      <Cartao titulo="O pedido para vincular venceu">
        <p className="text-body text-ink-muted">
          Ele vale 15 minutos e só neste navegador. Para recomeçar, entre de novo com o WhatsApp. Se você já está na sua
          conta, dá para vincular o WhatsApp em Meu perfil.
        </p>
        <div className="flex flex-wrap gap-2">
          <BotaoLink href="/entrar" variante="primario">
            Entrar
          </BotaoLink>
          <BotaoLink href="/perfil#whatsapp-acesso" variante="secundario">
            Ir para Meu perfil
          </BotaoLink>
        </div>
      </Cartao>
    );
  }
  if (!usuario) redirect(`/entrar?next=${encodeURIComponent(CAMINHO_JUNTAR)}`);
  const numero = formatarTelefone(prova.numero);
  const erro = primeiro(sp.erro);

  // 1. Na conta nova: a pergunta
  if (usuario.id === prova.nova) {
    const info = await contasParaJuntar(prova.nova);
    if (!info) {
      return (
        <Cartao titulo="Tudo certo">
          <p className="text-body text-ink-muted">Sua conta foi criada com o WhatsApp {numero}.</p>
          <form action={ficarComAContaNova}>
            <Botao type="submit" variante="primario">
              Continuar
            </Botao>
          </form>
        </Cartao>
      );
    }
    const quais = info.contas.length === 1 ? `da conta com o e-mail ${info.contas[0]}` : `das contas com os e-mails ${info.contas.join(" e ")}`;
    return (
      <Cartao titulo="Esse WhatsApp já está numa conta do Publike">
        <p className="text-body">
          O WhatsApp <strong>{numero}</strong> está no cadastro {quais}. {info.contas.length === 1 ? "É sua?" : "Uma delas é sua?"}
        </p>
        <p className="text-body-sm text-ink-muted">
          Se for, entre nela (com o link no e-mail, a senha ou o Google) e confirme: o WhatsApp passa a entrar nela, e a
          conta nova que acabou de ser criada é apagada. Vale por 15 minutos, neste navegador.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <form action={entrarNaOutraConta}>
            <Botao type="submit" variante="primario" className="w-full sm:w-auto">
              Sim, entrar na minha conta e vincular
            </Botao>
          </form>
          <form action={ficarComAContaNova}>
            <Botao type="submit" variante="secundario" className="w-full sm:w-auto">
              Não, criar uma conta nova
            </Botao>
          </form>
        </div>
      </Cartao>
    );
  }

  // 2. Já na outra conta: a confirmação
  return (
    <Cartao titulo="Vincular o WhatsApp a esta conta?">
      <p className="text-body">
        O WhatsApp <strong>{numero}</strong> vai entrar nesta conta
        {usuario.email ? (
          <>
            {" "}
            (<strong>{usuario.email}</strong>)
          </>
        ) : null}
        . A conta nova que foi criada com ele agora há pouco será apagada.
      </p>
      {erro && <Aviso tipo="erro">{ERROS[erro] ?? ERROS.fora}</Aviso>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <form action={juntarAsContas}>
          <Botao type="submit" variante="primario" className="w-full sm:w-auto">
            Vincular o WhatsApp
          </Botao>
        </form>
        <form action={naoJuntar}>
          <Botao type="submit" variante="secundario" className="w-full sm:w-auto">
            Agora não
          </Botao>
        </form>
      </div>
    </Cartao>
  );
}
