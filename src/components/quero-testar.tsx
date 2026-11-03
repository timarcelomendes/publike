"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { queroTestarApp } from "@/lib/acoes/quero-testar";
import { Botao } from "./ui/botao";
import { classesEntrada } from "./ui/campo";
import { useAcao } from "./ui/usar-acao";

/**
 * "Quero testar" (o teste fechado pela lista de e-mails): quem tem conta põe o e-mail da Play Store e recebe o
 * link no WhatsApp, mandado pela equipe. Sem conta, o botão leva a entrar e volta aqui.
 */
export function QueroTestar() {
  const [email, setEmail] = useState("");
  const [feito, setFeito] = useState(false);
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        rodar(
          () => queroTestarApp(email),
          (r) => r.ok && setFeito(true),
        );
      }}
    >
      <label htmlFor="email-play" className="text-label">
        O e-mail da conta Google do seu celular
      </label>
      <p className="-mt-2 text-body-sm text-ink-muted">
        É o que aparece na Play Store (toque na sua foto, no alto). Com outro e-mail, o teste não aparece para você.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          id="email-play"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@gmail.com"
          disabled={feito}
          className={`${classesEntrada} max-w-sm`}
        />
        <Botao type="submit" disabled={pendente || feito || !email.trim()}>
          <Send aria-hidden />
          Quero testar
        </Botao>
      </div>
      {mensagem}
    </form>
  );
}
