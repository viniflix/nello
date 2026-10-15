import {Button} from '@/components/ui/button';
export function TemplateCatalogStatus({catalog}) {
 if(!catalog)return null;
 return <div className="my-2 space-y-2">
  {catalog.error&&<div role="alert"><p>Não foi possível atualizar o catálogo. Os itens já carregados foram preservados.</p>
   <Button variant="outline" onClick={()=>catalog.hasMore?catalog.loadMore():catalog.fetchTemplates()}>Tentar carregar catálogo</Button></div>}
  {catalog.hasMore&&<Button variant="outline" disabled={catalog.loadingMore} onClick={()=>catalog.loadMore()}>
   {catalog.loadingMore?'Carregando mais…':'Carregar mais templates'}</Button>}
  {catalog.loadingMore&&<p role="status">Carregando próxima página…</p>}
 </div>;
}
