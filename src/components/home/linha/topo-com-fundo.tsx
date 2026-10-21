"use client";

import { Camera, Check, ImageIcon, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { escolherFundo, salvarFotoDoFundo, trocarFotoPeloTopo } from "@/lib/acoes/home";
import { FUNDO_LARGURA, FUNDO_MAX_BYTES, FUNDOS, type Fundo } from "@/lib/fundos";
import { reduzirImagem as reduzir } from "@/lib/reduzir-imagem";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { Avatar } from "../../ui/basicos";

/**
 * O topo da home com o fundo que a pessoa escolhe (preto, uma imagem pronta ou uma foto dela) e a
 * foto do perfil, que dá para trocar ali mesmo. Só a pessoa vê o fundo. Com imagem, uma camada
 * escura por cima deixa o texto legível com qualquer foto.
 */
export function TopoComFundo({
  fundo: fundoInicial,
  urlDaFoto,
  pessoaId,
  nome,
  foto: fotoInicial,
  texto,
  lado,
  embaixo,
}: {
  fundo: Fundo;
  /** a foto enviada para o fundo (link assinado), quando o fundo é "foto" */
  urlDaFoto: string | null;
  pessoaId: string;
  nome: string;
  foto: string | null;
  texto: ReactNode;
  lado: ReactNode;
  embaixo: ReactNode;
}) {
  const router = useRouter();
  const [fundo, setFundo] = useState<Fundo>(fundoInicial);
  const [minhaFoto, setMinhaFoto] = useState<string | null>(urlDaFoto);
  const [foto, setFoto] = useState(fotoInicial);
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState<"fundo" | "foto" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const id = useId();
  const quadro = useRef<HTMLDivElement>(null);

  // Esc e um toque fora fecham o quadro
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    const fora = (e: PointerEvent) => {
      if (quadro.current && !quadro.current.contains(e.target as Node)) setAberto(false);
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener("pointerdown", fora);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("pointerdown", fora);
    };
  }, [aberto]);

  const opcao = FUNDOS.find((f) => f.valor === fundo);
  const comImagem = fundo === "foto" ? Boolean(minhaFoto) : Boolean(opcao?.imagem);
  const estilo =
    fundo === "foto" && minhaFoto
      ? { backgroundImage: `url(${minhaFoto})`, backgroundSize: "cover", backgroundPosition: "center" }
      : { backgroundPosition: "center", ...(opcao?.estilo ?? {}) };

  async function escolher(valor: Fundo) {
    if (valor === fundo) return;
    const antes = fundo;
    setFundo(valor);
    setErro(null);
    if (valor === "foto") return;
    const r = await escolherFundo(valor);
    if (!r.ok) {
      setFundo(antes);
      setErro(r.erro);
    } else {
      setMinhaFoto(null);
    }
  }

  async function enviarFundo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) return setErro("Escolha uma imagem (JPG ou PNG).");
    if (arquivo.size > FUNDO_MAX_BYTES) return setErro("A foto passa de 5 MB. Escolha outra.");
    setEnviando("fundo");
    setErro(null);
    try {
      const imagem = await reduzir(arquivo, FUNDO_LARGURA);
      const caminho = `${pessoaId}/${Date.now()}.jpg`;
      const supabase = criarClienteNavegador();
      const { error } = await supabase.storage
        .from("fundos")
        .upload(caminho, imagem, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      const r = await salvarFotoDoFundo(caminho);
      if (!r.ok) throw new Error(r.erro);
      setMinhaFoto(URL.createObjectURL(imagem));
      setFundo("foto");
    } catch {
      setErro("Não foi possível enviar a foto. Tente outra imagem.");
    } finally {
      setEnviando(null);
    }
  }

  async function enviarFotoDoPerfil(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) return;
    setEnviando("foto");
    try {
      const imagem = await reduzir(arquivo, 320, true);
      const caminho = `${pessoaId}/${Date.now()}.jpg`;
      const supabase = criarClienteNavegador();
      const { error } = await supabase.storage
        .from("avatars")
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
      setErro("Não foi possível trocar a foto. Tente outra imagem.");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <section
      aria-label="Sua conta"
      style={estilo}
      className={`relative isolate rounded-t-[22px] bg-hero px-4 pt-5 text-on-hero sm:rounded-t-[28px] sm:px-12 sm:pt-16 ${
        comImagem
          ? "before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-[rgb(23_19_15/0.4)]"
          : ""
      } ${aberto ? "z-[60]" : ""}`}
    >
      {/* Editar fundo: no canto (no celular, só o ícone) */}
      <div ref={quadro} className="absolute top-3.5 right-3.5 z-10 sm:top-4 sm:right-4">
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={id}
          onClick={() => setAberto((a) => !a)}
          className="inline-flex size-10 items-center justify-center gap-2 rounded-pill border border-[rgb(251_247_239/0.24)] bg-[rgb(23_19_15/0.55)] text-[14px] font-semibold text-on-hero backdrop-blur-md hover:bg-[rgb(23_19_15/0.7)] sm:size-auto sm:h-9 sm:px-3.5"
        >
          <ImageIcon aria-hidden className="size-[18px] sm:size-4" />
          <span className="sr-only sm:not-sr-only">Editar fundo</span>
        </button>
        {aberto && (
          <>
            {/* no celular, a folha sobe de baixo com um véu atrás */}
            <div aria-hidden className="fixed inset-0 z-40 bg-veu sm:hidden" />
            <div
              id={id}
              role="dialog"
              aria-label="Fundo do topo"
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] bg-surface-200 px-4 pt-2.5 pb-[max(24px,env(safe-area-inset-bottom))] text-ink shadow-raised sm:absolute sm:inset-x-auto sm:top-11 sm:right-0 sm:bottom-auto sm:w-[424px] sm:rounded-lg sm:border sm:border-line sm:px-[18px] sm:pt-[18px] sm:pb-4"
            >
              <span aria-hidden className="mx-auto mb-2.5 block h-[5px] w-10 rounded-pill bg-line sm:hidden" />
              <div className="flex items-center justify-between">
                <h2 className="font-display text-h3 sm:text-[20px] sm:leading-[26px]">Fundo do topo</h2>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="grid size-9 place-items-center rounded-pill text-ink-muted hover:bg-surface-300"
                >
                  <X aria-hidden className="size-5" />
                  <span className="sr-only">Fechar</span>
                </button>
              </div>
              <p className="text-body-sm text-ink-muted">Escolha uma imagem ou envie uma foto sua. Só você vê.</p>
              <div role="radiogroup" aria-label="Fundos" className="mt-3.5 grid grid-cols-3 gap-x-2.5 gap-y-3">
                {FUNDOS.map((f) => (
                  <button
                    key={f.valor}
                    type="button"
                    role="radio"
                    aria-checked={fundo === f.valor}
                    onClick={() => escolher(f.valor)}
                    className="grid gap-1.5 text-left text-[13px] leading-4 font-semibold"
                  >
                    <span
                      className={`relative block h-[72px] rounded-md bg-center sm:h-16 ${
                        fundo === f.valor
                          ? "shadow-[0_0_0_2px_var(--pk-surface-200),0_0_0_4px_var(--pk-ink)]"
                          : "shadow-[inset_0_0_0_1px_rgb(31_26_20/0.12)]"
                      }`}
                      style={f.mini}
                    >
                      {fundo === f.valor && (
                        <span className="absolute top-1.5 right-1.5 grid size-[22px] place-items-center rounded-pill bg-ink text-surface-100">
                          <Check aria-hidden className="size-3.5" strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    {f.nome}
                  </button>
                ))}
                {minhaFoto && (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={fundo === "foto"}
                    onClick={() => setFundo("foto")}
                    className="grid gap-1.5 text-left text-[13px] leading-4 font-semibold"
                  >
                    <span
                      className={`relative block h-[72px] rounded-md bg-cover bg-center sm:h-16 ${
                        fundo === "foto" ? "shadow-[0_0_0_2px_var(--pk-surface-200),0_0_0_4px_var(--pk-ink)]" : ""
                      }`}
                      style={{ backgroundImage: `url(${minhaFoto})` }}
                    />
                    Sua foto
                  </button>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2.5 border-t border-line pt-3.5">
                <label
                  className={`inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-line-strong bg-surface-200 px-4 text-label whitespace-nowrap hover:bg-surface-300 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus sm:min-h-10 sm:flex-initial ${
                    enviando === "fundo" ? "opacity-60" : ""
                  }`}
                >
                  <Upload aria-hidden className="size-[17px]" />
                  {enviando === "fundo" ? "Enviando…" : "Enviar uma foto"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={enviarFundo}
                    disabled={enviando !== null}
                    className="sr-only"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="inline-flex min-h-12 items-center rounded-md bg-ink px-[18px] text-label font-bold text-surface-100 sm:ml-auto sm:min-h-10"
                >
                  Pronto
                </button>
                <p className="order-3 w-full text-center text-body-sm text-ink-muted sm:text-left">
                  JPG, PNG ou WebP, até 5 MB
                </p>
                {erro && (
                  <p role="alert" className="order-4 w-full text-body-sm text-danger">
                    {erro}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-10">
        <div className="flex min-w-0 items-center gap-3.5 pr-12 sm:gap-6 sm:pr-0">
          <label
            className={`group relative shrink-0 cursor-pointer rounded-pill shadow-[0_0_0_3px_var(--pk-surface-100)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-focus sm:shadow-[0_0_0_4px_var(--pk-surface-100)] ${
              enviando === "foto" ? "opacity-70" : ""
            }`}
          >
            <span className="sm:hidden">
              <Avatar nome={nome || "?"} foto={foto} tamanho={60} />
            </span>
            <span className="hidden sm:block">
              <Avatar nome={nome || "?"} foto={foto} tamanho={96} />
            </span>
            <span className="absolute -right-1.5 -bottom-1.5 grid size-[26px] place-items-center rounded-pill bg-surface-200 text-ink shadow-[0_0_0_2px_var(--pk-hero)] group-hover:bg-surface-300 sm:-right-1 sm:-bottom-1 sm:size-[34px] sm:shadow-[0_0_0_3px_var(--pk-hero)]">
              <Camera aria-hidden className="size-[13px] sm:size-4" />
            </span>
            <span className="sr-only">{foto ? "Trocar foto" : "Adicionar foto"}</span>
            <input
              type="file"
              accept="image/*"
              onChange={enviarFotoDoPerfil}
              disabled={enviando !== null}
              className="sr-only"
            />
          </label>
          <div className="min-w-0">{texto}</div>
        </div>
        {lado}
      </div>
      {erro && !aberto && (
        <p role="alert" className="mt-3 text-body-sm text-on-hero">
          {erro}
        </p>
      )}
      {embaixo}
    </section>
  );
}
