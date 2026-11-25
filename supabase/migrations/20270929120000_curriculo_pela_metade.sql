-- O currículo pela metade (25/11/2026; Marcelo, com a conversa da Arlete). Pode rodar de novo.
--
-- A Arlete aceitou montar o currículo pelo WhatsApp e parou no passo 1. Duas horas depois saiu o convite do Instagram
-- ("Enquanto isso, segue o Publike no Instagram"), e o PDF que ela mandou depois, em resposta ao passo 1, caiu fora
-- do currículo: o passo sai da última mensagem do Publike, e a última era o convite.
--
-- 1. O convite do Instagram não sai para quem parou no meio de um passo (o currículo, as perguntas da vaga na
--    candidatura): o código manda as marcas desses passos (p_marcas_fluxo). O atendimento também passou a ignorar o
--    convite e a dica das 24 horas na hora de saber o passo (src/lib/servidor/atendimento-whatsapp.ts).
-- 2. No lugar dele, quem parou no meio do currículo recebe, 2 horas depois, uma vez por parada, das 8h às 21h e dentro
--    da janela de 24 horas da Meta, o lembrete com a mesma pergunta (o texto e a marca do passo vêm do código).
-- 3. A tabela das candidaturas pelo WhatsApp (migração 20270927120000) ganha a segurança por linha, como as outras do
--    WhatsApp (o acesso continua só pelas funções do servidor).

-- 1. O convite do Instagram, sem o meio dos passos ------------------------------------------------------------------
drop function if exists public.servidor_whatsapp_convite_instagram(text, text, text[]);
create or replace function public.servidor_whatsapp_convite_instagram(
  p_chave text,
  p_marca text,
  p_marcas_ok text[],
  p_marcas_fluxo text[] default '{}'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hora integer := extract(hour from now() at time zone 'America/Sao_Paulo')::integer;
  v_teto integer := coalesce((select c.atendimento_teto_mes from privado.config_whatsapp c where c.id), 0);
  v_minutos integer;
begin
  perform privado.exigir_servidor(p_chave);
  select c.instagram_minutos into v_minutos from privado.config_whatsapp c
   where c.id and c.ativo and c.atendimento_ligado and c.instagram_convite;
  if v_minutos is null or v_hora < 8 or v_hora >= 21 or coalesce(p_marca, '') = ''
     or coalesce(array_length(p_marcas_ok, 1), 0) = 0 then
    return '[]'::jsonb;
  end if;
  if v_teto > 0 and privado.whatsapp_respostas_do_mes() >= v_teto then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('chave', x.chave, 'numero', x.numero))
      from (
        select c.chave, c.numero
          from privado.whatsapp_conversas c
          join lateral (select m.de, m.texto, m.criado_em from privado.whatsapp_conversa_mensagens m
                         where m.chave = c.chave order by m.criado_em desc limit 1) u on true
         where c.situacao = 'robo'
           and c.perfil = 'trabalho'
           and c.ultima_da_pessoa_em > now() - interval '22 hours'
           and u.de = 'robo'
           -- uma pergunta do Publike sem resposta: espera 2 horas; o resto, os minutos do Admin
           and u.criado_em < now() - case when strpos(u.texto, '?') > 0 then interval '2 hours'
                                          else make_interval(mins => v_minutos) end
           -- no meio de um passo (o currículo, as perguntas da vaga): não
           and not exists (select 1 from unnest(coalesce(p_marcas_fluxo, '{}'::text[])) mf
                            where coalesce(mf, '') <> '' and strpos(u.texto, mf) > 0)
           -- já recebeu link de vaga em algum momento da conversa
           and exists (select 1 from privado.whatsapp_conversa_mensagens m, unnest(p_marcas_ok) mm
                        where m.chave = c.chave and m.de = 'robo' and coalesce(mm, '') <> '' and strpos(m.texto, mm) > 0)
           and not exists (select 1 from privado.whatsapp_conversa_mensagens m
                            where m.chave = c.chave and m.de = 'robo' and strpos(m.texto, p_marca) > 0)
         order by u.criado_em
         limit 20
      ) x), '[]'::jsonb);
end
$$;
revoke execute on function public.servidor_whatsapp_convite_instagram(text, text, text[], text[]) from public;
grant execute on function public.servidor_whatsapp_convite_instagram(text, text, text[], text[])
  to anon, authenticated, service_role;

-- 2. O lembrete do currículo pela metade ----------------------------------------------------------------------------
-- Devolve a conversa, o número e a última mensagem do Publike (o passo): o código monta o lembrete com a mesma pergunta.
create or replace function public.servidor_whatsapp_curriculo_pela_metade(
  p_chave text,
  p_marcas text[],
  p_marca_lembrete text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hora integer := extract(hour from now() at time zone 'America/Sao_Paulo')::integer;
  v_teto integer := coalesce((select c.atendimento_teto_mes from privado.config_whatsapp c where c.id), 0);
  v_modo text;
begin
  perform privado.exigir_servidor(p_chave);
  select c.curriculo_modo into v_modo from privado.config_whatsapp c where c.id and c.ativo and c.atendimento_ligado;
  if coalesce(v_modo, 'desligado') = 'desligado' or v_hora < 8 or v_hora >= 21
     or coalesce(array_length(p_marcas, 1), 0) = 0 or coalesce(p_marca_lembrete, '') = '' then
    return '[]'::jsonb;
  end if;
  if v_teto > 0 and privado.whatsapp_respostas_do_mes() >= v_teto then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('chave', x.chave, 'numero', x.numero, 'ultima', x.texto))
      from (
        select c.chave, c.numero, u.texto
          from privado.whatsapp_conversas c
          join lateral (select m.de, m.texto, m.criado_em from privado.whatsapp_conversa_mensagens m
                         where m.chave = c.chave order by m.criado_em desc limit 1) u on true
         where c.situacao = 'robo'
           and c.perfil = 'trabalho'
           and c.ultima_da_pessoa_em > now() - interval '22 hours'
           and u.de = 'robo'
           and u.criado_em < now() - interval '2 hours'
           and exists (select 1 from unnest(p_marcas) mm where coalesce(mm, '') <> '' and strpos(u.texto, mm) > 0)
           and (v_modo = 'todos' or c.chave = any (privado.whatsapp_chaves_de_teste()))
           -- uma vez por parada: depois da última mensagem da pessoa, nenhum lembrete ainda
           and not exists (select 1 from privado.whatsapp_conversa_mensagens m
                            where m.chave = c.chave and m.de = 'robo' and strpos(m.texto, p_marca_lembrete) > 0
                              and m.criado_em > c.ultima_da_pessoa_em)
         order by u.criado_em
         limit 20
      ) x), '[]'::jsonb);
end
$$;
revoke execute on function public.servidor_whatsapp_curriculo_pela_metade(text, text[], text) from public;
grant execute on function public.servidor_whatsapp_curriculo_pela_metade(text, text[], text)
  to anon, authenticated, service_role;

-- 3. A segurança por linha nas candidaturas pelo WhatsApp ----------------------------------------------------------
alter table privado.whatsapp_candidaturas enable row level security;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270929120000_curriculo_pela_metade');
