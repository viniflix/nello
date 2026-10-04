import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {generatePdfViaEdge} from './edgePdfFallback';
const invoke=vi.hoisted(()=>vi.fn());
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{functions:{invoke}}}));
beforeEach(()=>{
 vi.stubGlobal('URL',Object.assign(class {},{createObjectURL:vi.fn(()=> 'blob:synthetic'),revokeObjectURL:vi.fn()}));
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();invoke.mockReset();});
describe('Edge PDF compatibility and cleanup',()=>{
 it('requests bytes and releases the temporary download URL',async()=>{
  invoke.mockResolvedValue({data:new Blob(['%PDF-synthetic'],{type:'application/octet-stream'}),error:null});
  await generatePdfViaEdge({title:'QA',fileName:'qa.pdf',lines:['Synthetic']});
  expect(invoke).toHaveBeenCalledWith('generate-pdf',{body:{title:'QA',fileName:'qa.pdf',lines:['Synthetic'],format:'binary'}});
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic');
  expect(document.querySelector('a[download]')).toBeNull();
 });
 it('accepts the older deployed JSON contract during publication',async()=>{
  invoke.mockResolvedValue({data:{base64Pdf:btoa('%PDF-synthetic'),fileName:'qa.pdf'},error:null});
  await generatePdfViaEdge({lines:[]});
  expect(URL.revokeObjectURL).toHaveBeenCalled();
 });
 it.each([{data:null,error:{message:'rate_limited'}},{data:new Blob(),error:null},{data:{},error:null}])('does not download a failed/empty response',async result=>{
  invoke.mockResolvedValue(result);
  await expect(generatePdfViaEdge({lines:[]})).rejects.toThrow();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
 });
});
