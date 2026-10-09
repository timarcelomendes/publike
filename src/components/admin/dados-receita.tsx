import { bairroDaReceita, nomeDaReceita } from "@/lib/cnpj";
import { consultarCnpj } from "@/lib/servidor/brasilapi";
import { Aviso } from "../ui/basicos";
import { Dado } from "./ui";

function data(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Dados públicos do CNPJ na Receita (BrasilAPI), para a equipe comparar com o perfil. */
export async function DadosDaReceita({ cnpj, agencia }: { cnpj: string; agencia: boolean }) {
  const consulta = await consultarCnpj(cnpj);
  if (!consulta.ok) {
    return (
      <p className="text-body-sm text-ink-muted">
        {consulta.motivo === "nao_encontrado"
          ? "A BrasilAPI não achou este CNPJ (empresa aberta há menos de um mês pode ainda não aparecer). Confira pelo link da Receita."
          : "Não deu para consultar a BrasilAPI agora. Confira pelo link da Receita."}
      </p>
    );
  }
  const d = consulta.dados;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-4">
      <p className="text-label">Na Receita (dados abertos)</p>
      <dl className="flex flex-col gap-3">
        <Dado rotulo="Razão social">{nomeDaReceita(d.razaoSocial)}</Dado>
        {d.nomeFantasia && <Dado rotulo="Nome fantasia">{nomeDaReceita(d.nomeFantasia)}</Dado>}
        <Dado rotulo="Situação">
          <span className={d.ativa ? "text-cerrado-text" : "text-danger"}>{nomeDaReceita(d.situacao)}</span>
          {d.mei && " · MEI"}
        </Dado>
        <Dado rotulo="Aberta em">{data(d.abertura)}</Dado>
        <Dado rotulo="Atividade principal">{[d.cnae, d.atividade].filter(Boolean).join(" · ") || "—"}</Dado>
        <Dado rotulo="Município">
          {d.municipio ? `${nomeDaReceita(d.municipio)}${d.uf ? `/${d.uf}` : ""}` : "—"}
          {d.bairro && ` · ${bairroDaReceita(d.bairro)}`}
        </Dado>
      </dl>
      {!d.ativa && <Aviso tipo="erro">O CNPJ não está ativo na Receita.</Aviso>}
      {d.ativa && agencia && !d.agenciaDeEmprego && (
        <Aviso tipo="alerta">
          Nenhuma atividade do grupo 78 (seleção, agenciamento ou locação de mão de obra). Pode ser consultoria de RH:
          confira antes de verificar.
        </Aviso>
      )}
    </div>
  );
}
