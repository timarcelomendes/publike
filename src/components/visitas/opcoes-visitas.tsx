"use client";

import { BellRing, EyeOff } from "lucide-react";
import { useState } from "react";
import { mudarOpcoesDeVisitas } from "@/lib/acoes/visitas";
import { Opcao } from "../visibilidade-curriculo";
import { useAcao } from "../ui/usar-acao";

/**
 * As opções de "Quem viu seu perfil": o aviso no sino e, para pessoa, navegar sem aparecer (como no
 * LinkedIn: quem esconde as próprias visitas também não vê o nome das pessoas que a visitaram).
 */
export function OpcoesVisitas({
  avisar: avisarInicial,
  semAparecer: semAparecerInicial,
  pessoa,
}: {
  avisar: boolean;
  semAparecer: boolean;
  pessoa: boolean;
}) {
  const acao = useAcao();
  const [avisar, setAvisar] = useState(avisarInicial);
  const [semAparecer, setSemAparecer] = useState(semAparecerInicial);

  function mudar(novoAvisar: boolean, novoSem: boolean, texto: string) {
    acao.rodar(
      async () => {
        const r = await mudarOpcoesDeVisitas(novoAvisar, novoSem);
        return r.ok ? { ok: true, mensagem: texto } : r;
      },
      (r) => {
        if (!r.ok) return;
        setAvisar(novoAvisar);
        setSemAparecer(novoSem);
      },
    );
  }

  return (
    <section
      id="opcoes"
      aria-labelledby="opcoes-titulo"
      className="flex scroll-mt-24 flex-col gap-5 rounded-lg border border-line bg-surface-200 p-4 sm:p-5"
    >
      <h3 id="opcoes-titulo" className="sr-only">
        Opções
      </h3>
      <Opcao
        id="opcao-avisar"
        nivel={3}
        icone={BellRing}
        titulo="Avisar quando alguém ver meu perfil"
        ligado={avisar}
        pendente={acao.pendente}
        aoMudar={() =>
          mudar(
            !avisar,
            semAparecer,
            avisar ? "Pronto: sem avisos de visita no sino." : "Pronto: as visitas voltam a avisar no sino.",
          )
        }
      >
        {pessoa
          ? "Um aviso no sino quando uma empresa vê seu perfil, seu currículo ou sua candidatura, e um resumo por dia das outras visitas. Não manda e-mail."
          : "Um resumo por dia no sino com as visitas da sua página. Não manda e-mail."}
      </Opcao>
      {pessoa && (
        <div className="border-t border-line pt-5">
          <Opcao
            id="opcao-sem-aparecer"
            nivel={3}
            icone={EyeOff}
            titulo="Navegar sem aparecer"
            ligado={semAparecer}
            pendente={acao.pendente}
            aoMudar={() =>
              mudar(
                avisar,
                !semAparecer,
                semAparecer
                  ? "Pronto: quem você visita volta a ver seu nome."
                  : "Pronto: agora você navega sem aparecer.",
              )
            }
          >
            Quem você visita vê só que alguém preferiu não aparecer. Em troca, você também não vê o nome das pessoas que
            viram seu perfil (só quantas foram). Empresas, comércios e agências aparecem sempre.
          </Opcao>
        </div>
      )}
      {acao.mensagem}
    </section>
  );
}
