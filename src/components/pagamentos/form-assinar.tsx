"use client";

import { CreditCard, LoaderCircle, LockKeyhole, QrCode } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import {
  assinar,
  buscarCepDeCobranca,
  comprarImpulso,
  comprarPorTrintaDias,
  mudarDeFaixa,
  type ResultadoAssinar,
} from "@/lib/acoes/assinatura";
import { documentoValido, formatarDocumento } from "@/lib/documento";
import { formatarMoeda, formatarTelefone } from "@/lib/formato";
import { formatarCep } from "@/lib/cep";
import {
  dataDoDia,
  MESES,
  NOME_CICLO,
  NOME_PRODUTO,
  POR_CICLO,
  type Ciclo,
  type Plano,
  type Produto,
} from "@/lib/pagamentos";
import { Campo, classesEntrada } from "../ui/campo";
import { Botao } from "../ui/botao";

// Assinar (claude/plano-checkout-asaas.md): o plano, a forma de pagar e os dados da nota fiscal. O cartão é
// digitado na página segura do parceiro de pagamentos (o Publike não vê o número); o Pix aparece aqui.

const OPCAO =
  "flex cursor-pointer gap-3 rounded-md border p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink";
const MARCADA = "border-ink bg-surface-300";
const SOLTA = "border-line-strong bg-surface-200 hover:bg-surface-300";

/**
 * O modo do formulário (migração 20270416120000): assinar (mensal, 3 meses ou anual), comprar os 30 dias sem
 * renovar, ou pagar a diferença da troca de faixa (`faixa`: a assinatura e quanto falta pagar).
 */
type Modo =
  | { tipo: "assinar"; ciclo?: Ciclo | null }
  | { tipo: "trinta" }
  | { tipo: "faixa"; assinatura: string; diferenca: number; dias: number; ate: string | null; renovacao: number }
  /** o impulso da vaga no Google (migração 20270423120000): os dias e o preço de cada opção */
  | {
      tipo: "impulso";
      anuncio: string;
      /** dias_rapido: o Rápido do plano, a mesma verba em menos dias (migração 20270516120000) */
      opcoes: { dias: number; valor: number; verba: number; dias_rapido?: number | null }[];
    };

