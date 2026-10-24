-- Mensagem da equipe (10/11/2026): o admin manda uma mensagem para uma conta, que chega no sino ("Equipe
-- Publike: …") e, se o admin marcar, também por e-mail. A resposta do e-mail vai para a equipe
-- (development@publike.org, no envio). A pessoa lê todas em /painel/mensagens-da-equipe. Pode rodar de novo.
--   * privado.mensagens_equipe: o que foi mandado (assunto, texto, se foi por e-mail, quem mandou, quando leu).
--   * admin_mandar_mensagem_equipe / admin_mensagens_equipe: o admin (só service_role).
--   * minhas_mensagens_equipe / ler_mensagens_equipe: a conta.
--   * notificacoes.tipo ganha 'mensagem_equipe' (só no sino: o e-mail sai pelo modelo 'mensagem_equipe').

create table if not exists privado.mensagens_equipe (
  id bigint generated always as identity primary key,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  assunto text not null check (char_length(assunto) between 3 and 80),
  texto text not null check (char_length(texto) between 3 and 1500),
  por_email boolean not null default false,
  enviada_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  lida_em timestamptz
);
create index if not exists mensagens_equipe_conta_idx on privado.mensagens_equipe (conta_id, criado_em desc);
alter table privado.mensagens_equipe enable row level security;
revoke all on privado.mensagens_equipe from public, anon, authenticated;

-- O tipo novo no sino (a lista igual a 20261106120000_veredito_da_moderacao, mais 'mensagem_equipe')
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao',
                  'recado_no_ar', 'recado_retido', 'recado_forca',
                  'convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos', 'convite_vitrine',
                  'curriculo_publico', 'visita', 'visitas_do_dia', 'visitas_novidade',
                  'avaliacao_liberada', 'avaliacao_removida', 'mensagem_equipe'));

drop trigger if exists notificacoes_por_email on public.notificacoes;
create trigger notificacoes_por_email
  after insert on public.notificacoes
  for each row
  when (new.tipo not in ('recado_no_ar', 'recado_retido', 'recado_forca', 'convite_curriculo', 'convite_empresa',
                         'convite_agencia', 'convite_servicos', 'convite_vitrine', 'curriculo_publico',
                         'visita', 'visitas_do_dia', 'visitas_novidade', 'avaliacao_liberada',
                         'avaliacao_removida', 'mensagem_equipe'))
  execute function privado.notificacao_por_email();

-- O modelo do e-mail (o texto da mensagem vai inteiro; quem responde fala com a equipe)
insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
values ('mensagem_equipe', 'usuarios', 90, 'Mensagem da equipe',
        'A mensagem que o admin escreve para uma conta (Admin › Contas › Mensagem da equipe). Quem responde o e-mail fala com a equipe.',
        array['nome', 'assunto', 'mensagem', 'link'],
        '{{assunto}}',
        E'Oi, {{nome}}.\n\n{{mensagem}}\n\nQualquer dúvida, é só responder este e-mail: quem lê é a equipe do Publike.',
        'Abrir o Publike',
        '{{assunto}}',
        E'Oi, {{nome}}.\n\n{{mensagem}}\n\nQualquer dúvida, é só responder este e-mail: quem lê é a equipe do Publike.',
        'Abrir o Publike')
on conflict (chave) do nothing;

