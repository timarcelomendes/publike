-- O caminho de quem chega pelo anúncio do impulso (claude/plano-impulsionar-vaga.md, 12/11/2026).
--
-- Antes só se contava a visita (abriu a vaga) e a curtida. Agora, no meio: tocou em Curtir, entrou (ou criou a conta),
-- a vaga pediu as perguntas ou o WhatsApp, e respondeu. Cada passo conta uma vez por visitante (o mesmo do cookie
-- publike_impulso, sem nada da pessoa). Admin › Impulsos mostra o caminho de cada impulso, para ver onde a pessoa para.

create table if not exists privado.impulso_passos (
  impulso_id uuid not null references privado.impulsos(id) on delete cascade,
  visitante text not null check (visitante ~ '^[A-Za-z0-9_-]{16,64}$'),
  passo text not null check (passo in ('tocou', 'entrou', 'pedido', 'respondeu')),
  criado_em timestamptz not null default now(),
  primary key (impulso_id, visitante, passo)
);
alter table privado.impulso_passos enable row level security;
revoke all on privado.impulso_passos from public, anon, authenticated;

-- o passo de quem chegou pelo anúncio desta vaga nos últimos 7 dias (como a curtida), com o impulso ainda valendo
-- (como a visita). "entrou", "pedido" e "respondeu" só com a conta aberta.
create or replace function public.contar_passo_do_impulso(p_codigo text, p_visitante text, p_anuncio uuid, p_passo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_n integer;
begin
  if p_codigo is null or p_visitante is null or p_passo is null or p_codigo !~ '^[a-z0-9]{6,20}$'
     or p_visitante !~ '^[A-Za-z0-9_-]{16,64}$' or p_passo not in ('tocou', 'entrou', 'pedido', 'respondeu') then
    return false;
  end if;
  if p_passo <> 'tocou' and (select auth.uid()) is null then
    return false;
  end if;
  select i.id into v_id from privado.impulsos i
   where i.codigo = p_codigo and i.anuncio_id = p_anuncio
     and (i.situacao in ('em_revisao', 'no_ar') or (i.situacao = 'encerrado' and i.encerrado_em > now() - interval '2 days'))
     and exists (select 1 from privado.impulso_visitas v
                  where v.impulso_id = i.id and v.visitante = p_visitante
                    and v.dia >= (now() at time zone 'America/Sao_Paulo')::date - 7);
  if v_id is null then
    return false;
  end if;
  insert into privado.impulso_passos (impulso_id, visitante, passo) values (v_id, p_visitante, p_passo)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n > 0;
end
$$;
revoke execute on function public.contar_passo_do_impulso(text, text, uuid, text) from public;
grant execute on function public.contar_passo_do_impulso(text, text, uuid, text) to anon, authenticated;

-- o caminho de cada impulso que correu nos últimos 30 dias (ou ainda corre): quantas pessoas chegaram a cada passo
create or replace function public.admin_impulso_caminho()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_impulsos_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', i.id, 'codigo', i.codigo, 'titulo', i.titulo, 'situacao', i.situacao,
             'conta', coalesce(p.nome, ''), 'criado_em', i.criado_em,
             'abriu', (select count(distinct v.visitante) from privado.impulso_visitas v where v.impulso_id = i.id),
             'tocou', (select count(*) from privado.impulso_passos s where s.impulso_id = i.id and s.passo = 'tocou'),
             'entrou', (select count(*) from privado.impulso_passos s where s.impulso_id = i.id and s.passo = 'entrou'),
             'pedido', (select count(*) from privado.impulso_passos s where s.impulso_id = i.id and s.passo = 'pedido'),
             'respondeu', (select count(*) from privado.impulso_passos s where s.impulso_id = i.id and s.passo = 'respondeu'),
             'curtiu', (select count(*) from privado.impulso_curtidas k where k.impulso_id = i.id))
           order by (i.situacao in ('em_revisao', 'no_ar')) desc, i.criado_em desc)
      from privado.impulsos i
      left join public.perfis p on p.id = i.conta_id
     where i.situacao in ('em_revisao', 'no_ar')
        or (i.situacao = 'encerrado' and i.encerrado_em > now() - interval '30 days')
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.admin_impulso_caminho() from public, anon;
grant execute on function public.admin_impulso_caminho() to authenticated, service_role;

notify pgrst, 'reload schema';
