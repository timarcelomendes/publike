-- Resposta à mensagem da equipe (11/11/2026): a conta responde pelo site, na página da mensagem
-- (/painel/mensagens-da-equipe). A resposta aparece no admin (na conta e no painel inicial, até alguém
-- abrir a conta) e vai por e-mail para os "Avisos para a equipe". Pode rodar de novo.
--   * privado.respostas_equipe: as respostas (até 1000 letras; 10 por hora por conta).
--   * responder_mensagem_equipe: a conta, só na própria mensagem.
--   * minhas_mensagens_equipe e admin_mensagens_equipe passam a trazer as respostas.
--   * admin_respostas_equipe / admin_ver_respostas_equipe: a lista do admin e "vi" (service_role).

create table if not exists privado.respostas_equipe (
  id bigint generated always as identity primary key,
  mensagem_id bigint not null references privado.mensagens_equipe (id) on delete cascade,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 1000),
  criado_em timestamptz not null default now(),
  vista_em timestamptz
);
create index if not exists respostas_equipe_mensagem_idx on privado.respostas_equipe (mensagem_id, criado_em);
create index if not exists respostas_equipe_novas_idx on privado.respostas_equipe (criado_em desc) where vista_em is null;
alter table privado.respostas_equipe enable row level security;
revoke all on privado.respostas_equipe from public, anon, authenticated;

-- O e-mail para a equipe (o admin só abre no computador do dono: o texto diz onde ver)
insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
values ('aviso_resposta_equipe', 'equipe', 60, 'Resposta à mensagem da equipe',
        'Aviso para a equipe quando uma conta responde, pelo site, uma mensagem da equipe.',
        array['quem', 'titulo', 'mensagem'],
        '{{quem}} respondeu: “{{titulo}}”',
        E'{{quem}} respondeu a mensagem da equipe “{{titulo}}”:\n\n{{mensagem}}\n\nA conversa fica no admin, em Contas › {{quem}} › Mensagem da equipe.',
        null,
        '{{quem}} respondeu: “{{titulo}}”',
        E'{{quem}} respondeu a mensagem da equipe “{{titulo}}”:\n\n{{mensagem}}\n\nA conversa fica no admin, em Contas › {{quem}} › Mensagem da equipe.',
        null)
on conflict (chave) do nothing;

create or replace function public.responder_mensagem_equipe(p_mensagem bigint, p_texto text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  v_texto text := btrim(regexp_replace(coalesce(p_texto, ''), '\n{3,}', E'\n\n', 'g'));
  v_assunto text;
  v_nome text;
  v_id bigint;
begin
  if conta is null then
    raise exception 'Entre na sua conta para responder.' using errcode = '42501';
  end if;
  select m.assunto into v_assunto from privado.mensagens_equipe m where m.id = p_mensagem and m.conta_id = conta;
  if v_assunto is null then
    raise exception 'Não encontramos essa mensagem.' using errcode = 'P0002';
  end if;
  if char_length(v_texto) < 1 then
    raise exception 'Escreva a resposta.' using errcode = '22023';
  end if;
  if char_length(v_texto) > 1000 then
    raise exception 'A resposta passa de 1000 letras.' using errcode = '22023';
  end if;
  if (select count(*) from privado.respostas_equipe r
       where r.conta_id = conta and r.criado_em > now() - interval '1 hour') >= 10 then
    raise exception 'Você mandou muitas respostas agora. Tente de novo daqui a pouco.' using errcode = 'P0001';
  end if;
  insert into privado.respostas_equipe (mensagem_id, conta_id, texto)
  values (p_mensagem, conta, v_texto)
  returning id into v_id;
  select p.nome into v_nome from public.perfis p where p.id = conta;
  perform privado.avisar_equipe('aviso_resposta_equipe', jsonb_build_object(
    'quem', coalesce(v_nome, 'Uma conta'), 'titulo', v_assunto, 'mensagem', v_texto, 'caminho', '/'));
  return v_id;
end
$$;
revoke execute on function public.responder_mensagem_equipe(bigint, text) from public, anon;
grant execute on function public.responder_mensagem_equipe(bigint, text) to authenticated;

-- As mensagens com as respostas (a conta)
drop function if exists public.minhas_mensagens_equipe();
create function public.minhas_mensagens_equipe()
returns table (id bigint, assunto text, texto text, criado_em timestamptz, lida_em timestamptz, respostas jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.assunto, m.texto, m.criado_em, m.lida_em,
         coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'texto', r.texto, 'criado_em', r.criado_em)
                                    order by r.criado_em)
                     from privado.respostas_equipe r where r.mensagem_id = m.id), '[]'::jsonb)
    from privado.mensagens_equipe m
   where m.conta_id = (select public.conta_atual())
   order by m.criado_em desc
   limit 50
$$;
revoke execute on function public.minhas_mensagens_equipe() from public, anon;
grant execute on function public.minhas_mensagens_equipe() to authenticated;

-- O admin: as mensagens da conta com as respostas, as respostas novas de todas e "vi"
drop function if exists public.admin_mensagens_equipe(uuid);
create function public.admin_mensagens_equipe(p_conta uuid)
returns table (id bigint, assunto text, texto text, por_email boolean, criado_em timestamptz, lida_em timestamptz,
               respostas jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.assunto, m.texto, m.por_email, m.criado_em, m.lida_em,
         coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'texto', r.texto, 'criado_em', r.criado_em,
                                                       'vista_em', r.vista_em) order by r.criado_em)
                     from privado.respostas_equipe r where r.mensagem_id = m.id), '[]'::jsonb)
    from privado.mensagens_equipe m
   where m.conta_id = p_conta
   order by m.criado_em desc
   limit 50
$$;

create or replace function public.admin_respostas_equipe(p_limite integer default 10)
returns table (id bigint, conta_id uuid, nome text, assunto text, texto text, criado_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.conta_id, p.nome, m.assunto, r.texto, r.criado_em
    from privado.respostas_equipe r
    join privado.mensagens_equipe m on m.id = r.mensagem_id
    left join public.perfis p on p.id = r.conta_id
   where r.vista_em is null
   order by r.criado_em desc
   limit least(greatest(coalesce(p_limite, 10), 1), 50)
$$;

create or replace function public.admin_ver_respostas_equipe(p_conta uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update privado.respostas_equipe r set vista_em = now() where r.conta_id = p_conta and r.vista_em is null;
$$;

revoke execute on function public.admin_mensagens_equipe(uuid), public.admin_respostas_equipe(integer),
  public.admin_ver_respostas_equipe(uuid) from public, anon, authenticated;
grant execute on function public.admin_mensagens_equipe(uuid), public.admin_respostas_equipe(integer),
  public.admin_ver_respostas_equipe(uuid) to service_role;
