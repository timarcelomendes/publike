-- O limite das entrevistas ao vivo pelo Publike (11/11/2026): cada uma usa minutos da Daily (10.000 minutos de
-- participante grátis por mês para o site todo; depois, US$ 0,004 por minuto de cada pessoa, uns R$ 1,30 por entrevista
-- de 30 minutos a dois). Por mês, pelo mês do horário da entrevista (em Goiânia):
--   Plano Empresa até 5 vagas: 10 · até 20: 20 · até 50: 30
--   Plano Agência até 15 vagas: 20 · até 200: 30 (a cortesia do Plano Agência: 20)
--   Entrevista em vídeo sozinha: 10 · Plano Completo (quem ainda assina): 30
--   liberada sem prazo pelo Admin: 30 · só os 15 dias grátis: 3
-- Acabou, a opção "pelo Publike" some até o mês virar: dá para marcar por link de vídeo, telefone ou presencial. A
-- entrevista gravada não tem limite (não usa a Daily). A cancelada não conta.
-- E a sala fica mais curta: abre 10 minutos antes (era 15) e fecha 15 minutos depois do fim marcado (era 2 horas).
-- Pode rodar de novo.

-- quantas entrevistas ao vivo a conta pode marcar por mês (0: não tem a Entrevista em vídeo)
create or replace function privado.limite_ao_vivo(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with produtos as (
    select a.recurso from privado.assinaturas a where a.conta_id = p_conta and a.situacao = 'ativa'
    union
    select c.recurso from privado.cobrancas c
     where c.conta_id = p_conta and c.situacao = 'paga'
       and c.periodo_ate + case when c.compra_id is null then interval '3 days' else interval '0' end > now()
  ),
  limites as (
    select case recurso
             when 'empresa_5' then 10 when 'empresa_20' then 20 when 'empresa_50' then 30
             when 'agencia_15' then 20 when 'agencia_200' then 30
             when 'completo' then 30 when 'video' then 10
             else 0 end as n
      from produtos
    union all
    select 20 from privado.plano_agencia_cortesia x where x.conta_id = p_conta and (x.ate is null or x.ate > now())
    union all
    -- liberada sem prazo pelo Admin
    select 30 from privado.video_contas v where v.conta_id = p_conta and v.ate is null
    union all
    -- só os dias grátis (ou o que ainda vale do período pago, já contado acima)
    select 3 from privado.video_contas v where v.conta_id = p_conta and v.ate > now()
  )
  select coalesce(max(n), 0)::integer from limites
$$;
revoke execute on function privado.limite_ao_vivo(uuid) from public, anon, authenticated;

-- quantas entrevistas ao vivo a conta tem no mês de p_quando (sem as canceladas e sem p_fora, a que está mudando)
create or replace function privado.ao_vivo_no_mes(p_conta uuid, p_quando timestamptz, p_fora uuid default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.entrevistas e
    join public.anuncios a on a.id = e.anuncio_id
   where a.autor_id = p_conta
     and e.formato = 'publike'
     and e.situacao <> 'cancelada'
     and e.id is distinct from p_fora
     and date_trunc('month', e.quando at time zone 'America/Sao_Paulo')
       = date_trunc('month', p_quando at time zone 'America/Sao_Paulo')
$$;
revoke execute on function privado.ao_vivo_no_mes(uuid, timestamptz, uuid) from public, anon, authenticated;

-- o freio: vale para todo jeito de marcar (a ficha, o candidato escolhendo o horário, as automações)
create or replace function privado.conferir_ao_vivo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid;
  v_limite integer;
  v_usadas integer;
begin
  if new.formato is distinct from 'publike' or new.situacao = 'cancelada' then
    return new;
  end if;
  -- já era ao vivo, no mesmo mês, e não estava cancelada: não gasta outra
  if tg_op = 'UPDATE' and old.formato = 'publike' and old.situacao <> 'cancelada'
     and date_trunc('month', old.quando at time zone 'America/Sao_Paulo')
       = date_trunc('month', new.quando at time zone 'America/Sao_Paulo') then
    return new;
  end if;
  select a.autor_id into v_conta from public.anuncios a where a.id = new.anuncio_id;
  v_limite := privado.limite_ao_vivo(v_conta);
  if v_limite = 0 then
    raise exception 'A entrevista ao vivo pelo Publike vem com a Entrevista em vídeo. Marque por link de vídeo, telefone ou presencial.'
      using errcode = 'P0001', hint = 'ao_vivo_fechado';
  end if;
  v_usadas := privado.ao_vivo_no_mes(v_conta, new.quando, new.id);
  if v_usadas >= v_limite then
    raise exception 'As % entrevistas ao vivo pelo Publike deste mês já foram usadas. Marque por link de vídeo, telefone ou presencial: elas voltam no mês que vem.', v_limite
      using errcode = 'P0001', hint = 'ao_vivo_no_limite';
  end if;
  return new;
end
$$;
revoke execute on function privado.conferir_ao_vivo() from public, anon, authenticated;

drop trigger if exists conferir_ao_vivo on public.entrevistas;
create trigger conferir_ao_vivo
  before insert or update of formato, quando, situacao on public.entrevistas
  for each row execute function privado.conferir_ao_vivo();

-- para a ficha: quantas a conta já marcou neste mês e quantas pode
create or replace function public.minhas_entrevistas_ao_vivo()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null then null else
    jsonb_build_object(
      'usadas', privado.ao_vivo_no_mes(public.conta_atual(), now()),
      'limite', privado.limite_ao_vivo(public.conta_atual()))
  end
$$;
revoke execute on function public.minhas_entrevistas_ao_vivo() from public, anon;
grant execute on function public.minhas_entrevistas_ao_vivo() to authenticated;

-- a sala: abre 10 minutos antes e fecha 15 minutos depois do fim marcado
create or replace function public.entrevista_para_entrar(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.entrevistas;
  a public.anuncios;
  v_papel text;
  v_nome text;
begin
  select * into e from public.entrevistas x where x.id = p_id;
  if e.id is null then
    raise exception 'Entrevista não encontrada.' using errcode = '42501';
  end if;
  select * into a from public.anuncios x where x.id = e.anuncio_id;
  if e.perfil_id = (select auth.uid()) then
    v_papel := 'candidato';
    select p.nome into v_nome from public.perfis p where p.id = e.perfil_id;
  elsif a.autor_id = public.conta_atual() then
    v_papel := 'empresa';
    select coalesce(split_part(pp.nome, ' ', 1) || ' (' || pc.nome || ')', pc.nome) into v_nome
      from public.perfis pc left join public.perfis pp on pp.id = (select auth.uid()) and pp.id <> pc.id
     where pc.id = a.autor_id;
  else
    raise exception 'Entrevista não encontrada.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'id', e.id, 'anuncio_id', e.anuncio_id, 'quando', e.quando, 'duracao_min', e.duracao_min,
    'situacao', e.situacao, 'formato', e.formato, 'sala', e.sala, 'papel', v_papel, 'nome', v_nome,
    'vaga', a.titulo, 'empresa', (select p.nome from public.perfis p where p.id = a.autor_id),
    'candidato', (select p.nome from public.perfis p where p.id = e.perfil_id),
    'abre_em', e.quando - interval '10 minutes',
    'fecha_em', e.quando + make_interval(mins => e.duracao_min) + interval '15 minutes');
end
$$;
revoke all on function public.entrevista_para_entrar(uuid) from public, anon;
grant execute on function public.entrevista_para_entrar(uuid) to authenticated;

notify pgrst, 'reload schema';
