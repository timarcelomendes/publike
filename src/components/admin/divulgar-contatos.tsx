import { Building2 } from "lucide-react";
import { formatarData, formatarTelefone } from "@/lib/formato";
import type { criarClienteAdmin } from "@/lib/supabase/admin";
import { Aviso, Selo, Vazio } from "../ui/basicos";
import { AcoesDoContato, whatsappDaReceita } from "./divulgar";
import { Filtros, linkCom, Paginacao } from "./ui";

// Os contatos de Admin › Convites › Divulgar (migração 20270916120000): as contabilidades e as empresas de gestão de
// pessoas das praças, da base da Receita. Primeiro os com telefone e os maiores; "Mandei" tira da lista dos que faltam.

type Linha = {
  cnpj: string;
  nome: string;
  razao_social: string | null;
  bairro: string | null;
  cidade: string;
  porte: string | null;
  matriz: boolean;
  telefone: string | null;
  email: string | null;
  mandado_em: string | null;
  no_publike: boolean;
};

const POR_PAGINA = 30;
const PORTE: Record<string, string> = { micro: "Micro", pequena: "Pequena", demais: "Média ou grande" };
const PUBLICOS = [
  { valor: "contabilidades", nome: "Contabilidades" },
  { valor: "gestao", nome: "Gestão de pessoas e RH" },
];

export async function ContatosDeDivulgar({
  c,
  sp,
}: {
  c: ReturnType<typeof criarClienteAdmin>;
  sp: Record<string, string | undefined>;
}) {
  const base = "/admin/convites";
  const publico = sp.publico === "gestao" ? "gestao" : "contabilidades";
  const mostrar = sp.mostrar === "mandados" || sp.mostrar === "todos" ? sp.mostrar : "faltam";
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const atuais = { aba: "divulgar", publico, mostrar, cidade: sp.cidade };
  const { data, error } = await c.rpc("admin_divulgar_contatos", {
    p_publico: publico,
    p_cidade: sp.cidade || null,
    p_mostrar: mostrar,
    p_limite: POR_PAGINA,
    p_pagina: pagina - 1,
  });
  if (error) {
    return (
      <Aviso tipo="alerta" titulo="Rode a migração dos contatos">
        Falta a migração 20270916120000_divulgar_contatos.sql neste banco.
      </Aviso>
    );
  }
  const r = data as unknown as { total: number; faltam: number; mandados: number; cidades: string[]; linhas: Linha[] };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Filtros rotulo="Para quem" opcoes={PUBLICOS} atual={publico} link={(v) => linkCom(base, atuais, { publico: v, pagina: null, cidade: null })} />
        <Filtros
          rotulo="Mostrar"
          discreto
          opcoes={[
            { valor: "faltam", nome: "Faltam mandar", numero: r.faltam },
            { valor: "mandados", nome: "Mandados", numero: r.mandados },
            { valor: "todos", nome: "Todos" },
          ]}
          atual={mostrar}
          link={(v) => linkCom(base, atuais, { mostrar: v, pagina: null })}
        />
        {r.cidades.length > 1 && (
          <Filtros
            rotulo="Cidade"
            discreto
            opcoes={[{ valor: "", nome: "Todas" }, ...r.cidades.map((x) => ({ valor: x, nome: x }))]}
            atual={sp.cidade ?? ""}
            link={(v) => linkCom(base, atuais, { cidade: v || null, pagina: null })}
          />
        )}
      </div>
      <p className="text-body-sm text-ink-muted">
        Da base da Receita, nas cidades do Publike: primeiro os com telefone e os maiores. “Abrir no WhatsApp” já leva a
        mensagem e marca como mandado. Telefone fixo pode não ter WhatsApp: se não abrir, ligue ou use o e-mail.
      </p>
      {r.linhas.length === 0 ? (
        <Vazio icone={Building2} titulo={mostrar === "mandados" ? "Nenhum mandado ainda" : "Ninguém nesta lista"}>
          {mostrar === "faltam" ? "Todos desta lista já receberam a mensagem." : "Troque os filtros acima."}
        </Vazio>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {r.linhas.map((e) => {
            const zap = whatsappDaReceita(e.telefone);
            return (
              <li key={e.cnpj} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-body font-semibold">{e.nome}</p>
                    {e.porte && <Selo>{PORTE[e.porte] ?? e.porte}</Selo>}
                    {!e.matriz && <Selo>Filial</Selo>}
                    {e.no_publike && <Selo variante="match">Já no Publike</Selo>}
                    {e.mandado_em && <Selo variante="match">Mandado em {formatarData(e.mandado_em)}</Selo>}
                  </div>
                  <p className="text-body-sm text-ink-muted">
                    {[e.bairro, e.cidade].filter(Boolean).join(", ")}
                  </p>
                  <p className="break-words text-body-sm">
                    {e.telefone ? `${formatarTelefone(e.telefone)}${zap ? (zap.celular ? " · celular" : " · fixo") : ""}` : "Sem telefone"}
                    {e.email ? ` · ${e.email}` : ""}
                  </p>
                </div>
                <AcoesDoContato
                  cnpj={e.cnpj}
                  publico={publico}
                  telefone={e.telefone}
                  mandado={Boolean(e.mandado_em)}
                />
              </li>
            );
          })}
        </ul>
      )}
      <Paginacao pagina={pagina} total={r.total} porPagina={POR_PAGINA} link={(p) => linkCom(base, atuais, { pagina: p > 1 ? String(p) : null })} />
    </div>
  );
}
