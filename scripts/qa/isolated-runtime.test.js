import{it,expect}from'vitest';import{assertIsolatedRuntime}from'./isolated-runtime.mjs';
it('requires an explicit isolated mode locally and still accepts the GitHub runner',()=>{
 expect(()=>assertIsolatedRuntime({CI:'true'})).toThrow('isolated');
 expect(assertIsolatedRuntime({NELLO_LOCAL_QA:'isolated'})).toBe('local');
 expect(assertIsolatedRuntime({CI:'true',GITHUB_ACTIONS:'true'})).toBe('github');
});
