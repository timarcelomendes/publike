-- O aviso do vencimento da vaga (15/11/2026, Marcelo: "Eles precisam receber notificações antes para lembrarem e no
-- ato e depois de 7 dias para renovar"). Duas vagas saíram do ar em 14/11 sem ninguém avisar quem publicou. Agora, para
-- quem publicou (no sino, no celular e por e-mail), das 8h às 20h:
--   * antes: 2 dias antes de vencer, "Sua vaga sai do ar em DD/MM. Ainda está contratando?";
--   * no dia: quando vence, "Sua vaga saiu do ar hoje";
--   * depois: 7 dias depois, se não renovou, o último lembrete.
-- O link leva a /painel/anuncio/<id>/renovar: "Renovar" em um toque ou "Já preenchi" (com o "Quem você contratou?").
-- Fica de fora: vaga preenchida, encerrada ou removida pela moderação, conta suspensa e quem já publicou de novo uma
-- vaga com o mesmo título. Renovou e venceu de novo: os avisos voltam (a chave leva a data do vencimento).
--
-- Os avisos novos: 'vaga_vence' (antes) e 'vaga_venceu' (no dia e depois). Pode rodar de novo.

-- 1. Os tipos de aviso novos (o mesmo jeito de 20270526120000) -----------------------------------------------------

do $$
declare
  d text;
begin
  select pg_get_constraintdef(c.oid) into d from pg_constraint c
   where c.conrelid = 'public.notificacoes'::regclass and c.conname = 'notificacoes_tipo_check';
  if strpos(d, '''vaga_vence''') = 0 then
    if strpos(d, '''ainda_espera''::text') = 0 then
      raise exception 'notificacoes_tipo_check sem ainda_espera (rode antes a 20270526120000): %', d;
    end if;
    d := replace(d, '''ainda_espera''::text', '''ainda_espera''::text, ''vaga_vence''::text, ''vaga_venceu''::text');
    alter table public.notificacoes drop constraint notificacoes_tipo_check;
    execute 'alter table public.notificacoes add constraint notificacoes_tipo_check ' || d;
  end if;
end
$$;

do $$
declare
  f text;
  antes text;
begin
  f := pg_get_functiondef('privado.grupo_do_aviso(text)'::regprocedure);
  if strpos(f, '''vaga_vence''') = 0 then
    antes := f;
    f := replace(f, '''te_respondeu'', ''ainda_espera'') then ''andamento''',
                 '''te_respondeu'', ''ainda_espera'', ''vaga_vence'', ''vaga_venceu'') then ''andamento''');
    if f = antes then
      raise exception 'privado.grupo_do_aviso mudou: não achei a lista do andamento';
    end if;
    execute f;
  end if;

  f := pg_get_functiondef('privado.notificacao_por_email()'::regprocedure);
  if strpos(f, '''vaga_vence''') = 0 then
    antes := f;
    f := replace(f, '''te_respondeu'', ''ainda_espera'') then',
                 '''te_respondeu'', ''ainda_espera'', ''vaga_vence'', ''vaga_venceu'') then');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei a lista do motivo';
    end if;
    antes := f;
    f := replace(f, 'when ''te_respondeu'' then coalesce(new.link, ''/#te-respondeu'')',
                 'when ''te_respondeu'' then coalesce(new.link, ''/#te-respondeu'')'
                 || chr(10) || '                 when ''vaga_vence'' then coalesce(new.link, ''/painel/anuncio/'' || new.anuncio_id || ''/renovar'')'
                 || chr(10) || '                 when ''vaga_venceu'' then coalesce(new.link, ''/painel/anuncio/'' || new.anuncio_id || ''/renovar'')');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei o caminho do te_respondeu';
    end if;
    execute f;
  end if;
end
$$;

do $$
declare
  t text;
begin
  select pg_get_triggerdef(g.oid) into t from pg_trigger g
   where g.tgrelid = 'public.notificacoes'::regclass and g.tgname = 'notificacoes_para_celular';
  if strpos(t, '''vaga_vence''') = 0 then
    if strpos(t, '''ainda_espera''::text]') = 0 then
      raise exception 'notificacoes_para_celular mudou: %', t;
    end if;
    t := replace(t, '''ainda_espera''::text]', '''ainda_espera''::text, ''vaga_vence''::text, ''vaga_venceu''::text]');
    drop trigger notificacoes_para_celular on public.notificacoes;
    execute t;
  end if;
end
$$;

-- 2. Os avisos mandados (um por vaga, por etapa e por vencimento) -------------------------------------------------

create table if not exists privado.avisos_de_vencimento (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  etapa text not null check (etapa in ('antes', 'no_dia', 'depois')),
  expira_em timestamptz not null,
  enviado_em timestamptz not null default now(),
  primary key (anuncio_id, etapa, expira_em)
);
alter table privado.avisos_de_vencimento enable row level security;
revoke all on privado.avisos_de_vencimento from public, anon, authenticated;

-- 3. O robô das filas ---------------------------------------------------------------------------------------------

create or replace function public.servidor_avisar_vencimentos(p_chave text, p_limite integer default 100)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hora integer := extract(hour from now() at time zone 'America/Sao_Paulo');
  r record;
  n integer := 0;
  v_texto text;
  v_tipo text;
begin
  perform privado.exigir_servidor(p_chave);
  -- das 8h às 20h (quem venceu de madrugada recebe de manhã)
  if hora < 8 or hora >= 20 then
    return 0;
  end if;
  for r in
    with base as (
      select a.id, a.titulo, a.autor_id, a.expira_em,
             case
               when a.status = 'ativo' and a.expira_em > now() and a.expira_em <= now() + interval '2 days'
                    and a.expira_em - a.criado_em > interval '4 days' then 'antes'
               when a.status in ('ativo', 'expirado') and a.expira_em <= now()
                    and a.expira_em > now() - interval '2 days' then 'no_dia'
               when a.status in ('ativo', 'expirado') and a.expira_em <= now() - interval '7 days'
                    and a.expira_em > now() - interval '14 days' then 'depois'
             end as etapa
        from public.anuncios a
        join public.perfis p on p.id = a.autor_id
       where a.tipo = 'vaga'
         and a.status in ('ativo', 'expirado')
         and a.preenchida_em is null
         and a.expira_em between now() - interval '14 days' and now() + interval '2 days'
         and (p.suspenso_ate is null or p.suspenso_ate <= now())
    )
    select b.* from base b
     where b.etapa is not null
       and not exists (select 1 from privado.avisos_de_vencimento x
                        where x.anuncio_id = b.id and x.etapa = b.etapa and x.expira_em = b.expira_em)
       -- já publicou de novo uma vaga igual: nada a lembrar
       and not exists (select 1 from public.anuncios o
                        where o.autor_id = b.autor_id and o.id <> b.id and o.tipo = 'vaga'
                          and o.status in ('ativo', 'pausado', 'em_analise') and o.expira_em > now()
                          and lower(btrim(o.titulo)) = lower(btrim(b.titulo)))
     order by b.expira_em
     limit least(greatest(coalesce(p_limite, 100), 1), 500)
  loop
    if r.etapa = 'antes' then
      v_tipo := 'vaga_vence';
      v_texto := 'Sua vaga “' || r.titulo || '” sai do ar em '
                 || to_char(r.expira_em at time zone 'America/Sao_Paulo', 'DD/MM') || '. Ainda está contratando? '
                 || 'Renove em um toque. Se já preencheu, conte quem você contratou.';
    elsif r.etapa = 'no_dia' then
      v_tipo := 'vaga_venceu';
      v_texto := 'Sua vaga “' || r.titulo || '” saiu do ar: o prazo acabou. Ainda precisa de gente? '
                 || 'Renove em um toque e ela volta para quem procura perto.';
    else
      v_tipo := 'vaga_venceu';
      v_texto := 'Sua vaga “' || r.titulo || '” está fora do ar desde '
                 || to_char(r.expira_em at time zone 'America/Sao_Paulo', 'DD/MM') || '. Se ainda está contratando, '
                 || 'renove em um toque: quem procura perto continua vendo vagas como essa.';
    end if;
    -- um aviso de vencimento por vaga no sino: o novo tira o anterior
    delete from public.notificacoes nt
     where nt.destinatario_id = r.autor_id and nt.anuncio_id = r.id and nt.tipo in ('vaga_vence', 'vaga_venceu');
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto, link)
    values (r.autor_id, v_tipo, r.id, v_texto, '/painel/anuncio/' || r.id || '/renovar');
    insert into privado.avisos_de_vencimento (anuncio_id, etapa, expira_em) values (r.id, r.etapa, r.expira_em)
    on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function public.servidor_avisar_vencimentos(text, integer) from public;
