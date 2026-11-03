-- A foto e o texto da vaga sem conta (o "mande a foto da vaga" da home): quem ainda não entrou manda a foto, a IA
-- preenche a vaga, e o login só é pedido ao publicar. Sem conta, a cota é por endereço de internet (embaralhado,
-- nunca o endereço de verdade) e por dia, com um teto do dia para todos os visitantes juntos: o gasto da IA nunca
-- fica sem limite. Pode rodar de novo.

create table if not exists privado.uso_ia_visitante (
  quem text not null check (quem ~ '^ip:[0-9a-f]{8,64}$'),
  dia date not null,
  total integer not null default 0,
  primary key (quem, dia)
);
alter table privado.uso_ia_visitante enable row level security;
revoke all on privado.uso_ia_visitante from public, anon, authenticated;

-- true: pode ler (e já conta este uso). false: passou a cota de quem pediu ou o teto do dia.
create or replace function public.servidor_usar_ia_visitante(p_chave text, p_quem text, p_limite integer,
                                                             p_teto integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_total integer;
  v_todos integer;
begin
  perform privado.exigir_servidor(p_chave);
  if p_quem is null or p_quem !~ '^ip:[0-9a-f]{8,64}$' then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  if not coalesce((select c.ia_melhorar_texto from public.config_site c limit 1), false) then
    return false;
  end if;
  if random() < 0.02 then
    delete from privado.uso_ia_visitante u where u.dia < hoje - 7;
  end if;
  select coalesce(sum(u.total), 0) into v_todos from privado.uso_ia_visitante u where u.dia = hoje;
  if v_todos >= least(greatest(coalesce(p_teto, 200), 1), 5000) then
    return false;
  end if;
  insert into privado.uso_ia_visitante as u (quem, dia, total) values (p_quem, hoje, 1)
  on conflict (quem, dia) do update set total = u.total + 1
  returning u.total into v_total;
  return v_total <= least(greatest(coalesce(p_limite, 5), 1), 50);
end
$$;

revoke execute on function public.servidor_usar_ia_visitante(text, text, integer, integer) from public;
grant execute on function public.servidor_usar_ia_visitante(text, text, integer, integer)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
