// Os clientes das agências: as empresas para quem a agência seleciona. Os dados
// (CNPJ, endereço, contato lá dentro, anotações) ficam só com a agência; na vaga
// aparece só o nome do cliente, ou "Empresa confidencial".

/** Um cliente como está no banco (clientes_agencia). */
export type Cliente = {
  id: string;
  nome: string;
  cnpj: string | null;
  confidencial: boolean;
  cidade: string | null;
  bairro: string | null;
  cep: string | null;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
  responsavel: string | null;
  telefone: string | null;
  email: string | null;
  nota: string | null;
  arquivado_em: string | null;
  criado_em: string;
  atualizado_em: string;
};

/** O que o formulário da vaga precisa de cada cliente (o nome, se é confidencial e o lugar). */
export type ClienteParaVaga = Pick<
  Cliente,
  "id" | "nome" | "confidencial" | "cidade" | "bairro" | "cep" | "endereco" | "lat" | "lng"
> & { arquivado: boolean };

export function paraVaga(c: Cliente): ClienteParaVaga {
  return {
    id: c.id,
    nome: c.nome,
    confidencial: c.confidencial,
    cidade: c.cidade,
    bairro: c.bairro,
    cep: c.cep,
    endereco: c.endereco,
    lat: c.lat,
    lng: c.lng,
    arquivado: Boolean(c.arquivado_em),
  };
}

/** O cliente tem lugar para levar à vaga: pelo menos o bairro ou o ponto no mapa. */
export function temLugar(c: Pick<Cliente, "bairro" | "lat" | "lng">) {
  return Boolean(c.bairro || (c.lat != null && c.lng != null));
}

/** Os números de um cliente, a partir das vagas e dos candidatos da agência. */
export type NumerosDoCliente = {
  vagas: number;
  noAr: number;
  candidatos: number;
  responder: number;
  contratados: number;
};
