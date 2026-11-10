-- Finalistas com a marca da agência (10/11/2026; claude/plano-planos-empresa-e-agencia.md, etapa 2, recurso 1). Rode
-- depois de 20270407120000_planos_empresa_e_agencia.sql. Pode rodar de novo.
--
-- O link que o cliente recebe (/finalistas/[token]) sai com a cor e a primeira foto da Página de carreiras da agência,
-- quando ela tem o Plano Agência (assinatura valendo) ou a cortesia da equipe (Admin › Usuários › Plano Agência).
-- Sem isso, o link continua como antes. É o primeiro dos recursos que só o Plano Agência tem.

-- 1. A cortesia da equipe: o Plano Agência sem pagar (teste com a primeira agência), sem prazo ou até `ate`
create table if not exists privado.plano_agencia_cortesia (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  liberado_em timestamptz not null default now(),
  ate timestamptz,
  motivo text check (motivo is null or char_length(motivo) <= 200)
);
alter table privado.plano_agencia_cortesia enable row level security;
revoke all on privado.plano_agencia_cortesia from public, anon, authenticated;

-- 2. Quem tem o Plano Agência: a cobrança paga de um Plano Agência que ainda vale (o período e mais 3 dias, como
-- os outros recursos) ou a cortesia
create or replace function privado.agencia_com_plano(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.plano_agencia_cortesia x
                  where x.conta_id = p_conta and (x.ate is null or x.ate > now()))
      or exists (select 1 from privado.cobrancas c
                  where c.conta_id = p_conta and c.recurso in ('agencia_15', 'agencia_200') and c.situacao = 'paga'
                    and c.periodo_ate + interval '3 days' >= now())
$$;
revoke execute on function privado.agencia_com_plano(uuid) from public, anon, authenticated;

-- 3. A marca no link dos finalistas (o cliente abre sem conta): a cor e a primeira foto da Página de carreiras de
-- quem publicou a vaga, só com o Plano Agência. Sem plano ou link inválido, null.
create or replace function public.marca_dos_finalistas(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'cor', p.cor,
           'foto', coalesce((to_jsonb(p) -> 'fotos' ->> 0), p.capa))
    from public.links_finalistas l
    join public.anuncios a on a.id = l.anuncio_id
    join public.paginas_de_vagas p on p.conta_id = a.autor_id
   where coalesce(p_token, '') ~ '^[0-9a-f]{64}$' and l.token = p_token
     and privado.agencia_com_plano(a.autor_id)
     and (p.cor is not null or p.capa is not null or jsonb_array_length(coalesce(to_jsonb(p) -> 'fotos', '[]')) > 0)
   limit 1
$$;
revoke execute on function public.marca_dos_finalistas(text) from public;
grant execute on function public.marca_dos_finalistas(text) to anon, authenticated, service_role;

-- 4. O painel da agência: tem o plano? (as telas mostram o que só ele tem)
create or replace function public.meu_plano_agencia()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(privado.agencia_com_plano((select public.conta_atual())), false)
$$;
revoke execute on function public.meu_plano_agencia() from public, anon;
grant execute on function public.meu_plano_agencia() to authenticated;

-- 5. Admin: liberar ou tirar a cortesia, e ler (o computador do dono, pela chave secreta)
create or replace function public.admin_cortesia_plano_agencia(p_conta uuid, p_liberar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  if not exists (select 1 from public.perfis p where p.id = p_conta and p.tipo = 'agencia') then
    raise exception 'O Plano Agência é só para conta de agência.' using errcode = 'P0001';
  end if;
  if coalesce(p_liberar, false) then
    insert into privado.plano_agencia_cortesia (conta_id) values (p_conta)
    on conflict (conta_id) do update set ate = null, liberado_em = now();
  else
    delete from privado.plano_agencia_cortesia where conta_id = p_conta;
  end if;
  perform privado.registrar(case when p_liberar then 'liberar_plano_agencia' else 'tirar_plano_agencia' end,
                            'usuario', p_conta::text, null, '{}'::jsonb);
end
$$;

create or replace function public.admin_plano_agencia(p_conta uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return jsonb_build_object(
    'tem', privado.agencia_com_plano(p_conta),
    'cortesia', exists (select 1 from privado.plano_agencia_cortesia x
                         where x.conta_id = p_conta and (x.ate is null or x.ate > now())));
end
$$;

revoke execute on function public.admin_cortesia_plano_agencia(uuid, boolean), public.admin_plano_agencia(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_cortesia_plano_agencia(uuid, boolean), public.admin_plano_agencia(uuid)
  to service_role;

notify pgrst, 'reload schema';
