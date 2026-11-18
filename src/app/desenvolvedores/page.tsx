import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import type { ReactNode } from "react";
import { Lista, Secao } from "@/components/documentos-legais";
import { BotaoLink } from "@/components/ui/botao";
import { Container } from "@/components/ui/basicos";
import { CAMINHO_API, CAMINHO_CHAVES, ETAPAS_API, SITUACOES_API } from "@/lib/api-publica";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { ETAPAS_CANDIDATO } from "@/lib/constantes";
import { formatarNumero } from "@/lib/formato";
import { MOTIVOS_SAIDA } from "@/lib/processo";
import { criarClientePublico } from "@/lib/supabase/servidor";

// A documentação da API pública (src/lib/servidor/api-publica.ts; migração 20270713120000_api_publica.sql), para quem
// cuida do CRM ou do sistema de recrutamento de quem contrata pelo Publike (17/11/2026: uma agência pediu). Os limites
// vêm do banco (privado.config_api), guardados por uma hora.

export const metadata: Metadata = {
  title: "API do Publike para desenvolvedores",
  description:
    "Receba os candidatos das suas vagas no seu CRM ou sistema de recrutamento e mude a etapa deles pela API do Publike.",
  alternates: { canonical: "/desenvolvedores" },
};

const BASE = `${SITE_URL}${CAMINHO_API}`;

async function limitesDaApi(): Promise<{ limite_gratis: number; limite_plano: number } | null> {
  "use cache";
  cacheLife("hours");
  if (MODO_DEMO) return null;
  try {
    const { data, error } = await criarClientePublico().rpc("limites_da_api");
    if (error || !data || typeof data !== "object") return null;
    const d = data as { limite_gratis?: unknown; limite_plano?: unknown };
    return typeof d.limite_gratis === "number" && typeof d.limite_plano === "number"
      ? { limite_gratis: d.limite_gratis, limite_plano: d.limite_plano }
      : null;
  } catch {
    return null;
  }
}

function Codigo({ children, rotulo }: { children: string; rotulo?: string }) {
  return (
    <figure className="flex min-w-0 flex-col gap-1">
      {rotulo && <figcaption className="text-caption text-ink-muted">{rotulo}</figcaption>}
      <pre className="overflow-x-auto rounded-md bg-surface-300 px-4 py-3 font-mono text-[13px] leading-5 text-ink">
        <code>{children}</code>
      </pre>
    </figure>
  );
}

const C = ({ children }: { children: ReactNode }) => (
  <code className="rounded-sm bg-surface-300 px-1 py-0.5 font-mono text-[0.9em] break-words">{children}</code>
);

function Endereco({
  id,
  metodo,
  caminho,
  titulo,
  children,
}: {
  id: string;
  metodo: "GET" | "POST" | "PUT";
  caminho: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="flex scroll-mt-24 flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-2 font-mono text-[13px] break-all">
          <span
            className={`rounded-sm px-1.5 py-0.5 font-sans text-caption font-bold ${metodo === "GET" ? "bg-surface-300 text-ink" : "bg-terra text-on-terra"}`}
          >
            {metodo}
          </span>
          {caminho}
        </p>
        <h3 id={`${id}-titulo`} className="text-h3">
          {titulo}
        </h3>
      </div>
      <div className="flex min-w-0 flex-col gap-3 text-body">{children}</div>
    </section>
  );
}

const EXEMPLO_CANDIDATURA = `{
  "vaga": {
    "id": "8f0c2a1e-5b7d-4c3a-9e21-6a4b8d2f1c90",
    "titulo": "Auxiliar de cozinha",
    "status": "ativo"
  },
  "candidato": {
    "id": "2d9e4b7a-1c3f-4e8a-b5d6-0f7a9c8e3b21",
    "nome": "Ana Souza",
    "foto": "https://…/avatars/2d9e4b7a-…/foto.jpg",
    "cidade": "Goiânia",
    "bairro": "Setor Bueno",
    "verificado": false,
    "whatsapp": "5562999990000",
    "email": "ana@exemplo.com"
  },
  "situacao": "aceita",
  "etapa": "entrevista",
  "etapa_nome": "Entrevista",
  "mensagem": "Tenho experiência em cozinha industrial.",
  "tem_curriculo": true,
  "candidatou_em": "2026-11-17T09:12:30.512-03:00",
  "respondida_em": "2026-11-17T10:40:02.118-03:00",
  "etapa_em": "2026-11-17T11:05:47.900-03:00",
  "atualizada_em": "2026-11-17T11:05:47.900-03:00",
  "link": "${SITE_URL}/painel/anuncio/8f0c2a1e-…/quadro?candidato=2d9e4b7a-…"
}`;

