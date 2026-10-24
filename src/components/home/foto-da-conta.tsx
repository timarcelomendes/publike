"use client";

import { Camera } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { trocarFotoPeloTopo } from "@/lib/acoes/home";
import { reduzirImagem } from "@/lib/reduzir-imagem";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { Avatar } from "../ui/basicos";

/**
 * A foto (ou o logo) no cartão da conta, com o botão de câmera para trocar ali mesmo. Quem é da
 * equipe de uma agência troca o logo no perfil da agência (o botão leva para lá).
 */
export function FotoDaConta({
  nome,
  foto: inicial,
  empresa,
  pessoaId,
  podeTrocar,
  tamanho = 64,
  className = "-mt-8 self-start bg-surface-200 p-1",
}: {
  nome: string;
  foto: string | null;
  empresa: boolean;
  /** a pasta da foto (a pessoa logada) */
  pessoaId: string;
  /** a conta é da própria pessoa (não de uma agência pela qual ela age) */
  podeTrocar: boolean;
  tamanho?: number;
  /** a moldura (no cartão, a borda branca que sobe na faixa) */
  className?: string;
}) {
  const router = useRouter();
  const [foto, setFoto] = useState(inicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const raio = empresa ? Math.round(tamanho * 0.28) : 999;
  const rotulo = empresa ? (foto ? "Trocar o logo" : "Pôr o logo") : foto ? "Trocar a foto" : "Pôr uma foto";

  async function enviar(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo || !arquivo.type.startsWith("image/")) return;
    setEnviando(true);
    setErro(null);
    try {
      // logo: sem cortar (fica inteiro no quadro branco); foto de pessoa: quadrada
      const imagem = await reduzirImagem(arquivo, 320, !empresa);
      const caminho = `${pessoaId}/${Date.now()}.jpg`;
      const { error } = await criarClienteNavegador()
        .storage.from("avatars")
        .upload(caminho, imagem, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
      if (error) throw error;
      const r = await trocarFotoPeloTopo(caminho);
      if (!r.ok) {
        if (r.ir) router.push(r.ir);
        throw new Error(r.erro);
      }
      setFoto(caminho);
      router.refresh();
    } catch {
      setErro("Não deu para trocar. Tente outra imagem.");
    } finally {
      setEnviando(false);
    }
  }

  const imagem = (
    <span className="flex" style={{ borderRadius: raio + 4 }}>
      <Avatar nome={nome} foto={foto} tamanho={tamanho} forma={empresa ? "quadrada" : "redonda"} colorida />
    </span>
  );
  const camera = (
    <span
      className={`absolute grid place-items-center rounded-pill bg-surface-200 text-ink shadow-[0_0_0_1px_var(--pk-line),0_1px_3px_rgb(31_26_20/0.15)] group-hover:bg-surface-300 ${
        tamanho < 56 ? "-right-1.5 -bottom-1.5 size-[22px]" : "-right-1.5 -bottom-1.5 size-[28px]"
      }`}
    >
      <Camera aria-hidden className={tamanho < 56 ? "size-3" : "size-[15px]"} />
    </span>
  );
  // inline-flex: dentro de uma linha (o campo do recado) a câmera fica no canto do quadro; com a moldura
  // em linha (label), o Safari prendia a câmera no começo da linha, fora do quadro
  const moldura = `group relative inline-flex ${className} ${enviando ? "opacity-70" : ""}`;

  return (
    <>
      {podeTrocar ? (
        <label
          className={`${moldura} cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus`}
          style={{ borderRadius: raio + 4 }}
          title={rotulo}
        >
          {imagem}
          {camera}
          <span className="sr-only">{rotulo}</span>
          <input type="file" accept="image/*" onChange={enviar} disabled={enviando} className="sr-only" />
        </label>
      ) : (
        <Link href="/perfil#foto" className={moldura} style={{ borderRadius: raio + 4 }} title={rotulo}>
          {imagem}
          {camera}
          <span className="sr-only">{rotulo} no perfil</span>
        </Link>
      )}
      {erro && (
        <p role="alert" className="-mt-1 text-body-sm text-danger">
          {erro}
        </p>
      )}
    </>
  );
}
