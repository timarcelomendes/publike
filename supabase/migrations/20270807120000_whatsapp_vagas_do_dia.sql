-- As vagas pelo WhatsApp de quem procura trabalho (19/11/2026; Marcelo: "para o público acessar o whatsapp e pedir
-- vagas [...] até 3 vagas no dia", e o "quero"). A pessoa pergunta e o atendimento manda vagas perto dela, até 3 por
-- dia (de Brasília); passou disso, o botão leva às vagas no site. Esta função conta quantas vagas (links de
-- /anuncio/) o atendimento já mandou hoje para a conversa.
--
-- Pode rodar de novo.

-- (volatile, não stable: a conferência da chave do servidor marca o uso, e o PostgREST roda as stable só para leitura)
create or replace function public.servidor_whatsapp_vagas_enviadas(p_chave text, p_conversa text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return coalesce((
    select sum((char_length(m.texto) - char_length(replace(m.texto, '/anuncio/', ''))) / char_length('/anuncio/'))
      from privado.whatsapp_conversa_mensagens m
     where m.chave = p_conversa
       and m.de = 'robo'
       and m.criado_em >= ((now() at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo')
  ), 0)::integer;
end
$$;

revoke execute on function public.servidor_whatsapp_vagas_enviadas(text, text) from public;
grant execute on function public.servidor_whatsapp_vagas_enviadas(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270807120000_whatsapp_vagas_do_dia');
