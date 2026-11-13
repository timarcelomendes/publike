-- As palavras do impulso conferidas uma vez por dia, não a cada medida (13/11/2026, pedido do Marcelo: "Faça").
--
-- O robô confere as palavras-chave do grupo de cada impulso no ar (`acertarPalavras`, em src/lib/servidor/impulsos.ts):
-- são 2 consultas ao Google Ads, e a medida é a cada 2 horas. O acesso "Explorer" da Google Ads API tem 2.880
-- operações em 24 horas para tudo, e cada consulta conta. Agora a conferência só sai quando nunca saiu ou quando a
-- última foi há mais de 22 horas (um pouco menos de 1 dia, porque a medida não cai sempre na mesma hora). Logo depois
-- de criar, as palavras entram e a data fica marcada.
--
-- `palavras_em` nasce vazia: depois desta migração, cada impulso no ar confere as palavras na medida seguinte (pega a
-- lista nova de 13/11) e daí uma vez por dia. Sem esta migração, o robô confere a cada medida, como antes.

alter table privado.impulsos add column if not exists palavras_em timestamptz;

-- quando as palavras do grupo foram conferidas pela última vez (null: nunca)
create or replace function public.servidor_impulso_palavras_em(p_chave text, p_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return (select i.palavras_em from privado.impulsos i where i.id = p_id);
end
$$;

-- as palavras do grupo acabaram de ser conferidas (ou postas, logo depois de criar)
create or replace function public.servidor_impulso_palavras_feitas(p_chave text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.impulsos set palavras_em = now() where id = p_id;
end
$$;

-- como as outras do servidor: a chave do servidor (p_chave) é quem protege
revoke execute on function public.servidor_impulso_palavras_em(text, uuid),
  public.servidor_impulso_palavras_feitas(text, uuid) from public;
grant execute on function public.servidor_impulso_palavras_em(text, uuid),
  public.servidor_impulso_palavras_feitas(text, uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
