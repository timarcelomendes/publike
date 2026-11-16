-- O bairro no currículo (16/11/2026): passa a ser obrigatório ao salvar o currículo (a página e a ação conferem) e
-- quem já aparece para as empresas sem bairro no perfil recebe o aviso no sino, com o link para o campo novo
-- ("Onde você mora", /perfil/curriculo#onde-mora). Ninguém sai de Talentos por isso. Pode rodar de novo: quem já
-- recebeu o aviso com o mesmo link fica de fora.

insert into public.notificacoes (destinatario_id, tipo, texto, link)
select distinct p.id, 'comunicado',
       'Diga o seu bairro e apareça para as empresas perto de você: ele aparece no seu cartão e no mapa dos talentos. '
       || 'Só o nome do bairro, nunca o seu endereço.',
       '/perfil/curriculo#onde-mora'
  from public.perfis p
 where p.tipo = 'pessoa'
   and nullif(btrim(p.bairro), '') is null
   and (exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = p.id)
        or exists (select 1 from public.curriculo_visivel v where v.perfil_id = p.id))
   and not exists (select 1 from public.notificacoes x
                    where x.destinatario_id = p.id and x.tipo = 'comunicado' and x.link = '/perfil/curriculo#onde-mora');

select privado.migracao_aplicada('20270701120000_aviso_do_bairro');