-- o robô usa a chave pública com a chave do servidor (como as outras funções do servidor)
grant execute on function public.servidor_avisar_vencimentos(text, integer) to anon, authenticated, service_role;

-- 4. Os e-mails ----------------------------------------------------------------------------------------------------

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('vaga_vence', 'usuarios', 56, 'Vaga vence em 2 dias',
     'Para quem publicou: 2 dias antes de a vaga sair do ar, o lembrete para renovar (ou contar que preencheu).',
     array['nome', 'titulo', 'motivo', 'link'],
     'Sua vaga “{{titulo}}” sai do ar em 2 dias',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Renovar a vaga'),
    ('vaga_venceu', 'usuarios', 57, 'Vaga saiu do ar',
     'Para quem publicou: no dia em que a vaga sai do ar e 7 dias depois, se não renovou.',
     array['nome', 'titulo', 'motivo', 'link'],
     'Sua vaga “{{titulo}}” saiu do ar',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Renovar a vaga')
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do update
  set nome = excluded.nome, descricao = excluded.descricao, variaveis = excluded.variaveis,
      assunto = case when modelos_email.assunto = modelos_email.assunto_padrao then excluded.assunto
                     else modelos_email.assunto end,
      corpo = case when modelos_email.corpo = modelos_email.corpo_padrao then excluded.corpo
                   else modelos_email.corpo end,
      botao = case when modelos_email.botao = modelos_email.botao_padrao then excluded.botao
                   else modelos_email.botao end,
      assunto_padrao = excluded.assunto_padrao, corpo_padrao = excluded.corpo_padrao,
      botao_padrao = excluded.botao_padrao;

notify pgrst, 'reload schema';
