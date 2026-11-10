import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { itensDaSaude } from "@/components/admin/saude";
import { Situacao } from "@/components/admin/ui";
import {
  configDoSite,
  empresasComGenteEsperando,
  listarChavesServidor,
  respostasNovasDaEquipe,
  saudeDoSite,
} from "@/lib/admin/dados";
import { resumoDoAdmin } from "@/lib/admin/painel";
import { vagasParadas } from "@/lib/admin/vagas-paradas";
import { plural, tempoRelativo } from "@/lib/formato";
import { situacaoFilas } from "@/lib/servidor/filas";
import { itensPagamentos, situacaoPagamentos } from "@/lib/servidor/situacao-pagamentos";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// "Precisa de você" (claude/plano-indicadores-do-admin.md), no alto da Visão geral, só no admin: o que pede ação,
// junto. Com tudo em dia, uma linha verde. A pergunta ao site no ar sobre os pagamentos carrega à parte.

type Item = { chave: string; numero: number | null; titulo: string; apoio: string; href: string };

const HORAS_ESPERA = 48;

export async function PrecisaDeVoce({ agora }: { agora: number }) {
  const c = criarClienteAdmin();
  const [saude, respostas, chaves, config, n, esperando, paradas] = await Promise.all([
    saudeDoSite(c),
    respostasNovasDaEquipe(c),
    listarChavesServidor(c),
    configDoSite(c),
    resumoDoAdmin(),
    empresasComGenteEsperando(c, agora).catch(() => null),
    vagasParadas(c, agora).catch(() => null),
  ]);

  const itens: Item[] = [];
  const saudeItens = saude ? itensDaSaude(saude, agora) : [];
  for (const s of saudeItens.filter((i) => !i.ok)) {
    // a moderação vira um item por fila, cada um abrindo a lista já filtrada (com as abas para ver o resto)
    if (s.tema === "Moderação" && saude) {
      const m = saude.moderacao;
      const desde = m.desde ? `O mais antigo chegou ${tempoRelativo(m.desde, agora)}` : "Esperando você";
      const filas: [string, number, string, string][] = [
        [
          "anuncios",
          m.anuncios,
          plural(m.anuncios, "anúncio em análise", "anúncios em análise"),
          "/admin/anuncios?status=em_analise",
        ],
        ["recados", m.recados, plural(m.recados, "post retido", "posts retidos"), "/admin/denuncias?aba=recados"],
        [
          "avaliacoes",
          m.avaliacoes,
          plural(m.avaliacoes, "avaliação retida", "avaliações retidas"),
          "/admin/denuncias?aba=avaliacoes",
        ],
        [
          "denuncias",
          m.denuncias,
          plural(m.denuncias, "denúncia aberta", "denúncias abertas"),
          "/admin/denuncias?aba=anuncios",
        ],
      ];
      for (const [chave, n, titulo, href] of filas.filter((f) => f[1] > 0)) {
        itens.push({ chave: `moderacao-${chave}`, numero: n, titulo, apoio: `Moderação · ${desde}`, href });
      }
      continue;
    }
    itens.push({ chave: s.tema, numero: null, titulo: s.tema, apoio: s.texto, href: s.href });
  }
  if (esperando) {
    const limite = agora - HORAS_ESPERA * 3600e3;
    const empresas = esperando.filter((e) => e.esperando.some((p) => Date.parse(p.desde) < limite));
    const pessoas = empresas.reduce((t, e) => t + e.esperando.filter((p) => Date.parse(p.desde) < limite).length, 0);
    if (pessoas > 0) {
      itens.push({
        chave: "esperando",
        numero: pessoas,
        titulo: `${plural(pessoas, "curtida esperando", "curtidas esperando")} há mais de ${HORAS_ESPERA} h`,
        apoio: `Em ${plural(empresas.length, "empresa", "empresas")}`,
        href: `/admin/esperando?mais_de=${HORAS_ESPERA}`,
      });
    }
  }
  if (paradas?.length) {
    itens.push({
      chave: "paradas",
      numero: paradas.length,
      titulo: plural(paradas.length, "vaga parada", "vagas paradas"),
      apoio: "Sem candidato há mais de 24 h",
      href: "/admin/vagas-paradas",
    });
  }
  if (n.perfis.agencias_a_verificar > 0) {
    itens.push({
      chave: "agencias",
      numero: n.perfis.agencias_a_verificar,
      titulo: `${plural(n.perfis.agencias_a_verificar, "agência espera", "agências esperam")} o CNPJ`,
      apoio: "Verificada, a agência pode ter mais vagas no ar",
      href: "/admin/usuarios?filtro=agencias_a_verificar",
    });
  }
  if (respostas && respostas.length > 0) {
    itens.push({
      chave: "respostas",
      numero: respostas.length,
      titulo: plural(respostas.length, "resposta à equipe", "respostas à equipe"),
      apoio: "Ninguém abriu ainda: veja embaixo",
      href: "#responderam",
    });
  }

  const filas = situacaoFilas();
  const temChave = chaves.length > 0;
  const faltando =
    !temChave ||
    !filas.smtp ||
    !filas.enderecoEmails ||
    (config.ia_moderacao && !filas.ia) ||
    config.avisos_para.length === 0;
  const emDia = saudeItens.filter((i) => i.ok).map((i) => i.tema.charAt(0).toLowerCase() + i.tema.slice(1));

  return (
    <section
      aria-labelledby="precisa-titulo"
      className="flex flex-col gap-3 rounded-lg border border-line-strong bg-surface-200 p-4 sm:p-5"
    >
      <h2 id="precisa-titulo" className="text-h3">
        {itens.length ? "Precisa de você" : "Precisa de você: nada agora"}
      </h2>
      {itens.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {itens.map((i) => (
            <li key={i.chave}>
              <Link
                href={i.href}
                className="flex h-full gap-3 rounded-md bg-surface-100 p-3 transition-colors hover:bg-surface-300"
              >
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-terra-soft text-label text-terra-text"
                >
                  {i.numero ?? "!"}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-label">{i.titulo}</span>
                  <span className="text-body-sm text-ink-muted">{i.apoio}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {emDia.length > 0 && (
        <p className="flex items-start gap-2 text-body-sm text-ink-muted">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-cerrado-text" />
          Em dia: {emDia.join(", ")}.
        </p>
      )}
      <Suspense fallback={<p className="text-body-sm text-ink-muted">Conferindo os pagamentos…</p>}>
        <PagamentosNoQuadro />
      </Suspense>
      {faltando && (
        <details className="rounded-md bg-surface-300 p-3 text-body-sm">
          <summary className="cursor-pointer text-label">Falta configurar</summary>
          <div className="mt-2 flex flex-col gap-2">
            <Situacao ok={Boolean(filas.smtp)}>
              E-mail no servidor (SMTP_SERVIDOR, SMTP_USUARIO, SMTP_SENHA e SMTP_REMETENTE).{" "}
              <Link href="/admin/emails?aba=configuracoes" className="underline">
                Ver e-mails
              </Link>
            </Situacao>
            <Situacao ok={Boolean(filas.enderecoEmails)}>
              Endereço do site no ar para os links dos e-mails (PUBLIKE_URL_PUBLICA no seu computador).{" "}
              <Link href="/admin/emails?aba=configuracoes" className="underline">
                Ver e-mails
              </Link>
            </Situacao>
            <Situacao ok={temChave}>
              Chave do servidor, para o site publicado mandar e-mails e rodar a IA.{" "}
              <Link href="/admin/chaves" className="underline">
                Ver chaves
              </Link>
            </Situacao>
            <Situacao ok={config.avisos_para.length > 0}>
              Quem recebe os avisos da equipe (denúncia, cadastro, anúncio tirado do ar).{" "}
              <Link href="/admin/emails?aba=configuracoes#configuracoes" className="underline">
                Escolher
              </Link>
            </Situacao>
            {config.ia_moderacao && (
              <Situacao ok={filas.ia}>
                Chave da IA no servidor (OPENAI_API_KEY ou ANTHROPIC_API_KEY).{" "}
                <Link href="/admin/ia" className="underline">
                  Ver IA
                </Link>
              </Situacao>
            )}
          </div>
        </details>
      )}
      {respostas && respostas.length > 0 && (
        <div id="responderam" className="flex flex-col gap-1 border-t border-line pt-3">
          <h3 className="text-label">Responderam a equipe</h3>
          <p className="text-body-sm text-ink-muted">Abrir a conta marca como vistas.</p>
          <ul className="flex flex-col divide-y divide-line">
            {respostas.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-2.5 text-body-sm">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/admin/usuarios/${r.conta_id}`} className="text-label underline underline-offset-2">
                    {r.nome ?? "Conta sem nome"}
                  </Link>
                  <span className="text-ink-muted">
                    sobre “{r.assunto}” · {tempoRelativo(r.criado_em, agora)}
                  </span>
                </span>
                <span className="line-clamp-3 whitespace-pre-line">{r.texto}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Os pagamentos: em dia numa linha; o que falta, item por item (o resto em Admin › Pagamentos). */
async function PagamentosNoQuadro() {
  const itens = itensPagamentos(await situacaoPagamentos(criarClienteAdmin()));
  const faltam = itens.filter((i) => !i.ok);
  if (!faltam.length) {
    return (
      <p className="flex items-start gap-2 text-body-sm text-ink-muted">
        <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-cerrado-text" />
        Pagamentos em dia: o site no ar fala com o Asaas e os avisos estão chegando.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {faltam.map((i) => (
        <Situacao key={i.texto} ok={false}>
          {i.texto}{" "}
          <Link href="/admin/pagamentos" className="underline">
            Ver pagamentos
          </Link>
        </Situacao>
      ))}
    </div>
  );
}
