import { BriefcaseBusiness, PartyPopper, ThumbsUp } from "lucide-react";
import Link from "next/link";
import {
  RELACOES_RECOMENDACAO,
  type RelacaoRecomendacao,
} from "@/lib/constantes";
import {
  contratacoesRecentes,
  recomendacoesDoPerfil,
} from "@/lib/dados-social";
import { formatarLugar, tempoRelativo } from "@/lib/formato";
import { Avatar, Container, Selo } from "../ui/basicos";
import { AcoesRecomendacao, FormRecomendar } from "./recomendar";

/** "Eu recomendo" no perfil de quem presta serviço. */
export async function SecaoRecomendacoes({
  perfilId,
  nome,
  usuarioId,
  agora,
}: {
  perfilId: string;
  nome: string;
  usuarioId: string | null;
  agora: number;
}) {
  const lista = await recomendacoesDoPerfil(perfilId);
  const meu = usuarioId === perfilId;
  const minha = lista.find((r) => r.autor_id === usuarioId) ?? null;
  const primeiroNome = nome.split(" ")[0];
  const visiveis = lista.filter((r) => !r.oculta).length;

  return (
    <section id="recomendacoes" className="mt-10 scroll-mt-24">
      <h2 className="flex items-center gap-2 text-h2">
        <ThumbsUp aria-hidden className="size-6" />
        Quem recomenda
      </h2>
      <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
        {meu
          ? "Peça para vizinhos, clientes e ex-patrões recomendarem você: confiança é o que mais pesa na hora de contratar. Cada recomendação só aparece no seu perfil depois que você aprovar."
          : visiveis
            ? `Recomendações de quem conhece ${primeiroNome}: vizinhos, clientes, ex-patrões e colegas. São diferentes das avaliações, que vêm depois de um serviço contratado pelo Publike.`
            : `Conhece ${primeiroNome}? Sua recomendação ajuda ${primeiroNome} a conseguir trabalho.`}
      </p>
      {lista.length > 0 && (
        <ul className="mt-4 flex max-w-3xl flex-col gap-3">
          {lista.map((r) => (
            <li
              key={r.id}
              className="flex gap-3 rounded-lg border border-line bg-surface-200 p-4"
            >
              <Avatar nome={r.autor_nome} foto={r.autor_foto} tamanho={40} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={`/perfil/${r.autor_id}`}
                    className="text-label hover:underline"
                  >
                    {r.autor_nome}
                  </Link>
                  <span className="text-body-sm text-ink-muted">
                    {RELACOES_RECOMENDACAO[r.relacao as RelacaoRecomendacao] ??
                      "Conhecido"}{" "}
                    · {tempoRelativo(r.criado_em, agora)}
                  </span>
                  {r.oculta &&
                    (r.decidida ? (
                      <Selo variante="contorno">Escondida</Selo>
                    ) : (
                      <Selo>{meu ? "Nova" : "Esperando aprovação"}</Selo>
                    ))}
                </p>
                <p className="text-body whitespace-pre-line">{r.texto}</p>
                {!meu && r.autor_id === usuarioId && r.oculta && (
                  <p className="text-body-sm text-ink-muted">Ainda não aparece no perfil de {primeiroNome}.</p>
                )}
                {(meu || r.autor_id === usuarioId) && (
                  <AcoesRecomendacao
                    id={r.id}
                    profissionalId={perfilId}
                    sou={meu ? "profissional" : "autor"}
                    oculta={r.oculta}
                    decidida={r.decidida}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!meu && (
        <div className="mt-4">
          <FormRecomendar
            profissionalId={perfilId}
            primeiroNome={primeiroNome}
            logado={usuarioId !== null}
            minha={
              minha ? { relacao: minha.relacao, texto: minha.texto } : null
            }
          />
        </div>
      )}
    </section>
  );
}

/** Contratações que os dois lados toparam mostrar, de uma empresa ou de uma pessoa. */
export async function SecaoContratacoes({
  empresa,
  pessoa,
  agora,
}: {
  empresa?: string;
  pessoa?: string;
  agora: number;
}) {
  const lista = await contratacoesRecentes({ empresa, pessoa, limite: 12 });
  if (!lista.length) return null;
  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-h2">
        <PartyPopper aria-hidden className="size-6 text-cerrado-text" />
        {empresa ? "Contratou pelo Publike" : "Contratado pelo Publike"}
      </h2>
      <ul className="mt-4 flex max-w-3xl flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
        {lista.map((c) => (
          <li
            key={`${c.anuncio_id}:${c.pessoa_id}`}
            className="flex flex-col gap-0.5 px-4 py-3"
          >
            <span className="text-label">
              {empresa ? c.pessoa_nome : c.empresa_nome} · {c.titulo}
            </span>
            <span className="text-body-sm text-ink-muted">
              {formatarLugar(c.bairro, c.cidade)} ·{" "}
              {tempoRelativo(c.publicado_em, agora)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Na página inicial: gente contratada pelo Publike (só com 3 ou mais, para não parecer vazio). */
export async function ContratacoesNaHome({ agora }: { agora: number }) {
  const lista = await contratacoesRecentes({ limite: 6 });
  if (lista.length < 3) return null;
  return (
    <Container>
      <section aria-labelledby="contratados-home" className="mt-16 sm:mt-20">
        <h2
          id="contratados-home"
          className="flex items-center gap-2 text-h2 sm:text-h1"
        >
          Gente contratada pelo Publike
        </h2>
        <p className="mt-2 max-w-2xl text-body text-ink-muted sm:text-body-lg">
          Quem contratou e quem foi contratado toparam mostrar. Pode ser você na
          próxima.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((c) => (
            <li
              key={`${c.anuncio_id}:${c.pessoa_id}`}
              className="flex gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-cerrado text-on-cerrado">
                <BriefcaseBusiness aria-hidden className="size-5" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-label">
                  {c.pessoa_nome} foi contratado(a) por{" "}
                  <Link
                    href={`/perfil/${c.empresa_id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {c.empresa_nome}
                  </Link>
                </span>
                <span className="truncate text-body-sm text-ink-muted">
                  {c.titulo} · {formatarLugar(c.bairro, c.cidade)} ·{" "}
                  {tempoRelativo(c.publicado_em, agora)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}
