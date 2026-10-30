"use client";

import { Check, Copy, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Botao } from "../ui/botao";

/** O Pix da fatura: o QR, o copia e cola e, enquanto a tela está aberta, a espera pelo pagamento. */
export function PixDaFatura({ id, imagem, codigo }: { id: string; imagem: string; codigo: string }) {
  const router = useRouter();
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let parar = false;
    const olhar = async () => {
      if (parar || document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/pagamentos/situacao?id=${id}`, { cache: "no-store" });
        const { situacao } = (await r.json()) as { situacao: string | null };
        if (situacao === "paga") {
          parar = true;
          router.refresh();
        }
      } catch {
        // a internet falhou: tenta de novo na próxima volta
      }
    };
    const t = setInterval(olhar, 4000);
    return () => {
      parar = true;
      clearInterval(t);
    };
  }, [id, router]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      (document.getElementById("pix-codigo") as HTMLTextAreaElement | null)?.select();
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      {/* eslint-disable-next-line @next/next/no-img-element -- o QR vem como imagem pronta (data:) */}
      <img
        src={imagem}
        alt="QR Code do Pix"
        width={208}
        height={208}
        className="size-52 shrink-0 rounded-md border border-line bg-white p-2"
      />
      <div className="flex w-full min-w-0 flex-col gap-3">
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-body-sm">
          <li>Abra o app do seu banco e escolha pagar com Pix.</li>
          <li>Leia o QR Code ou cole o código abaixo.</li>
          <li>Pronto: esta tela muda sozinha quando o pagamento chegar.</li>
        </ol>
        <label htmlFor="pix-codigo" className="sr-only">
          Código Pix copia e cola
        </label>
        <textarea
          id="pix-codigo"
          readOnly
          value={codigo}
          rows={3}
          className="w-full resize-none rounded-sm border border-line-strong bg-surface-300 p-2 font-mono text-caption break-all text-ink"
        />
        <Botao variante="primario" onClick={copiar} className="self-start">
          {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copiado ? "Código copiado" : "Copiar o código Pix"}
        </Botao>
        <p className="flex items-center gap-2 text-body-sm text-ink-muted" role="status">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          Esperando o pagamento
        </p>
      </div>
    </div>
  );
}
