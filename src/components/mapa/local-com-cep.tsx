"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { buscarCentroDoBairro, buscarCep, buscarEnderecoDoPonto } from "@/lib/acoes/cep";
import { formatarCep, limparCep, montarEndereco, TEXTO_PRECISAO } from "@/lib/cep";
import { distanciaKm } from "@/lib/descobrir";
import { cidadeDoPublike } from "@/lib/pracas";
import { centroDaCidade, chaveBairro } from "@/lib/regioes";
import { Botao } from "../ui/botao";
import { classesEntrada, MensagemErro } from "../ui/campo";
import { bairroEscrito, type LugarDoPonto, SeletorLocal } from "./seletor-local";

type Ponto = { lat: number; lng: number };

/** O pino marcado já fica no bairro escolhido: perto do meio dele, o mapa não mexe (o toque da pessoa vale mais). */
const PINO_NO_BAIRRO_KM = 1.5;

/** O bairro e a cidade escritos no formulário, e o pino marcado (os campos escondidos do mapa). */
function lugarDoFormulario(raiz: HTMLElement | null) {
  const f = raiz?.closest("form");
  const valor = (nome: string) => {
    const campo = f?.elements.namedItem(nome);
    return campo instanceof HTMLInputElement || campo instanceof HTMLSelectElement ? campo.value.trim() : "";
  };
  const lat = Number(valor("lat"));
  const lng = Number(valor("lng"));
  return {
    bairro: valor("bairro"),
    cidade: valor("cidade"),
    pino: valor("lat") && valor("lng") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
  };
}
const chaveDoLugar = (bairro: string, cidade: string) => `${chaveBairro(bairro)}|${cidade}`;

/**
 * "Onde é" do anúncio: CEP + número levam o pino até a porta e preenchem a
 * cidade e o bairro; depois a pessoa confere e ajusta no mapa.
 * Comércio, empresa e agência (`publico`) mostram o endereço na vaga, e o ponto
 * fica exato. Pessoa física usa o CEP só para achar o lugar: na vaga aparece
 * uma área de ~500 m, sem endereço. Sem conta ainda (`publico="talvez"`), o endereço aparece como
 * opcional: se a conta for de pessoa, o banco apaga o endereço e arredonda o ponto (anuncios_endereco).
 */