const ENDERECOS = [
  ["GET /", "A conta da chave, o limite e o uso de hoje"],
  ["GET /vagas", "As vagas da conta"],
  ["GET /candidaturas", "As candidaturas que mudaram, em páginas"],
  ["GET /vagas/{vaga}/candidaturas", "As candidaturas de uma vaga"],
  ["GET /vagas/{vaga}/candidaturas/{candidato}", "Uma candidatura, com o currículo e as respostas"],
  ["POST /vagas/{vaga}/candidaturas/{candidato}/aceitar", "Aceitar (dar match)"],
  ["POST /vagas/{vaga}/candidaturas/{candidato}/dispensar", "Dispensar"],
  ["PUT /vagas/{vaga}/candidaturas/{candidato}/etapa", "Mudar a etapa"],
] as const;

const ERROS = [
  [
    "400",
    "pedido_invalido, json_invalido, etapa_invalida, motivo_invalido, desde_invalido, cursor_invalido",
    "O pedido veio com algo fora do formato. A mensagem diz o quê.",
  ],
  ["401", "sem_chave, chave_invalida", "Faltou a chave, ela está errada ou foi apagada."],
  ["403", "conta_bloqueada", "A conta está suspensa ou deixou de ser uma conta que contrata."],
  ["404", "nao_encontrada, nao_encontrado", "A vaga ou a candidatura não é da conta, ou o endereço não existe."],
  [
    "409",
    "etapa_sem_match, match_feito, match_desfeito, falta_contato, motivo_saida, com_moderacao, bloqueado",
    "A regra do Publike não deixa, como no site. A mensagem diz por quê.",
  ],
  ["429", "limite, limite_etapa", "Passou do limite do dia."],
  ["500, 503", "erro_interno, indisponivel, api_desligada", "Problema do nosso lado: tente de novo em alguns minutos."],
] as const;