-- Admin: manda a mensagem (sino sempre; e-mail se pedir e a conta tiver para onde)
create or replace function public.admin_mandar_mensagem_equipe(p_conta uuid, p_assunto text, p_texto text, p_email boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assunto text := btrim(regexp_replace(coalesce(p_assunto, ''), '\s+', ' ', 'g'));
  v_texto text := btrim(regexp_replace(coalesce(p_texto, ''), '\n{3,}', E'\n\n', 'g'));
  v_nome text;
  destino text;
  v_id bigint;
  v_email bigint;
begin
  perform privado.exigir_admin();
  select p.nome into v_nome from public.perfis p where p.id = p_conta;
  if v_nome is null then
    raise exception 'Conta sem perfil: não tem sino para receber.' using errcode = 'P0001';
  end if;
  if char_length(v_assunto) < 3 or char_length(v_assunto) > 80 then
    raise exception 'O assunto vai de 3 a 80 letras.' using errcode = '22023', hint = 'assunto';
  end if;
  if char_length(v_texto) < 3 or char_length(v_texto) > 1500 then
    raise exception 'A mensagem vai de 3 a 1500 letras.' using errcode = '22023', hint = 'texto';
  end if;
  if coalesce(p_email, false) then
    select coalesce(nullif(btrim(u.email::text), ''), nullif(btrim(c.email), '')) into destino
      from auth.users u left join public.contatos c on c.perfil_id = u.id
     where u.id = p_conta;
    if destino is null or destino !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'Esta conta não tem e-mail: desmarque o e-mail para mandar só no sino.'
        using errcode = 'P0001', hint = 'email';
    end if;
  end if;

  insert into privado.mensagens_equipe (conta_id, assunto, texto, por_email, enviada_por)
  values (p_conta, v_assunto, v_texto, destino is not null, (select auth.uid()))
  returning id into v_id;

  insert into public.notificacoes (destinatario_id, tipo, texto)
  values (p_conta, 'mensagem_equipe', left('Equipe Publike: ' || v_assunto, 300));

  if destino is not null then
    insert into privado.fila_emails (modelo, para, usuario_id, dados)
    values ('mensagem_equipe', lower(destino), p_conta,
            jsonb_build_object('nome', coalesce(privado.nome_para_email(p_conta), v_nome, ''),
                               'assunto', v_assunto, 'mensagem', v_texto,
                               'caminho', '/painel/mensagens-da-equipe'))
    returning id into v_email;
  end if;

  perform privado.registrar('mensagem_equipe', 'usuario', p_conta::text, v_nome,
                            jsonb_build_object('assunto', v_assunto, 'email', destino is not null));
  return jsonb_build_object('id', v_id, 'email_id', v_email);
end
$$;

create or replace function public.admin_mensagens_equipe(p_conta uuid)
returns table (id bigint, assunto text, texto text, por_email boolean, criado_em timestamptz, lida_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.assunto, m.texto, m.por_email, m.criado_em, m.lida_em
    from privado.mensagens_equipe m
   where m.conta_id = p_conta
   order by m.criado_em desc
   limit 50
$$;

revoke execute on function public.admin_mandar_mensagem_equipe(uuid, text, text, boolean),
  public.admin_mensagens_equipe(uuid) from public, anon, authenticated;
grant execute on function public.admin_mandar_mensagem_equipe(uuid, text, text, boolean),
  public.admin_mensagens_equipe(uuid) to service_role;

-- A conta: as mensagens que recebeu (das mais novas para as mais antigas) e "li"
create or replace function public.minhas_mensagens_equipe()
returns table (id bigint, assunto text, texto text, criado_em timestamptz, lida_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.assunto, m.texto, m.criado_em, m.lida_em
    from privado.mensagens_equipe m
   where m.conta_id = (select public.conta_atual())
   order by m.criado_em desc
   limit 50
$$;

create or replace function public.ler_mensagens_equipe()
returns void
language sql
security definer
set search_path = ''
as $$
  update privado.mensagens_equipe m set lida_em = now()
   where m.conta_id = (select public.conta_atual()) and m.lida_em is null;
  update public.notificacoes n set lida = true
   where n.destinatario_id = (select public.conta_atual()) and n.tipo = 'mensagem_equipe' and not n.lida;
$$;

revoke execute on function public.minhas_mensagens_equipe(), public.ler_mensagens_equipe() from public, anon;
grant execute on function public.minhas_mensagens_equipe(), public.ler_mensagens_equipe() to authenticated;
