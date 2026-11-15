import { Building2 } from "lucide-react";
import Link from "next/link";
import { OFICIOS } from "@/lib/constantes";
import { formatarNumero } from "@/lib/formato";
import { RAMOS_DOS_OFICIOS, ramosDoOficio } from "@/lib/ramos-prestadores";
import type { criarClienteAdmin } from "@/lib/supabase/admin";
import { Aviso, Selo, Vazio } from "../ui/basicos";
import { ConvidarDaReceita } from "./convidar-da-receita";
import { Filtros, linkCom, Paginacao } from "./ui";
import { bairroDaReceita } from "@/lib/cnpj";

// As listas da base da Receita em Admin › Convites (claude/plano-base-de-empresas-da-receita.md, partes 1 e 5;
// migração 20270604120000): as empresas que abriram, as agências de RH de Goiás e o MEI prestador de serviço.

export type ListaDaReceita = "abriram" | "agencias" | "prestadores";

type Linha = {
  cnpj: string;
  nome: string;
  razao_social: string | null;
  cnae: string | null;
  ramo: string | null;
  bairro: string | null;
  cidade: string;
  endereco: string | null;
  abertura: string | null;
  porte: string | null;
  mei: boolean;
  matriz: boolean;
  na_praca: boolean;
  telefone: string | null;
  email: string | null;
  no_publike: boolean;
  convite: { id: string; status: string; criado_em: string } | null;
};

const POR_PAGINA = 50;
const DIAS = [
  { valor: "30", nome: "30 dias" },
  { valor: "60", nome: "60 dias" },
  { valor: "120", nome: "4 meses" },
  { valor: "365", nome: "1 ano" },
];
const DIAS_PRESTADOR = [...DIAS, { valor: "tudo", nome: "Todos" }];
const PORTE: Record<string, string> = { micro: "Micro", pequena: "Pequena", demais: "Média ou grande" };
const TIPO = { abriram: "empresa", agencias: "agencia", prestadores: "prestador" } as const;
const DESCRICAO: Record<ListaDaReceita, string> = {
  abriram:
    "Empresas (fora o MEI) que abriram há pouco nas cidades das praças: quem acabou de abrir vai contratar. O convite já leva a vaga que o ramo mais contrata.",
  agencias:
    "Agências de RH de Goiás inteiro, pelo ramo principal ou secundário (seleção, mão de obra temporária e terceirização), MEI também. Primeiro as das praças e as maiores.",
  prestadores:
    "MEI das praças nos ramos da vitrine de serviços. O endereço do MEI não aparece (quase sempre é a casa da pessoa). O convite leva a vitrine pronta com o ofício.",
};

function dataBr(iso: string | null) {
  return iso ? iso.split("-").reverse().join("/") : null;
}

