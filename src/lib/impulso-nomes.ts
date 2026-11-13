// Os nomes no Google Ads (13/11/2026, Marcelo: "pense e organize como serão as campanhas, grupos e anúncios, para
// ficar organizado"). Na conta dos impulsos, a campanha diz o cliente, o tipo e a vaga, e o código fica no fim (o mesmo
// do Admin): "Impulso · Padaria Boa · Pago 7 dias · Padeiro · 8da58639ff". Em ordem alfabética, o mesmo cliente fica
// junto. O grupo é a vaga, com o bairro: "Padeiro · Setor Bueno". A conta publike.org fica só com as campanhas do
// próprio Publike ("Publike · Candidatos · Vagas · Goiânia"), feitas à mão. O robô dá esses nomes ao criar e acerta
// os das campanhas no ar na medida (servidor/impulsos.ts, acertarCampanha).

export type OrigemDoImpulso = "compra" | "credito" | "cortesia" | "admin";

const NOME_DO_TIPO: Record<OrigemDoImpulso, string> = {
  compra: "Pago",
  credito: "Crédito",
  cortesia: "Grátis",
  admin: "Presente",
};

/**
 * O que o Google Ads aceita no nome, sem quebra de linha nem espaço sobrando, até `n` letras. O nome comprido é cortado
 * no fim de uma palavra e sem a pontuação que sobra ("Instalador e Reparador, Ramo: Software e Internet," vira
 * "Instalador e Reparador, Ramo: Software e Internet").
 */
function limpo(s: string | null | undefined, n: number) {
  let t = (s ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > n) {
    const corte = t.slice(0, n + 1).lastIndexOf(" ");
    t = corte >= n * 0.6 ? t.slice(0, corte) : t.slice(0, n);
  }
  return t.replace(/[\s,;:.·\-–—/|(]+$/u, "");
}

/** O tipo no nome: "Automático", "Pago 7 dias", "Presente", "Grátis" ou "Crédito". */
export function tipoDoImpulso(o: { origem: OrigemDoImpulso; automatico?: boolean | null; dias: number }) {
  if (o.automatico) return "Automático";
  return o.origem === "compra" ? `Pago ${o.dias} ${o.dias === 1 ? "dia" : "dias"}` : NOME_DO_TIPO[o.origem];
}

/** A campanha de uma vaga: "Impulso · Padaria Boa · Pago 7 dias · Padeiro · 8da58639ff". */
export function nomeDaCampanhaDaVaga(o: {
  cliente: string | null | undefined;
  origem: OrigemDoImpulso;
  automatico?: boolean | null;
  dias: number;
  vaga: string;
  codigo: string;
}) {
  return ["Impulso", limpo(o.cliente, 40) || "Sem nome", tipoDoImpulso(o), limpo(o.vaga, 50) || "Vaga", o.codigo].join(
    " · ",
  );
}

/** A campanha do cliente (as vagas que o Publike deu de presente): "Impulso · Etica RH · Presente · 23d635ad63". */
export function nomeDaCampanhaDoCliente(o: { cliente: string | null | undefined; codigo: string }) {
  return ["Impulso", limpo(o.cliente, 40) || "Sem nome", "Presente", o.codigo].join(" · ");
}

/**
 * O grupo de anúncios da vaga: a função e o bairro ("Padeiro · Setor Bueno"). Na campanha do cliente, com o código do
 * impulso no fim: duas vagas iguais no mesmo bairro não podem ter o mesmo nome na campanha.
 */
export function nomeDoGrupo(o: { vaga: string; bairro?: string | null; codigo?: string }) {
  return [limpo(o.vaga, 60) || "Vaga", limpo(o.bairro, 40), o.codigo ?? ""].filter(Boolean).join(" · ");
}
