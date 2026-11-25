-- Os currículos que ficaram sem abrir, com o perfil da conversa (25/11/2026; Marcelo, da Arlete: "devolve isso pra
-- ela"). Pode rodar de novo.
--
-- O robô das filas relê o arquivo de quem ouviu "por aqui eu não consigo abrir" (migração 20270921120000). Quando o
-- arquivo não vira currículo (a Arlete mandou a Carteira de Trabalho Digital dela), quem procura trabalho passa a
-- receber o porquê de verdade, com Montar meu currículo e Agora não (src/lib/servidor/atendimento-whatsapp.ts). Para
-- isso o robô precisa do perfil da conversa: só quem disse que procura trabalho recebe (quem ainda não disse pode estar
-- mandando uma vaga). O resto da função segue igual.

create or replace function public.servidor_curriculos_sem_abrir(p_chave text, p_limite integer default 3)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return coalesce((
    select jsonb_agg(x)
      from (select c.chave as conversa, c.numero, c.nome, c.perfil,
                   (select jsonb_agg(jsonb_build_object('wamid', md.wamid, 'tipo', md.tipo, 'midia', md.midia_id,
                                                        'mime', md.mime) order by md.criado_em)
                      from (select m.* from privado.whatsapp_midias m
                             where m.conversa = c.chave
                               and m.criado_em between r.criado_em - interval '30 minutes' and r.criado_em + interval '1 minute'
                             order by m.criado_em desc limit 4) md) as midias
              from privado.whatsapp_conversas c
              cross join lateral (
                select max(cm.criado_em) as criado_em
                  from privado.whatsapp_conversa_mensagens cm
                 where cm.chave = c.chave and cm.de = 'robo'
                   and cm.texto like '%mas por aqui eu não consigo abrir%'
                   and cm.criado_em > now() - interval '30 days') r
             where r.criado_em is not null
               and c.situacao = 'robo'
               and c.ultima_da_pessoa_em > now() - interval '23 hours'
               and coalesce(c.perfil, 'trabalho') = 'trabalho'
               and not exists (select 1 from privado.curriculos_relidos l where l.chave = c.chave)
             order by r.criado_em
             limit greatest(1, least(coalesce(p_limite, 3), 10))) x), '[]'::jsonb);
end
$$;

revoke execute on function public.servidor_curriculos_sem_abrir(text, integer) from public;
grant execute on function public.servidor_curriculos_sem_abrir(text, integer) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270930120000_reler_com_o_perfil');
