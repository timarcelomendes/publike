"use client";

import { Camera } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { trocarFotoPeloTopo } from "@/lib/acoes/home";
import { reduzirImagem } from "@/lib/reduzir-imagem";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { Avatar } from "../ui/basicos";

const TAMANHO = 64;

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
}: {
  nome: string;
  foto: string | null;
  empresa: boolean;
  /** a pasta da foto (a pessoa logada) */
  pessoaId: string;
  /** a conta é da própria pessoa (não de uma agência pela qual ela age) */
  podeTrocar: boolean;
}) {
  const router = useRouter();
  const [foto, setFoto] = useState(inicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const raio = empresa ? Math.round(TAMANHO * 0.28) : 999;
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
    <span className="block" style={{ borderRadius: raio + 4 }}>
      <Avatar nome={nome} foto={foto} tamanho={TAMANHO} forma={empresa ? "quadrada" : "redonda"} colorida />
    </span>
  );
  const camera = (
    <span className="absolute -right-1.5 -bottom-1.5 grid size-[28px] place-items-center rounded-pill bg-surface-200 text-ink shadow-[0_0_0_2px_var(--pk-line)] group-hover:bg-surface-300">
      <Camera aria-hidden className="size-[15px]" />
    </span>
  );
  const moldura = `group relative -mt-8 self-start bg-surface-200 p-1 ${enviando ? "opacity-70" : ""}`;

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
