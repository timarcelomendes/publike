import { ImageResponse } from "next/og";
import { formatarLugar, plural, urlDaFoto } from "@/lib/formato";
import { vagasDaEmpresa } from "@/lib/servidor/vagas-da-empresa";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { valorCurto } from "@/lib/vagas-da-empresa";

// A imagem do link da página de vagas da empresa (WhatsApp, Facebook, LinkedIn): a logo, o nome, "está contratando",
// quantas vagas e as 3 mais novas com o valor e o bairro (claude/plano-pagina-de-vagas.md, parte 1). Sem logo, as
// iniciais num quadrado. Empresa sem vaga aberta (ou que não existe): o nome e "Vagas no Publike".

export const alt = "Vagas abertas no Publike";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const curto = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);
const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** Quantas vagas estão no ar (o quadro só traz as 30 mais novas). */
async function totalDeVagas(id: string, lidas: number) {
  if (lidas < 30) return lidas;
  try {
    const { count } = await criarClientePublico()
      .from("anuncios")
      .select("id", { count: "exact", head: true })
      .eq("autor_id", id)
      .eq("tipo", "vaga")
      .eq("status", "ativo")
      .gt("expira_em", new Date().toISOString());
    return count ?? lidas;
  } catch {
    return lidas;
  }
}

export default async function Imagem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quadro = await vagasDaEmpresa(id).catch(() => null);
  const nome = quadro ? curto(quadro.perfil.nome, 42) : "Publike";
  const foto = urlDaFoto(quadro?.perfil.foto);
  const vagas = quadro?.vagas ?? [];
  const total = quadro ? await totalDeVagas(id, vagas.length) : 0;
  const primeiras = vagas.slice(0, 3);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#fbf7ef",
        padding: "56px 72px",
        color: "#1f1a14",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        {foto ? (
          <img
            src={foto}
            alt=""
            width={140}
            height={140}
            style={{ borderRadius: 24, objectFit: "cover", border: "2px solid #e6dccb", background: "#fff" }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 140,
              height: 140,
              borderRadius: 24,
              background: "#a2441f",
              color: "#fff",
              fontSize: 60,
              fontWeight: 800,
            }}
          >
            {iniciais(nome) || "P"}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div style={{ display: "flex", fontSize: nome.length > 26 ? 50 : 62, fontWeight: 800, lineHeight: 1.05 }}>
            {nome}
          </div>
          <div style={{ display: "flex", fontSize: 36, color: "#a2441f", fontWeight: 700 }}>
            {total ? `está contratando · ${plural(total, "vaga aberta", "vagas abertas")}` : "Vagas no Publike"}
          </div>
        </div>
      </div>
      {primeiras.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {primeiras.map((v) => (
            <div
              key={v.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 24,
                background: "#fff",
                border: "2px solid #ece3d4",
                borderRadius: 18,
                padding: "16px 24px",
                fontSize: 30,
              }}
            >
              <span style={{ fontWeight: 700 }}>{curto(v.titulo, 34)}</span>
              <span style={{ color: "#4a4136" }}>
                {curto(`${valorCurto({ ...v, tipo: "vaga" })} · ${formatarLugar(v.bairro, v.cidade)}`, 40)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 30 }}>
        <span style={{ fontWeight: 800, fontSize: 44 }}>publike</span>
        <span style={{ color: "#6b6052" }}>
          {total > 3 ? `e mais ${plural(total - 3, "vaga", "vagas")} · ` : ""}Candidate-se de graça
        </span>
      </div>
    </div>,
    size,
  );
}
