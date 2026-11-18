-- O aviso do grátis de cada mês (18/11/2026). Marcelo, "sim" para o aviso por e-mail e no sino contando às empresas
-- que agora elas têm um pouco de cada recurso pago de graça todo mês (migração 20270730120000). Sai uma vez para cada
-- conta que contrata (comércio, empresa, agência), só quando a equipe toca em "Avisar" em Admin › Pagamentos › O
-- grátis de cada mês: no sino e por e-mail (o e-mail respeita quem não quer receber e-mails do Publike). O link leva
-- à aba Avaliar da vaga mais nova da conta no ar (as três ferramentas com o grátis à vista) ou, sem vaga no ar, à
-- Triagem com IA. Pode rodar de novo.

create table if not exists privado.avisos_gratis (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  avisado_em timestamptz not null default now(),
  avisado_por uuid
);
alter table privado.avisos_gratis enable row level security;
revoke all on privado.avisos_gratis from public, anon, authenticated;

-- quem recebe: as contas que contratam, fora as suspensas, que ainda não receberam
create or replace function privado.aviso_gratis_contas()
returns table (conta_id uuid, nome text, tipo text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nome, p.tipo
    from public.perfis p
   where p.tipo in ('comercio', 'empresa', 'agencia')
     and (p.suspenso_ate is null or p.suspenso_ate < now())
     and not exists (select 1 from privado.avisos_gratis x where x.conta_id = p.id)
$$;

-- para onde o aviso leva: a aba Avaliar da vaga mais nova no ar; sem vaga no ar, a Triagem com IA
create or replace function privado.aviso_gratis_caminho(p_conta uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select '/painel/anuncio/' || a.id || '/avaliar'
       from public.anuncios a
      where a.autor_id = p_conta and a.tipo = 'vaga' and a.status = 'ativo'
      order by a.criado_em desc
      limit 1),
    '/painel/copiloto')
$$;

-- o texto do sino, com os números de agora (Admin › Pagamentos)
create or replace function privado.aviso_gratis_texto()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when t > 0 and g > 0 and v > 0 then
             format('Novidade: todo mês, de graça, a IA lê %s das suas vagas e você pede %s e %s. '
                    || 'Na tela de cada recurso, você vê quanto já usou.',
                    case when t = 1 then '1 candidato' else t || ' candidatos' end,
                    case when g = 1 then '1 entrevista gravada' else g || ' entrevistas gravadas' end,
                    case when v = 1 then '1 ao vivo' else v || ' ao vivo' end)
           else 'Novidade: um pouco de cada recurso pago do Publike agora é grátis todo mês. Na tela de cada recurso, '
                || 'você vê quanto já usou.'
         end
    from (select coalesce(c.gratis_triagem_mes, 5) as t, coalesce(c.gratis_gravadas_mes, 5) as g,
                 coalesce(c.gratis_ao_vivo_mes, 1) as v
            from (select 1) um left join privado.config_pagamentos c on c.id) n
$$;

revoke all on function privado.aviso_gratis_contas(), privado.aviso_gratis_caminho(uuid), privado.aviso_gratis_texto()
  from public, anon, authenticated;

-- o e-mail (o texto muda em Admin › E-mails › Textos)
insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('gratis_do_mes', 'usuarios', 62, 'O grátis de cada mês',
     'Para quem contrata: o aviso de que um pouco de cada recurso pago ficou grátis todo mês. Sai uma vez por conta, '
       || 'quando a equipe toca em "Avisar" em Admin › Pagamentos › O grátis de cada mês.',
     array['nome', 'empresa', 'triagem', 'gravadas', 'ao_vivo', 'link'],
     'Agora é grátis todo mês: um pouco de cada recurso do Publike',
     E'Oi, {{nome}}.\n\nA partir de agora, a {{empresa}} usa de graça, todo mês, um pouco de cada recurso pago do '
       || E'Publike:\n\n• Triagem com IA: a IA lê sozinha {{triagem}} candidatos das suas vagas e mostra o que cada um '
       || E'atende, com o trecho do currículo.\n• Entrevista em vídeo: {{gravadas}} entrevistas gravadas e {{ao_vivo}} ao '
       || E'vivo, dentro do Publike.\n• Teste Prático: o teste da Publike que combina com a vaga.\n• Automações: as 5 '
       || E'prontas, em toda vaga.\n\nNa tela de cada recurso aparece quanto você já usou no mês, e tudo renova no dia '
       || E'1º. Precisa de mais? Ali mesmo você assina só o que usar, ou experimenta 15 dias com tudo liberado, se ainda '
       || E'não experimentou.',
     'Ver nas minhas vagas')
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