export function FormAssinar({
  recurso,
  planos: todos,
  primeiro,
  inicial,
  troca = false,
  modo = { tipo: "assinar" },
}: {
  recurso: Produto;
  planos: Plano[];
  modo?: Modo;
  /** a data da 1ª cobrança, quando não é hoje (o fim do teste grátis ou do que já está pago) */
  primeiro: string | null;
  inicial: {
    documento: string;
    nome: string;
    email: string;
    /** o celular e o endereço de cobrança já informados (ou o WhatsApp da conta) */
    telefone?: string;
    endereco?: Partial<Record<"cep" | "rua" | "numero" | "complemento" | "bairro", string>> | null;
  };
  troca?: boolean;
}) {
  const router = useRouter();
  // os 30 dias são uma compra à parte: no assinar, só os ciclos que renovam
  const planos = todos.filter((p) => (modo.tipo === "trinta" ? p.ciclo === "AVULSO" : p.ciclo !== "AVULSO"));
  const ordenados = [...planos].sort((a, b) => MESES[a.ciclo] - MESES[b.ciclo]);
  const cicloInicial = modo.tipo === "assinar" ? modo.ciclo : null;
  const [plano, setPlano] = useState(
    (ordenados.find((p) => p.ciclo === cicloInicial) ?? ordenados[0])?.id ?? "",
  );
  const [forma, setForma] = useState<"cartao" | "pix">("cartao");
  const [dias, setDias] = useState(modo.tipo === "impulso" ? (modo.opcoes[0]?.dias ?? 0) : 0);
  const opcaoImpulso = modo.tipo === "impulso" ? modo.opcoes.find((o) => o.dias === dias) : undefined;
  // o Rápido: os mesmos reais no Google em menos dias, mais gente por dia
  const [rapido, setRapido] = useState(false);
  const comRapido = Boolean(opcaoImpulso?.dias_rapido);
  const diasDoImpulso = comRapido && rapido ? opcaoImpulso!.dias_rapido! : dias;
  const [documento, setDocumento] = useState(formatarDocumento(inicial.documento));
  const [nome, setNome] = useState(inicial.nome);
  const [email, setEmail] = useState(inicial.email);
  const [erro, setErro] = useState<string | null>(null);
  const [erroDoc, setErroDoc] = useState<string | null>(null);
  const [telefone, setTelefone] = useState(formatarTelefone(inicial.telefone ?? "") || (inicial.telefone ?? ""));
  const [end, setEnd] = useState({
    cep: formatarCep(inicial.endereco?.cep ?? ""),
    rua: inicial.endereco?.rua ?? "",
    numero: inicial.endereco?.numero ?? "",
    complemento: inicial.endereco?.complemento ?? "",
    bairro: inicial.endereco?.bairro ?? "",
  });
  const [cidade, setCidade] = useState<string | null>(null);
  const [erroCep, setErroCep] = useState<string | null>(null);
  const mudarEnd = (k: keyof typeof end, v: string) => setEnd((x) => ({ ...x, [k]: v }));

  // o CEP completo preenche a rua, o bairro e a cidade (a pessoa confere e põe o número)
  async function procurarCep(valor: string) {
    const cep = valor.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setErroCep(null);
    const r = await buscarCepDeCobranca(cep).catch(() => null);
    if (!r) return;
    if (!r.ok) {
      setErroCep(r.erro);
      return;
    }
    setCidade(`${r.cidade}${r.uf ? ` (${r.uf})` : ""}`);
    setEnd((x) => ({ ...x, rua: r.rua ?? x.rua, bairro: r.bairro ?? x.bairro }));
    if (r.rua) window.setTimeout(() => document.getElementById("cob-numero")?.focus(), 0);
  }
  const [pendente, iniciar] = useTransition();
  const escolhido = ordenados.find((p) => p.id === plano);
  const mensal = ordenados.find((p) => p.ciclo === "MONTHLY");
  const f = troca ? "cartao" : forma;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!documentoValido(documento)) {
      setErroDoc("Confira o CPF ou o CNPJ.");
      document.getElementById("documento")?.focus();
      return;
    }
    setErroDoc(null);
    iniciar(async () => {
      const pagador = { forma: f, documento, nome, email, endereco: f === "cartao" ? { telefone, ...end } : undefined };
      const r: ResultadoAssinar = await chamarAcao(() =>
        modo.tipo === "impulso"
          ? comprarImpulso({ ...pagador, anuncio: modo.anuncio, dias, rapido: comRapido && rapido })
          : modo.tipo === "trinta"
          ? comprarPorTrintaDias({ ...pagador, plano })
          : modo.tipo === "faixa"
            ? mudarDeFaixa({ ...pagador, plano, assinatura: modo.assinatura })
            : assinar({ ...pagador, plano, troca }),
      );
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      // o cartão: a página segura do parceiro; o Pix: a fatura, aqui
      if (r.externo) window.location.assign(r.ir);
      else router.push(r.ir);
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-6" noValidate>
      {modo.tipo === "impulso" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label">Por quanto tempo</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {modo.opcoes.map((o) => (
              <label key={o.dias} className={`${OPCAO} ${dias === o.dias ? MARCADA : SOLTA}`}>
                <input
                  type="radio"
                  name="dias"
                  value={o.dias}
                  checked={dias === o.dias}
                  onChange={() => setDias(o.dias)}
                  className="mt-1 size-4 accent-terra"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-label">
                    {o.dias_rapido ? `${o.dias} dias, ou ${o.dias_rapido} no Rápido` : `${o.dias} dias no Google`}
                  </span>
                  <span className="text-h3 tabular-nums">{formatarMoeda(o.valor)}</span>
                  <span className="text-body-sm text-ink-muted">
                    {formatarMoeda(o.verba)} vão para o anúncio, cerca de {formatarMoeda(Math.round((o.verba / o.dias) * 100) / 100)}{" "}
                    por dia
                  </span>
                </span>
              </label>
            ))}
          </div>
          {opcaoImpulso?.dias_rapido && (
            <div role="radiogroup" aria-label="Em quantos dias" className="mt-2 grid gap-2 sm:grid-cols-2">
              {[false, true].map((r) => {
                const d = r ? opcaoImpulso.dias_rapido! : opcaoImpulso.dias;
                return (
                  <label key={String(r)} className={`${OPCAO} ${rapido === r ? MARCADA : SOLTA}`}>
                    <input
                      type="radio"
                      name="rapido"
                      checked={rapido === r}
                      onChange={() => setRapido(r)}
                      className="mt-1 size-4 accent-terra"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-label">{r ? `Rápido: ${d} dias` : `Normal: ${d} dias`}</span>
                      <span className="text-body-sm text-ink-muted">
                        {r
                          ? `Mais gente por dia, cerca de ${formatarMoeda(Math.round((opcaoImpulso.verba / d) * 100) / 100)} por dia no Google. Mesmo preço.`
                          : `Cerca de ${formatarMoeda(Math.round((opcaoImpulso.verba / d) * 100) / 100)} por dia no Google, por mais tempo.`}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      )}

      {!troca && modo.tipo !== "faixa" && modo.tipo !== "impulso" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label">Plano</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ordenados.map((p) => {
              const porMes = p.valor / MESES[p.ciclo];
              const economia =
                (p.ciclo === "QUARTERLY" || p.ciclo === "YEARLY") && mensal
                  ? Math.round((1 - porMes / mensal.valor) * 100)
                  : 0;
              return (
                <label key={p.id} className={`${OPCAO} ${plano === p.id ? MARCADA : SOLTA}`}>
                  <input
                    type="radio"
                    name="plano"
                    value={p.id}
                    checked={plano === p.id}
                    onChange={() => setPlano(p.id)}
                    className="mt-1 size-4 accent-terra"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-label">{NOME_CICLO[p.ciclo]}</span>
                    <span className="text-h3 tabular-nums">
                      {formatarMoeda(p.valor)}{" "}
                      <span className="text-body-sm font-normal text-ink-muted">{POR_CICLO[p.ciclo]}</span>
                    </span>
                    {p.ciclo === "YEARLY" && (
                      <span className="text-body-sm text-ink-muted">12 meses pelo preço de 9</span>
                    )}
                    {(p.ciclo === "QUARTERLY" || p.ciclo === "YEARLY") && (
                      <span className="text-body-sm text-ink-muted">
                        Sai {formatarMoeda(Math.round(porMes * 100) / 100)} por mês
                        {economia > 0 && <span className="text-cerrado-text"> · {economia}% a menos</span>}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {!troca && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label">Como pagar</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={`${OPCAO} ${forma === "cartao" ? MARCADA : SOLTA}`}>
              <input
                type="radio"
                name="forma"
                value="cartao"
                checked={forma === "cartao"}
                onChange={() => setForma("cartao")}
                className="mt-1 size-4 accent-terra"
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-label">
                  <CreditCard aria-hidden className="size-[18px]" />
                  Cartão de crédito
                </span>
                <span className="text-body-sm text-ink-muted">
                  {modo.tipo === "assinar" ? "Renova sozinho. Você não precisa fazer nada." : "Cobrado uma vez só."}
                </span>
              </span>
            </label>
            <label className={`${OPCAO} ${forma === "pix" ? MARCADA : SOLTA}`}>
              <input
                type="radio"
                name="forma"
                value="pix"
                checked={forma === "pix"}
                onChange={() => setForma("pix")}
                className="mt-1 size-4 accent-terra"
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-label">
                  <QrCode aria-hidden className="size-[18px]" />
                  Pix
                </span>
                <span className="text-body-sm text-ink-muted">
                  {modo.tipo === "assinar"
                    ? "A cada fatura, você paga o Pix aqui no Publike."
                    : "Você paga o Pix aqui no Publike, uma vez só."}
                </span>
              </span>
            </label>
          </div>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-label">Dados da nota fiscal</legend>
        <Campo rotulo="CPF ou CNPJ" nome="documento" erro={erroDoc ?? undefined}>
          <input
            id="documento"
            name="documento"
            inputMode="text"
            autoComplete="off"
            value={documento}
            onChange={(e) => setDocumento(formatarDocumento(e.target.value))}
            aria-invalid={Boolean(erroDoc)}
            aria-describedby={erroDoc ? "documento-erro" : undefined}
            className={`${classesEntrada} max-w-xs tabular-nums`}
            required
          />
        </Campo>
        <Campo rotulo="Nome ou razão social" nome="nome">
          <input
            id="nome"
            name="nome"
            autoComplete="organization"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={120}
            className={classesEntrada}
            required
          />
        </Campo>
        <Campo rotulo="E-mail para a nota" nome="email" opcional ajuda="A nota fiscal também fica em Faturas.">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
            aria-describedby="email-ajuda"
            className={classesEntrada}
          />
        </Campo>
      </fieldset>

      {f === "cartao" && (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-label">Endereço de cobrança</legend>
          <p className="-mt-2 text-body-sm text-ink-muted">
            O parceiro de pagamentos pede para conferir o cartão. Fica guardado para a próxima vez.
          </p>
          <Campo rotulo="Celular, com DDD" nome="cob-telefone">
            <input
              id="cob-telefone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={telefone}
              onChange={(e) => setTelefone(formatarTelefone(e.target.value) || e.target.value)}
              placeholder="(62) 99999-9999"
              className={`${classesEntrada} max-w-xs`}
            />
          </Campo>
          <Campo rotulo="CEP" nome="cob-cep" erro={erroCep ?? undefined} ajuda={cidade ?? undefined}>
            <input
              id="cob-cep"
              inputMode="numeric"
              autoComplete="postal-code"
              value={end.cep}
              onChange={(e) => {
                const v = formatarCep(e.target.value);
                mudarEnd("cep", v);
                void procurarCep(v);
              }}
              aria-invalid={Boolean(erroCep)}
              aria-describedby={erroCep ? "cob-cep-erro" : cidade ? "cob-cep-ajuda" : undefined}
              placeholder="00000-000"
              className={`${classesEntrada} max-w-[10rem] tabular-nums`}
            />
          </Campo>
          <Campo rotulo="Rua" nome="cob-rua">
            <input
              id="cob-rua"
              autoComplete="address-line1"
              value={end.rua}
              onChange={(e) => mudarEnd("rua", e.target.value)}
              maxLength={120}
              className={classesEntrada}
            />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <Campo rotulo="Número" nome="cob-numero">
              <input
                id="cob-numero"
                value={end.numero}
                onChange={(e) => mudarEnd("numero", e.target.value)}
                maxLength={12}
                placeholder="S/N"
                className={classesEntrada}
              />
            </Campo>
            <Campo rotulo="Complemento" nome="cob-complemento" opcional>
              <input
                id="cob-complemento"
                autoComplete="address-line2"
                value={end.complemento}
                onChange={(e) => mudarEnd("complemento", e.target.value)}
                maxLength={60}
                placeholder="Sala, quadra, lote"
                className={classesEntrada}
              />
            </Campo>
          </div>
          <Campo rotulo="Bairro" nome="cob-bairro">
            <input
              id="cob-bairro"
              value={end.bairro}
              onChange={(e) => mudarEnd("bairro", e.target.value)}
              maxLength={80}
              className={classesEntrada}
            />
          </Campo>
        </fieldset>
      )}

      {(escolhido || modo.tipo === "faixa" || opcaoImpulso) && (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
          <p className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-body">
              {modo.tipo === "impulso"
                ? `Impulso no Google · ${diasDoImpulso} dias${comRapido && rapido ? " (Rápido)" : ""}`
                : modo.tipo === "faixa"
                  ? `${NOME_PRODUTO[recurso]}: a diferença`
                  : `${NOME_PRODUTO[recurso]} · ${escolhido ? NOME_CICLO[escolhido.ciclo].toLowerCase() : ""}`}
            </span>
            <span className="text-h3 tabular-nums">
              {formatarMoeda(
                modo.tipo === "impulso"
                  ? (opcaoImpulso?.valor ?? 0)
                  : modo.tipo === "faixa"
                    ? modo.diferenca
                    : (escolhido?.valor ?? 0),
              )}
            </span>
          </p>
          <p className="text-body-sm text-ink-muted">
            {modo.tipo === "impulso"
              ? "Cobrado hoje, uma vez só. Os dias contam quando o Google aprovar o anúncio, em até 1 dia útil; até lá, dá para cancelar e o dinheiro volta. Se a vaga fechar antes do fim, os dias que faltam viram crédito para outra vaga."
              : modo.tipo === "faixa"
              ? `Cobrado hoje: a diferença dos ${modo.dias} ${modo.dias === 1 ? "dia" : "dias"} que faltam${
                  modo.ate ? ` até ${dataDoDia(modo.ate)}` : ""
                }. A faixa muda assim que o pagamento for confirmado, e a renovação passa a ser ${formatarMoeda(modo.renovacao)}.`
              : modo.tipo === "trinta"
                ? "Cobrado hoje, uma vez só. Vale 30 dias a partir do pagamento e não renova sozinho: três dias antes do fim, você recebe o aviso. Desistiu em até 7 dias, o dinheiro volta."
                : escolhido && (
                    <>
                      {primeiro
                        ? `Nada é cobrado hoje. A primeira cobrança vem em ${dataDoDia(primeiro)}, e depois ${POR_CICLO[escolhido.ciclo]}.`
                        : `Cobrado hoje, e depois ${POR_CICLO[escolhido.ciclo]}.`}{" "}
                      Cancele quando quiser: o que já foi pago vale até o fim do período.
                      {escolhido.ciclo === "YEARLY" && " Desistiu em até 7 dias do primeiro pagamento, o dinheiro volta."}
                    </>
                  )}
          </p>
          {erro && (
            <p role="alert" className="text-body-sm text-danger">
              {erro}
            </p>
          )}
          <Botao type="submit" variante="primario" disabled={pendente} className="self-start">
            {pendente ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : f === "cartao" ? (
              <LockKeyhole aria-hidden />
            ) : (
              <QrCode aria-hidden />
            )}
            {troca
              ? "Pôr o cartão novo"
              : f === "cartao"
                ? "Continuar para o cartão"
                : modo.tipo === "assinar"
                  ? "Assinar e gerar o Pix"
                  : "Gerar o Pix"}
          </Botao>
          {f === "cartao" && (
            <p className="text-body-sm text-ink-muted">
              O cartão é digitado na página segura do nosso parceiro de pagamentos. O Publike não vê nem guarda o número
              do cartão.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
