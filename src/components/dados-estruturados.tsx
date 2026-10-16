/**
 * Dados estruturados (JSON-LD) para o Google: um <script> para cada objeto. Uma lista
 * [ ... ] no mesmo script é válida, mas o Safari dá erro com ela
 * (TypeError: r["@context"].toLowerCase; https://bugs.webkit.org/show_bug.cgi?id=255764).
 */
export function DadosEstruturados({ dados }: { dados: object | object[] }) {
  const lista = Array.isArray(dados) ? dados : [dados];
  return lista.map((d, i) => (
    <script
      key={i}
      type="application/ld+json"
      // sem "<" no JSON: nada fecha a tag de script antes da hora
      dangerouslySetInnerHTML={{ __html: JSON.stringify(d).replace(/</g, "\\u003c") }}
    />
  ));
}
