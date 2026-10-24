"use client";

import { Check, LoaderCircle, MapPin, RotateCcw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";
import { ERRO_SEM_SALVAR, ehNavegacao } from "@/lib/acao-segura";
import { conferirAnuncio, salvarAnuncio } from "@/lib/acoes/anuncios";
import { detalheDoErro, relatarFalha } from "@/lib/falhas";
import type { ClienteParaVaga } from "@/lib/clientes";
import { REGIMES } from "@/lib/constantes";
import { formatarValor } from "@/lib/formato";
import { MODELOS_ANUNCIO, type ModeloAnuncio } from "@/lib/modelos-anuncio";
import { lerNumeroBR } from "@/lib/numero";
import {
  apagarRascunho,
  formDataDoRascunho,
  guardarRascunho,
  lerRascunhoGuardado,
  valoresDoRascunho,
  type Rascunho,
} from "@/lib/rascunho-anuncio";
import type { Regime } from "@/lib/tipos";
import { ganhosDoBanco, lerGanhosExtras } from "@/lib/vaga-extra";
import { valoresDoConvite } from "@/lib/valores-convite";
import { ArteDaVaga } from "./arte-da-vaga";
import { AvisoConvite } from "./aviso-convite";
import { FormAnuncio, type ValoresAnuncio } from "./form-anuncio";
import { Aviso, Selo } from "./ui/basicos";

// Publicar uma vaga: os modelos prontos em cima, a prévia de como a vaga aparece e,
// para quem ainda não entrou, o rascunho guardado no aparelho. Depois de entrar
// (?continuar=1), o rascunho é publicado sozinho.

type Previa = { titulo: string; valor: string; regime: string | null; lugar: string };

function lerPrevia(form: HTMLFormElement): Previa {
  const f = new FormData(form);
  const t = (k: string) => {
    const v = f.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const combinar = t("combinar") === "on";
  const valor = lerNumeroBR(t("pagamento_valor"));
  const ate = lerNumeroBR(t("pagamento_ate"));
  const ganhos = lerGanhosExtras(t("ganhos_extras"));
  return {
    titulo: t("titulo"),
    valor: formatarValor(
      combinar || valor == null || !Number.isFinite(valor) ? null : valor,
      combinar ? null : t("pagamento_unidade") || null,
      null,
      false,
      { ate: ate != null && Number.isFinite(ate) ? ate : null, ganhos: ganhos.ok ? ganhos.lista : [] },
    ),
    regime: REGIMES[t("regime") as Regime]?.selo ?? null,
    lugar: [t("bairro"), t("cidade")].filter(Boolean).join(" · "),
  };
}

function aplicarModelo(m: ModeloAnuncio, atual: ValoresAnuncio): ValoresAnuncio {
  return {
    ...atual,
    titulo: m.titulo,
    descricao: m.descricao,
    categoria: m.categoria,
    regime: m.regime,
    combinar: false,
    pagamento_valor: m.valor,
    pagamento_ate: m.ate,
    pagamento_unidade: m.unidade,
    comissao: m.comissao ?? false,
    ganhos_extras: ganhosDoBanco([], m.comissao),
    jornada: m.jornada ?? null,
    beneficios_lista: m.beneficios ?? [],
    pede_curriculo: m.pedeCurriculo ?? false,
  };
}

/** O lugar e a empresa já escritos no formulário (trocar de modelo não apaga o bairro nem o cliente). */
function lugarDoFormulario(form: HTMLFormElement | null, base: ValoresAnuncio): ValoresAnuncio {
  if (!form) return base;
  const dados = new FormData(form);
  const r: Rascunho = { salvo_em: Date.now(), campos: [] };
  for (const [k, v] of dados.entries())
    if (typeof v === "string" && ["cidade", "bairro", "cep", "endereco", "lat", "lng"].includes(k))
      r.campos.push([k, v]);
  r.campos.push(["titulo", "x"]);
  const lido = valoresDoRascunho(r, base);
  const texto = (k: string) => {
    const v = dados.get(k);
    return typeof v === "string" ? v : null;
  };
  return {
    ...base,
    cidade: lido.cidade,
    bairro: lido.bairro,
    cep: lido.cep,
    endereco: lido.endereco,
    lat: lido.lat,
    lng: lido.lng,
    // agência: o cliente escolhido (ou a empresa escrita) e a marcação de confidencial
    ...(dados.has("agencia")
      ? {
          cliente_id: texto("cliente_id") || null,
          contratante: texto("contratante") ?? base.contratante ?? null,
          contratante_confidencial: texto("contratante_confidencial") === "on",
        }
      : {}),
  };
}

export function PublicarAnuncio({
  inicial: base,
  semConta = false,
  continuar = false,
  comModelos = false,
  ia = false,
  agencia = false,
  contatoAgencia = null,
  clientes = null,
  enderecoPublico = false,
  convite = null,
}: {
  inicial: ValoresAnuncio;
  /** quem ainda não entrou: o formulário confere e leva para entrar */
  semConta?: boolean;
  /** acabou de entrar: publica o rascunho guardado */
  continuar?: boolean;
  /** vaga nova do zero (não "publicar parecida") */
  comModelos?: boolean;
  /** a ajuda da IA está ligada: "Melhorar texto" e "Tem a arte da vaga?" (só com conta) */
  ia?: boolean;
  agencia?: boolean;
  contatoAgencia?: { whatsapp: string | null; email: string | null } | null;
  /** agência: os clientes para escolher */
  clientes?: ClienteParaVaga[] | null;
  enderecoPublico?: boolean;
  /** veio do link do convite do Publike: publicar é o aceite */
  convite?: { token: string; nome: string; pronta: boolean } | null;
}) {
  const router = useRouter();
  const raiz = useRef<HTMLDivElement>(null);
  const [inicial, setInicial] = useState(base);
  const [chave, setChave] = useState(0);
  const [modelo, setModelo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<"restaurado" | "publicando" | "lido" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const tempo = useRef<number | null>(null);

  const formulario = () => raiz.current?.querySelector("form") ?? null;

  // ao abrir: publica o rascunho de quem acabou de entrar, ou traz de volta o que ficou pela metade
  useEffect(() => {
    // fora do corpo do efeito: o localStorage só existe no navegador
    const t = window.setTimeout(() => abrir(), 0);
    return () => window.clearTimeout(t);
    function abrir() {
      const r = lerRascunhoGuardado();
      if (!r) return;
      // a vaga do convite vem pronta: o rascunho antigo deste aparelho não passa por cima dela
      if (convite && !continuar) return;
      if (continuar && !semConta) {
        apagarRascunho();
        setAviso("publicando");
        startTransition(async () => {
          // deu certo: a ação leva para a vaga publicada; voltou: mostra o formulário com o erro
          let resultado: Awaited<ReturnType<typeof salvarAnuncio>>;
          try {
            resultado = await salvarAnuncio({ ok: false }, formDataDoRascunho(r));
          } catch (e) {
            if (ehNavegacao(e)) throw e;
            // não chegou ao servidor: o rascunho volta e a pessoa vê o motivo (e a equipe fica sabendo)
            console.error("Publike: a vaga guardada não chegou ao servidor:", e);
            relatarFalha({ onde: "vaga", etapa: "conexao", mensagem: ERRO_SEM_SALVAR, detalhe: detalheDoErro(e) });
            resultado = { ok: false, erro: ERRO_SEM_SALVAR };
          }
          if (!resultado || resultado.ok) return;
          try {
            localStorage.setItem("publike_rascunho_vaga", JSON.stringify(r));
          } catch {}
          setInicial(valoresDoRascunho(r, base));
          setChave((c) => c + 1);
          setAviso(null);
          setErro(
            resultado.erros
              ? `Falta ajustar: ${Object.values(resultado.erros).slice(0, 2).join(" ")}`
              : (resultado.erro ?? "Não deu para publicar agora. Confira e tente de novo."),
          );
        });
        return;
      }
      setInicial(valoresDoRascunho(r, base));
      setChave((c) => c + 1);
      setAviso("restaurado");
    }
    // só na abertura da página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a prévia acompanha o que a pessoa escreve; sem conta, o rascunho também
  function aoMexer() {
    if (tempo.current) window.clearTimeout(tempo.current);
    tempo.current = window.setTimeout(() => {
      const f = formulario();
      if (!f) return;
      setPrevia(lerPrevia(f));
      if (semConta) guardarRascunho(f);
    }, 250);
  }
  useEffect(() => {
    const t = window.setTimeout(() => {
      const f = formulario();
      if (f) setPrevia(lerPrevia(f));
    }, 0);
    return () => window.clearTimeout(t);
  }, [chave]);

  function escolher(m: ModeloAnuncio | null) {
    const atual = lugarDoFormulario(formulario(), base);
    setInicial(m ? aplicarModelo(m, atual) : { ...base, cidade: atual.cidade, bairro: atual.bairro });
    setModelo(m?.id ?? null);
    setChave((c) => c + 1);
    setAviso(null);
  }

  // "Tem a arte da vaga?": o que a IA leu da imagem entra no formulário (o lugar já escrito fica)
  function aplicarArte(vaga: Parameters<typeof valoresDoConvite>[0]) {
    setInicial(valoresDoConvite(vaga, lugarDoFormulario(formulario(), base)));
    setModelo(null);
    setChave((c) => c + 1);
    setAviso("lido");
  }

  function seguirParaEntrar() {
    const f = formulario();
    if (f) guardarRascunho(f);
    router.push(`/entrar?next=${encodeURIComponent("/publicar?continuar=1")}`);
  }

  if (aviso === "publicando") {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface-200 px-5 py-12 text-center"
      >
        <LoaderCircle aria-hidden className="size-8 animate-spin text-ink-muted" />
        <p className="font-display text-h3">Publicando sua vaga…</p>
        <p className="text-body-sm text-ink-muted">É o anúncio que você preencheu antes de entrar.</p>
      </div>
    );
  }

  return (
    <div ref={raiz} onInput={aoMexer} onChange={aoMexer} className="flex flex-col gap-6">
      {convite && (
        <AvisoConvite token={convite.token} nome={convite.nome}>
          {convite.pronta
            ? "A vaga já veio preenchida com o anúncio de vocês. Confira, ajuste o que precisar e toque em Publicar."
            : "Escreva a vaga e toque em Publicar."}{" "}
          É grátis, sem plano e sem taxa. Para publicar, você entra com o e-mail, sem senha.
        </AvisoConvite>
      )}
      {semConta && !convite && (
        <Aviso tipo="info" titulo="Não precisa de conta para começar">
          Preencha a vaga. No fim, é só entrar com seu WhatsApp ou e-mail e ela vai ao ar na hora. O que você escreve
          fica guardado neste aparelho.
        </Aviso>
      )}
      {aviso === "restaurado" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface-300 px-4 py-3 text-body-sm">
          <RotateCcw aria-hidden className="size-4 shrink-0 text-ink-muted" />
          <span className="flex-1">Continuamos de onde você parou.</span>
          <button
            type="button"
            onClick={() => {
              apagarRascunho();
              escolher(null);
            }}
            className="min-h-10 font-semibold underline underline-offset-2"
          >
            Começar do zero
          </button>
        </div>
      )}
      {aviso === "lido" && (
        <Aviso tipo="info" titulo="Preenchemos com o que estava na imagem">
          Confira cada campo antes de publicar: o título, o valor, o que a vaga pede e o endereço.
        </Aviso>
      )}
      {erro && (
        <Aviso tipo="alerta" titulo="Sua vaga ainda não foi publicada">
          {erro}
        </Aviso>
      )}

      {comModelos && ia && !semConta && <ArteDaVaga aoLer={aplicarArte} />}

      {comModelos && (
        <section aria-labelledby="modelos-titulo" className="flex flex-col gap-3">
          <h2 id="modelos-titulo" className="flex items-center gap-2 text-h3">
            <Sparkles aria-hidden className="size-5 text-ink-muted" />
            Comece por um modelo
          </h2>
          <p className="-mt-1 text-body-sm text-ink-muted">
            Vem com título, descrição e um valor para começar. Ajuste ao seu caso.
          </p>
          <ul className="flex flex-wrap gap-2">
            {MODELOS_ANUNCIO.map((m) => {
              const ativo = modelo === m.id;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => escolher(ativo ? null : m)}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
                      ativo
                        ? "border-ink bg-ink text-surface-100"
                        : "border-line bg-surface-300 hover:border-line-strong"
                    }`}
                  >
                    {ativo && <Check aria-hidden className="size-4" />}
                    {m.nome}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <FormAnuncio
        key={chave}
        inicial={inicial}
        acaoSalvar={semConta ? conferirAnuncio : salvarAnuncio}
        semConta={semConta}
        aposConferir={semConta ? seguirParaEntrar : undefined}
        ia={ia && !semConta}
        agencia={agencia}
        contatoAgencia={contatoAgencia}
        clientes={clientes}
        enderecoPublico={enderecoPublico}
        previa={previa?.titulo ? <PreviaDaVaga p={previa} /> : null}
        extras={convite ? { convite: convite.token } : undefined}
        jaMudou={aviso === "lido"}
      />
    </div>
  );
}

/** Como a vaga aparece na busca, com o que já foi escrito. */
function PreviaDaVaga({ p }: { p: Previa }) {
  return (
    <section aria-label="Prévia da vaga" className="flex flex-col gap-2">
      <p className="text-label text-ink-muted">Assim sua vaga aparece na busca</p>
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:max-w-md">
        <p className="flex flex-wrap items-center gap-2">
          <Selo variante="aviso">Vaga</Selo>
          {p.regime && <Selo variante="contorno">{p.regime}</Selo>}
        </p>
        <p className="font-display text-h3 break-words">{p.titulo}</p>
        <p className="text-label">{p.valor}</p>
        {p.lugar && (
          <p className="flex items-center gap-1.5 text-body-sm text-ink-muted">
            <MapPin aria-hidden className="size-4 shrink-0" />
            {p.lugar}
          </p>
        )}
      </div>
    </section>
  );
}
