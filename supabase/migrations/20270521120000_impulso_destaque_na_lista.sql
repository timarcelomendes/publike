-- O destaque das vagas impulsionadas na lista (14/11/2026, claude/plano-destaque-das-vagas-impulsionadas.md). Pedido do
-- Marcelo: "Pensando em como fazer as vagas impulsionadas terem destaque na plataforma.. alguns sao antigos e nao
-- aparecem no topo da busca"; sobre as opções, "Os dois juntos" e "ok".
--
-- O quadro "Vagas impulsionadas na região" passa a aparecer também no alto da busca e da linha do tempo, e a vaga
-- impulsionada ganha um espaço patrocinado no meio da lista (src/lib/destaques.ts). A visita pelo espaço da lista tem
-- origem própria, 'lista' (o cartão leva à vaga com ?destaque=<código>&no=lista), para o piloto medir o que traz mais
-- candidato. Para o cliente, as duas contam juntas como "no Publike" (impulso_dias.visitas_quadro e curtidas_quadro).
--
-- Pode rodar de novo.

alter table privado.impulso_visitas drop constraint if exists impulso_visitas_origem_check;
alter table privado.impulso_visitas add constraint impulso_visitas_origem_check
  check (origem in ('google', 'quadro', 'link', 'lista'));
alter table privado.impulso_curtidas drop constraint if exists impulso_curtidas_origem_check;
alter table privado.impulso_curtidas add constraint impulso_curtidas_origem_check
  check (origem in ('google', 'quadro', 'link', 'lista'));

-- a visita (a de 20270519120000), com a origem 'lista'
create or replace function public.contar_visita_do_impulso(p_codigo text, p_anuncio uuid, p_visitante text, p_origem text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_origem text := case when p_origem in ('quadro', 'link', 'lista') then p_origem else 'google' end;
  v_n integer;
begin
  if p_codigo !~ '^[a-z0-9]{6,20}$' or p_visitante !~ '^[A-Za-z0-9_-]{16,64}$' then
    return false;
  end if;
  select i.id into v_id from privado.impulsos i
   where i.codigo = p_codigo and i.anuncio_id = p_anuncio
     and (i.situacao in ('em_revisao', 'no_ar')
          or (i.situacao in ('encerrado', 'credito') and i.encerrado_em > now() - interval '2 days'));
  if v_id is null then
    return false;
  end if;
  insert into privado.impulso_visitas (impulso_id, visitante, dia, origem) values (v_id, p_visitante, v_dia, v_origem)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return false;
  end if;
  insert into privado.impulso_dias (impulso_id, dia, visitas, visitas_quadro)
  values (v_id, v_dia, 1, case when v_origem in ('quadro', 'lista') then 1 else 0 end)
  on conflict (impulso_id, dia) do update
    set visitas = privado.impulso_dias.visitas + 1,
        visitas_quadro = privado.impulso_dias.visitas_quadro + case when v_origem in ('quadro', 'lista') then 1 else 0 end;
  return true;
end
$$;

-- a curtida (a de 20270519120000): a que veio do espaço da lista também conta como "no Publike"
create or replace function public.contar_curtida_do_impulso(p_visitante text, p_anuncio uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_id uuid;
  v_origem text;
  v_n integer;
  i privado.impulsos;
begin
  if (select auth.uid()) is null or eu is null or p_visitante !~ '^[A-Za-z0-9_-]{16,64}$' then
    return false;
  end if;
  if not exists (select 1 from public.curtidas c where c.anuncio_id = p_anuncio and c.perfil_id = eu) then
    return false;
  end if;
  select v.impulso_id, v.origem into v_id, v_origem
    from privado.impulso_visitas v
    join privado.impulsos x on x.id = v.impulso_id
   where x.anuncio_id = p_anuncio and v.visitante = p_visitante and v.dia >= v_dia - 7
   order by x.criado_em desc, v.dia desc
   limit 1;
  if v_id is null then
    return false;
  end if;
  insert into privado.impulso_curtidas (impulso_id, perfil_id, origem) values (v_id, eu, v_origem) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return false;
  end if;
  insert into privado.impulso_dias (impulso_id, dia, curtidas, curtidas_quadro)
  values (v_id, v_dia, 1, case when v_origem in ('quadro', 'lista') then 1 else 0 end)
  on conflict (impulso_id, dia) do update
    set curtidas = privado.impulso_dias.curtidas + 1,
        curtidas_quadro = privado.impulso_dias.curtidas_quadro + case when v_origem in ('quadro', 'lista') then 1 else 0 end;
  select * into i from privado.impulsos where id = v_id;
  if i.produto = 'candidatos' and i.situacao = 'no_ar' and privado.pacote_entregues(i.id) >= i.alvo then
    perform privado.pacote_terminar(i.id, 'Chegaram os candidatos do pacote.', true);
  end if;
  return true;
end
$$;


notify pgrst, 'reload schema';
