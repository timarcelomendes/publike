/**
 * O mês escrito de outro jeito vira "AAAA-MM": "03/2019", "3/2019", "2019-3" e "2019-03-01" (o campo de mês antigo, que
 * no Firefox e no Safari era uma caixa de texto, e currículos guardados antes). O resto passa como veio e a regra avisa.
 */
export function mesDoTexto(t: string) {
  const v = t.trim();
  let m = /^(\d{1,2})\s*[/.-]\s*(\d{4})$/.exec(v);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(v);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  return v;
}
