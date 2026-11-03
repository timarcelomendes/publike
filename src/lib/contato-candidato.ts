// Os atributos que marcam um link de contato com um candidato (o WhatsApp, o telefone, o e-mail): o ouvinte do
// painel (src/components/contar-contato.tsx) avisa o servidor quando a empresa toca nele, para Admin › Retorno.
export function marcaDeContato(anuncioId: string, perfilId: string, canal: "whatsapp" | "telefone" | "email") {
  return { "data-contato": `${anuncioId}:${perfilId}`, "data-canal": canal };
}
