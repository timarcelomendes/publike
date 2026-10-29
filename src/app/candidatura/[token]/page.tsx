import { Briefcase, CircleCheck, FileText, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AceitarConvite, NaoQuero } from "@/components/convite-candidato/aceitar-convite";
import { SeloVerificado } from "@/components/selo-verificado";
import { Aviso, Avatar, Container, Esqueleto } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { LOGIN_CELULAR, MODO_DEMO } from "@/lib/config";
import { TOKEN_CONVITE, type DadosDoConvite } from "@/lib/convite-candidato";
import { obterAnuncio, obterMeuCurriculo, obterUsuario } from "@/lib/dados";
import { formatarDataCurta, formatarLugar } from "@/lib/formato";
import { jeitosDeEntrar } from "@/lib/login-social";
import { dadosDoConvite } from "@/lib/servidor/convites-candidato";
import { perguntasDoBanco } from "@/lib/vaga-extra";

export const metadata: Metadata = { title: "Convite para uma vaga", robots: { index: false, follow: false } };

// O link que a agência (ou quem publicou a vaga) manda para quem enviou o currículo por fora:
// a pessoa entra (com o celular, quando o código por SMS está ligado), aceita e confere o
// currículo que veio pronto.

export default function Candidatura({ params }: PageProps<"/candidatura/[token]">) {
  return (
    <Container className="max-w-2xl py-8">
      <Suspense fallback={<Esqueleto className="h-96 w-full rounded-lg" />}>
        {params.then(({ token }) => (
          <Conteudo token={token} />
        ))}
      </Suspense>
    </Container>
  );
}