export async function ListaDaReceitaAdmin({
  c,
  lista,
  sp,
}: {
  c: ReturnType<typeof criarClienteAdmin>;
  lista: ListaDaReceita;
  sp: Record<string, string | undefined>;
}) {
  const base = "/admin/convites";
  const atuais = { aba: lista, cidade: sp.cidade, dias: sp.dias, oficio: sp.oficio };
  const diasPedidos = sp.dias ?? (lista === "prestadores" ? "tudo" : "60");
  const opcoesDias = lista === "prestadores" ? DIAS_PRESTADOR : DIAS;
  const dias = opcoesDias.some((d) => d.valor === diasPedidos) ? diasPedidos : "60";
  const oficio = lista === "prestadores" && RAMOS_DOS_OFICIOS.some((r) => r.oficio === sp.oficio) ? sp.oficio! : null;
  const pagina = Math.max(1, Number(sp.pagina) || 1);

  const { data, error } = await c.rpc("admin_lista_receita", {
    p_lista: lista,
    p_cidade: sp.cidade || null,
    p_cnaes: lista === "prestadores" ? ramosDoOficio(oficio) : null,
    p_dias: lista === "agencias" ? null : dias === "tudo" ? null : Number(dias),
    p_limite: POR_PAGINA,
    p_pagina: pagina - 1,
  });
  if (error) {
    return (
      <Aviso tipo="alerta" titulo="Rode as migrações da base da Receita">
        Faltam as migrações 20270602120000 a 20270604120000 neste banco.
      </Aviso>
    );
  }
  const r = data as unknown as { total: number; linhas: Linha[]; cidades: string[] };

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-body-sm text-ink-muted">{DESCRICAO[lista]}</p>
      <div className="flex flex-col gap-2">
        {lista !== "agencias" && (
          <Filtros
            rotulo="Desde quando abriu"
            discreto
            opcoes={opcoesDias}
            atual={dias}
            link={(v) => linkCom(base, atuais, { dias: v, pagina: null })}
          />
        )}
        {lista === "prestadores" && (
          <Filtros
            rotulo="Ofício"
            discreto
            opcoes={[
              { valor: "", nome: "Todos os ofícios" },
              ...RAMOS_DOS_OFICIOS.map((o) => ({
                valor: o.oficio,
                nome: OFICIOS.find((x) => x.slug === o.oficio)?.nome ?? o.oficio,
              })),
            ]}
            atual={oficio ?? ""}
            link={(v) => linkCom(base, atuais, { oficio: v || null, pagina: null })}
          />
        )}
        {r.cidades.length > 1 && (
          <Filtros
            rotulo="Cidade"
            discreto
            opcoes={[{ valor: "", nome: "Todas as cidades" }, ...r.cidades.slice(0, 30).map((x) => ({ valor: x, nome: x }))]}
            atual={sp.cidade ?? ""}
            link={(v) => linkCom(base, atuais, { cidade: v || null, pagina: null })}
          />
        )}
      </div>

      <p className="text-label text-ink">
        {formatarNumero(r.total)} {r.total === 1 ? "empresa" : "empresas"}
      </p>

      {r.linhas.length === 0 ? (
        <Vazio icone={Building2} titulo="Nada por aqui">
          A base da Receita ainda não foi carregada ou nenhuma empresa passa nesses filtros.
        </Vazio>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
          {r.linhas.map((e) => (
            <li key={e.cnpj} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-label text-ink">{e.nome}</span>
                  {e.mei && <Selo variante="contorno">MEI</Selo>}
                  {!e.matriz && <Selo variante="contorno">Filial</Selo>}
                  {e.no_publike && <Selo variante="match">Já no Publike</Selo>}
                </p>
                <p className="text-body-sm text-ink-muted">
                  {[e.ramo, e.porte ? PORTE[e.porte] : null].filter(Boolean).join(", ")}
                </p>
                <p className="text-body-sm text-ink-muted">
                  {[e.endereco, e.bairro && bairroDaReceita(e.bairro), e.cidade].filter(Boolean).join(", ")}
                  {e.abertura && <> (aberta em {dataBr(e.abertura)})</>}
                </p>
                <p className="text-body-sm text-ink">
                  {[e.telefone, e.email].filter(Boolean).join("  ·  ") || (
                    <span className="text-ink-muted">Sem telefone nem e-mail na Receita</span>
                  )}
                </p>
              </div>
              <div className="shrink-0">
                {e.convite ? (
                  <Link href="/admin/convites" className="text-body-sm text-ink underline underline-offset-2">
                    Já convidada ({e.convite.status})
                  </Link>
                ) : e.no_publike ? null : (
                  <ConvidarDaReceita
                    tipo={TIPO[lista]}
                    empresa={{
                      cnpj: e.cnpj,
                      nome: e.nome,
                      cnae: e.cnae,
                      ramo: e.ramo,
                      bairro: e.bairro,
                      cidade: e.cidade,
                      abertura: e.abertura,
                      telefone: e.telefone,
                      email: e.email,
                    }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Paginacao
        pagina={pagina}
        total={r.total}
        porPagina={POR_PAGINA}
        link={(p) => linkCom(base, atuais, { pagina: p > 1 ? String(p) : null })}
      />
    </div>
  );
}
