import { Eye, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CurriculoResumo } from "@/components/curriculo-resumo";
import { BotaoImprimir, RespostaDoCliente } from "@/components/finalistas/resposta-cliente";
import { SeloVerificado } from "@/components/selo-verificado";
import { Aviso, Avatar, Container, Esqueleto } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { REGIMES } from "@/lib/constantes";
import { DECISOES_CLIENTE, lerDadosDoLink, type DadosDoLink, type FinalistaDoLink } from "@/lib/finalistas";
import { formatarLugar } from "@/lib/formato";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { Regime } from "@/lib/tipos";

export const metadata: Metadata = { title: "Finalistas da vaga", robots: { index: false, follow: false } };

// A página que a agência manda ao cliente (sem conta, pelo link): os finalistas da vaga com o
// currículo (sem contato), as respostas e o parecer da agência; o cliente responde cada um.
// Dá para imprimir ou salvar em PDF (só o conteúdo, sem o topo e o rodapé do site).

export default function FinalistasDoCliente({ params }: PageProps<"/finalistas/[token]">) {
  return (
    <Container className="max-w-3xl py-8" data-imprimir>
      <Suspense fallback={<Esqueleto className="h-96 w-full rounded-lg" />}>
        {params.then(({ token }) => (
          <Conteudo token={token} />
        ))}
      </Suspense>
    </Container>
  );
}

async function Conteudo({ token }: { token: string }) {
  if (MODO_DEMO || !/^[0-9a-f]{64}$/.test(token)) return <LinkQueNaoVale />;
  // com o login de quem abriu: a própria agência vê a prévia (sem contar como o cliente abrindo)
  const { data, error } = await (await criarClienteServidor()).rpc("finalistas_do_link", { p_token: token });
  if (error) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para abrir a lista agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  const d = lerDadosDoLink(data);
  if (!d) return <LinkQueNaoVale />;
  if (d.situacao === "expirado") {
    return (
      <Aviso tipo="alerta" titulo="Este link venceu">
        Peça um link novo para {d.agencia.nome}.
      </Aviso>
    );
  }
  if (d.situacao !== "valido" || !d.vaga) {
    return (
      <Aviso tipo="alerta" titulo="Esta lista não está mais disponível">
        Fale com {d.agencia.nome} para saber dos finalistas.
      </Aviso>
    );
  }
  const agora = await agoraDaRequisicao();
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(new Date(agora))
    .slice(0, 7);
  return <Lista d={d} token={token} hoje={hoje} />;
}

function LinkQueNaoVale() {
  return (
    <Aviso tipo="alerta" titulo="Este link não vale">
      Confira se copiou o link inteiro ou peça um novo para a agência.
    </Aviso>
  );
}

