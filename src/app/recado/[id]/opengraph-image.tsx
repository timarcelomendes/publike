import { ImageResponse } from "next/og";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// A imagem que aparece quando alguém manda o link de um recado (WhatsApp, redes): o texto do
// recado num balão, quem escreveu e o nome do Publike.

export const alt = "Recado no Publike";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function lerRecado(id: string) {
  if (!UUID.test(id)) return null;
  try {
    const { data } = await criarClientePublico().rpc("recado", { p_id: id }).maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

export default async function Imagem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await lerRecado(id);
  const texto = r ? (r.texto.length > 220 ? `${r.texto.slice(0, 217).trimEnd()}…` : r.texto) : "Recado no Publike";
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
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: "#fcf3d6",
          borderRadius: "12px 40px 40px 40px",
          padding: "44px 52px",
          gap: 20,
        }}
      >
        {r && (
          <div style={{ display: "flex", fontSize: 30, color: "#6b6052" }}>
            <span style={{ fontWeight: 700, color: "#1f1a14" }}>{r.autor_nome}</span>
            <span style={{ marginLeft: 12 }}>
              {r.autor_tipo === "pessoa" ? "procura trabalho" : "está contratando"}
            </span>
          </div>
        )}
        <div style={{ display: "flex", fontSize: texto.length > 140 ? 40 : 50, lineHeight: 1.3 }}>{texto}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 30 }}>
        <span style={{ fontWeight: 800, fontSize: 44 }}>publike</span>
        <span style={{ color: "#6b6052" }}>Trabalho perto de casa, de graça</span>
      </div>
    </div>,
    size,
  );
}
