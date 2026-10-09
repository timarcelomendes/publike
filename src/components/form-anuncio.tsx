"use client";

import { ArrowRight, Briefcase, Check, Wrench } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { salvarAnuncio } from "@/lib/acoes/anuncios";
import type { RascunhoAnuncio } from "@/lib/acoes/ia";
import { BAIRROS } from "@/lib/bairros";
import { CATEGORIAS, CIDADES, REGIMES, REGIMES_COM_CURRICULO, UNIDADES, type Cidade } from "@/lib/constantes";
import type { EstadoForm, Regime, TipoAnuncio } from "@/lib/tipos";
import { lerNumeroBR } from "@/lib/numero";
import { MelhorarTexto } from "./anuncio/melhorar-texto";
import { SeletorLocal } from "./mapa/seletor-local";
import { Aviso } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { Campo, classesEntrada, ligarCampo, MensagemErro, Seletor } from "./ui/campo";

export type ValoresAnuncio = {
  id?: string;
  tipo: TipoAnuncio;
  titulo: string;
  descricao: string;
  categoria: string;
  regime: string | null;
  pagamento_valor: number | null;
  pagamento_unidade: string | null;
  beneficios: string | null;
  horario: string | null;
  vagas: number;
  /** vaga: quem curtir é convidado a preencher o currículo, e você vê o currículo de cada um */
  pede_curriculo?: boolean;
  cidade: string;
  bairro: string;
  lat: number | null;
  lng: number | null;
};

const ESTADO_INICIAL: EstadoForm = { ok: false };

