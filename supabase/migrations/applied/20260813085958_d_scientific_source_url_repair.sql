begin;
update public.scientific_sources
set source_url = 'https://cfn.org.br/wp-content/uploads/resolucoes/resolucoes_old/Res_594_2017.htm',
    citation = 'CFN. Resolução nº 594, de 17 de dezembro de 2017.'
where code = 'CFN594'
  and version = 1;
commit;
