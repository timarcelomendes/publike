import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao } from "@/components/admin/ui";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { Botao, BotaoLink } from "@/components/ui/botao";
import {
  mandarAtendemAgora,
  mandarProcuradasAgora,
  salvarConfigAtendem,
  salvarConfigProcuradas,
} from "@/lib/acoes/admin-procuradas";
import { formatarDataCurta, plural, primeiro } from "@/lib/formato";
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
type Dados = {
  config: { ligado: boolean; minimo: number; dias: number };
  dias: number;
  funcoes: Funcao[];
  destinatarios: Destinatario[];
  avisadas: Avisada[];
  registros: number;
};

const ERROS: Record<string, string> = {
  fora: "O admin só funciona com a sua conta de admin.",
  salvar: "Não deu para salvar. Tente de novo.",
  mandar: "Não deu para mandar agora. Tente de novo em instantes.",
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
  const [{ data, error }, oferta, atendem] = await Promise.all([
    c.rpc("admin_procuradas", { p_dias: null }),
    // muita procura e pouca vaga (migração 20270909120000) e quem atende e não curtiu (20270908120000): sem a migração,
    // a parte fica com o aviso de rodar
    c.rpc("admin_procura_e_oferta", { p_dias: 14, p_minimo: 3 }),
    c.rpc("admin_atendem"),
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

  return (
    <div className="flex flex-col gap-6">
      {erro && <Aviso tipo="erro">{ERROS[erro] ?? ERROS.salvar}</Aviso>}
      {primeiro(sp.salvo) === "1" && <Aviso tipo="sucesso" titulo="Salvo." />}
      {mandados !== undefined && (
        <Aviso tipo="sucesso" titulo={`${plural(Number(mandados) || 0, "aviso mandado", "avisos mandados")}.`}>
          Cada conta recebe no sino, no celular e por e-mail (se não desligou os avisos da semana).
        </Aviso>
      )}
      {mandadosAtendem !== undefined && (
        <Aviso tipo="sucesso" titulo={`${plural(Number(mandadosAtendem) || 0, "aviso mandado", "avisos mandados")}.`}>
          Cada vaga com pessoas novas que atendem tudo recebe no máximo um aviso por dia.
        </Aviso>
      )}

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
          <Botao type="submit" variante="secundario">
            Salvar
          </Botao>
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
              <Botao type="submit" variante="primario" tamanho="sm">
                Sim, mandar
              </Botao>
              <BotaoLink href="/admin/procuradas" variante="secundario" tamanho="sm">
                Cancelar
              </BotaoLink>
            </form>
          ) : (
            <BotaoLink href="/admin/procuradas?confirmar=1" variante="primario" tamanho="sm">
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
                <Botao type="submit" variante="secundario">
                  Salvar
                </Botao>
              </form>
              <form action={mandarAtendemAgora}>
                <Botao type="submit" variante="secundario" tamanho="sm">
                  Mandar agora
                </Botao>
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
    </div>
  );
}
