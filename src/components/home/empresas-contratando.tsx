import Link from "next/link";
import { distanciaKm } from "@/lib/descobrir";
import { formatarLugar, plural } from "@/lib/formato";
import type { Local } from "@/lib/regioes";
import { anunciosNoAr } from "@/lib/servidor/paginas-busca";
import { SeloVerificado } from "../selo-verificado";
import { Avatar, Container } from "../ui/basicos";

export type EmpresaContratando = {
  id: string;
  nome: string;
  tipo: string;
  foto: string | null;
  verificado: boolean;
  vagas: number;
  /** o bairro da vaga mais nova */
  lugar: string;
  /** da casa da pessoa até a vaga mais perto (só com o CEP de casa) */
  km: number | null;
};

/**
 * Quem tem vaga no ar (empresa, comércio e agência), com quantas: com o CEP de casa, as
 * mais perto primeiro; sem, as que mais contratam. Sai das vagas no ar (com cache).
 */
export async function empresasContratando(local: Local | null, quantas: number): Promise<EmpresaContratando[]> {
  const vagas = (await anunciosNoAr("vaga")).filter((v) => v.autor_tipo !== "pessoa");
  // a casa (CEP) ou, sem ela, o meio do bairro escolhido: as mais perto primeiro
  const ponto = local?.ponto ?? local?.centro ?? null;
  const porEmpresa = new Map<string, EmpresaContratando>();
  for (const v of vagas) {
    const km = ponto ? distanciaKm(ponto.lat, ponto.lng, v.lat, v.lng) : null;
    const e = porEmpresa.get(v.autor_id);
    if (e) {
      e.vagas += 1;
      if (km !== null && (e.km === null || km < e.km)) e.km = km;
      continue;
    }
    // a lista vem da mais nova para a mais velha: a primeira de cada empresa é a mais nova
    porEmpresa.set(v.autor_id, {
      id: v.autor_id,
      nome: v.autor_nome,
      tipo: v.autor_tipo,
      foto: v.autor_foto,
      verificado: v.autor_verificado,
      vagas: 1,
      lugar: formatarLugar(v.bairro, v.cidade),
      km,
    });
  }
  const lista = [...porEmpresa.values()];
  lista.sort((a, b) => (ponto ? (a.km ?? 999) - (b.km ?? 999) : 0) || b.vagas - a.vagas);
  return lista.slice(0, quantas);
}

function CartaoEmpresa({ e }: { e: EmpresaContratando }) {
  return (
    <Link
      href={`/perfil/${e.id}/vagas`}
      className="flex h-full w-40 flex-col items-start gap-2 rounded-[18px] border border-line bg-surface-200 p-4 shadow-card transition-shadow hover:shadow-raised sm:w-auto"
    >
      <Avatar nome={e.nome} foto={e.foto} tamanho={44} forma="quadrada" colorida />
      <span className="flex items-center gap-1 text-label">
        <span className="line-clamp-2">{e.nome}</span>
        {e.verificado && <SeloVerificado agencia={e.tipo === "agencia"} />}
      </span>
      <span className="text-body-sm text-ink-muted">
        {plural(e.vagas, "vaga", "vagas")} · {e.lugar}
      </span>
    </Link>
  );
}

/** Na home do visitante: até 5 empresas, em colunas (no celular, uma faixa que rola). */
export async function EmpresasContratando({ local }: { local: Local | null }) {
  const empresas = await empresasContratando(local, 5);
  if (empresas.length < 2) return null;
  return (
    <Container className="mt-12 sm:mt-16">
      <section aria-labelledby="empresas-contratando">
        <h2 id="empresas-contratando" className="text-h2 sm:text-[28px] sm:leading-[34px]">
          {local?.ponto ? "Empresas contratando perto de você" : "Empresas contratando em Goiânia e região"}
        </h2>
        {/* no celular, uma faixa que rola de lado; do tablet para cima, em colunas */}
        <ul className="sem-barra -mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
          {empresas.map((e) => (
            <li key={e.id} className="shrink-0">
              <CartaoEmpresa e={e} />
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}
