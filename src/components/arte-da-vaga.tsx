"use client";

import { ImageUp, LoaderCircle } from "lucide-react";
import { useId, useState } from "react";
import { lerArteDaVaga } from "@/lib/acoes/arte-vaga";
import { ErroDaLeitura, fotosParaLeitura } from "@/lib/arquivo-curriculo";
import type { RascunhoConvite } from "@/lib/convites";
import { MensagemErro } from "./ui/campo";

/**
 * "Tem a arte da vaga?": a foto do anúncio (a arte postada numa rede social) vira a vaga
 * preenchida. Quem chama põe o que foi lido no formulário; a pessoa confere e publica.
 */
export function ArteDaVaga({ aoLer }: { aoLer: (vaga: RascunhoConvite) => void }) {
  const id = useId();
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setErro(null);
    if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) return setErro("Escolha uma imagem (JPG ou PNG).");
    setLendo(true);
    try {
      const [foto] = await fotosParaLeitura([arquivo]);
      const dados = new FormData();
      dados.append("foto", new File([foto], "arte.jpg", { type: "image/jpeg" }));
      dados.append("nome", arquivo.name.slice(0, 120));
      const r = await lerArteDaVaga(dados);
      if (!r.ok) return setErro(r.erro);
      aoLer(r.vaga);
    } catch (falha) {
      setErro(falha instanceof ErroDaLeitura ? falha.message : "Não deu para ler a imagem agora. Tente de novo.");
    } finally {
      setLendo(false);
    }
  }

  return (
    <section
      id="arte"
      aria-labelledby={`${id}-titulo`}
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:flex-row sm:items-center sm:p-5"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-ipe text-on-ipe">
        <ImageUp aria-hidden className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id={`${id}-titulo`} className="text-h3">
          Tem a arte da vaga? Mande a foto.
        </h2>
        <p className="text-body-sm text-ink-muted">
          O Publike lê a imagem e preenche a vaga. Você só confere antes de publicar.
        </p>
        {erro && (
          <div className="mt-2">
            <MensagemErro>{erro}</MensagemErro>
          </div>
        )}
      </div>
      <label
        className={`inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 self-start rounded-md border border-line-strong bg-surface-200 px-4 text-label hover:bg-surface-300 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus sm:self-center ${
          lendo ? "pointer-events-none opacity-70" : ""
        }`}
      >
        {lendo ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
        ) : (
          <ImageUp aria-hidden className="size-4" />
        )}
        {lendo ? "Lendo a imagem…" : "Escolher a imagem"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={escolher}
          disabled={lendo}
          className="sr-only"
          aria-label="Imagem da vaga"
        />
      </label>
    </section>
  );
}
