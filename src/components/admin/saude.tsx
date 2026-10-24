import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import type { SaudeSite } from "@/lib/admin/dados";
import { plural, tempoRelativo } from "@/lib/formato";

type Item = { tema: string; ok: boolean; texto: string; href: string };

const MEIA_HORA = 30 * 60 * 1000;

/** O que precisa de atenção: cada tema crítico em verde (em dia) ou vermelho (parado ou esperando você). */
export function itensDaSaude(s: SaudeSite, agora: number): Item[] {
  const quando = (iso: string | null) => (iso ? tempoRelativo(iso, agora) : "");

  // e-mails: parados na fila ou com falha
  const emails: Item = {
    tema: "E-mails",
    href: "/admin/emails",
    ok: s.emails.parados === 0 && s.emails.falharam_24h === 0,
    texto:
      s.emails.parados > 0
        ? `${plural(s.emails.parados, "e-mail parado", "e-mails parados")} na fila ${quando(s.emails.parado_desde)}: o site não está conseguindo mandar.`
        : s.emails.falharam_24h > 0
          ? `${plural(s.emails.falharam_24h, "e-mail falhou", "e-mails falharam")} nas últimas 24 horas.`
          : s.emails.ultimo_enviado
            ? `Em dia. O último saiu ${quando(s.emails.ultimo_enviado)}.`
            : "Em dia.",
  };

  // revisão da IA: anúncios, recados e avaliações esperando
  const ia: Item = {
    tema: "Revisão da IA",
    href: "/admin/ia",
    ok: s.ia.parados === 0 && s.ia.erros_24h === 0,
    texto:
      s.ia.parados > 0
        ? `${plural(s.ia.parados, "item espera", "itens esperam")} a IA ${quando(s.ia.parado_desde)}: quem publicou fica sem resposta.`
        : s.ia.erros_24h > 0
          ? `A IA deu erro ${plural(s.ia.erros_24h, "vez", "vezes")} nas últimas 24 horas.`
          : !s.ia.ligada
            ? "Desligada: os anúncios entram no ar sem revisão."
            : s.ia.ultima_revisao
              ? `Em dia. A última revisão foi ${quando(s.ia.ultima_revisao)}.`
              : "Em dia.",
  };

  // a chave do site publicado: sem ela (ou com o valor errado na Vercel), as filas param
  const nova = s.chaves[0] ?? null;
  const usadas = s.chaves.map((k) => k.usada_em).filter((d): d is string => Boolean(d));
  const ultimoUso = usadas.length ? usadas.reduce((a, b) => (a > b ? a : b)) : null;
  const paradoDesde = [s.emails.parado_desde, s.ia.parado_desde].filter((d): d is string => Boolean(d)).sort()[0];
  const novaSemUso = nova && !nova.usada_em && agora - new Date(nova.criada_em).getTime() > MEIA_HORA;
  const filaSemChave = Boolean(paradoDesde) && (!ultimoUso || ultimoUso < paradoDesde);
  const chave: Item = {
    tema: "Chave do site",
    href: "/admin/chaves",
    ok: Boolean(nova) && !novaSemUso && !filaSemChave,
    texto: !nova
      ? "Nenhuma chave: o site publicado não manda e-mails nem roda a IA."
      : novaSemUso
        ? `A chave “${nova.nome}” foi criada ${quando(nova.criada_em)} e o site nunca usou. Na Vercel, cole só o valor (sem o nome) e faça um Redeploy.`
        : filaSemChave
          ? `Tem coisa parada na fila e o site ${ultimoUso ? `não usa a chave desde ${quando(ultimoUso)}` : "nunca usou a chave"}. Confira o valor na Vercel.`
          : ultimoUso
            ? `O site usou a chave ${quando(ultimoUso)}.`
            : `Criada ${quando(nova.criada_em)}: esperando o site usar.`,
  };

  // moderação: gente esperando o veredito
  const m = s.moderacao;
  const partes = [
    m.anuncios ? plural(m.anuncios, "anúncio em análise", "anúncios em análise") : "",
    m.recados ? plural(m.recados, "recado retido", "recados retidos") : "",
    m.avaliacoes ? plural(m.avaliacoes, "avaliação retida", "avaliações retidas") : "",
    m.denuncias ? plural(m.denuncias, "denúncia aberta", "denúncias abertas") : "",
  ].filter(Boolean);
  const moderacao: Item = {
    tema: "Moderação",
    href: m.anuncios ? "/admin/anuncios?status=em_analise" : "/admin/denuncias",
    ok: partes.length === 0,
    texto: partes.length
      ? `Esperando você: ${partes.join(", ")}. O mais antigo chegou ${quando(m.desde)}.`
      : "Nada esperando a moderação.",
  };

  // erros do sistema ao publicar vaga ou salvar currículo (não os de preenchimento)
  const falhas: Item = {
    tema: "Publicar vaga e currículo",
    href: "/admin/falhas",
    ok: s.falhas.sistema_24h === 0,
    texto:
      s.falhas.sistema_24h > 0
        ? `${plural(s.falhas.sistema_24h, "erro do sistema", "erros do sistema")} nas últimas 24 horas. O último foi ${quando(s.falhas.ultima)}.`
        : "Nenhum erro do sistema nas últimas 24 horas.",
  };

  return [chave, emails, ia, moderacao, falhas];
}

/** Quadro do topo do painel: o primeiro que se vê ao abrir o admin. */
export function SaudeDoSite({ saude, agora }: { saude: SaudeSite; agora: number }) {
  const itens = itensDaSaude(saude, agora);
  const problemas = itens.filter((i) => !i.ok).length;
  return (
    <section
      aria-labelledby="saude-titulo"
      className={`flex flex-col gap-3 rounded-lg border-2 p-4 sm:p-5 ${problemas ? "border-danger bg-danger/5" : "border-cerrado bg-cerrado/5"}`}
    >
      <h2 id="saude-titulo" className="flex items-center gap-2 text-h3">
        {problemas ? (
          <CircleAlert aria-hidden className="size-6 text-danger" />
        ) : (
          <CircleCheck aria-hidden className="size-6 text-cerrado-text" />
        )}
        {problemas
          ? `Saúde do site: ${plural(problemas, "ponto precisa", "pontos precisam")} de você`
          : "Saúde do site: tudo certo"}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {itens.map((i) => (
          <li key={i.tema}>
            <Link
              href={i.href}
              className={`flex h-full gap-3 rounded-md border bg-surface-200 p-3 hover:bg-surface-300 ${i.ok ? "border-line" : "border-danger"}`}
            >
              <span aria-hidden className={`mt-1 size-3 shrink-0 rounded-pill ${i.ok ? "bg-cerrado" : "bg-danger"}`} />
              <span className="flex flex-col gap-0.5">
                <span className="text-label">
                  <span className="sr-only">{i.ok ? "Em dia: " : "Atenção: "}</span>
                  {i.tema}
                </span>
                <span className="text-body-sm text-ink-muted">{i.texto}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
