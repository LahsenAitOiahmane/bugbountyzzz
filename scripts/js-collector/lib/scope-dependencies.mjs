export function assessScopeDependencies(pages, assets) {
  const saved = new Set(assets.filter(a => a.kind === 'script' && a.state === 'saved').map(a => a.url));
  const blockedPages = [];
  for (const page of pages) {
    const refs = page.scriptReferences || [];
    const blockedEntries = refs.filter(r => r.via === 'script-src' && !r.inScope);
    const savedDirectScripts = refs.filter(r => saved.has(r.url)).length;
    if (blockedEntries.length && !savedDirectScripts) blockedPages.push({
      pageUrl: page.url, entryScripts: blockedEntries.map(r => r.url),
      reason: 'Declared script entries are outside scope and no directly referenced external script was collected. Application rendering and login coverage cannot be validated.'
    });
  }
  const blockedReferences = pages.flatMap(p => (p.scriptReferences || []).filter(r => !r.inScope).map(r => ({ ...r, pageUrl: p.url })));
  return { required: blockedPages.length > 0, blockedPages, blockedReferenceCount: blockedReferences.length,
    blockedOrigins: [...new Set(blockedReferences.map(r => new URL(r.url).origin))],
    nextStep: 'Review the authorized published-asset retrieval origins for this run. Configure permitted application dependencies as asset-only origins while keeping CDN infrastructure outside page/API/testing scope. If the authorization is unclear, clarify the program context. Credentials alone do not change origin configuration.' };
}