function Lista({ d, token, hoje }: { d: DadosDoLink; token: string; hoje: string }) {
  const vaga = d.vaga!;
  const regime = vaga.regime && vaga.regime in REGIMES ? REGIMES[vaga.regime as Regime].nome : null;
  const n = d.finalistas.length;
  return (
    <div className="flex flex-col gap-6">
      {d.previa && (
        <p data-nao-imprimir className="flex items-start gap-2 rounded-md bg-surface-300 px-4 py-3 text-body-sm">
          <Eye aria-hidden className="mt-0.5 size-4 shrink-0" />
          Você está vendo como o cliente vê. Só o cliente responde; as respostas dele aparecem no seu painel.
        </p>
      )}
      <header className="flex flex-col gap-4 border-b border-line pb-5">
        <div className="flex items-center gap-3">
          <Avatar nome={d.agencia.nome} foto={d.agencia.foto} tamanho={48} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-label">
              {d.agencia.nome}
              {d.agencia.verificado && <SeloVerificado agencia />}
            </p>
            <p className="text-body-sm text-ink-muted">Seleção de candidatos</p>
          </div>
        </div>
        <div>
          <p className="text-caption text-ink-muted uppercase">
            Finalistas{vaga.cliente ? ` para ${vaga.cliente}` : ""}
          </p>
          <h1 className="mt-1 text-h1 break-words">{vaga.titulo}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="size-4" />
              {formatarLugar(vaga.bairro, vaga.cidade)}
            </span>
            {regime && <span>{regime}</span>}
            <span>{n === 1 ? "1 finalista" : `${n} finalistas`}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-body-sm text-ink-muted" data-nao-imprimir>
            Veja cada pessoa e responda “Quero entrevistar” ou “Não seguir”. A resposta vai na hora para{" "}
            {d.agencia.nome}, que cuida do contato e marca as entrevistas.
          </p>
          <BotaoImprimir />
        </div>
      </header>

      {n === 0 ? (
        <Aviso tipo="info" titulo="Nenhum finalista na lista agora">
          {d.agencia.nome} ainda está escolhendo. Volte a este link mais tarde.
        </Aviso>
      ) : (
        <ol className="flex flex-col gap-5">
          {d.finalistas.map((f, i) => (
            <Finalista key={f.id} f={f} numero={i + 1} token={token} hoje={hoje} previa={d.previa} />
          ))}
        </ol>
      )}

      <footer className="border-t border-line pt-4 text-caption text-ink-muted">
        <p>
          Lista enviada por {d.agencia.nome} pelo Publike. Os dados destes candidatos são para esta seleção: não repasse
          a outras pessoas nem use para outra finalidade (LGPD). Telefone e e-mail ficam com a agência.
        </p>
      </footer>
    </div>
  );
}

function Finalista({
  f,
  numero,
  token,
  hoje,
  previa,
}: {
  f: FinalistaDoLink;
  numero: number;
  token: string;
  hoje: string;
  previa: boolean;
}) {
  const decisao = f.decisao ? DECISOES_CLIENTE[f.decisao] : null;
  return (
    <li className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-4 sm:p-6 print:break-inside-avoid print:border-line-strong">
      <div className="flex items-start gap-3">
        <span className="mt-1 text-label text-ink-muted tabular-nums">{numero}.</span>
        <Avatar nome={f.nome} foto={f.foto} tamanho={56} />
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 break-words">{f.nome}</h2>
          <p className="text-body-sm text-ink-muted">{formatarLugar(f.bairro, f.cidade)}</p>
          {f.curriculo?.titulo && <p className="mt-1 text-body-sm">{f.curriculo.titulo}</p>}
        </div>
      </div>

      {f.parecer && (
        <section className="flex flex-col gap-1.5 rounded-md bg-surface-300 p-4">
          <h3 className="text-caption text-ink-muted uppercase">Parecer da agência</h3>
          <p className="text-body whitespace-pre-line">{f.parecer}</p>
        </section>
      )}

      {f.curriculo ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-label">Currículo</h3>
          <CurriculoResumo curriculo={f.curriculo} linkPdf={null} hoje={hoje} />
        </section>
      ) : (
        <p className="text-body-sm text-ink-muted">Sem currículo preenchido no Publike.</p>
      )}

      {f.respostas.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-label">Respostas às perguntas da vaga</h3>
          <dl className="flex flex-col gap-1.5 text-body-sm">
            {f.respostas.map((r) => (
              <div key={r.pergunta}>
                <dt className="text-ink-muted">{r.pergunta}</dt>
                <dd className="font-semibold">{r.resposta}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {!previa && (
        <div className="border-t border-line pt-4">
          <RespostaDoCliente
            token={token}
            id={f.id}
            nome={f.nome}
            inicial={{ decisao: f.decisao, comentario: f.comentario, quem: f.quem }}
          />
        </div>
      )}
      {previa && (decisao || f.comentario) && (
        <p className="border-t border-line pt-4 text-body-sm">
          Resposta do cliente: <span className="font-semibold">{decisao?.nome ?? "sem resposta"}</span>
          {f.comentario ? ` · “${f.comentario}”` : ""}
        </p>
      )}
    </li>
  );
}