export default async function Desenvolvedores() {
  const limites = await limitesDaApi();
  const nomeEtapa = (e: string) => ETAPAS_CANDIDATO[e as keyof typeof ETAPAS_CANDIDATO]?.nome ?? e;
  return (
    <Container className="max-w-3xl py-10">
      <h1 className="text-h1">API do Publike</h1>
      <p className="mt-3 text-body-lg text-ink-muted">
        Para o CRM ou o sistema de recrutamento de quem contrata pelo Publike: receber os candidatos das suas vagas e
        mudar a etapa deles (aceitar, dispensar, Em análise, Entrevista, Contratado) sem digitar no site. O candidato
        recebe os mesmos avisos de quando a empresa faz pelo Publike.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <BotaoLink href={CAMINHO_CHAVES} variante="primario">
          Criar a chave da API
        </BotaoLink>
        <BotaoLink href="#sincronizar" variante="secundario">
          Como receber os candidatos
        </BotaoLink>
      </div>

      <div className="mt-10 flex flex-col gap-8">
        <Secao id="comecar" titulo="Começar">
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            <li>
              No Publike, quem é dono da conta (ou admin da equipe) cria a chave em{" "}
              <Link href={CAMINHO_CHAVES} className="underline underline-offset-2">
                Configurações › API
              </Link>
              . Ela aparece uma vez só: copie e guarde no seu sistema, como uma senha.
            </li>
            <li>
              Mande a chave em todo pedido, no cabeçalho <C>Authorization: Bearer publike_api_…</C> (ou{" "}
              <C>X-Api-Key</C>). As respostas são JSON, em UTF-8.
            </li>
            <li>Confira se a chave funciona:</li>
          </ol>
          <Codigo>{`curl ${BASE} \\
  -H "Authorization: Bearer $PUBLIKE_CHAVE"`}</Codigo>
          <Codigo rotulo="Resposta">{`{
  "conta": {
    "id": "…",
    "nome": "Agência Exemplo",
    "tipo": "agencia",
    "com_plano": true,
    "limite_por_dia": ${limites ? limites.limite_plano : 20000},
    "usadas_hoje": 1
  }
}`}</Codigo>
          <p>
            A chave vê só as vagas da conta que criou e os candidatos delas. Se ela vazar, apague em Configurações ›
            API e crie outra: a apagada para de funcionar na hora.
          </p>
        </Secao>

        <Secao id="limite" titulo="Limite de uso">
          <Lista
            itens={[
              limites ? (
                <>
                  De graça: <strong>{formatarNumero(limites.limite_gratis)} chamadas por dia</strong> para cada conta. Nos{" "}
                  <Link href="/painel/planos" className="underline underline-offset-2">
                    planos
                  </Link>
                  : <strong>{formatarNumero(limites.limite_plano)} por dia</strong>.
                </>
              ) : (
                <>
                  Cada conta tem um limite de chamadas por dia, maior nos{" "}
                  <Link href="/painel/planos" className="underline underline-offset-2">
                    planos
                  </Link>
                  . O seu aparece em <C>GET {CAMINHO_API}</C> e em Configurações › API.
                </>
              ),
              "O dia vira à meia-noite, no horário de Brasília. Todas as chaves da conta somam no mesmo limite.",
              "Chamada que dá erro não conta.",
              <>
                Acima do limite, a resposta é <C>429</C> com o código <C>limite</C>. Mudar etapa também tem o limite do
                site: 300 mudanças por dia (<C>429</C>, código <C>limite_etapa</C>).
              </>,
            ]}
          />
        </Secao>

        <Secao id="enderecos" titulo="Endereços">
          <p>
            Tudo a partir de <C>{BASE}</C>. Os ids são UUIDs.
          </p>
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {ENDERECOS.map(([pedido, faz]) => (
              <li key={pedido} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
                <code className="font-mono text-[13px] break-all sm:w-[58%] sm:shrink-0">{pedido}</code>
                <span className="text-body-sm text-ink-muted">{faz}</span>
              </li>
            ))}
          </ul>
        </Secao>

        <Endereco id="vagas" metodo="GET" caminho={`${CAMINHO_API}/vagas`} titulo="As vagas da conta">
          <p>
            As 500 vagas mais novas da conta, para ligar cada candidatura à vaga no seu sistema. Com <C>?status=ativo</C>
            , só as que estão no ar (os outros: <C>pausado</C>, <C>encerrado</C>, <C>expirado</C>, <C>em_analise</C> e{" "}
            <C>removido</C>, quando a moderação tirou).
          </p>
          <Codigo rotulo="Resposta">{`{
  "vagas": [
    {
      "id": "8f0c2a1e-…",
      "titulo": "Auxiliar de cozinha",
      "status": "ativo",
      "regime": "clt",
      "cidade": "Goiânia",
      "bairro": "Setor Bueno",
      "contratante": "Restaurante Exemplo",
      "contratante_confidencial": false,
      "criada_em": "2026-11-10T08:00:00-03:00",
      "expira_em": "2026-12-10T08:00:00-03:00",
      "candidaturas": 12,
      "link": "${SITE_URL}/anuncio/8f0c2a1e-…"
    }
  ]
}`}</Codigo>
        </Endereco>

        <Endereco id="candidaturas" metodo="GET" caminho={`${CAMINHO_API}/candidaturas`} titulo="As candidaturas que mudaram">
          <p>
            As candidaturas às vagas da conta, da mudança mais antiga para a mais nova. Uma candidatura muda quando a
            pessoa se candidata, quando é aceita ou dispensada, quando o match é desfeito e quando a etapa muda (pelo
            site ou pela API).
          </p>
          <Lista
            itens={[
              <>
                <C>vaga</C>: só as de uma vaga (o mesmo que <C>{CAMINHO_API}/vagas/{"{vaga}"}/candidaturas</C>).
              </>,
              <>
                <C>desde</C>: só o que mudou depois dessa data e hora (ISO 8601, como <C>2026-11-17T08:00:00-03:00</C>).
              </>,
              <>
                <C>cursor</C>: continua depois da página anterior (o <C>proximo</C> dela).
              </>,
              <>
                <C>limite</C>: quantas por página, de 1 a 100 (padrão 50).
              </>,
            ]}
          />
          <Codigo>{`curl "${BASE}/candidaturas?desde=2026-11-01T00:00:00-03:00&limite=100" \\
  -H "Authorization: Bearer $PUBLIKE_CHAVE"`}</Codigo>
          <Codigo rotulo="Resposta">{`{
  "candidaturas": [ { …uma candidatura… } ],
  "proximo": "MjAyNi0xMS0xN1QxMTowNTo0Ny45LTAzOjAwfDhmMGMy…",
  "mais": false
}`}</Codigo>
          <p>
            <C>mais</C> diz se já há outra página. <C>proximo</C> vem sempre que a página tem alguma candidatura: guarde e
            mande na próxima consulta para receber só o que mudou depois.
          </p>
        </Endereco>

        <Endereco
          id="candidatura"
          metodo="GET"
          caminho={`${CAMINHO_API}/vagas/{vaga}/candidaturas/{candidato}`}
          titulo="Uma candidatura, com o currículo"
        >
          <p>
            A candidatura, mais o currículo do candidato (o mesmo que o painel mostra a quem publicou a vaga) e as
            respostas às perguntas da vaga. O PDF do currículo não vem pela API: <C>tem_pdf</C> diz se ele existe, e o{" "}
            <C>link</C> abre a candidatura no Publike.
          </p>
          <Codigo rotulo="Resposta (o que vem além da candidatura)">{`{
  "candidatura": {
    …os campos da candidatura…,
    "curriculo": {
      "titulo": "Auxiliar de cozinha",
      "escolaridade": "medio",
      "escolaridade_nome": "Ensino médio completo",
      "curso": null,
      "experiencias": [
        {
          "cargo": "Auxiliar de cozinha",
          "onde": "Restaurante Exemplo",
          "inicio": "2023-03",
          "fim": null,
          "atual": true,
          "descricao": "Preparo e higienização na cozinha industrial."
        }
      ],
      "estudos": [],
      "cursos": ["Boas práticas na manipulação de alimentos"],
      "habilidades": ["Preparo de saladas", "Higienização"],
      "cnh": null,
      "disponibilidade": ["manha", "tarde"],
      "atualizado_em": "2026-11-15T19:20:00-03:00",
      "tem_pdf": true
    },
    "respostas": [
      { "pergunta": "Tem disponibilidade aos fins de semana?", "resposta": "Sim" }
    ]
  }
}`}</Codigo>
          <p>
            <C>curriculo</C> é <C>null</C> quando a pessoa ainda não fez o currículo.
          </p>
        </Endereco>

        <Endereco
          id="aceitar"
          metodo="POST"
          caminho={`${CAMINHO_API}/vagas/{vaga}/candidaturas/{candidato}/aceitar`}
          titulo="Aceitar (dar match)"
        >
          <p>
            Libera o contato dos dois lados, como “Curtir de volta” no site: o candidato recebe o WhatsApp e o e-mail da
            conta, e a resposta já traz os dele. Precisa do WhatsApp e do e-mail no perfil da conta no Publike (é o
            contato que o candidato recebe). Numa vaga que pede currículo e a pessoa ainda não mandou, a situação fica
            em <C>aceita_falta_curriculo</C>, e o match sai quando o currículo chegar.
          </p>
          <Codigo>{`curl -X POST "${BASE}/vagas/$VAGA/candidaturas/$CANDIDATO/aceitar" \\
  -H "Authorization: Bearer $PUBLIKE_CHAVE"`}</Codigo>
        </Endereco>

        <Endereco
          id="dispensar"
          metodo="POST"
          caminho={`${CAMINHO_API}/vagas/{vaga}/candidaturas/{candidato}/dispensar`}
          titulo="Dispensar"
        >
          <p>
            Tira a pessoa do processo, como “Dispensar” no site, e ela recebe o retorno que a conta configurou. O motivo é
            opcional, a não ser que a conta peça o motivo nas Configurações (aí, sem ele, a resposta é <C>409</C> com o
            código <C>motivo_saida</C>). Depois do match, dispensar não vale: use o Publike para desfazer o match.
          </p>
          <Codigo>{`curl -X POST "${BASE}/vagas/$VAGA/candidaturas/$CANDIDATO/dispensar" \\
  -H "Authorization: Bearer $PUBLIKE_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{ "motivo": "requisito" }'`}</Codigo>
        </Endereco>

        <Endereco
          id="etapa"
          metodo="PUT"
          caminho={`${CAMINHO_API}/vagas/{vaga}/candidaturas/{candidato}/etapa`}
          titulo="Mudar a etapa"
        >
          <p>
            A etapa da candidatura no quadro da vaga. O candidato vê a etapa e recebe um aviso quando ela muda. Antes do
            aceite, só <C>novo</C> e <C>analise</C>; as outras, depois do match. A <C>nota</C> é opcional e só a conta vê;
            sem ela, a anotação de antes continua.
          </p>
          <Codigo>{`curl -X PUT "${BASE}/vagas/$VAGA/candidaturas/$CANDIDATO/etapa" \\
  -H "Authorization: Bearer $PUBLIKE_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{ "etapa": "entrevista", "nota": "Entrevista marcada pelo CRM" }'`}</Codigo>
          <p>As três ações devolvem a candidatura como ficou.</p>
        </Endereco>

        <Secao id="sincronizar" titulo="Como receber os candidatos no seu sistema">
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            <li>
              Na primeira vez, peça <C>/candidaturas</C> com <C>desde</C> na data em que quer começar (ou sem ele, para
              trazer tudo) e <C>limite=100</C>.
            </li>
            <li>
              Grave cada candidatura pela dupla <C>vaga.id</C> + <C>candidato.id</C>: se já existe, atualize (ela volta
              toda vez que muda).
            </li>
            <li>
              Guarde o <C>proximo</C>. Enquanto <C>mais</C> for <C>true</C>, peça de novo na hora, com{" "}
              <C>cursor=&lt;proximo&gt;</C>.
            </li>
            <li>
              Depois, a cada 5 minutos, peça com o último <C>cursor</C> guardado: vem só o que mudou. São menos de 300
              chamadas por dia.
            </li>
          </ol>
          <p>
            Para mudar a etapa pelo seu sistema, use as ações acima: a mudança volta na próxima consulta, com o{" "}
            <C>atualizada_em</C> novo.
          </p>
        </Secao>

        <Secao id="campos" titulo="A candidatura">
          <Codigo>{EXEMPLO_CANDIDATURA}</Codigo>
          <Lista
            itens={[
              <>
                <C>candidato.whatsapp</C> e <C>candidato.email</C>: só depois do aceite (situação <C>aceita</C>) e com a vaga
                fora da moderação. Antes, vêm <C>null</C>, como no painel.
              </>,
              <>
                <C>mensagem</C>: o que a pessoa escreveu ao se candidatar (pode vir <C>null</C>).
              </>,
              <>
                <C>atualizada_em</C>: a última mudança; é por ela que a lista de candidaturas vem em ordem.
              </>,
              <>
                <C>link</C>: abre a candidatura no quadro da vaga, no Publike (pede para entrar).
              </>,
            ]}
          />
          <h3 className="mt-2 text-h3">Situações</h3>
          <Lista
            itens={SITUACOES_API.map((s) => (
              <>
                <C>{s.valor}</C>: {s.nome}
              </>
            ))}
          />
          <h3 className="mt-2 text-h3">Etapas</h3>
          <Lista
            itens={ETAPAS_API.map((e) => (
              <>
                <C>{e}</C>: {nomeEtapa(e)}
                {e === "novo" || e === "analise" ? " (vale antes do aceite)" : " (só depois do aceite)"}
              </>
            ))}
          />
          <h3 className="mt-2 text-h3">Motivos para dispensar</h3>
          <Lista
            itens={MOTIVOS_SAIDA.map((m) => (
              <>
                <C>{m.valor}</C>: {m.nome}
              </>
            ))}
          />
        </Secao>

        <Secao id="erros" titulo="Erros">
          <p>Todo erro vem no mesmo formato, com o código HTTP certo:</p>
          <Codigo>{`{
  "erro": {
    "codigo": "etapa_sem_match",
    "mensagem": "Essa etapa só pode ser marcada depois do match."
  }
}`}</Codigo>
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {ERROS.map(([http, codigos, quando]) => (
              <li key={http} className="flex flex-col gap-1 py-3">
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-[13px] font-bold">{http}</span>
                  <span className="font-mono text-[13px] break-words text-ink-muted">{codigos}</span>
                </p>
                <p className="text-body-sm">{quando}</p>
              </li>
            ))}
          </ul>
        </Secao>

        <Secao id="privacidade" titulo="Privacidade e LGPD">
          <Lista
            itens={[
              "Pela API vem o mesmo que o painel mostra a quem publicou a vaga, com as mesmas regras: o contato do candidato só depois do aceite, nada de contas suspensas e só os candidatos das vagas da conta.",
              "Os dados que chegam ao seu sistema ficam sob a responsabilidade da sua empresa: use só para o processo seletivo e apague quando não precisar mais, como pede a LGPD.",
              <>
                Guarde a chave no servidor, nunca no navegador nem no código público. Para tirar o acesso, apague a
                chave em{" "}
                <Link href={CAMINHO_CHAVES} className="underline underline-offset-2">
                  Configurações › API
                </Link>
                .
              </>,
            ]}
          />
          <p className="text-ink-muted">
            Dúvidas ou um pedido para a API? Fale com a gente em{" "}
            <Link href="/sugerir" className="underline underline-offset-2">
              Sugestões e erros
            </Link>
            .
          </p>
        </Secao>
      </div>
    </Container>
  );
}
