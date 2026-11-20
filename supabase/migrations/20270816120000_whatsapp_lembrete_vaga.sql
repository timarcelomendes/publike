-- O lembrete de quem chegou para publicar vaga e parou (20/11/2026; Marcelo: "percebi que as pessoas que entram para
-- publicar vagas costumam nao seguir"). Nos 10 dias antes, 17 de 23 conversas que começaram com "Quero publicar uma
-- vaga pelo WhatsApp" pararam na primeira mensagem. A primeira resposta virou os 3 botões (mandar a foto ou o texto,
-- montar a vaga em 3 perguntas, procuro emprego); quem parou nela, no "pode mandar" ou numa das 3 perguntas recebe,
-- 2 horas depois, uma vez, o lembrete com os botões.
--
-- Só entre 8h e 21h de Brasília, só com o robô na conversa, dentro das 24 horas da Meta. Vale também no teto do mês
-- (quem contrata segue normal: é quem traz vaga nova). Os textos ficam em src/lib/servidor/atendimento-whatsapp.ts: o
-- robô manda um pedaço de cada mensagem em que dá para parar (p_marcas) e o começo do lembrete (p_marca_lembrete).
--
-- Pode rodar de novo.
create or replace function public.servidor_whatsapp_lembrete_vaga(p_chave text, p_marcas text[], p_marca_lembrete text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hora integer := extract(hour from now() at time zone 'America/Sao_Paulo')::integer;
begin
  perform privado.exigir_servidor(p_chave);
  if v_hora < 8 or v_hora >= 21 or coalesce(p_marca_lembrete, '') = ''
     or coalesce(array_length(p_marcas, 1), 0) = 0 then
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
           and coalesce(c.perfil, '') <> 'trabalho'
           and c.ultima_da_pessoa_em > now() - interval '22 hours'
           and u.de = 'robo'
           and u.criado_em < now() - interval '2 hours'
           and exists (select 1 from unnest(p_marcas) mm where coalesce(mm, '') <> '' and strpos(lower(u.texto), lower(mm)) > 0)
           and not exists (select 1 from privado.whatsapp_conversa_mensagens m
                            where m.chave = c.chave and m.de = 'robo' and m.texto ilike p_marca_lembrete || '%'
                              and m.criado_em > c.ultima_da_pessoa_em)
         limit 30
      ) x), '[]'::jsonb);
end
$$;
revoke execute on function public.servidor_whatsapp_lembrete_vaga(text, text[], text) from public;
grant execute on function public.servidor_whatsapp_lembrete_vaga(text, text[], text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270816120000_whatsapp_lembrete_vaga');
