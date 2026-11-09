import { Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { AcoesNovidade, FormNovidade, type NovidadeParaEditar } from "@/components/admin/novidades";
import { Secao } from "@/components/admin/ui";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { classesBotao } from "@/components/ui/botao";
import { formatarData, primeiro } from "@/lib/formato";
import { DICAS } from "@/lib/dicas";
import { PARA_NOVIDADE, paraDaNovidade } from "@/lib/novidades";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Novidades" };

// Admin › Novidades: as principais evoluções do Publike, escritas uma vez (migração 20270122120000_novidades.sql).
// Publicadas, aparecem em /novidades. Cada uma também sai como banner (cartão ou janela) e como recado no sino:
// "Fazer banner" e "Mandar no sino" abrem esses formulários já preenchidos com ela.

export default function Novidades({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      {searchParams.then((sp) => (
        <Conteudo
          aba={primeiro(sp.aba) ?? null}
          editar={primeiro(sp.editar) ?? null}
          salvo={primeiro(sp.salvo) ?? null}
        />
      ))}
    </Suspense>
  );
}

/** O dia de hoje em Brasília, "2026-11-02". */
function hojeEmBrasilia(agora: number) {
  return new Date(agora - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

async function Conteudo({ aba, editar, salvo }: { aba: string | null; editar: string | null; salvo: string | null }) {
  const c = await exigirAdminLocal();
  const [{ data, error }, agora, { data: numerosDicas }] = await Promise.all([
    c.from("novidades").select("*").order("dia", { ascending: false }).order("criada_em", { ascending: false }),
    agoraDaRequisicao(),
    // as dicas de novidade (migração 20270317120000; sem ela, a seção não aparece)
    c.rpc("admin_numeros_dicas"),
  ]);
  if (error) {
    return (
      <Aviso tipo="erro" titulo="Falta a migração">
        Rode a migração 20270122120000_novidades.sql no Supabase. Ela cria as novidades e já traz um rascunho das
        principais evoluções para você revisar.
      </Aviso>
    );
  }
  const novidades = data ?? [];
  const hoje = hojeEmBrasilia(agora);
  const aberta = novidades.find((n) => n.id === editar);
  const noForm = Boolean(aberta) || aba === "nova" || novidades.length === 0;
  const paraEditar: NovidadeParaEditar | undefined = aberta && {
    id: aberta.id,
    titulo: aberta.titulo,
    texto: aberta.texto,
    link: aberta.link,
    botao: aberta.botao,
    para: paraDaNovidade(aberta.para),
    dia: aberta.dia,
    publicada: aberta.publicada,
  };
  const publicadas = novidades.filter((n) => n.publicada).length;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Novidades" className="flex flex-wrap gap-2">
        <Link
          href="/admin/novidades"
          aria-current={noForm ? undefined : "page"}
          className={classesBotao(noForm ? "secundario" : "primario", "sm")}
        >
          Novidades ({novidades.length})
        </Link>
        {aberta ? (
          <span aria-current="page" className={classesBotao("primario", "sm")}>
            <Pencil aria-hidden />
            Editar
          </span>
        ) : (
          <Link
            href="/admin/novidades?aba=nova"
            aria-current={noForm ? "page" : undefined}
            className={classesBotao(noForm ? "primario" : "secundario", "sm")}
          >
            <Plus aria-hidden />
            Nova novidade
          </Link>
        )}
      </nav>

      {salvo && !noForm && (
        <Aviso tipo="sucesso" titulo={salvo === "nova" ? "Novidade criada" : "Novidade salva"}>
          Publicada, aparece em /novidades (no site no ar, em até 15 minutos).
        </Aviso>
      )}

      {noForm ? (
        <Secao
          titulo={aberta ? "Editar a novidade" : "Nova novidade"}
          descricao="Uma evolução do Publike, contada uma vez. Depois de salvar, ela também pode sair como banner e como recado no sino."
          acoes={
            novidades.length > 0 && (
              <Link href="/admin/novidades" className={classesBotao("fantasma", "sm")}>
                Cancelar
              </Link>
            )
          }
        >
          <FormNovidade key={aberta?.id ?? "nova"} novidade={paraEditar} hoje={hoje} />
        </Secao>
      ) : (
        <Secao
          titulo="Novidades"
          descricao={
            <>
              {publicadas === 1 ? "1 publicada" : `${publicadas} publicadas`} em{" "}
              <Link href="/novidades" target="_blank" className="underline underline-offset-2">
                /novidades
              </Link>
              , junto com os banners marcados “Também em Novidades”. Os rascunhos ficam só aqui.
            </>
          }
        >
          {novidades.length === 0 ? (
            <Vazio icone={Plus} titulo="Nenhuma novidade ainda">
              Crie a primeira em Nova novidade.
            </Vazio>
          ) : (
            <ul aria-label="Novidades" className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {novidades.map((n) => (
                <li key={n.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Selo variante={n.publicada ? (n.dia > hoje ? "aviso" : "match") : "contorno"}>
                        {n.publicada ? (n.dia > hoje ? "Agendada" : "Publicada") : "Rascunho"}
                      </Selo>
                      <span className="text-label">{n.titulo}</span>
                    </div>
                    <p className="text-body-sm text-ink-muted">{n.texto}</p>
                    <p className="text-body-sm text-ink-muted">
                      {formatarData(`${n.dia}T12:00:00-03:00`)} · {PARA_NOVIDADE[paraDaNovidade(n.para)]}
                      {n.link ? ` · botão “${n.botao ?? "Ver"}” (${n.link})` : " · sem botão"}
                    </p>
                    <Link
                      href={`/admin/novidades?editar=${n.id}`}
                      className="inline-flex min-h-10 w-fit items-center gap-1.5 text-label underline underline-offset-2"
                    >
                      <Pencil aria-hidden className="size-4" />
                      Editar
                    </Link>
                  </div>
                  <AcoesNovidade id={n.id} publicada={n.publicada} />
                </li>
              ))}
            </ul>
          )}
        </Secao>
      )}
      {numerosDicas && (
        <Secao
          titulo="Dicas de novidade"
          descricao="O balão “Novo” junto do botão ou do campo novo: cada pessoa vê uma vez (quem já tinha conta, no primeiro acesso depois da melhoria; quem chega depois, também). Os textos ficam em src/lib/dicas.ts."
        >
          <ul className="flex flex-col divide-y divide-line">
            {DICAS.map((d) => {
              const n = numerosDicas.find((x) => x.chave === d.chave);
              return (
                <li key={d.chave} className="flex flex-col gap-1 py-3">
                  <span className="flex flex-wrap items-center gap-2">
                    <Selo variante={d.ligada ? "match" : "contorno"}>{d.ligada ? "Ligada" : "Desligada"}</Selo>
                    <span className="text-label">{d.texto}</span>
                  </span>
                  <span className="text-body-sm text-ink-muted">
                    {n
                      ? `${n.vistas} ${n.vistas === 1 ? "pessoa viu" : "pessoas viram"}, ${n.usaram} ${n.usaram === 1 ? "usou" : "usaram"} a novidade depois`
                      : "Ninguém com conta viu ainda"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Secao>
      )}
    </div>
  );
}
