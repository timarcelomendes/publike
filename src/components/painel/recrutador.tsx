import {
  CalendarClock,
  ChevronRight,
  Clock,
  Eye,
  Hourglass,
  KanbanSquare,
  Link2,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Store,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { STATUS_ANUNCIO } from "@/lib/constantes";
import { formatarNumero, plural } from "@/lib/formato";
import { dataDaEntrevista, SITUACOES_ENTREVISTA } from "@/lib/recrutamento";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { MeuAnuncio, StatusAnuncio } from "@/lib/tipos";
import { ParaFazer, type ItemParaFazer } from "./fluxo";

// Visão geral de quem contrata (comércio, empresa e agência): os números do
// recrutamento, o que fazer hoje, as próximas entrevistas e cada vaga com
// visitas → candidatos → entrevista → contratados. Cada número leva ao quadro.

type Candidato = {
  anuncio_id: string;
  perfil_id: string;
  nome: string;
  status: string;
  curtido_em: string;
  etapa: string;
  etapa_em: string | null;
};

const DIA = 24 * 3600e3;

async function dadosExtras(vagas: string[], agora: number) {
  if (!vagas.length) return { visitas: new Map<string, number>(), entrevistas: [] as EntrevistaPainel[] };
  const supabase = await criarClienteServidor();
  const [{ data: visitas }, { data: entrevistas }] = await Promise.all([
    supabase.from("anuncio_visitas").select("anuncio_id, total").in("anuncio_id", vagas),
    supabase
      .from("entrevistas")
      .select("id, anuncio_id, perfil_id, quando, situacao")
      .in("anuncio_id", vagas)
      .in("situacao", ["marcada", "confirmada", "remarcar"])
      .gte("quando", new Date(agora - 2 * 3600e3).toISOString())
      .order("quando")
      .limit(50),
  ]);
  return {
    visitas: new Map((visitas ?? []).map((v) => [v.anuncio_id, v.total])),
    entrevistas: (entrevistas ?? []) as EntrevistaPainel[],
  };
}

type EntrevistaPainel = { id: string; anuncio_id: string; perfil_id: string; quando: string; situacao: string };

function Numero({
  icone: Icone,
  numero,
  nome,
  ajuda,
  href,
  destaque = false,
}: {
  icone: LucideIcon;
  numero: string;
  nome: string;
  ajuda?: string;
  href?: string;
  destaque?: boolean;
}) {
  const miolo = (
    <>
      <span className="flex items-center gap-2 text-body-sm text-ink-muted">
        <Icone aria-hidden className="size-4 shrink-0" />
        {nome}
      </span>
      <span
        className={`mt-1 block font-display text-h2 leading-none tabular-nums ${destaque ? "text-terra-text" : ""}`}
      >
        {numero}
      </span>
      {ajuda && <span className="mt-1 block text-caption text-ink-muted">{ajuda}</span>}
    </>
  );
  const classe = `block h-full rounded-lg border p-4 ${destaque ? "border-transparent bg-terra-soft" : "border-line bg-surface-200"}`;
  return href ? (
    <Link href={href} className={`${classe} transition-colors hover:border-line-strong`}>
      {miolo}
    </Link>
  ) : (
    <div className={classe}>{miolo}</div>
  );
}

export async function PainelRecrutador({
  nome,
  anuncios,
  candidatos,
  agora,
}: {
  nome: string;
  anuncios: MeuAnuncio[] | null;
  candidatos: Candidato[] | null;
  agora: number;
}) {
  const vagas = (anuncios ?? []).filter((a) => a.tipo === "vaga");
  const servicos = (anuncios ?? []).filter((a) => a.tipo === "servico");
  const todos = candidatos ?? [];
  const noAr = vagas.filter((a) => a.status === "ativo" && new Date(a.expira_em).getTime() > agora);
  const { visitas, entrevistas } = await dadosExtras(
    vagas.map((v) => v.id),
    agora,
  );
  const nomeDe = new Map(todos.map((c) => [c.perfil_id, c.nome]));
  const tituloDe = new Map(vagas.map((v) => [v.id, v.titulo]));

  const ultimos7 = todos.filter((c) => agora - new Date(c.curtido_em).getTime() < 7 * DIA).length;
  const pendentes = todos.filter((c) => c.status === "pendente");
  const antigos = pendentes.filter((c) => agora - new Date(c.curtido_em).getTime() > 2 * DIA);
  const contratados = todos.filter((c) => c.etapa === "contratado" && c.status === "match");
  const dias = contratados
    .filter((c) => c.etapa_em)
    .map((c) => (new Date(c.etapa_em as string).getTime() - new Date(c.curtido_em).getTime()) / DIA);
  const tempoMedio = dias.length ? Math.max(0, Math.round(dias.reduce((a, b) => a + b, 0) / dias.length)) : null;
  const totalVisitas = [...visitas.values()].reduce((a, b) => a + b, 0);

  // ------------------------------------------------------------ para fazer hoje
  const proximas = entrevistas.filter((e) => new Date(e.quando).getTime() <= agora + 2 * DIA);
  const remarcar = entrevistas.filter((e) => e.situacao === "remarcar");
  const comEntrevista = new Set(entrevistas.map((e) => `${e.anuncio_id}:${e.perfil_id}`));
  const semData = todos.filter(
    (c) => c.etapa === "entrevista" && c.status === "match" && !comEntrevista.has(`${c.anuncio_id}:${c.perfil_id}`),
  );
  const vencendo = vagas.filter((a) => a.status === "ativo" && new Date(a.expira_em).getTime() - agora < 5 * DIA);
  const paradas = noAr.filter((a) => a.curtidas_total === 0 && agora - new Date(a.criado_em).getTime() > 7 * DIA);
  const quadroDe = (ids: string[]) => {
    const unicos = [...new Set(ids)];
    return unicos.length === 1 ? `/painel/anuncio/${unicos[0]}/quadro` : "/painel/anuncios?tipo=vaga";
  };

  const itens: ItemParaFazer[] = [];
  if (pendentes.length) {
    itens.push({
      icone: Users,
      texto: `${plural(pendentes.length, "candidato esperando", "candidatos esperando")} resposta`,
      ajuda: antigos.length
        ? `${plural(antigos.length, "espera", "esperam")} há mais de 2 dias. Responder rápido traz os melhores.`
        : "Curta de volta quem interessa ou mova para “Não seguiu”.",
      href: quadroDe(pendentes.map((c) => c.anuncio_id)),
    });
  }
  if (proximas.length) {
    itens.push({
      icone: CalendarClock,
      texto: `${plural(proximas.length, "entrevista", "entrevistas")} nos próximos 2 dias`,
      ajuda: proximas
        .slice(0, 3)
        .map((e) => `${(nomeDe.get(e.perfil_id) ?? "").split(" ")[0]} ${dataDaEntrevista(e.quando)}`)
        .join(" · "),
      href: quadroDe(proximas.map((e) => e.anuncio_id)),
    });
  }
  if (remarcar.length) {
    itens.push({
      icone: RefreshCw,
      texto: `${plural(remarcar.length, "candidato pediu", "candidatos pediram")} outro horário`,
      ajuda: "Abra o cartão e remarque a entrevista.",
      href: quadroDe(remarcar.map((e) => e.anuncio_id)),
    });
  }
  if (semData.length) {
    itens.push({
      icone: CalendarClock,
      texto: `${plural(semData.length, "candidato", "candidatos")} em Entrevista sem data marcada`,
      ajuda: "Marque dia e hora: o candidato recebe o aviso e confirma pelo Publike.",
      href: quadroDe(semData.map((c) => c.anuncio_id)),
    });
  }
  if (vencendo.length) {
    itens.push({
      icone: Hourglass,
      texto: `${plural(vencendo.length, "vaga sai", "vagas saem")} do ar em até 5 dias`,
      ajuda: vencendo
        .map((v) => v.titulo)
        .slice(0, 2)
        .join(" · "),
      href: "/painel/anuncios?tipo=vaga",
    });
  }
  if (paradas.length) {
    itens.push({
      icone: Megaphone,
      texto: `${plural(paradas.length, "vaga", "vagas")} sem candidatos há uma semana`,
      ajuda: "Divulgue o link da sua página de vagas no Instagram e no WhatsApp, ou revise o título e o salário.",
      href: "/painel/anuncios?tipo=vaga",
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-h2">Recrutamento</h2>
          <p className="mt-1 text-body text-ink-muted">
            As vagas de {nome}, quem se candidatou e o que fazer agora. Abra o quadro de cada vaga para mover os
            candidatos, marcar entrevistas e mandar mensagens.
          </p>
        </div>
        <BotaoLink href="/publicar" variante="primario" tamanho="sm">
          <Plus aria-hidden />
          Publicar vaga
        </BotaoLink>
      </div>

      {vagas.length === 0 ? (
        <Vazio
          icone={Megaphone}
          titulo="Publique a primeira vaga"
          acao={<BotaoLink href="/publicar">Publicar vaga grátis</BotaoLink>}
        >
          Grátis, sem limite de candidatos. Quem mora perto vê primeiro, e você acompanha tudo aqui: candidatos, nota de
          aderência, entrevistas e contratações.
        </Vazio>
      ) : (
        <>
          <section aria-label="Números do recrutamento" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Numero
              icone={Megaphone}
              nome="Vagas no ar"
              numero={formatarNumero(noAr.length)}
              href="/painel/anuncios?tipo=vaga&situacao=no_ar"
              ajuda={`${formatarNumero(totalVisitas)} visitas no total`}
            />
            <Numero
              icone={Users}
              nome="Candidatos"
              numero={formatarNumero(todos.length)}
              href="/painel/candidatos"
              ajuda={`${formatarNumero(ultimos7)} nos últimos 7 dias`}
            />
            <Numero
              icone={Clock}
              nome="Para responder"
              numero={formatarNumero(pendentes.length)}
              href="/painel/candidatos?situacao=responder"
              destaque={pendentes.length > 0}
              ajuda="Esperando você"
            />
            <Numero
              icone={UserCheck}
              nome="Contratados"
              numero={formatarNumero(contratados.length)}
              href="/painel/candidatos?etapa=contratado"
              ajuda={
                tempoMedio === null
                  ? "Tempo até contratar: –"
                  : `Em média ${plural(tempoMedio, "dia", "dias")} até contratar`
              }
            />
          </section>

          <ParaFazer itens={itens} />

          {entrevistas.length > 0 && (
            <section aria-labelledby="proximas-entrevistas" className="flex flex-col gap-3">
              <h3 id="proximas-entrevistas" className="text-h3">
                Próximas entrevistas
              </h3>
              <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
                {entrevistas.slice(0, 8).map((e) => {
                  const s = SITUACOES_ENTREVISTA[e.situacao] ?? SITUACOES_ENTREVISTA.marcada;
                  return (
                    <li key={e.id}>
                      <Link
                        href={`/painel/anuncio/${e.anuncio_id}/quadro`}
                        className="flex min-h-14 flex-col gap-1 px-4 py-2.5 hover:bg-surface-300 sm:flex-row sm:items-center sm:gap-3"
                      >
                        <span className="text-label tabular-nums sm:w-40 sm:shrink-0">
                          {dataDaEntrevista(e.quando)}
                        </span>
                        <span className="min-w-0 text-body-sm sm:flex-1">
                          <span className="font-semibold">{nomeDe.get(e.perfil_id) ?? "Candidato"}</span>
                          <span className="text-ink-muted"> · {tituloDe.get(e.anuncio_id)}</span>
                        </span>
                        <Selo variante={s.tom} className="self-start sm:self-center">
                          {s.nome}
                        </Selo>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section aria-labelledby="vagas-recrutamento" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="vagas-recrutamento" className="text-h3">
                Suas vagas
              </h3>
              <Link
                href="/painel/anuncios?tipo=vaga"
                className="text-label text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                Gerenciar vagas
              </Link>
            </div>
            {/* celular: um cartão por vaga; a partir de 640 px, a tabela */}
            <ul className="flex flex-col gap-2 sm:hidden">
              {vagas.map((v) => {
                const daVaga = todos.filter((c) => c.anuncio_id === v.id);
                const status = v.status as StatusAnuncio;
                const numeros: [string, number, string?][] = [
                  ["Visitas", visitas.get(v.id) ?? 0],
                  ["Candidatos", daVaga.length],
                  ["Responder", daVaga.filter((c) => c.status === "pendente").length, "text-terra-text"],
                  ["Entrevista", daVaga.filter((c) => c.etapa === "entrevista" && c.status === "match").length],
                  [
                    "Contratados",
                    daVaga.filter((c) => c.etapa === "contratado" && c.status === "match").length,
                    "text-cerrado-text",
                  ],
                ];
                return (
                  <li key={v.id}>
                    <Link
                      href={`/painel/anuncio/${v.id}/quadro`}
                      className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4 hover:border-line-strong"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-label">{v.titulo}</span>
                        <Selo variante={status === "ativo" ? "match" : "contorno"}>
                          {STATUS_ANUNCIO[status]?.nome ?? status}
                        </Selo>
                      </span>
                      <span className="grid grid-cols-5 gap-1 text-center">
                        {numeros.map(([nome, n, cor]) => (
                          <span key={nome} className="flex flex-col">
                            <span className={`font-display text-h3 tabular-nums ${n > 0 && cor ? cor : ""}`}>{n}</span>
                            <span className="text-caption text-ink-muted">{nome}</span>
                          </span>
                        ))}
                      </span>
                      <span className="inline-flex items-center gap-1 text-label text-ink-muted">
                        <KanbanSquare aria-hidden className="size-4" />
                        Abrir o quadro
                        <ChevronRight aria-hidden className="size-4" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto rounded-lg border border-line bg-surface-200 sm:block">
              <table className="w-full min-w-[40rem] text-left text-body-sm">
                <thead className="border-b border-line text-caption text-ink-muted uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Vaga
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">
                      <span className="inline-flex items-center gap-1">
                        <Eye aria-hidden className="size-3.5" />
                        Visitas
                      </span>
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">
                      Candidatos
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">
                      Responder
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">
                      Entrevista
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">
                      Contratados
                    </th>
                    <th scope="col" className="px-3 py-3">
                      <span className="sr-only">Quadro</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {vagas.map((v) => {
                    const daVaga = todos.filter((c) => c.anuncio_id === v.id);
                    const vis = visitas.get(v.id) ?? 0;
                    const status = v.status as StatusAnuncio;
                    // candidatos que vieram de outro jeito (link direto antes de contar visitas) passam das visitas
                    const taxa = vis > 0 && daVaga.length <= vis ? Math.round((100 * daVaga.length) / vis) : null;
                    return (
                      <tr key={v.id} className="hover:bg-surface-300">
                        <td className="px-4 py-3">
                          <Link
                            href={`/painel/anuncio/${v.id}/quadro`}
                            className="font-semibold underline-offset-2 hover:underline"
                          >
                            {v.titulo}
                          </Link>
                          <span className="mt-1 flex items-center gap-2">
                            <Selo variante={status === "ativo" ? "match" : "contorno"}>
                              {STATUS_ANUNCIO[status]?.nome ?? status}
                            </Selo>
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {formatarNumero(vis)}
                          {taxa !== null && (
                            <span className="block text-caption text-ink-muted">{taxa}% se candidatam</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{daVaga.length}</td>
                        <td
                          className={`px-3 py-3 text-right tabular-nums ${daVaga.some((c) => c.status === "pendente") ? "font-semibold text-terra-text" : ""}`}
                        >
                          {daVaga.filter((c) => c.status === "pendente").length}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {daVaga.filter((c) => c.etapa === "entrevista" && c.status === "match").length}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-cerrado-text">
                          {daVaga.filter((c) => c.etapa === "contratado" && c.status === "match").length}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Link
                            href={`/painel/anuncio/${v.id}/quadro`}
                            aria-label={`Quadro de candidatos de ${v.titulo}`}
                            className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-label text-ink hover:bg-surface-200"
                          >
                            <KanbanSquare aria-hidden className="size-4" />
                            <span className="hidden sm:inline">Quadro</span>
                            <ChevronRight aria-hidden className="size-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section aria-label="Mais" className="grid gap-3 sm:grid-cols-3">
        <Atalho
          icone={Link2}
          href="/painel/anuncios?tipo=vaga#pagina-de-vagas"
          titulo="Sua página de vagas"
          texto="O link com todas as vagas e o código para o site da empresa."
        />
        <Atalho
          icone={Users}
          href="/painel/candidatos"
          titulo="Todos os candidatos"
          texto="De todas as vagas juntas, com busca e planilha."
        />
        {servicos.length ? (
          <Atalho
            icone={Store}
            href="/painel/anuncios?tipo=servico"
            titulo="Seus serviços"
            texto={`${plural(servicos.length, "serviço", "serviços")} na vitrine.`}
          />
        ) : (
          <Atalho
            icone={Search}
            href="/painel/curtidas"
            titulo="O que você curtiu"
            texto="Serviços e vagas que você pediu ou curtiu."
          />
        )}
      </section>
    </div>
  );
}

function Atalho({
  icone: Icone,
  href,
  titulo,
  texto,
}: {
  icone: LucideIcon;
  href: string;
  titulo: string;
  texto: string;
}) {
  return (
    <Link
      href={href}
      className="flex h-full items-start gap-3 rounded-lg border border-line bg-surface-200 p-4 transition-colors hover:border-line-strong"
    >
      <Icone aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
      <span className="min-w-0">
        <span className="block text-label">{titulo}</span>
        <span className="block text-body-sm text-ink-muted">{texto}</span>
      </span>
    </Link>
  );
}
