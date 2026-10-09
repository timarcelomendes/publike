import { UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Busca, Filtros, linkCom, Paginacao } from "@/components/admin/ui";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { Aviso, Avatar, Selo, Vazio } from "@/components/ui/basicos";
import { listarUsuarios, POR_PAGINA } from "@/lib/admin/dados";
import {
  ehParaSempre,
  formatarDataCurta,
  formatarLugar,
  formatarNumero,
  formatarTelefone,
  nomeDoProvedor,
  primeiro,
  rotuloConta,
  tempoRelativo,
} from "@/lib/formato";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Usuários" };

const FILTROS = [
  { valor: "todos", nome: "Todos" },
  { valor: "suspensos", nome: "Suspensos" },
  { valor: "banidos", nome: "Banidos" },
  { valor: "moderadores", nome: "Moderadores" },
  { valor: "verificados", nome: "Verificados" },
  { valor: "sem_perfil", nome: "Sem perfil" },
];

export default function Usuarios({ searchParams }: PageProps<"/admin/usuarios">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/usuarios">["searchParams"] }) {
  const c = await exigirAdminLocal();
  const sp = await searchParams;
  const q = (primeiro(sp.q) ?? "").trim().slice(0, 80);
  const pedido = primeiro(sp.filtro) ?? "todos";
  const filtro = FILTROS.some((f) => f.valor === pedido) ? pedido : "todos";
  const pagina = Math.max(1, Math.floor(Number(primeiro(sp.pagina))) || 1);
  const [{ itens, total }, agora] = await Promise.all([
    listarUsuarios(c, q || null, filtro, pagina),
    agoraDaRequisicao(),
  ]);
  const atuais = { q: q || null, filtro: filtro === "todos" ? null : filtro };

  return (
    <div className="flex flex-col gap-4">
      {primeiro(sp.excluida) === "1" && <Aviso tipo="sucesso" titulo="Conta apagada." />}
      <Busca acao="/admin/usuarios" valor={q} placeholder="Nome, e-mail ou WhatsApp" ocultos={{ filtro: atuais.filtro }} />
      <Filtros
        rotulo="Filtrar contas"
        opcoes={FILTROS}
        atual={filtro}
        link={(v) => linkCom("/admin/usuarios", atuais, { filtro: v === "todos" ? null : v, pagina: null })}
      />
      <p className="text-body-sm text-ink-muted" aria-live="polite">
        {total === 1 ? "1 conta" : `${formatarNumero(total)} contas`}
        {q && ` para “${q}”`}
      </p>

      {itens.length === 0 ? (
        <Vazio icone={UsersRound} titulo="Nenhuma conta encontrada">
          Tente outro nome, e-mail ou filtro.
        </Vazio>
      ) : (
        <ul className="flex flex-col gap-2">
          {itens.map((u) => {
            const banida = u.suspensao_tipo === "banimento" || ehParaSempre(u.suspenso_ate, agora);
            return (
              <li key={u.id}>
                <Link
                  href={`/admin/usuarios/${u.id}`}
                  className="flex gap-3 rounded-lg border border-line bg-surface-200 p-4 transition-colors hover:bg-surface-300"
                >
                  <Avatar nome={u.nome ?? u.email ?? "?"} foto={u.foto} tamanho={44} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-label">{u.nome ?? "Sem perfil ainda"}</span>
                      {u.moderador && <Selo variante="neutro">Moderador</Selo>}
                      {u.verificado && <Selo variante="match">Verificado</Selo>}
                      {u.suspenso_ate &&
                        (banida ? (
                          <Selo variante="perigo">Banida</Selo>
                        ) : (
                          <Selo variante="aviso">Suspensa até {formatarDataCurta(u.suspenso_ate)}</Selo>
                        ))}
                    </div>
                    <p className="truncate text-body-sm text-ink-muted">
                      {[
                        u.email ?? (u.telefone ? formatarTelefone(u.telefone) : null),
                        nomeDoProvedor(u.provedor),
                        u.tipo ? rotuloConta(u.tipo) : null,
                        u.cidade ? formatarLugar(u.bairro, u.cidade) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="text-body-sm text-ink-muted">
                      Entrou {tempoRelativo(u.criado_em, agora)}
                      {u.ultimo_acesso && ` · último acesso ${tempoRelativo(u.ultimo_acesso, agora)}`}
                      {` · ${u.anuncios_total} ${u.anuncios_total === 1 ? "anúncio" : "anúncios"}`}
                      {u.anuncios_no_ar > 0 && ` (${u.anuncios_no_ar} no ar)`}
                      {u.denuncias_recebidas > 0 && (
                        <span className="text-terra-text">
                          {` · ${u.denuncias_recebidas} ${u.denuncias_recebidas === 1 ? "denúncia" : "denúncias"}`}
                        </span>
                      )}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Paginacao
        pagina={pagina}
        total={total}
        porPagina={POR_PAGINA}
        link={(p) => linkCom("/admin/usuarios", atuais, { pagina: p > 1 ? String(p) : null })}
      />
    </div>
  );
}