export function LocalComCep({
  inicial,
  inicialCep,
  inicialEndereco,
  inicialNumero,
  publico: publicoPedido,
  erro,
  aoAchar,
  children,
  mapaOpcional = false,
  cidade,
}: {
  /** a cidade do formulário: sem ponto ainda, o mapa abre nela */
  cidade?: string | null;
  inicial: Ponto | null;
  inicialCep?: string | null;
  inicialEndereco?: string | null;
  /** o número da fachada, para "Achar no mapa" chegar na porta (o cadastro do cliente traz da Receita) */
  inicialNumero?: string | null;
  /** true: comércio, empresa e agência; "talvez": quem ainda não entrou (o endereço é opcional) */
  publico: boolean | "talvez";
  erro?: string;
  /** a cidade e o bairro (do CEP, da localização ou do ponto no mapa) para os campos do formulário; devolve se o bairro mudou */
  aoAchar: (lugar: LugarDoPonto) => boolean;
  /** cidade e bairro do formulário, entre o CEP e o endereço */
  children?: ReactNode;
  /** sem pino, vale o meio do bairro (publicar) */
  mapaOpcional?: boolean;
}) {
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const talvez = publicoPedido === "talvez";
  const publico = publicoPedido !== false;
  const [cep, setCep] = useState(formatarCep(inicialCep));
  const [numero, setNumero] = useState(inicialNumero ?? "");
  const [endereco, setEndereco] = useState(inicialEndereco ?? "");
  const [rua, setRua] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [irPara, setIrPara] = useState<(Ponto & { vez: number; zoom?: number; marcar?: boolean; aviso?: string }) | null>(null);
  const [buscando, iniciar] = useTransition();
  const [preenchendo, iniciarPreencher] = useTransition();

  // escolher o bairro (ou trocar a cidade) leva o mapa até lá (23/11/2026): o último lugar levado ao mapa, ou posto
  // pelo CEP, pela localização ou pelo toque no mapa, não é procurado de novo
  const lugarNoMapa = useRef<string | null>(null);
  const [, iniciarBairro] = useTransition();
  function achou(lugar: LugarDoPonto) {
    const mudou = aoAchar(lugar);
    // o formulário acerta a cidade e o bairro agora; o lugar levado ao mapa passa a ser esse
    setTimeout(() => {
      const f = lugarDoFormulario(raiz.current);
      lugarNoMapa.current = chaveDoLugar(f.bairro, f.cidade);
    }, 0);
    return mudou;
  }
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const inicio = lugarDoFormulario(el);
    lugarNoMapa.current = chaveDoLugar(inicio.bairro, inicio.cidade);
    let espera: ReturnType<typeof setTimeout> | null = null;
    let vez = 0;
    const levar = () => {
      const { bairro, cidade: c, pino } = lugarDoFormulario(el);
      const chave = chaveDoLugar(bairro, c);
      if (chave === lugarNoMapa.current) return;
      const trocouACidade = !lugarNoMapa.current?.endsWith(`|${c}`);
      lugarNoMapa.current = chave;
      const minha = ++vez;
      if (bairro.length < 2) {
        // só a cidade: o mapa vai para o centro dela, sem marcar
        const daCidade = cidadeDoPublike(c);
        if (trocouACidade && daCidade) setIrPara({ ...centroDaCidade(daCidade), vez: Date.now(), zoom: 13, marcar: false });
        return;
      }
      iniciarBairro(async () => {
        const centro = await buscarCentroDoBairro(bairro, c);
        if (minha !== vez) return;
        if (!centro) {
          setAviso(
            `Não achamos “${bairro}” no mapa. ${pino ? "Confira se o local marcado no mapa é o do trabalho." : "Se quiser, toque no mapa no lugar do trabalho."}`,
          );
          return;
        }
        // o pino já está no bairro (a pessoa tocou no lugar certo): fica
        if (pino && distanciaKm(pino.lat, pino.lng, centro.lat, centro.lng) < PINO_NO_BAIRRO_KM) return;
        setAviso(null);
        setIrPara({
          ...centro,
          vez: Date.now(),
          zoom: 15,
          aviso: `Levamos o mapa para ${bairro}. Se o trabalho é em outro ponto do bairro, toque no mapa no lugar certo.`,
        });
      });
    };
    const aoMudar = (e: Event) => {
      const alvo = e.target;
      if (!(alvo instanceof HTMLInputElement || alvo instanceof HTMLSelectElement)) return;
      if (alvo.name !== "bairro" && alvo.name !== "cidade") return;
      // digitando o bairro: espera escolher na lista ou sair do campo
      const tipo = (e as InputEvent).inputType;
      if (e.type === "input" && alvo.name === "bairro" && tipo && tipo !== "insertReplacementText") return;
      if (espera) clearTimeout(espera);
      espera = setTimeout(levar, 250);
    };
    el.addEventListener("input", aoMudar);
    el.addEventListener("change", aoMudar);
    return () => {
      el.removeEventListener("input", aoMudar);
      el.removeEventListener("change", aoMudar);
      if (espera) clearTimeout(espera);
      vez++;
    };
  }, []);

  // "Usar minha localização": o pino já foi para onde a pessoa está; agora o endereço
  // acompanha (rua, bairro, cidade e o CEP, quando o mapa tem). O número quase nunca vem.
  function preencherPeloPonto(p: Ponto) {
    setFalha(null);
    setAviso(null);
    iniciarPreencher(async () => {
      const r = await buscarEnderecoDoPonto(p.lat, p.lng, bairroEscrito(raiz.current));
      if (!r.ok) {
        setAviso(r.erro);
        return;
      }
      const e = r.endereco;
      if (e.cep) setCep(formatarCep(e.cep));
      setNumero(e.numero ?? "");
      setRua(e.rua);
      if (publico) setEndereco(montarEndereco(e.rua, e.numero) ?? "");
      // o bairro escrito fica perto do ponto: fica (o nome do mapa nem sempre é o do povo)
      achou({ cidade: e.cidade, bairro: r.manterBairro ? null : e.bairro });
      setAviso(
        !e.rua
          ? "Preenchemos a cidade e o bairro pela sua localização. Confira."
          : e.numero || !publico
            ? "Preenchemos o endereço pela sua localização. Confira se está certo."
            : "Preenchemos a rua pela sua localização. Ponha o número no endereço.",
      );
    });
  }

  function buscar() {
    setFalha(null);
    setAviso(null);
    iniciar(async () => {
      const r = await buscarCep(limparCep(cep), numero);
      if (!r.ok) {
        setFalha(r.erro);
        return;
      }
      setCep(formatarCep(r.endereco.cep));
      setRua(r.endereco.rua);
      if (r.endereco.rua) setEndereco(montarEndereco(r.endereco.rua, numero) ?? "");
      achou({ cidade: r.endereco.cidade, bairro: r.endereco.bairro });
      if (r.ponto) {
        setIrPara({ ...r.ponto, vez: Date.now(), zoom: r.precisao === "bairro" ? 15 : 17 });
        setAviso(
          r.precisao === "rua" && !numero.trim()
            ? "Achamos a rua. Ponha o número para chegar mais perto, ou toque no mapa na porta certa."
            : r.precisao === "bairro" && r.endereco.rua
              ? `A ${r.endereco.rua} não está no mapa que usamos, então o pino ficou perto, no bairro ${r.endereco.bairro ?? "do CEP"}. Toque no mapa na porta certa.`
              : r.precisao
                ? TEXTO_PRECISAO[r.precisao]
                : null,
        );
      } else {
        // abre o mapa na cidade, sem marcar: a pessoa toca no lugar
        if (r.centro) setIrPara({ ...r.centro, vez: Date.now(), zoom: 13, marcar: false });
        setAviso("Achamos o endereço, mas não o ponto no mapa. Toque no mapa para marcar o local.");
      }
    });
  }

  return (
    <div ref={raiz} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-label" id={`${id}-titulo`}>
          Ache pelo CEP
        </p>
        <div
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:grid-cols-[10rem_8rem_auto]"
          role="group"
          aria-labelledby={`${id}-titulo`}
        >
          <label className="sr-only" htmlFor={`${id}-cep`}>
            CEP
          </label>
          <input
            id={`${id}-cep`}
            name="cep"
            value={cep}
            onChange={(e) => setCep(formatarCep(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                buscar();
              }
            }}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="CEP"
            maxLength={9}
            className={classesEntrada}
          />
          <label className="sr-only" htmlFor={`${id}-numero`}>
            Número
          </label>
          <input
            id={`${id}-numero`}
            value={numero}
            onChange={(e) => setNumero(e.target.value.slice(0, 10))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                buscar();
              }
            }}
            placeholder="Número"
            autoComplete="off"
            className={classesEntrada}
          />
          <Botao
            tamanho="md"
            onClick={buscar}
            disabled={buscando || limparCep(cep).length !== 8}
            className="col-span-2 sm:col-span-1"
          >
            <Search aria-hidden />
            {buscando ? "Procurando…" : "Achar no mapa"}
          </Botao>
        </div>
        {falha ? (
          <MensagemErro>{falha}</MensagemErro>
        ) : (
          <p className="text-body-sm text-ink-muted" aria-live="polite">
            {preenchendo
              ? "Procurando o endereço deste lugar…"
              : (aviso ??
                (talvez
                  ? "Empresa ou comércio? O endereço aparece na vaga, com o pino na porta. Pessoa física: mostramos só a região."
                  : publico
                    ? "Com o endereço certo, quem mora perto acha sua vaga e sabe quanto tempo leva para chegar."
                    : "O CEP só ajuda a achar o lugar. Na vaga aparece uma área de uns 500 m, sem o endereço."))}
          </p>
        )}
      </div>

      {children}

      {publico && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-endereco`} className="text-label">
            Endereço{" "}
            <span className="font-normal text-ink-muted">
              {talvez ? "(opcional, aparece na vaga de empresa e comércio)" : "(aparece na vaga)"}
            </span>
          </label>
          <input
            id={`${id}-endereco`}
            name="endereco"
            value={endereco}
            onChange={(e) => setEndereco(e.target.value.slice(0, 120))}
            placeholder={rua ? `${rua}, número` : "Ex.: Rua 90, 1200"}
            autoComplete="off"
            className={classesEntrada}
          />
          <p className="text-body-sm text-ink-muted">
            Rua e número, como na fachada. Deixe em branco para mostrar só uma área de uns 500 m.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="text-label">
          {publico && endereco.trim() ? "Confira o pino no mapa" : "Marque a região no mapa"}
          {mapaOpcional && !(publico && endereco.trim()) && (
            <span className="font-normal text-ink-muted"> (opcional)</span>
          )}
        </p>
        <SeletorLocal
          inicial={inicial}
          erro={erro}
          exato={publico && endereco.trim() !== ""}
          irPara={irPara}
          aoUsarLocalizacao={preencherPeloPonto}
          preencher={achou}
          recolhido={mapaOpcional}
          cidade={cidade}
        />
      </div>
    </div>
  );
}