async function Conteudo({ token }: { token: string }) {
  if (MODO_DEMO || !TOKEN_CONVITE.test(token)) return <LinkQueNaoVale />;
  let d: DadosDoConvite | null;
  try {
    d = await dadosDoConvite(token);
  } catch {
    return (
      <Aviso tipo="alerta" titulo="Não deu para abrir o convite agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  if (!d) return <LinkQueNaoVale />;
  const usuario = await obterUsuario();
  const aqui = `/candidatura/${token}`;
  const quem = d.quem.nome;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Avatar nome={quem} foto={d.quem.foto} tamanho={56} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-label break-words">
            {quem}
            {d.quem.verificado && <SeloVerificado agencia={d.quem.tipo === "agencia"} />}
          </p>
          <p className="text-body-sm text-ink-muted">
            {d.quem.tipo === "agencia" ? "Agência de emprego e RH" : "Quem publicou a vaga"}
          </p>
        </div>
      </div>
      <h1 className="text-h2 sm:text-h1">
        {d.nome ? `${d.nome}, ${quem} chamou você para uma vaga` : `${quem} chamou você para uma vaga`}
      </h1>

      <section
        aria-labelledby="a-vaga"
        className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-5 shadow-card"
      >
        <p className="flex items-center gap-2 text-caption text-ink-muted uppercase">
          <Briefcase aria-hidden className="size-4" />
          Vaga
        </p>
        <h2 id="a-vaga" className="text-h3 break-words">
          {d.vaga.titulo}
        </h2>
        <p className="text-body-sm">{d.vaga.confidencial ? "Empresa confidencial" : (d.vaga.contratante ?? quem)}</p>
        <p className="flex items-center gap-1.5 text-body-sm text-ink-muted">
          <MapPin aria-hidden className="size-4 shrink-0" />
          {formatarLugar(d.vaga.bairro, d.vaga.cidade)}
        </p>
        {d.situacao === "valido" && (
          <p>
            <Link href={`/anuncio/${d.anuncio_id}`} className="text-label underline underline-offset-2">
              Ver a vaga completa
            </Link>
          </p>
        )}
      </section>

      {d.previa ? (
        <Aviso tipo="info" titulo="É assim que a pessoa vê o convite">
          Mande o link para {d.nome || "ela"}. Quando aceitar, aparece no quadro da vaga e você recebe o aviso.
        </Aviso>
      ) : d.situacao === "aceito" ? (
        <Aceito d={d} token={token} logado={usuario !== null} />
      ) : d.situacao === "recusado" ? (
        <Aviso tipo="info" titulo="Você disse que não tem interesse">
          Avisamos {quem}, e seus dados saíram do convite. Mudou de ideia? Fale com {quem}.
        </Aviso>
      ) : d.situacao !== "valido" ? (
        <Aviso tipo="alerta" titulo="Este convite não vale mais">
          {d.situacao === "vencido"
            ? `Venceu em ${formatarDataCurta(d.expira_em)}. Peça um link novo para ${quem}.`
            : d.situacao === "fora_do_ar"
              ? "A vaga saiu do ar."
              : `${quem} cancelou o convite.`}{" "}
          <Link href="/?tipo=vaga" className="text-label underline">
            Ver vagas perto de você
          </Link>
        </Aviso>
      ) : usuario ? (
        <Suspense fallback={<Esqueleto className="h-40 w-full rounded-lg" />}>
          <ParaAceitar d={d} token={token} />
        </Suspense>
      ) : (
        <section aria-labelledby="como" className="flex flex-col gap-4">
          <h2 id="como" className="text-h3">
            Como aceitar
          </h2>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-body">
            <li>
              {/* só fala em celular quando a entrada pelo código por SMS está ligada (LOGIN_CELULAR) */}
              {LOGIN_CELULAR
                ? "Entre com o número do seu celular (chega um código por SMS)."
                : `Entre com ${jeitosDeEntrar()}: na primeira vez, a conta é criada na hora.`}
            </li>
            <li>
              {d.tem_curriculo
                ? `Confira o currículo que ${quem} montou com o que você mandou.`
                : "Preencha seu currículo (leva poucos minutos)."}
            </li>
            <li>Aceite: o WhatsApp de vocês aparece para os dois.</li>
          </ol>
          <p className="text-body-sm text-ink-muted">
            O Publike é grátis para quem procura trabalho. O convite vale até {formatarDataCurta(d.expira_em)}.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <BotaoLink href={`/entrar?next=${encodeURIComponent(aqui)}`} variante="primario">
              {LOGIN_CELULAR ? "Entrar com o celular" : "Entrar para aceitar"}
            </BotaoLink>
            <NaoQuero token={token} />
          </div>
        </section>
      )}
    </div>
  );
}

async function ParaAceitar({ d, token }: { d: DadosDoConvite; token: string }) {
  const [anuncio, curriculo] = await Promise.all([obterAnuncio(d.anuncio_id), obterMeuCurriculo()]);
  return (
    <section aria-labelledby="aceitar" className="flex flex-col gap-4">
      <h2 id="aceitar" className="text-h3">
        Quer participar?
      </h2>
      {d.tem_curriculo && !curriculo && (
        <p className="flex items-start gap-2 text-body-sm">
          <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
          {d.quem.nome} montou seu currículo com o que você mandou. Você confere tudo antes de salvar.
        </p>
      )}
      <AceitarConvite
        token={token}
        perguntas={perguntasDoBanco(anuncio?.perguntas)}
        quem={d.quem.nome}
        temCurriculo={curriculo !== null}
      />
    </section>
  );
}

function Aceito({ d, token, logado }: { d: DadosDoConvite; token: string; logado: boolean }) {
  if (!d.meu) {
    return (
      <Aviso tipo="alerta" titulo="Este convite já foi aceito">
        {logado ? "Ele foi aceito por outra conta." : "Se foi você, entre na sua conta para ver."}{" "}
        {!logado && (
          <Link href={`/entrar?next=${encodeURIComponent(`/candidatura/${token}`)}`} className="text-label underline">
            Entrar
          </Link>
        )}
      </Aviso>
    );
  }
  return (
    <section aria-labelledby="aceito" className="flex flex-col gap-3 rounded-lg border-2 border-cerrado p-5">
      <h2 id="aceito" className="flex items-center gap-2 text-h3">
        <CircleCheck aria-hidden className="size-5 text-cerrado-text" />
        Você aceitou o convite
      </h2>
      <p className="text-body-sm">
        Se ainda falta o currículo, confira e salve: o match sai na hora. Depois, é só conversar com {d.quem.nome}.
      </p>
      <div className="flex flex-wrap gap-2">
        <BotaoLink href={`/anuncio/${d.anuncio_id}`} variante="primario" tamanho="sm">
          Ver a vaga
        </BotaoLink>
        <BotaoLink href={`/perfil/curriculo?convite=${token}`} tamanho="sm">
          Meu currículo
        </BotaoLink>
      </div>
    </section>
  );
}

function LinkQueNaoVale() {
  return (
    <Aviso tipo="alerta" titulo="Este link não vale">
      Confira se copiou o link inteiro ou peça um novo para quem chamou você.{" "}
      <Link href="/?tipo=vaga" className="text-label underline">
        Ver vagas perto de você
      </Link>
    </Aviso>
  );
}
