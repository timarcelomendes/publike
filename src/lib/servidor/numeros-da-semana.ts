import "server-only";
import { textoDosNumerosDaSemana, type Metas } from "@/lib/admin/indicadores";
import type { Periodo } from "@/lib/admin/o-que-mudou";
import { acessoFila } from "@/lib/servidor/filas";

// Os números da semana por e-mail (claude/plano-indicadores-do-admin.md, parte 5): na segunda, a partir das 8h, para
// quem recebe os avisos da equipe, uma vez. Nasce desligado (Admin › Painel). Sem a migração 20270403120000, nada (e
// sem `motivo`). O link leva a Equipe › Números no site (o Painel do admin só abre no computador do dono).

type DaSemana = { semana: string; de: string; ate: string; atual: Periodo; antes: Periodo; metas: Metas | null };

export async function mandarNumerosDaSemana(): Promise<{ mandados: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { mandados: 0 };
  const { data, error } = await acesso.cliente.rpc("servidor_numeros_da_semana", { p_chave: acesso.chave });
  if (error) {
    if (error.code === "PGRST202") return { mandados: 0 };
    console.error("Publike: falha nos números da semana:", error.message);
    return { mandados: 0, motivo: "Não foi possível montar os números da semana." };
  }
  if (!data) return { mandados: 0 };
  const x = data as unknown as DaSemana;
  const textos = textoDosNumerosDaSemana(x);
  const { data: n, error: e2 } = await acesso.cliente.rpc("servidor_mandar_numeros_da_semana", {
    p_chave: acesso.chave,
    p_semana: x.semana,
    p_dados: { ...textos, link: "/admin/numeros" },
  });
  if (e2) {
    console.error("Publike: falha ao pôr os números da semana na fila:", e2.message);
    return { mandados: 0, motivo: "Não foi possível pôr os números da semana na fila." };
  }
  return { mandados: Number(n ?? 0) };
}
