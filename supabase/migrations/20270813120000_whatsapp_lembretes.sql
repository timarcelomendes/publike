-- Os lembretes do atendimento do WhatsApp (20/11/2026; Marcelo, depois de rever as conversas: "concordo e adicione
-- também um lembrete antes de acabar as 24h, para o usuário lembrar que ele pode usar o WhatsApp, toda vez que desejar
-- para buscar vagas"). Dois, cada um uma vez, dentro das 24 horas em que a Meta deixa responder:
--   * "pergunta": quem parou no "me conta o que você faz e o bairro" (a última mensagem é essa, do robô) recebe, 2 horas
--     depois, a pergunta de novo;
--   * "sempre": quem procura trabalho e já recebeu uma busca (vagas ou "não achei") recebe, perto do fim das 24 horas
--     (entre 20 e 23h30 depois da última mensagem dela), o lembrete de que pode chamar sempre que quiser.
-- Só entre 8h e 21h de Brasília, só com o robô na conversa, e não no modo econômico (o teto do mês). Os textos ficam em
-- src/lib/servidor/atendimento-whatsapp.ts; o robô manda o começo de cada um (p_marcas) para saber se já foi.
--
-- Pode rodar de novo.

create or replace function public.servidor_whatsapp_lembretes(p_chave text, p_marca_pergunta text, p_marca_sempre text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hora integer := extract(hour from now() at time zone 'America/Sao_Paulo')::integer;
  v_teto integer := coalesce((select c.atendimento_teto_mes from privado.config_whatsapp c where c.id), 0);
begin
  perform privado.exigir_servidor(p_chave);
  if v_hora < 8 or v_hora >= 21 or coalesce(p_marca_pergunta, '') = '' or coalesce(p_marca_sempre, '') = '' then
    return '[]'::jsonb;
  end if;
  -- no teto do mês, sem lembrete
  if v_teto > 0 and privado.whatsapp_respostas_do_mes() >= v_teto then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('chave', x.chave, 'numero', x.numero, 'tipo', x.tipo))
      from (
        -- parou na pergunta
        select c.chave, c.numero, 'pergunta' as tipo
          from privado.whatsapp_conversas c
          join lateral (select m.de, m.texto, m.criado_em from privado.whatsapp_conversa_mensagens m
                         where m.chave = c.chave order by m.criado_em desc limit 1) u on true
         where c.situacao = 'robo'
           and c.ultima_da_pessoa_em > now() - interval '22 hours'
           and u.de = 'robo'
           and u.texto ilike '%o que você faz e o bairro%'
           and u.texto not ilike p_marca_pergunta || '%'
           and u.criado_em < now() - interval '2 hours'
           and not exists (select 1 from privado.whatsapp_conversa_mensagens m
                            where m.chave = c.chave and m.de = 'robo' and m.texto ilike p_marca_pergunta || '%'
                              and m.criado_em > c.ultima_da_pessoa_em)
        union all
        -- perto do fim das 24 horas
        select c.chave, c.numero, 'sempre'
          from privado.whatsapp_conversas c
         where c.situacao = 'robo'
           and c.perfil = 'trabalho'
           and c.ultima_da_pessoa_em between now() - interval '23 hours 30 minutes' and now() - interval '20 hours'
           and exists (select 1 from privado.whatsapp_conversa_mensagens m
                        where m.chave = c.chave and m.de = 'robo'
                          and (m.texto ilike '%/anuncio/%' or m.texto ilike '%não achei vaga%'))
           and not exists (select 1 from privado.whatsapp_conversa_mensagens m
                            where m.chave = c.chave and m.de = 'robo'
                              and (m.texto ilike p_marca_sempre || '%' or m.texto ilike p_marca_pergunta || '%')
                              and m.criado_em > c.ultima_da_pessoa_em)
         limit 30
      ) x), '[]'::jsonb);
end
$$;
revoke execute on function public.servidor_whatsapp_lembretes(text, text, text) from public;
grant execute on function public.servidor_whatsapp_lembretes(text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270813120000_whatsapp_lembretes');
