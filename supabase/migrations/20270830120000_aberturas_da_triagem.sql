-- Quem abre a Triagem com IA (22/11/2026; Marcelo, depois de ver que as 360 chamadas de 30 dias eram quase todas do
-- robô: "quero" saber quem abre a tela). Guarda só a conta, a vaga, o dia, quantas vezes e se a Triagem estava
-- liberada (sem nada do que a pessoa viu). O Admin › Triagem junta isso com as leituras da IA, por conta.
--
-- Pode rodar de novo.

create table if not exists privado.aberturas_triagem (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  vezes integer not null default 1,
  liberado boolean not null default false,
  primeira timestamptz not null default now(),
  ultima timestamptz not null default now(),
  primary key (anuncio_id, dia)
);
create index if not exists aberturas_triagem_conta on privado.aberturas_triagem (conta_id, dia desc);
alter table privado.aberturas_triagem enable row level security;
revoke all on privado.aberturas_triagem from public, anon, authenticated;

-- A página da Triagem conta a abertura (de quem publicou a vaga; a oferta, sem o recurso, conta como não liberada)
create or replace function public.copiloto_abriu(p_anuncio uuid, p_liberado boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
begin
  if eu is null or not exists (select 1 from public.anuncios a
                                where a.id = p_anuncio and a.tipo = 'vaga' and a.autor_id = eu) then
    return;
  end if;
  insert into privado.aberturas_triagem as t (anuncio_id, conta_id, liberado)
  values (p_anuncio, eu, coalesce(p_liberado, false))
  on conflict (anuncio_id, dia) do update
     set vezes = t.vezes + 1, ultima = now(), liberado = t.liberado or excluded.liberado;
end
$$;
revoke execute on function public.copiloto_abriu(uuid, boolean) from public, anon;
grant execute on function public.copiloto_abriu(uuid, boolean) to authenticated;

-- O Admin › Triagem: por conta, nos últimos `p_dias`, as leituras da IA (as do robô e as pedidas por uma pessoa), os
-- critérios escritos por uma pessoa e as aberturas da tela
create or replace function public.admin_uso_da_triagem(p_dias integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  desde timestamptz := now() - make_interval(days => least(greatest(coalesce(p_dias, 30), 1), 365));
begin
  perform privado.exigir_admin();
  return coalesce((
    with leituras as (
      select a.autor_id as conta, count(*) as lidos, count(distinct v.anuncio_id) as vagas, max(v.criado_em) as ultima
        from privado.copiloto_avaliacoes v
        join public.anuncios a on a.id = v.anuncio_id
       where v.criado_em > desde
       group by 1),
    pessoa as (
      select r.conta_id as conta,
             coalesce(sum(r.quantos) filter (where r.acao = 'avaliou'), 0) as lidos_pedidos,
             coalesce(sum(r.quantos) filter (where r.acao = 'criterios'), 0) as criterios
        from privado.copiloto_registro r
       where r.criado_em > desde and r.pessoa_id is not null
       group by 1),
    aberturas as (
      select t.conta_id as conta, count(distinct t.dia) as dias, sum(t.vezes) as vezes,
             count(distinct t.anuncio_id) as vagas, bool_or(not t.liberado) as sem_acesso, max(t.ultima) as ultima
        from privado.aberturas_triagem t
       where t.ultima > desde
       group by 1),
    contas as (
      select conta from leituras union select conta from pessoa union select conta from aberturas)
    select jsonb_agg(jsonb_build_object(
             'conta_id', c.conta, 'nome', p.nome, 'tipo', p.tipo,
             'lidos', coalesce(l.lidos, 0), 'vagas_lidas', coalesce(l.vagas, 0), 'ultima_leitura', l.ultima,
             'lidos_pedidos', coalesce(x.lidos_pedidos, 0), 'criterios', coalesce(x.criterios, 0),
             'dias_abertos', coalesce(b.dias, 0), 'aberturas', coalesce(b.vezes, 0), 'vagas_abertas', coalesce(b.vagas, 0),
             'sem_acesso', coalesce(b.sem_acesso, false), 'ultima_abertura', b.ultima,
             'liberado', privado.copiloto_liberado(c.conta), 'assinatura', privado.qualificados_com_plano(c.conta))
           order by coalesce(b.vezes, 0) desc, coalesce(x.lidos_pedidos, 0) + coalesce(x.criterios, 0) desc,
                    coalesce(l.lidos, 0) desc, p.nome)
      from contas c
      join public.perfis p on p.id = c.conta
      left join leituras l on l.conta = c.conta
      left join pessoa x on x.conta = c.conta
      left join aberturas b on b.conta = c.conta
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.admin_uso_da_triagem(integer) from public, anon;
grant execute on function public.admin_uso_da_triagem(integer) to authenticated;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270830120000_aberturas_da_triagem');