function Secao({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 sm:p-6">
      <h2 className="flex items-center gap-3 text-h3">
        <span className="flex size-8 items-center justify-center rounded-pill bg-surface-300 text-label">{numero}</span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

export function FormAnuncio({
  inicial,
  acaoSalvar = salvarAnuncio,
  equipe = false,
  ia = false,
}: {
  inicial: ValoresAnuncio;
  /** Ação que salva (padrão: publicar ou editar o próprio anúncio). */
  acaoSalvar?: (anterior: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  /** Correção feita pela moderação no anúncio de outra pessoa. */
  equipe?: boolean;
  /** Mostra o botão "Melhorar texto com IA". */
  ia?: boolean;
}) {
  const editando = Boolean(inicial.id);
  const [estado, acao, enviando] = useActionState(acaoSalvar, ESTADO_INICIAL);
  // anúncio novo é sempre vaga; serviço tem cadastro próprio ("Meus serviços")
  const tipo: TipoAnuncio = editando ? inicial.tipo : "vaga";
  const [combinar, setCombinar] = useState(editando ? inicial.pagamento_valor == null : false);
  const [unidade, setUnidade] = useState(inicial.pagamento_unidade ?? (inicial.tipo === "vaga" ? "mes" : "servico"));
  const [descricao, setDescricao] = useState(inicial.descricao);
  const [cidade, setCidade] = useState(inicial.cidade);
  const [pedeCurriculo, setPedeCurriculo] = useState(inicial.pede_curriculo ?? false);
  // Em vaga nova, CLT, estágio e temporário já marcam "pedir currículo" (até a pessoa mexer na caixa)
  const [mexeuNoCurriculo, setMexeuNoCurriculo] = useState(editando);
  const formulario = useRef<HTMLFormElement>(null);
  const erros = estado.erros ?? {};
  const vaga = tipo === "vaga";

  // Depois de um erro, leva a pessoa até o primeiro campo com problema
  useEffect(() => {
    if (!estado.erros) return;
    const campo = formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    campo?.focus();
  }, [estado]);

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    startTransition(() => acao(dados));
  }

  const valor = inicial.pagamento_valor != null ? String(inicial.pagamento_valor).replace(".", ",") : "";

  // O que já está escrito no formulário vai para a IA como rascunho.
  function lerRascunho(): RascunhoAnuncio {
    const f = formulario.current ? new FormData(formulario.current) : new FormData();
    const texto = (nome: string) => {
      const v = f.get(nome);
      return typeof v === "string" ? v : "";
    };
    const valorDigitado = combinar ? null : lerNumeroBR(f.get("pagamento_valor"));
    return {
      tipo,
      titulo: texto("titulo"),
      descricao,
      categoria: texto("categoria"),
      regime: vaga ? texto("regime") || null : null,
      pagamento_valor: valorDigitado != null && Number.isFinite(valorDigitado) ? valorDigitado : null,
      pagamento_unidade: combinar ? null : unidade,
      beneficios: texto("beneficios") || null,
      horario: texto("horario") || null,
      vagas: Number(texto("vagas")) || 1,
      cidade: texto("cidade"),
      bairro: texto("bairro"),
    };
  }

  function aplicarSugestao(titulo: string, novaDescricao: string) {
    const campoTitulo = formulario.current?.elements.namedItem("titulo");
    if (campoTitulo instanceof HTMLInputElement) campoTitulo.value = titulo;
    setDescricao(novaDescricao);
  }

  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="flex flex-col gap-6">
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}

      <Secao numero={1} titulo="O que você quer publicar?">
        {editando ? (
          <>
            <input type="hidden" name="tipo" value={tipo} />
            <p className="text-body text-ink-muted">
              {vaga ? "Uma vaga de trabalho." : "Um serviço oferecido."} O tipo não muda depois de publicado.
            </p>
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="tipo" value="vaga" />
            <div className="flex gap-3 rounded-md border border-ink bg-surface-300 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-200 text-ink">
                <Briefcase aria-hidden className="size-5" />
              </span>
              <span>
                <span className="flex items-center gap-1.5 text-label">
                  Uma vaga
                  <Check aria-hidden className="size-4" />
                </span>
                <span className="block text-body-sm text-ink-muted">
                  Contratar alguém: com carteira, temporário, diária ou freelance (um pedreiro para um reboco, uma faxina…).
                </span>
              </span>
            </div>
            <Link
              href="/painel/servicos"
              className="flex gap-3 rounded-md border border-line-strong bg-surface-200 p-4 transition-colors hover:bg-surface-300"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-300 text-ink">
                <Wrench aria-hidden className="size-5" />
              </span>
              <span>
                <span className="flex items-center gap-1 text-label">
                  Ofereço serviços
                  <ArrowRight aria-hidden className="size-4" />
                </span>
                <span className="block text-body-sm text-ink-muted">
                  Sou pedreiro, diarista, manicure… Monte sua vitrine com fotos e preço.
                </span>
              </span>
            </Link>
          </div>
        )}
      </Secao>

      <Secao numero={2} titulo={vaga ? "Conte sobre a vaga" : "Conte sobre o serviço"}>
        <Campo rotulo="Título" nome="titulo" erro={erros.titulo} ajuda="Curto e direto, como você falaria para um vizinho.">
          <input
            {...ligarCampo("titulo", erros.titulo, true)}
            defaultValue={inicial.titulo}
            maxLength={90}
            required
            placeholder={vaga ? "Ex.: Auxiliar de cozinha para o turno da noite" : "Ex.: Pedreiro: reboco e contrapiso"}
            className={classesEntrada}
          />
        </Campo>

        <Campo rotulo="Categoria" nome="categoria" erro={erros.categoria}>
          <Seletor {...ligarCampo("categoria", erros.categoria)} defaultValue={inicial.categoria} required className={classesEntrada}>
            <option value="" disabled>
              Escolha uma categoria
            </option>
            {CATEGORIAS.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nome}
              </option>
            ))}
          </Seletor>
        </Campo>

        {vaga && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-label">Tipo de contratação</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(REGIMES).map(([v, r]) => (
                <label
                  key={v}
                  title={r.ajuda}
                  className="inline-flex min-h-10 cursor-pointer items-center rounded-pill border border-line bg-surface-300 px-3.5 text-label transition-colors has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-surface-100 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
                >
                  <input
                    type="radio"
                    name="regime"
                    value={v}
                    defaultChecked={inicial.regime === v}
                    onChange={() => {
                      if (!mexeuNoCurriculo) setPedeCurriculo(REGIMES_COM_CURRICULO.includes(v as Regime));
                    }}
                    className="sr-only"
                  />
                  {r.nome}
                </label>
              ))}
            </div>
            {erros.regime && <MensagemErro>{erros.regime}</MensagemErro>}
          </fieldset>
        )}

        {vaga && (
          <label className="flex cursor-pointer items-start gap-3 rounded-md bg-surface-300 p-4">
            <input
              type="checkbox"
              name="pede_curriculo"
              checked={pedeCurriculo}
              onChange={(e) => {
                setMexeuNoCurriculo(true);
                setPedeCurriculo(e.target.checked);
              }}
              className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
            />
            <span>
              <span className="block text-label">Pedir currículo</span>
              <span className="block text-body-sm text-ink-muted">
                Quem curtir é convidado a preencher o currículo: estudos, experiências, cursos e CNH. Você vê na lista
                de interessados, e só dá match com quem preencheu.
              </span>
            </span>
          </label>
        )}

        <Campo
          rotulo="Descrição"
          nome="descricao"
          erro={erros.descricao}
          ajuda={
            vaga
              ? "O que a pessoa vai fazer, o que precisa saber e o que você oferece. Sem telefone: o contato aparece no match."
              : "O que você faz, há quanto tempo e o que está incluído. Sem telefone: o contato aparece no match."
          }
        >
          <textarea
            {...ligarCampo("descricao", erros.descricao, true)}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={7}
            maxLength={3000}
            required
            className={`${classesEntrada} resize-y`}
          />
          <span className="self-end text-body-sm text-ink-muted">{descricao.length}/3000</span>
        </Campo>
        {ia && <MelhorarTexto lerRascunho={lerRascunho} aplicar={aplicarSugestao} />}
      </Secao>

      <Secao numero={3} titulo="Valor e horário">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 self-start text-label">
          <input
            type="checkbox"
            name="combinar"
            checked={combinar}
            onChange={(e) => setCombinar(e.target.checked)}
            className="size-5 accent-[var(--pk-ink)]"
          />
          Valor a combinar
        </label>

        {!combinar && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Valor (R$)" nome="pagamento_valor" erro={erros.pagamento_valor}>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body text-ink-muted">R$</span>
                <input
                  {...ligarCampo("pagamento_valor", erros.pagamento_valor)}
                  defaultValue={valor}
                  inputMode="decimal"
                  placeholder={vaga ? "1.900" : "300"}
                  className={`${classesEntrada} pl-10`}
                />
              </div>
            </Campo>
            <Campo rotulo="Por" nome="pagamento_unidade" erro={erros.pagamento_unidade}>
              <Seletor
                {...ligarCampo("pagamento_unidade", erros.pagamento_unidade)}
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                className={classesEntrada}
              >
                {Object.entries(UNIDADES).map(([v, nome]) => (
                  <option key={v} value={v}>
                    {nome}
                  </option>
                ))}
              </Seletor>
            </Campo>
          </div>
        )}

        {vaga && (
          <Campo rotulo="Benefícios" nome="beneficios" opcional erro={erros.beneficios}>
            <input
              {...ligarCampo("beneficios", erros.beneficios)}
              defaultValue={inicial.beneficios ?? ""}
              maxLength={120}
              placeholder="Ex.: vale-transporte e refeição"
              className={classesEntrada}
            />
          </Campo>
        )}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Campo rotulo={vaga ? "Horário" : "Quando"} nome="horario" opcional erro={erros.horario}>
            <input
              {...ligarCampo("horario", erros.horario)}
              defaultValue={inicial.horario ?? ""}
              maxLength={120}
              placeholder={vaga ? "Ex.: Seg a sex, das 8h às 17h" : "Ex.: Pode ser no fim de semana"}
              className={classesEntrada}
            />
          </Campo>
          {vaga && (
            <Campo rotulo="Quantas pessoas" nome="vagas" erro={erros.vagas}>
              <input
                {...ligarCampo("vagas", erros.vagas)}
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                defaultValue={inicial.vagas}
                className={classesEntrada}
              />
            </Campo>
          )}
        </div>
      </Secao>

      <Secao numero={4} titulo="Onde é">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Cidade" nome="cidade" erro={erros.cidade}>
            <Seletor
              {...ligarCampo("cidade", erros.cidade)}
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              className={classesEntrada}
            >
              {CIDADES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Seletor>
          </Campo>
          <Campo rotulo="Bairro ou setor" nome="bairro" erro={erros.bairro}>
            <input
              {...ligarCampo("bairro", erros.bairro)}
              defaultValue={inicial.bairro}
              list="bairros"
              maxLength={80}
              required
              placeholder="Ex.: Setor Bueno"
              autoComplete="off"
              className={classesEntrada}
            />
            <datalist id="bairros">
              {(BAIRROS[cidade as Cidade] ?? []).map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Campo>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-label">Marque a região no mapa</p>
          <SeletorLocal
            inicial={inicial.lat != null && inicial.lng != null ? { lat: inicial.lat, lng: inicial.lng } : null}
            erro={erros.lat ?? erros.lng}
          />
          {(erros.lat || erros.lng) && <MensagemErro>{erros.lat ?? erros.lng}</MensagemErro>}
        </div>
      </Secao>

      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Botao type="submit" variante="primario" disabled={enviando} className="sm:min-w-56">
          {enviando
            ? "Salvando…"
            : equipe
              ? "Salvar correção"
              : editando
                ? "Salvar alterações"
                : vaga
                  ? "Publicar vaga"
                  : "Publicar serviço"}
        </Botao>
        {equipe ? (
          <p className="text-body-sm text-ink-muted">
            Quem publicou não recebe aviso da correção. A mudança fica no registro da equipe.
          </p>
        ) : (
          <p className="text-body-sm text-ink-muted">
            Grátis. Fica 30 dias no ar e pode ser renovado de 30 em 30 dias. Ao publicar, você concorda com as{" "}
            <Link href="/privacidade#regras" className="underline">
              regras do Publike
            </Link>
            .
          </p>
        )}
      </div>
    </form>
  );
}
