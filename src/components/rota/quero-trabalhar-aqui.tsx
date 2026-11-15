"use client";

import { Check, MessageCircle, Navigation, Phone } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { demonstrarInteresse, type ContatoDoLugar } from "@/lib/acoes/interesse-local";

const BOTAO =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors disabled:opacity-60";

/**
 * "Quero trabalhar aqui" (migração 20270615120000): a empresa que já está no Publike recebe o aviso com o currículo;
 * a que não está mostra o WhatsApp (se o telefone da Receita for celular), o Ligar e o Traçar rota.
 */
export function QueroTrabalharAqui({ cnpj, nome, funcao }: { cnpj: string; nome: string; funcao?: string | null }) {
  const [resposta, setResposta] = useState<{ avisada: boolean; contato: ContatoDoLugar | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams().toString();

  function querer() {
    setErro(null);
    iniciar(async () => {
      const r = await demonstrarInteresse(cnpj);
      if (r.ok) return setResposta({ avisada: r.avisada, contato: r.contato });
      if (r.entrar) {
        router.push(`/entrar?next=${encodeURIComponent(busca ? `${caminho}?${busca}` : caminho)}`);
        return;
      }
      setErro(r.erro);
    });
  }

  if (!resposta) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={querer}
          disabled={pendente}
          className={`${BOTAO} border-ink bg-ink text-surface-100 hover:opacity-90`}
        >
          {pendente ? "Enviando…" : "Quero trabalhar aqui"}
        </button>
        {erro && (
          <span role="alert" className="text-body-sm text-danger">
            {erro}
          </span>
        )}
      </div>
    );
  }

  const c = resposta.contato;
  const rota =
    c?.lat != null && c?.lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`
      : c?.endereco
        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.endereco)}`
        : null;
  const texto = `Olá! Moro aqui perto e gostaria de trabalhar na ${nome}${funcao ? ` como ${funcao.toLowerCase()}` : ""}. Posso deixar o meu currículo?`;

  return (
    <div role="status" className="flex flex-col gap-2 text-body-sm">
      {resposta.avisada ? (
        <p className="inline-flex items-start gap-1.5 text-cerrado-text">
          <Check aria-hidden className="mt-0.5 size-4 shrink-0" />
          Pronto! A {nome} está no Publike e recebeu o seu currículo. Se tiver vaga, ela chama você.
        </p>
      ) : (
        <p className="text-ink">
          A {nome} ainda não está no Publike. Fale direto com eles
          {c?.telefone ? " (o telefone é o da Receita: pode ser do contador)" : ""}:
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!resposta.avisada && c?.telefone && c.celular && (
          <a
            href={`https://wa.me/55${c.telefone}?text=${encodeURIComponent(texto)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BOTAO} border-line-strong bg-surface-200 text-ink hover:bg-surface-300`}
          >
            <MessageCircle aria-hidden className="size-4" />
            Chamar no WhatsApp
          </a>
        )}
        {!resposta.avisada && c?.telefone && (
          <a href={`tel:+55${c.telefone}`} className={`${BOTAO} border-line-strong bg-surface-200 text-ink hover:bg-surface-300`}>
            <Phone aria-hidden className="size-4" />
            Ligar
          </a>
        )}
        {rota && (
          <a
            href={rota}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BOTAO} border-line-strong bg-surface-200 text-ink hover:bg-surface-300`}
          >
            <Navigation aria-hidden className="size-4" />
            Traçar rota
          </a>
        )}
      </div>
    </div>
  );
}
