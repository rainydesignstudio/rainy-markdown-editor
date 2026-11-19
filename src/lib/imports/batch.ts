export type ImportBatchSummary={total:number;created:number;failed:number;skipped:number;stopped:boolean};

/** Each article is independent; only a shared context failure stops the remainder. */
export async function runImportBatch<T,R>(items:readonly T[],options:{current:()=>boolean;cancelled:()=>boolean;create:(item:T)=>Promise<R>;start:(item:T)=>void;created:(item:T,result:R)=>void|Promise<void>;failed:(item:T,error:unknown)=>void;skipped:(item:T)=>void;fatal:(error:unknown)=>boolean;progress:(summary:ImportBatchSummary)=>void}):Promise<ImportBatchSummary>{
  const summary:ImportBatchSummary={total:items.length,created:0,failed:0,skipped:0,stopped:false};
  for(let i=0;i<items.length;i++){
    if(!options.current()||options.cancelled()||summary.stopped){summary.stopped=true;summary.skipped+=items.length-i;for(const item of items.slice(i))options.skipped(item);options.progress({...summary});break;}
    const item=items[i];options.start(item);
    let result:R;
    try{result=await options.create(item);}
    catch(error){summary.failed++;options.failed(item,error);if(options.fatal(error))summary.stopped=true;options.progress({...summary});continue;}
    summary.created++;await options.created(item,result);
    options.progress({...summary});
  }
  return summary;
}
