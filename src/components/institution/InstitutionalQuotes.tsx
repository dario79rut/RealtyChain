import React,{useEffect,useState} from 'react';
import {useProperties} from '../../hooks/useProperties';
import {InstitutionalQuoteDesk,InstitutionalQuote,fetchInstitutionalQuotes,requestInstitutionalQuote,actOnInstitutionalQuote} from '../../utils/api';
import {Button} from '../ui/Button';
const field='mt-1 w-full rounded-lg border border-void-600 bg-void-800 p-2.5 text-cream-100';
const money=(n:number)=>n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
function QuoteForm({quote,desk,busy,onQuote}:{quote:InstitutionalQuote;desk:InstitutionalQuoteDesk;busy:boolean;onQuote:(payload:Record<string,unknown>)=>void}){
 const [price,setPrice]=useState('');const [counterpartyId,setCounterparty]=useState('');const [hours,setHours]=useState('24');
 return <form className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3" onSubmit={e=>{e.preventDefault();onQuote({price:Number(price),counterpartyId,validHours:Number(hours)});}}>
  <label className="text-xs text-cream-400">Counterparty<select required className={field} value={counterpartyId} onChange={e=>setCounterparty(e.target.value)}><option value="">Select institution</option>{desk.counterparties.filter(row=>row.id!==quote.userId).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
  <label className="text-xs text-cream-400">Price · USDC/share<input required type="number" min="0.01" step="0.01" className={field} value={price} onChange={e=>setPrice(e.target.value)}/></label>
  <label className="text-xs text-cream-400">Valid for · hours<input required type="number" min="1" max="72" step="1" className={field} value={hours} onChange={e=>setHours(e.target.value)}/></label>
  <Button type="submit" size="sm" disabled={busy}>Propose block quote</Button>
 </form>;
}
export function InstitutionalQuotes(){
 const {data:properties=[]}=useProperties();const [desk,setDesk]=useState<InstitutionalQuoteDesk|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const [draft,setDraft]=useState({propertyId:'',side:'buy',shares:'100',note:''});
 useEffect(()=>{let active=true;fetchInstitutionalQuotes().then(data=>{if(active)setDesk(data);}).catch(err=>{if(active)setError(err.message);});return()=>{active=false;};},[]);
 async function run(action:()=>Promise<InstitutionalQuoteDesk>){if(busy)return;setBusy(true);setError('');try{setDesk(await action());}catch(err){setError(err instanceof Error?err.message:'Request failed.');}finally{setBusy(false);}}
 const action=(id:string,verb:string,payload:Record<string,unknown>={})=>run(()=>actOnInstitutionalQuote(id,verb,payload));
 return <section className="mt-8 rounded-2xl border border-void-600 bg-void-900/60 p-5" aria-label="Institutional block quote desk">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-accent">Private block liquidity</p><h2 className="mt-1 font-display text-2xl text-cream-100">Institutional quote desk</h2></div><Button size="sm" variant="outline" disabled={busy} onClick={()=>run(fetchInstitutionalQuotes)}>Refresh quotes</Button></div>
  <p className="mt-2 text-sm text-cream-400">Request → operator proposal → counterparty confirmation → acceptance → settlement. Quotes are private to the two institutions and the operator. Counterparties must confirm before their cash or shares are reserved.</p>
  <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-xs text-cream-300">{desk?.demoMode?'Demo balances · ':''}Application-ledger block trades. No bank payment, Corda instruction, or on-chain transaction is submitted by this quote workflow. Existing Corda / Solana position records below are separate.</p>
  {error&&<p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
  {desk&&<>
   {desk.role==='institution'&&<form className="mt-5 space-y-3" onSubmit={e=>{e.preventDefault();run(()=>requestInstitutionalQuote({...draft,shares:Number(draft.shares)}));}}>
    {!desk.eligible&&<p className="text-sm text-amber-200">Approved institutional KYC and accreditation are required to request or accept quotes.</p>}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><label className="text-xs text-cream-400">Property<select required value={draft.propertyId} onChange={e=>setDraft({...draft,propertyId:e.target.value})} className={field}><option value="">Choose property</option>{properties.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label className="text-xs text-cream-400">Direction<select className={field} value={draft.side} onChange={e=>setDraft({...draft,side:e.target.value})}><option value="buy">Buy block</option><option value="sell">Sell block</option></select></label><label className="text-xs text-cream-400">Shares · all or none<input required type="number" min="1" max="1000000" step="1" className={field} value={draft.shares} onChange={e=>setDraft({...draft,shares:e.target.value})}/></label></div>
    <label className="block text-xs text-cream-400">Pricing / settlement requirements<textarea rows={2} maxLength={1000} className={field} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label><Button type="submit" disabled={busy||!desk.eligible}>Request a block quote</Button>
   </form>}
   {desk.requests.length===0?<p className="mt-5 text-sm text-cream-400">No private quote requests.</p>:<div className="mt-5 space-y-4">{desk.requests.map(quote=><article key={quote.id} className="rounded-xl border border-void-700 p-4">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold text-cream-100">{quote.side==='buy'?'Buy':'Sell'} {quote.shares.toLocaleString()} shares · {quote.propertyTitle}</h3><span className="text-xs uppercase tracking-wide text-accent">{quote.status}</span></div>
    <p className="mt-2 text-xs text-cream-400">Requester: {quote.requester} · counterparty: {quote.counterparty||'Not selected'} · {quote.id}</p>{quote.note&&<p className="mt-2 text-sm text-cream-300">{quote.note}</p>}
    {quote.price!=null&&<p className="mt-3 text-sm text-cream-100">{money(quote.price)} USDC/share · total {money(quote.notionalUsdc||0)} USDC · no platform fee</p>}
    {quote.quoteExpiresAt&&<p className="mt-1 text-xs text-cream-400">Quote expires {new Date(quote.quoteExpiresAt).toLocaleString()}{quote.settlementDeadline?` · settlement deadline ${new Date(quote.settlementDeadline).toLocaleString()}`:''}</p>}
    {desk.role==='admin'&&quote.status==='requested'&&<QuoteForm quote={quote} desk={desk} busy={busy} onQuote={payload=>action(quote.id,'quote',payload)}/>}
    <div className="mt-3 flex flex-wrap gap-2">
     {quote.status==='proposed'&&quote.isCounterparty&&<Button size="sm" disabled={busy||!desk.eligible} onClick={()=>action(quote.id,'confirm')}>Confirm terms &amp; reserve assets</Button>}
     {quote.status==='quoted'&&quote.isRequester&&<Button size="sm" disabled={busy||!desk.eligible} onClick={()=>action(quote.id,'accept')}>Accept &amp; reserve assets</Button>}
     {quote.status==='accepted'&&desk.role==='admin'&&<Button size="sm" disabled={busy} onClick={()=>action(quote.id,'settle')}>Settle reserved block</Button>}
     {!['settled','cancelled'].includes(quote.status)&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>action(quote.id,'cancel')}>Cancel quote</Button>}
    </div>
    {quote.settlementReference&&<p className="mt-3 text-xs text-emerald-300">Ledger settlement reference: {quote.settlementReference}</p>}
    <details className="mt-3 text-xs text-cream-400"><summary className="cursor-pointer">Negotiation &amp; execution history</summary><ol className="mt-2 space-y-2">{quote.history.map((entry,index)=><li key={`${entry.at}-${index}`} className="border-l border-void-500 pl-3"><time dateTime={entry.at}>{new Date(entry.at).toLocaleString()}</time><p className="mt-1 text-cream-300">{entry.note}</p></li>)}</ol></details>
   </article>)}</div>}
  </>}
 </section>;
}
