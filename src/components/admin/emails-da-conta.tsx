"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { enviarEmailParaConta } from "@/lib/acoes/admin-contas";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada, Seletor } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";
import { PRACA_PADRAO } from "@/lib/pracas";

export type ModeloParaEnviar = { chave: string; nome: string; descricao: string; variaveis: string[] };

// Nomes das variáveis que o admin preenche (nome e link o site põe sozinho).
const VARIAVEIS: Record<string, { rotulo: string; exemplo: string }> = {
  titulo: { rotulo: "Título do anúncio", exemplo: "Auxiliar de cozinha para a noite" },
  quem: { rotulo: "Nome da outra pessoa", exemplo: "Bruno Silva" },
  motivo: { rotulo: "Motivo ou explicação", exemplo: "O anúncio pedia pagamento para a pessoa se cadastrar." },
  ate: { rotulo: "Até quando", exemplo: "15/10/2026 às 14:30" },
  total: { rotulo: "Quantidade", exemplo: "2" },
  tipo: { rotulo: "Tipo", exemplo: "comércio" },
  cidade: { rotulo: "Cidade", exemplo: PRACA_PADRAO.cidade },
  origem: { rotulo: "Origem", exemplo: "o anúncio recebeu denúncias de três pessoas diferentes." },
  quando: { rotulo: "Quando", exemplo: "08/10/2026 às 13:00" },
};
const AUTOMATICAS = new Set(["nome", "link"]);
// Para onde o botão leva, quando não é a página padrão do tipo de conta.
const CAMINHOS: Record<string, string> = { boas_vindas_prestador: "/painel/servicos" };

/** Mandar qualquer modelo de e-mail para a conta, na hora (mesmo com os avisos desligados). */
export function EnviarEmailParaConta({
  usuarioId,
  modelos,
  sugerido,
}: {
  usuarioId: string;
  modelos: ModeloParaEnviar[];
  /** O modelo que já vem escolhido (as boas-vindas do perfil da conta). */
  sugerido: string;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [modelo, setModelo] = useState(
    modelos.some((m) => m.chave === sugerido) ? sugerido : (modelos[0]?.chave ?? ""),
  );
  const [valores, setValores] = useState<Record<string, string>>({});
  const atual = modelos.find((m) => m.chave === modelo);
  const campos = (atual?.variaveis ?? []).filter((v) => !AUTOMATICAS.has(v));

  if (!modelos.length)
    return <p className="text-body-sm text-ink-muted">Nenhum modelo de e-mail para quem usa o site.</p>;

  return (
    <div className="flex flex-col gap-4">
      <Campo rotulo="Modelo" nome="modelo-email" ajuda={atual?.descricao}>
        <Seletor
          id="modelo-email"
          aria-describedby="modelo-email-ajuda"
          value={modelo}
          onChange={(e) => setModelo(e.target.value)}
          className={classesEntrada}
        >
          {modelos.map((m) => (
            <option key={m.chave} value={m.chave}>
              {m.nome}
            </option>
          ))}
        </Seletor>
      </Campo>

      {campos.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {campos.map((v) => (
            <Campo key={`${modelo}-${v}`} rotulo={VARIAVEIS[v]?.rotulo ?? v} nome={`variavel-${v}`} opcional>
              <input
                id={`variavel-${v}`}
                value={valores[v] ?? ""}
                onChange={(e) => setValores((atuais) => ({ ...atuais, [v]: e.target.value }))}
                maxLength={500}
                placeholder={VARIAVEIS[v] ? `Ex.: ${VARIAVEIS[v].exemplo}` : undefined}
                className={classesEntrada}
              />
            </Campo>
          ))}
        </div>
      )}

      <div className="flex flex-col items-start gap-2">
        <Botao
          disabled={pendente || !modelo}
          onClick={() => {
            const dados: Record<string, string> = Object.fromEntries(
              campos.map((v) => [v, (valores[v] ?? "").trim()]).filter(([, t]) => t),
            );
            if (CAMINHOS[modelo]) dados.caminho = CAMINHOS[modelo];
            rodar(() => enviarEmailParaConta(usuarioId, modelo, dados));
          }}
        >
          <Send aria-hidden />
          {pendente ? "Enviando…" : "Enviar agora"}
        </Botao>
        {mensagem}
        <p className="text-body-sm text-ink-muted">
          Vai na hora para o e-mail de login (ou o de contato, se a conta entra pelo celular), mesmo que a pessoa tenha
          desligado os avisos. Parágrafo com campo vazio não aparece no e-mail.
        </p>
      </div>
    </div>
  );
}
