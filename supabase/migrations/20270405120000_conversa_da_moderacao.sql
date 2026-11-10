-- Conversa com a moderação (10/11/2026). Pode rodar de novo.
--
-- Quando o anúncio vai para análise (a IA reteve ou chegaram denúncias) ou é removido, quem publicou só recebia o
-- aviso. Agora, na página do anúncio, a pessoa explica a vaga para a moderação ("a comissão é sobre a venda, a SL
-- Digital é registrada…"), e a moderação pergunta o que precisar antes de decidir. Tudo fica junto do anúncio, na
-- fila da moderação e na ficha dele.
--   * privado.conversa_moderacao: as mensagens (até 1000 letras; quem publicou manda até 10 por hora).
--   * explicar_para_moderacao: quem publicou, com o anúncio em análise ou removido. A equipe recebe o e-mail.
--   * perguntar_ao_anunciante: a moderação (admin ou moderador). Chega no sino, no celular e no e-mail.
--   * minha_conversa_moderacao, equipe_conversas_moderacao e equipe_explicacoes_pendentes: as leituras.
--   * Os avisos de "em análise" e "removido" passam a dizer que dá para explicar.

create table if not exists privado.conversa_moderacao (
  id bigint generated always as identity primary key,
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  de text not null check (de in ('autor', 'equipe')),
  quem uuid references public.perfis (id) on delete set null,
  texto text not null check (char_length(texto) between 1 and 1000),
  criado_em timestamptz not null default now()
);
create index if not exists conversa_moderacao_anuncio_idx on privado.conversa_moderacao (anuncio_id, criado_em);
alter table privado.conversa_moderacao enable row level security;
revoke all on privado.conversa_moderacao from public, anon, authenticated;

-- O e-mail para a equipe quando quem publicou explica
insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
values ('aviso_explicacao_moderacao', 'equipe', 61, 'Explicação para a moderação',
        'Aviso para a equipe quando quem publicou um anúncio em análise ou removido escreve para a moderação.',
        array['quem', 'titulo', 'mensagem'],
        '{{quem}} explicou: “{{titulo}}”',
        E'{{quem}} escreveu para a moderação sobre o anúncio “{{titulo}}”:\n\n{{mensagem}}\n\nResponda ou decida em Admin › Moderação › Anúncios.',
        null,
        '{{quem}} explicou: “{{titulo}}”',
        E'{{quem}} escreveu para a moderação sobre o anúncio “{{titulo}}”:\n\n{{mensagem}}\n\nResponda ou decida em Admin › Moderação › Anúncios.',
        null)
on conflict (chave) do nothing;

-- texto limpo: sem espaços nas pontas e no máximo uma linha em branco seguida
create or replace function privado.texto_da_conversa(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(coalesce(p, ''), '\n{3,}', E'\n\n', 'g'))
$$;
revoke execute on function privado.texto_da_conversa(text) from public, anon, authenticated;

-- 1. Quem publicou explica
create or replace function public.explicar_para_moderacao(p_anuncio uuid, p_texto text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  v_texto text := privado.texto_da_conversa(p_texto);
  v_titulo text;
  v_status text;
  v_nome text;
  v_id bigint;
begin
  if usuario is null then
    raise exception 'Entre na sua conta para escrever para a moderação.' using errcode = '42501';
  end if;
  select a.titulo, a.status into v_titulo, v_status from public.anuncios a
   where a.id = p_anuncio and a.autor_id = usuario;
  if v_titulo is null then
    raise exception 'Não encontramos esse anúncio entre os seus.' using errcode = 'P0002';
  end if;
  if v_status not in ('em_analise', 'removido') then
    raise exception 'Este anúncio não está com a moderação.' using errcode = 'P0001';
  end if;
  if char_length(v_texto) < 1 then
    raise exception 'Escreva a explicação.' using errcode = '22023';
  end if;
  if char_length(v_texto) > 1000 then
    raise exception 'A explicação passa de 1000 letras.' using errcode = '22023';
  end if;
  if (select count(*) from privado.conversa_moderacao c
       where c.quem = usuario and c.de = 'autor' and c.criado_em > now() - interval '1 hour') >= 10 then
    raise exception 'Você mandou muitas mensagens agora. Tente de novo daqui a pouco.' using errcode = 'P0001';
  end if;
  insert into privado.conversa_moderacao (anuncio_id, de, quem, texto)
  values (p_anuncio, 'autor', usuario, v_texto)
  returning id into v_id;
  select p.nome into v_nome from public.perfis p where p.id = usuario;
  perform privado.avisar_equipe('aviso_explicacao_moderacao', jsonb_build_object(
    'quem', coalesce(v_nome, 'Quem publicou'), 'titulo', v_titulo, 'mensagem', v_texto,
    'anuncio_id', p_anuncio, 'caminho', '/admin/denuncias'));
  return v_id;
end
$$;
revoke execute on function public.explicar_para_moderacao(uuid, text) from public, anon;
grant execute on function public.explicar_para_moderacao(uuid, text) to authenticated;

-- 2. A moderação pergunta (sino e celular pela notificação; o e-mail pelo modelo da mensagem da equipe)
create or replace function public.perguntar_ao_anunciante(p_anuncio uuid, p_texto text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_texto text := privado.texto_da_conversa(p_texto);
  v_titulo text;
  v_autor uuid;
  v_nome text;
  destino text;
  v_id bigint;
begin
  perform privado.exigir_equipe();
  select a.titulo, a.autor_id into v_titulo, v_autor from public.anuncios a where a.id = p_anuncio;
  if v_autor is null then
    raise exception 'Anúncio não encontrado.' using errcode = 'P0002';
  end if;
  if v_autor = (select auth.uid()) and not privado.eh_admin() then
    raise exception 'O anúncio é seu: fale com outra pessoa da moderação.' using errcode = 'P0001';
  end if;
  if char_length(v_texto) < 3 then
    raise exception 'Escreva a pergunta.' using errcode = '22023';
  end if;
  if char_length(v_texto) > 1000 then
    raise exception 'A pergunta passa de 1000 letras.' using errcode = '22023';
  end if;
  insert into privado.conversa_moderacao (anuncio_id, de, quem, texto)
  values (p_anuncio, 'equipe', (select auth.uid()), v_texto)
  returning id into v_id;

  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
  values (v_autor, 'mensagem_equipe', p_anuncio,
          left('A moderação perguntou sobre “' || v_titulo || '”: ' || v_texto, 300));

  select coalesce(nullif(btrim(u.email::text), ''), nullif(btrim(c.email), '')) into destino
    from auth.users u left join public.contatos c on c.perfil_id = u.id
   where u.id = v_autor;
  if destino is not null and privado.email_valido(destino) then
    select p.nome into v_nome from public.perfis p where p.id = v_autor;
    insert into privado.fila_emails (modelo, para, usuario_id, dados)
    values ('mensagem_equipe', lower(btrim(destino)), v_autor,
            jsonb_build_object(
              'nome', coalesce(privado.nome_para_email(v_autor), v_nome, ''),
              'assunto', left('A moderação tem uma pergunta sobre “' || v_titulo || '”', 120),
              'mensagem', v_texto || E'\n\nResponda pelo Publike, na página do anúncio: é lá que a moderação lê.',
              'caminho', '/anuncio/' || p_anuncio || '#moderacao'));
  end if;

  perform privado.registrar('perguntar_anunciante', 'anuncio', p_anuncio::text, v_titulo,
                            jsonb_build_object('texto', left(v_texto, 200)));
  return v_id;
end
$$;
revoke execute on function public.perguntar_ao_anunciante(uuid, text) from public, anon;
grant execute on function public.perguntar_ao_anunciante(uuid, text) to authenticated, service_role;

-- 3. As leituras
-- quem publicou: a conversa do próprio anúncio (sem dizer quem da equipe escreveu)
create or replace function public.minha_conversa_moderacao(p_anuncio uuid)
returns table (id bigint, de text, texto text, criado_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.de, c.texto, c.criado_em
    from privado.conversa_moderacao c
    join public.anuncios a on a.id = c.anuncio_id
   where c.anuncio_id = p_anuncio and a.autor_id = (select auth.uid())
   order by c.criado_em, c.id
   limit 100
$$;
revoke execute on function public.minha_conversa_moderacao(uuid) from public, anon;
grant execute on function public.minha_conversa_moderacao(uuid) to authenticated;

-- a moderação: as conversas dos anúncios da fila (ou da ficha)
create or replace function public.equipe_conversas_moderacao(p_anuncios uuid[])
returns table (id bigint, anuncio_id uuid, de text, texto text, criado_em timestamptz, quem_nome text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_equipe();
  return query
    select c.id, c.anuncio_id, c.de, c.texto, c.criado_em, p.nome
      from privado.conversa_moderacao c
      left join public.perfis p on p.id = c.quem
     where c.anuncio_id = any ((coalesce(p_anuncios, '{}'::uuid[]))[1:200])
     order by c.anuncio_id, c.criado_em, c.id;
end
$$;

-- a moderação: os anúncios removidos em que quem publicou escreveu depois da última mensagem da equipe
-- (os em análise já estão na fila)
create or replace function public.equipe_explicacoes_pendentes()
returns table (anuncio_id uuid, titulo text, tipo text, cidade text, bairro text, autor_id uuid, autor_nome text,
               nota_moderacao text, ultima timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_equipe();
  return query
    select a.id, a.titulo, a.tipo, a.cidade, a.bairro, a.autor_id, p.nome, a.nota_moderacao, u.criado_em
      from public.anuncios a
      join lateral (select c.de, c.criado_em from privado.conversa_moderacao c
                     where c.anuncio_id = a.id order by c.criado_em desc, c.id desc limit 1) u on true
      left join public.perfis p on p.id = a.autor_id
     where a.status = 'removido' and u.de = 'autor'
     order by u.criado_em desc
     limit 50;
end
$$;

revoke execute on function public.equipe_conversas_moderacao(uuid[]), public.equipe_explicacoes_pendentes()
  from public, anon;
grant execute on function public.equipe_conversas_moderacao(uuid[]), public.equipe_explicacoes_pendentes()
  to authenticated, service_role;

-- 4. Os avisos de "em análise" e "removido" dizem que dá para explicar
do $$
declare
  def text;
  novo text;
begin
  def := pg_get_functiondef('public.notificar_moderacao()'::regprocedure);
  if position('explique o anúncio para a moderação' in def) > 0 then
    return; -- já trocada
  end if;
  novo := replace(def, 'Você recebe um aviso quando terminar.''',
                  'Você recebe um aviso quando terminar. Se quiser, explique o anúncio para a moderação na página dele.''');
  novo := replace(novo, 'saiu do ar até a moderação analisar.''',
                  'saiu do ar até a moderação analisar. Se quiser, explique o anúncio para a moderação na página dele.''');
  novo := replace(novo, '|| coalesce('' Motivo: '' || new.nota_moderacao, ''''));',
                  '|| coalesce('' Motivo: '' || new.nota_moderacao, '''')
              || '' Se não concordar, explique o anúncio para a moderação na página dele.'');');
  if novo = def then
    raise notice 'Os avisos da moderação mudaram de texto: ficam como estão.';
    return;
  end if;
  execute novo;
end
$$;

notify pgrst, 'reload schema';