-- Admin › Pagamentos: quantas contas recebem, as que já receberam e a prévia do sino e do e-mail
create or replace function public.admin_aviso_gratis()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'contas', (select count(*) from public.perfis p
                where p.tipo in ('comercio', 'empresa', 'agencia') and (p.suspenso_ate is null or p.suspenso_ate < now())),
    'para_avisar', (select count(*) from privado.aviso_gratis_contas()),
    'avisadas', (select count(*) from privado.avisos_gratis),
    'ultimo', (select max(x.avisado_em) from privado.avisos_gratis x),
    'texto_sino', privado.aviso_gratis_texto(),
    'numeros', (select jsonb_build_object('triagem', coalesce(c.gratis_triagem_mes, 5),
                                          'gravadas', coalesce(c.gratis_gravadas_mes, 5),
                                          'ao_vivo', coalesce(c.gratis_ao_vivo_mes, 1))
                  from (select 1) um left join privado.config_pagamentos c on c.id),
    'email', (select jsonb_build_object('grupo', m.grupo, 'assunto', m.assunto, 'corpo', m.corpo, 'botao', m.botao)
                from public.modelos_email m where m.chave = 'gratis_do_mes'));
end
$$;
revoke execute on function public.admin_aviso_gratis() from public, anon;
grant execute on function public.admin_aviso_gratis() to authenticated, service_role;

-- o "Avisar": para cada conta que ainda não recebeu, o sino e o e-mail (uma vez por conta)
create or replace function public.admin_avisar_gratis()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_caminho text;
  v_texto text := privado.aviso_gratis_texto();
  v_t integer;
  v_g integer;
  v_v integer;
  v_n integer := 0;
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  select coalesce(c.gratis_triagem_mes, 5), coalesce(c.gratis_gravadas_mes, 5), coalesce(c.gratis_ao_vivo_mes, 1)
    into v_t, v_g, v_v
    from (select 1) um left join privado.config_pagamentos c on c.id;
  for r in select * from privado.aviso_gratis_contas() loop
    insert into privado.avisos_gratis (conta_id, avisado_por) values (r.conta_id, (select auth.uid()))
    on conflict (conta_id) do nothing;
    if not found then
      continue;
    end if;
    v_caminho := privado.aviso_gratis_caminho(r.conta_id);
    insert into public.notificacoes (destinatario_id, tipo, texto, link)
    values (r.conta_id, 'comunicado', v_texto, v_caminho);
    perform privado.enfileirar_email(r.conta_id, 'gratis_do_mes', jsonb_build_object(
      'caminho', v_caminho,
      'empresa', coalesce(nullif(btrim(r.nome), ''), 'sua empresa'),
      'triagem', v_t::text, 'gravadas', v_g::text, 'ao_vivo', v_v::text));
    v_n := v_n + 1;
  end loop;
  perform privado.registrar('avisar_gratis', 'config', null, 'Aviso do grátis de cada mês',
                            jsonb_build_object('contas', v_n));
  return v_n;
end
$$;
revoke execute on function public.admin_avisar_gratis() from public, anon;
grant execute on function public.admin_avisar_gratis() to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270731120000_aviso_do_gratis_de_cada_mes');
