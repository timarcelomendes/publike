import { ImageResponse } from "next/og";
import { formatarLugar, valorDoAnuncio } from "@/lib/formato";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// A imagem que aparece quando alguém manda o link da vaga no WhatsApp (e nas redes): o título, o valor,
// o lugar e quem contrata, para o grupo do bairro ver a vaga antes de abrir. Serviço: título e lugar.
// Vaga fora do ar (ou que não existe): só o nome do Publike.

export const alt = "Vaga no Publike";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function lerAnuncio(id: string) {
  if (!UUID.test(id)) return null;
  try {
    const { data } = await criarClientePublico().rpc("obter_anuncio", { p_id: id }).maybeSingle();
    return data && data.status === "ativo" && !data.preenchida_em ? data : null;
  } catch {
    return null;
  }
}

const curto = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);

export default async function Imagem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await lerAnuncio(id);
  const vaga = a?.tipo === "vaga";
  const titulo = a ? curto(a.titulo, 70) : "Trabalho perto de casa";
  const valor = a ? valorDoAnuncio(a) : null;
  const lugar = a ? formatarLugar(a.bairro, a.cidade) : null;
  // vaga de agência: quem contrata é a empresa (ou confidencial), não a agência
  const quem = !a
    ? null
    : a.contratante
      ? a.contratante
      : a.contratante_confidencial
        ? "Empresa confidencial"
        : a.autor_nome;
  const conferida = vaga && a?.autor_verificado && a.autor_tipo !== "pessoa";
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#fbf7ef",
        padding: "64px 72px",
        color: "#1f1a14",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#a2441f" }}>
          {a ? (vaga ? "Vaga de emprego" : "Serviço") : "publike"}
        </div>
        <div style={{ display: "flex", fontSize: titulo.length > 40 ? 64 : 80, fontWeight: 800, lineHeight: 1.1 }}>
          {titulo}
        </div>
        {a && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 36, color: "#4a4136" }}>
            {valor && valor !== "A combinar" && vaga && (
              <span style={{ fontWeight: 700, color: "#1f1a14" }}>{curto(valor, 60)}</span>
            )}
            {lugar && <span>{curto(lugar, 60)}</span>}
            {vaga && quem && <span>{curto(quem, 50)}</span>}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 30 }}>
        <span style={{ fontWeight: 800, fontSize: 44 }}>publike</span>
        <span style={{ color: conferida ? "#2f6b3d" : "#6b6052", fontWeight: conferida ? 700 : 400 }}>
          {conferida ? "Empresa conferida pelo Publike" : vaga ? "Candidate-se de graça" : "Trabalho perto de casa"}
        </span>
      </div>
    </div>,
    size,
  );
}
