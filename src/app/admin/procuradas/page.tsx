import { BellRing, ChartNoAxesColumn, SearchX, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { BotaoSalvar } from "@/components/admin/botao-salvar";
import { abaPedida, SubAbasAdmin } from "@/components/admin/sub-abas";
import { Secao } from "@/components/admin/ui";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import {
  mandarAtendemAgora,
  mandarProcuradasAgora,
  religarAvisosDeVaga,
  salvarAvisosDeVaga,
  salvarConfigAtendem,
  salvarConfigProcuradas,
} from "@/lib/acoes/admin-procuradas";
import { formatarDataCurta, formatarDataHora, formatarNumero, plural, primeiro } from "@/lib/formato";
import { emDolares, TARIFA_MARKETING_USD } from "@/lib/whatsapp-tipos";
import { exigirAdminLocal } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Procuradas sem vaga" };

// As funções que as pessoas procuraram no WhatsApp do Publike sem vaga no ar (migração 20270822120000; 21/11/2026,
// Marcelo: "empresas que já tiveram vagas ou são agências de emprego... serem notificadas"). Quem receberia o aviso
// com o texto, e o envio (automático, a cada novas pessoas na função, ou o "Mandar agora").

type Funcao = { funcao: string; pessoas: number; cidades: string[]; regioes: string[] };
type Destinatario = { conta_id: string; nome: string; tipo: "empresa" | "agencia"; funcoes: string[]; texto: string; sem_novidade: boolean; ultimo_aviso: string | null };
type Avisada = { dia: string; nome: string; conta_id: string; funcoes: string[] };
type DadosAtendem = {
  ligado: boolean;
  minimo: number;
  avisos: { dia: string; anuncio_id: string; titulo: string; conta_id: string; nome: string; pessoas: number; convites: number }[];
};
/** O aviso de vaga nova pelo WhatsApp (migração 20271005120000). */
type DadosAviso = {
  ligado: boolean;
  por_dia: number;
  whatsapp_ativo: boolean;
  hoje: number;
  semana: number;
  semana_modelo: number;
  semana_falhas: number;
  semana_candidaturas: number;
  pessoas: number;
  pararam: number;
  /** o freio (migração 20271006120000; sem ela, não vem) */
  freio?: {
    desde: string;
    avisadas: number;
    pararam: number;
    recusaram: number;
    pct: number;
    qualidade: string | null;
    qualidade_em: string | null;
    freado_em: string | null;
    motivo: string | null;
    religado_em: string | null;
  };
};

/** A nota do número na Meta, em palavras. */
const NOTA_DO_NUMERO: Record<string, string> = {
  GREEN: "verde (boa)",
  YELLOW: "amarela (atenção)",
  RED: "vermelha (ruim)",
  UNKNOWN: "sem nota ainda",
};
type Dados = {
  config: { ligado: boolean; minimo: number; dias: number };
  dias: number;
  funcoes: Funcao[];
  destinatarios: Destinatario[];
  avisadas: Avisada[];
  registros: number;
};

// as partes da tela (22/11/2026, Marcelo: "pode pensar essas telas com sub-abas, ficam muito extensas")
const ABAS = [
  { id: "sem-vaga", nome: "Procuradas sem vaga", icone: SearchX },
  { id: "procura", nome: "Muita procura, pouca vaga", icone: ChartNoAxesColumn },
  { id: "atendem", nome: "Quem atende e não curtiu", icone: UserCheck },
  { id: "aviso", nome: "Aviso de vaga nova", icone: BellRing },
] as const;

const ERROS: Record<string, string> = {
  fora: "O admin só funciona com a sua conta de admin.",
  salvar: "Não deu para salvar. Tente de novo.",
  mandar: "Não deu para mandar agora. Tente de novo em instantes.",
  teto: "O teto do dia vai de 0 a 5.000 avisos.",
  freio: "O freio vai de 1% a 50% de quem pede para parar.",
};

export default function Procuradas({ searchParams }: PageProps<"/admin/procuradas">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/procuradas">["searchParams"] }) {
  const c = await exigirAdminLocal();
  const sp = await searchParams;
  const [{ data, error }, oferta, atendem, aviso] = await Promise.all([
    c.rpc("admin_procuradas", { p_dias: null }),
    // muita procura e pouca vaga (migração 20270909120000), quem atende e não curtiu (20270908120000) e o aviso de vaga
    // nova (20271005120000): sem a migração, a parte fica com o aviso de rodar
    c.rpc("admin_procura_e_oferta", { p_dias: 14, p_minimo: 3 }),
    c.rpc("admin_atendem"),
    c.rpc("admin_avisos_de_vaga_whatsapp"),
  ]);
  if (error)
    return (
      <Aviso tipo="erro" titulo="Sem os dados">
        {error.code === "PGRST202" ? "Rode a migração 20270822120000_procuradas_sem_vaga.sql primeiro." : error.message}
      </Aviso>
    );
  const d = data as unknown as Dados;
  const aReceber = d.destinatarios.filter((x) => !x.sem_novidade);
  const confirmar = primeiro(sp.confirmar) === "1";
  const erro = primeiro(sp.erro);
  const mandados = primeiro(sp.mandados);
  const mandadosAtendem = primeiro(sp.atendem);
  const at = atendem.data as unknown as DadosAtendem | null;
  const aba = abaPedida(ABAS, primeiro(sp.aba));
  const salvo = primeiro(sp.salvo);
  const av = aviso.data as unknown as DadosAviso | null;

  return (
    <div className="flex flex-col gap-6">
      {erro && <Aviso tipo="erro">{ERROS[erro] ?? ERROS.salvar}</Aviso>}
      {mandados !== undefined && (
        <Aviso tipo="sucesso" titulo={`${plural(Number(mandados) || 0, "aviso mandado", "avisos mandados")}.`}>
          Cada conta recebe no sino, no celular e por e-mail (se não desligou os avisos da semana).
        </Aviso>
      )}

      <SubAbasAdmin
        rotulo="Procuradas sem vaga"
        base="/admin/procuradas"
        abas={ABAS.map((a) =>
          a.id === "sem-vaga" ? { ...a, alerta: { n: aReceber.length, leitor: "contas com gente nova para avisar" } } : a,
        )}
        ativa={aba}
      />

      {aba === "sem-vaga" && (
        <>
          <Secao
            titulo="Procuradas sem vaga"
            descricao={
              <>
                As funções que as pessoas procuraram no WhatsApp do Publike e não tinham vaga no ar, nos últimos {d.dias} dias.
                Só a função, a cidade e a região: quem procurou não aparece. Com o envio ligado, a empresa que já anunciou a
                função (e não tem vaga dela no ar) e as agências recebem o aviso quando a função junta {d.config.minimo}{" "}
                pessoas, e um aviso novo a cada {d.config.minimo} pessoas a mais desde o último.
              </>
            }
          >
            <form action={salvarConfigProcuradas} className="flex flex-wrap items-end gap-4 rounded-md border border-line p-4">
              <label className="flex items-center gap-2 text-label">
                <input type="checkbox" name="ligado" defaultChecked={d.config.ligado} className="size-5" />
                Mandar sozinho
              </label>
              <label className="flex flex-col gap-1 text-body-sm">
                Pessoas a mais para avisar
                <input type="number" name="minimo" min={1} max={50} defaultValue={d.config.minimo} className="w-24 rounded-md border border-line bg-surface-100 px-3 py-2" />
              </label>
              <label className="flex flex-col gap-1 text-body-sm">
                Dias para trás
                <input type="number" name="dias" min={1} max={30} defaultValue={d.config.dias} className="w-24 rounded-md border border-line bg-surface-100 px-3 py-2" />
              </label>
              <BotaoSalvar variante="secundario" feito={salvo === "procuradas" ? "Salvo" : null} />
              <p className="basis-full text-caption text-ink-muted">
                {d.config.ligado
                  ? `Ligado: sai de segunda a sexta, das 9h às 18h, sempre que uma função da conta junta ${plural(d.config.minimo, "pessoa", "pessoas")} a mais desde o último aviso (no máximo um por dia; para depois de 3 avisos seguidos sem publicar).`
                  : "Desligado: nada sai sozinho. Dá para mandar pelo botão abaixo, depois de conferir a lista."}
              </p>
            </form>

            {d.funcoes.length === 0 ? (
              <Vazio icone={SearchX} titulo="Nenhuma procura sem vaga no período">
                Quando alguém procurar no WhatsApp uma função sem vaga no ar, ela aparece aqui.
              </Vazio>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead className="text-left text-caption text-ink-muted">
                    <tr>
                      <th className="py-2 pr-4 font-normal">Função</th>
                      <th className="py-2 pr-4 font-normal">Pessoas</th>
                      <th className="py-2 font-normal">Onde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.funcoes.map((f) => (
                      <tr key={f.funcao} className="border-t border-line">
                        <td className="py-2 pr-4">
                          {f.funcao}
                          {f.pessoas >= d.config.minimo && (
                            <Selo variante="contorno" className="ml-2">
                              avisa
                            </Selo>
                          )}
                        </td>
                        <td className="py-2 pr-4 tabular-nums">{f.pessoas}</td>
                        <td className="py-2 text-ink-muted">{[...f.cidades, ...f.regioes.map((r) => `região ${r}`)].join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>

          <Secao
            titulo="Quem recebe"
            descricao={`O texto exato de cada aviso. ${plural(aReceber.length, "conta tem", "contas têm")} gente nova para avisar agora.`}
            acoes={
              aReceber.length > 0 &&
              (confirmar ? (
                <form action={mandarProcuradasAgora} className="flex flex-wrap items-center gap-2">
                  <span className="text-body-sm">Mandar para {plural(aReceber.length, "conta", "contas")} agora?</span>
                  <BotaoSalvar variante="primario" tamanho="sm" enviando="Mandando…">
                    Sim, mandar
                  </BotaoSalvar>
                  <BotaoLink href="/admin/procuradas" variante="secundario" tamanho="sm" scroll={false}>
                    Cancelar
                  </BotaoLink>
                </form>
              ) : (
                <BotaoLink href="/admin/procuradas?confirmar=1" variante="primario" tamanho="sm" scroll={false}>
                  Mandar agora
                </BotaoLink>
              ))
            }
          >
            {d.destinatarios.length === 0 ? (
              <p className="text-body-sm text-ink-muted">
                Ninguém por enquanto: nenhuma função chegou a {plural(d.config.minimo, "pessoa", "pessoas")}, ou não há empresa que
                já anunciou essas funções nem agência no Publike.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {d.destinatarios.map((x) => (
                  <li key={x.conta_id} className="flex flex-col gap-2 rounded-md border border-line p-4">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/usuarios/${x.conta_id}`} className="text-label underline-offset-2 hover:underline">
                        {x.nome}
                      </Link>
                      <Selo variante="contorno">{x.tipo === "agencia" ? "Agência" : "Já anunciou"}</Selo>
                      {x.sem_novidade && (
                        <Selo variante="match">
                          Avisada{x.ultimo_aviso ? ` em ${formatarDataCurta(x.ultimo_aviso)}` : ""}: espera mais gente
                        </Selo>
                      )}
                    </span>
                    <p className="text-body-sm">{x.texto}</p>
                  </li>
                ))}
              </ul>
            )}
          </Secao>

          {d.avisadas.length > 0 && (
            <Secao titulo="Avisos mandados (30 dias)">
              <ul className="flex flex-col gap-1 text-body-sm">
                {d.avisadas.map((a) => (
                  <li key={`${a.conta_id}-${a.dia}`}>
                    {formatarDataCurta(a.dia)} ·{" "}
                    <Link href={`/admin/usuarios/${a.conta_id}`} className="underline-offset-2 hover:underline">
                      {a.nome}
                    </Link>{" "}
                    · {a.funcoes.join(", ")}
                  </li>
                ))}
              </ul>
            </Secao>
          )}
        </>
      )}

      {aba === "procura" && (
        <Secao
          titulo="Muita procura, pouca vaga (14 dias)"
          descricao={
            <>
              Todas as funções procuradas no WhatsApp (com vaga ou sem), por 3 pessoas ou mais, contra as vagas no ar com a
              função no título. Primeiro, as sem vaga; depois, as com mais gente por vaga. O aviso às empresas vem depois de
              umas duas semanas de dados.
              {oferta.data?.[0]?.desde && ` Guardando desde ${formatarDataCurta(oferta.data[0].desde)}.`}
            </>
          }
        >
          {oferta.error ? (
            <p className="text-body-sm text-ink-muted">
              {oferta.error.code === "PGRST202"
                ? "Rode a migração 20270909120000_procura_e_oferta.sql para começar a guardar."
                : oferta.error.message}
            </p>
          ) : !oferta.data?.length ? (
            <p className="text-body-sm text-ink-muted">Nenhuma função com 3 pessoas ou mais ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead className="text-left text-caption text-ink-muted">
                  <tr>
                    <th className="py-2 pr-4 font-normal">Função</th>
                    <th className="py-2 pr-4 font-normal">Pessoas</th>
                    <th className="py-2 pr-4 font-normal">Vagas no ar</th>
                    <th className="py-2 font-normal">Pessoas por vaga</th>
                  </tr>
                </thead>
                <tbody>
                  {oferta.data.map((f) => (
                    <tr key={f.funcao} className="border-t border-line">
                      <td className="py-2 pr-4">{f.funcao}</td>
                      <td className="py-2 pr-4 tabular-nums">{f.pessoas}</td>
                      <td className="py-2 pr-4 tabular-nums">{f.vagas}</td>
                      <td className="py-2 tabular-nums">
                        {f.por_vaga == null ? <Selo variante="aviso">sem vaga</Selo> : String(f.por_vaga).replace(".", ",")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Secao>
      )}

      {aba === "atendem" && (
        <section id="atendem" className="scroll-mt-24">
          <Secao
            titulo="Quem atende a vaga e não curtiu"
            descricao="Quando o “Atende a vaga” (Talentos › Para a sua vaga) junta pessoas novas que atendem tudo o que a vaga pede e ainda não curtiram, a conta recebe um aviso para convidar. Só vagas no ar há 1 dia ou mais, no máximo um por dia por vaga, das 8h às 20h. Quem já foi avisado (aqui ou pelo “Chegou um talento que combina”), curtiu ou foi convidado não conta de novo; para depois de 3 avisos seguidos sem nenhum convite da vaga."
          >
            {!at ? (
              <p className="text-body-sm text-ink-muted">
                {atendem.error?.code === "PGRST202"
                  ? "Rode a migração 20270908120000_atendem_a_vaga.sql primeiro."
                  : (atendem.error?.message ?? "Sem os dados.")}
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <form action={salvarConfigAtendem} className="flex flex-wrap items-end gap-4 rounded-md border border-line p-4">
                  <label className="flex items-center gap-2 text-label">
                    <input type="checkbox" name="ligado" defaultChecked={at.ligado} className="size-5" />
                    Mandar sozinho
                  </label>
                  <label className="flex flex-col gap-1 text-body-sm">
                    Pessoas novas para avisar
                    <input
                      type="number"
                      name="minimo"
                      min={1}
                      max={20}
                      defaultValue={at.minimo}
                      className="w-24 rounded-md border border-line bg-surface-100 px-3 py-2"
                    />
                  </label>
                  <BotaoSalvar variante="secundario" feito={salvo === "atendem" ? "Salvo" : null} />
                </form>
                <form action={mandarAtendemAgora}>
                  <BotaoSalvar
                    variante="secundario"
                    tamanho="sm"
                    enviando="Mandando…"
                    feito={
                      mandadosAtendem !== undefined
                        ? `${plural(Number(mandadosAtendem) || 0, "aviso mandado", "avisos mandados")} agora`
                        : null
                    }
                  >
                    Mandar agora
                  </BotaoSalvar>
                </form>
                {at.avisos.length === 0 ? (
                  <p className="text-body-sm text-ink-muted">Nenhum aviso nos últimos 30 dias.</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-body-sm">
                    {at.avisos.map((a) => (
                      <li key={`${a.anuncio_id}-${a.dia}`}>
                        {formatarDataCurta(a.dia)} ·{" "}
                        <Link href={`/admin/usuarios/${a.conta_id}`} className="underline-offset-2 hover:underline">
                          {a.nome}
                        </Link>{" "}
                        ·{" "}
                        <Link href={`/admin/anuncios/${a.anuncio_id}`} className="underline-offset-2 hover:underline">
                          {a.titulo}
                        </Link>{" "}
                        · {plural(a.pessoas, "pessoa", "pessoas")}, {plural(a.convites, "convidada", "convidadas")} depois
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Secao>
        </section>
      )}

      {aba === "aviso" && (
        <Secao
          titulo="Aviso de vaga nova pelo WhatsApp"
          descricao={
            <>
              Quem procurou uma função na conversa do WhatsApp nos últimos 30 dias recebe a vaga dessa função que entrar
              depois, perto dela (até 30 km, ou na mesma cidade): uma por dia, das 8h às 20h, a que ainda não foi para a
              conversa, publicada há até 3 dias. Dentro das 24 horas da última mensagem da pessoa, vai de graça, com o botão “Quero me
              candidatar”; fora delas, pelo modelo publike_vaga_que_procurou (marketing, {emDolares(TARIFA_MARKETING_USD)}{" "}
              cada), depois de a Meta aprovar. Quem responde PARAR não recebe mais; se muita gente pedir para parar, ou se a
              nota do número cair, o aviso para sozinho (o freio). Ligar e desligar: Admin › WhatsApp › Parâmetros, com
              os outros avisos.
            </>
          }
        >
          {!av ? (
            <p className="text-body-sm text-ink-muted">
              {aviso.error?.code === "PGRST202"
                ? "Rode a migração 20271005120000_whatsapp_aviso_de_vaga_nova.sql primeiro."
                : (aviso.error?.message ?? "Sem os dados.")}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {(!av.ligado || !av.whatsapp_ativo || av.por_dia === 0) && (
                <Aviso tipo="alerta" titulo="Não está saindo">
                  {!av.whatsapp_ativo
                    ? "O envio do WhatsApp está desligado em Admin › WhatsApp › Parâmetros."
                    : !av.ligado
                      ? "O aviso “Vaga nova do que a pessoa procurou na conversa” está desmarcado em Admin › WhatsApp › Parâmetros."
                      : "O teto do dia está em 0."}{" "}
                  <Link href="/admin/whatsapp?aba=parametros" className="underline underline-offset-2">
                    Abrir os parâmetros
                  </Link>
                </Aviso>
              )}
              {av.freio?.freado_em && (
                <Aviso tipo="erro" titulo={`Parou sozinho em ${formatarDataHora(av.freio.freado_em)}`}>
                  <span className="flex flex-col gap-3">
                    <span>{av.freio.motivo ?? "O freio puxou."}</span>
                    <form action={religarAvisosDeVaga}>
                      <BotaoSalvar variante="secundario" enviando="Religando…" feito={null}>
                        Religar o aviso
                      </BotaoSalvar>
                    </form>
                    <span className="text-caption">
                      Religar recomeça as contas de agora. Com a nota do número fora do verde, ele para de novo na próxima
                      rodada.
                    </span>
                  </span>
                </Aviso>
              )}
              {salvo === "religado" && !av.freio?.freado_em && (
                <Aviso tipo="sucesso" titulo="Religado">
                  O aviso volta a sair na próxima rodada (das 8h às 20h), e o freio conta de novo a partir de agora.
                </Aviso>
              )}
              {av.freio && (
                <div className="flex flex-col gap-1 rounded-md border border-line p-4 text-body-sm">
                  <p className="text-label">Freio automático</p>
                  <p className="text-ink-muted">
                    Para sozinho quando {av.freio.pct}% ou mais das pessoas avisadas (com 20 avisadas ou mais, e pelo
                    menos 2 pessoas) respondem PARAR em até 3 dias ou recusam o marketing na Meta, ou quando a nota do
                    número sai do verde. A equipe recebe o e-mail.
                  </p>
                  <p>
                    Desde {formatarDataHora(av.freio.desde)}:{" "}
                    <strong className="tabular-nums">
                      {formatarNumero(av.freio.pararam + av.freio.recusaram)} de {formatarNumero(av.freio.avisadas)}
                    </strong>{" "}
                    pediram para parar
                    {av.freio.avisadas
                      ? ` (${Math.round(((av.freio.pararam + av.freio.recusaram) * 100) / av.freio.avisadas)}%)`
                      : ""}
                    : {formatarNumero(av.freio.pararam)} PARAR e {formatarNumero(av.freio.recusaram)} recusas da Meta.
                  </p>
                  <p>
                    Nota do número na Meta:{" "}
                    {av.freio.qualidade ? (NOTA_DO_NUMERO[av.freio.qualidade] ?? av.freio.qualidade) : "ainda não conferida"}
                    {av.freio.qualidade_em ? `, conferida em ${formatarDataHora(av.freio.qualidade_em)}` : ""}.
                  </p>
                </div>
              )}
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { nome: "Hoje", valor: `${formatarNumero(av.hoje)} de ${formatarNumero(av.por_dia)}` },
                  {
                    nome: "Últimos 7 dias",
                    valor: formatarNumero(av.semana),
                    nota: `${formatarNumero(av.semana_modelo)} pelo modelo (${emDolares(av.semana_modelo * TARIFA_MARKETING_USD)})`,
                  },
                  { nome: "Candidaturas depois do aviso", valor: formatarNumero(av.semana_candidaturas), nota: "7 dias, na vaga do aviso" },
                  { nome: "Pessoas com busca guardada", valor: formatarNumero(av.pessoas), nota: "procuraram nos últimos 30 dias" },
                  { nome: "Responderam PARAR", valor: formatarNumero(av.pararam) },
                  { nome: "Não saíram", valor: formatarNumero(av.semana_falhas), nota: "7 dias: a Meta recusou o número" },
                ].map((x) => (
                  <div key={x.nome} className="flex flex-col gap-0.5 rounded-md border border-line p-3">
                    <dt className="text-caption text-ink-muted">{x.nome}</dt>
                    <dd className="text-h3 tabular-nums">{x.valor}</dd>
                    {x.nota && <dd className="text-caption text-ink-muted">{x.nota}</dd>}
                  </div>
                ))}
              </dl>
              <form action={salvarAvisosDeVaga} className="flex flex-wrap items-end gap-4 rounded-md border border-line p-4">
                <label className="flex flex-col gap-1 text-body-sm">
                  Teto do dia
                  <input
                    type="number"
                    name="por_dia"
                    min={0}
                    max={5000}
                    defaultValue={av.por_dia}
                    className="w-28 rounded-md border border-line bg-surface-100 px-3 py-2"
                  />
                </label>
                {av.freio && (
                  <label className="flex flex-col gap-1 text-body-sm">
                    Freio (% que pede para parar)
                    <input
                      type="number"
                      name="freio_pct"
                      min={1}
                      max={50}
                      defaultValue={av.freio.pct}
                      className="w-28 rounded-md border border-line bg-surface-100 px-3 py-2"
                    />
                  </label>
                )}
                <BotaoSalvar variante="secundario" feito={salvo === "aviso" ? "Salvo" : null} />
                <p className="basis-full text-caption text-ink-muted">
                  Os avisos de todas as pessoas, somados, por dia (0 para de mandar). Se todos saírem pelo modelo, o teto de{" "}
                  {formatarNumero(av.por_dia)} custa até {emDolares(av.por_dia * TARIFA_MARKETING_USD)} por dia; os de dentro
                  das 24 horas são de graça.
                </p>
              </form>
            </div>
          )}
        </Secao>
      )}
    </div>
  );
}
